//! EastMoney instrument search via the suggest API.
//!
//! The watchlist page searches the whole market instead of a static catalog:
//! `searchapi.eastmoney.com/api/suggest/get` returns matched A-shares, ETFs
//! and OTC funds with market/exchange metadata, which we normalize into the
//! same `MarketInstrument` shape the catalog uses.

use serde::Deserialize;

use crate::market::MarketInstrument;

const SEARCH_URL: &str = "https://searchapi.eastmoney.com/api/suggest/get";
const SEARCH_TOKEN: &str = "D43BF722C8E33BDC906FB84D85E326E8";

#[derive(Debug, Deserialize)]
struct SuggestResponse {
    #[serde(rename = "QuotationCodeTable")]
    quotation_table: Option<SuggestTable>,
}

#[derive(Debug, Deserialize)]
struct SuggestTable {
    #[serde(rename = "Data")]
    data: Option<Vec<SuggestRow>>,
}

#[derive(Debug, Deserialize)]
struct SuggestRow {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Classify")]
    classify: String,
    #[serde(rename = "MktNum")]
    market_num: Option<String>,
}

fn exchange_for(market_num: Option<&str>) -> &'static str {
    match market_num {
        Some("1") => "SSE",
        Some("0") => "SZSE",
        _ => "OTC",
    }
}

/// 仅保留 A 股与基金（含场外基金），剔除债券、美股、英股等。
fn is_accepted(classify: &str, market_num: Option<&str>) -> bool {
    match classify {
        "AStock" => matches!(market_num, Some("0") | Some("1")),
        "Fund" | "OTCFUND" => market_num.is_some(),
        _ => false,
    }
}

/// 解析 suggest 响应为可添加的自选标的列表。
pub fn parse_search_response(body: &str) -> Result<Vec<MarketInstrument>, String> {
    let response: SuggestResponse =
        serde_json::from_str(body).map_err(|e| format!("搜索响应解析失败: {e}"))?;
    let rows = response
        .quotation_table
        .and_then(|table| table.data)
        .unwrap_or_default();
    let mut instruments: Vec<MarketInstrument> = rows
        .iter()
        .filter(|row| is_accepted(&row.classify, row.market_num.as_deref()))
        .map(|row| MarketInstrument {
            id: format!("CN:{}", row.code),
            symbol: row.code.clone(),
            name: row.name.clone(),
            kind: if row.classify == "AStock" { "stock".to_string() } else { "fund".to_string() },
            exchange: exchange_for(row.market_num.as_deref()).to_string(),
            currency: "CNY".to_string(),
        })
        .collect();
    instruments.sort_by(|a, b| a.symbol.cmp(&b.symbol));
    instruments.dedup_by(|a, b| a.id == b.id);
    Ok(instruments)
}

#[tauri::command]
pub async fn search_instruments(keyword: String) -> Result<Vec<MarketInstrument>, String> {
    let client = crate::market::client::build_client().map_err(|err| err.to_string())?;
    let url = format!(
        "{SEARCH_URL}?input={}&type=14&token={SEARCH_TOKEN}&count=12",
        urlencode(&keyword)
    );
    let response = client
        .get(&url)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    if !status.is_success() {
        return Err(format!("搜索接口错误: HTTP {status}"));
    }
    parse_search_response(&body)
}

fn urlencode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_search_fixture() {
        let body = include_str!("fixtures/search_000001.json");
        let instruments = parse_search_response(body).expect("fixture must parse");
        assert!(instruments.len() >= 1);
        let bank = instruments
            .iter()
            .find(|instrument| instrument.symbol == "000001")
            .expect("平安银行 must be present");
        assert_eq!(bank.name, "平安银行");
        assert_eq!(bank.kind, "stock");
        assert_eq!(bank.exchange, "SZSE");
        assert_eq!(bank.id, "CN:000001");
        // 债券类结果被过滤。
        assert!(!instruments.iter().any(|instrument| instrument.name == "平安银行" && instrument.symbol != "000001"));
    }

    #[test]
    fn filters_foreign_and_bond_rows() {
        let body = r#"{"QuotationCodeTable":{"Data":[
            {"Code":"000001","Name":"平安银行","Classify":"AStock","MktNum":"0"},
            {"Code":"751240","Name":"平安银行","Classify":"Bond","MktNum":"1"},
            {"Code":"RITA","Name":"ETFB Green","Classify":"UsStock","MktNum":"107"},
            {"Code":"012734","Name":"易方达ETF联接C","Classify":"OTCFUND","MktNum":"150"}
        ]}}"#;
        let instruments = parse_search_response(body).expect("parses");
        let symbols: Vec<&str> = instruments.iter().map(|i| i.symbol.as_str()).collect();
        assert_eq!(symbols, vec!["000001", "012734"]);
        let fund = instruments
            .iter()
            .find(|i| i.symbol == "012734")
            .expect("otc fund kept");
        assert_eq!(fund.kind, "fund");
        assert_eq!(fund.exchange, "OTC");
    }

    #[test]
    fn urlencodes_chinese_keywords() {
        assert_eq!(urlencode("茅台"), "%E8%8C%85%E5%8F%B0");
        assert_eq!(urlencode("600519"), "600519");
    }
}
