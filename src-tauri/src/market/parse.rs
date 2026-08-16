//! Pure response parsing for the EastMoney HTTP endpoints.
//!
//! These functions never touch the network; they map the raw JSON bodies
//! (captured as fixtures under `fixtures/`) into normalized rows so the
//! command layer stays thin and the parsing stays deterministically
//! testable.

use serde::Deserialize;

/// One OHLCV row parsed from an EastMoney kline response.
#[derive(Debug, Clone, PartialEq)]
pub struct KlineRow {
    pub trade_date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// One NAV row parsed from an EastMoney fund-NAV response.
#[derive(Debug, Clone, PartialEq)]
pub struct NavRow {
    pub trade_date: String,
    pub nav: f64,
}

#[derive(Debug, Deserialize)]
struct KlineResponse {
    rc: Option<i64>,
    data: Option<KlineData>,
}

#[derive(Debug, Deserialize)]
struct KlineData {
    klines: Option<Vec<String>>,
}

fn parse_f64(value: &str) -> Option<f64> {
    value.trim().parse::<f64>().ok()
}

fn parse_kline_line(line: &str) -> Option<KlineRow> {
    // fields2=f51,f52,f53,f54,f55,f56 => date,open,close,high,low,volume
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() < 6 {
        return None;
    }
    let trade_date = parts[0].trim().to_string();
    if trade_date.is_empty() {
        return None;
    }
    Some(KlineRow {
        trade_date,
        open: parse_f64(parts[1])?,
        close: parse_f64(parts[2])?,
        high: parse_f64(parts[3])?,
        low: parse_f64(parts[4])?,
        volume: parse_f64(parts[5])?,
    })
}

/// Parses a `push2his.eastmoney.com/api/qt/stock/kline/get` body.
/// Malformed lines are skipped; a body without any usable row is an error.
pub fn parse_kline_response(body: &str) -> Result<Vec<KlineRow>, String> {
    let response: KlineResponse =
        serde_json::from_str(body).map_err(|e| format!("行情响应解析失败: {e}"))?;
    let klines = response
        .data
        .and_then(|data| data.klines)
        .unwrap_or_default();
    let rows: Vec<KlineRow> = klines.iter().filter_map(|line| parse_kline_line(line)).collect();
    if rows.is_empty() {
        return Err("无行情数据".to_string());
    }
    Ok(rows)
}

#[derive(Debug, Deserialize)]
struct FundNavResponse {
    #[serde(rename = "Data")]
    data: Option<FundNavData>,
}

#[derive(Debug, Deserialize)]
struct FundNavData {
    #[serde(rename = "LSJZList")]
    lsjz_list: Option<Vec<FundNavRowJson>>,
}

#[derive(Debug, Deserialize)]
struct FundNavRowJson {
    #[serde(rename = "FSRQ")]
    fsrq: Option<String>,
    #[serde(rename = "DWJZ")]
    dwjz: Option<String>,
}

/// Parses an `api.fund.eastmoney.com/f10/lsjz` body (unit NAV history).
/// Rows without a parseable NAV are skipped. An empty page is the end of
/// history, not an error; a body without the expected structure is.
pub fn parse_fund_nav_response(body: &str) -> Result<Vec<NavRow>, String> {
    let response: FundNavResponse =
        serde_json::from_str(body).map_err(|e| format!("净值响应解析失败: {e}"))?;
    let rows: Vec<NavRow> = response
        .data
        .and_then(|data| data.lsjz_list)
        .unwrap_or_default()
        .iter()
        .filter_map(|row| {
            let trade_date = row.fsrq.as_deref()?.trim().to_string();
            if trade_date.is_empty() {
                return None;
            }
            let nav = parse_f64(row.dwjz.as_deref()?)?;
            Some(NavRow { trade_date, nav })
        })
        .collect();
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stock_kline_fixture() {
        let body = include_str!("fixtures/kline_600519.json");
        let rows = parse_kline_response(body).expect("kline fixture must parse");
        assert!(rows.len() >= 20, "expected a full month, got {}", rows.len());
        let first = &rows[0];
        assert_eq!(first.trade_date, "2026-07-01");
        assert!(first.open > 0.0 && first.close > 0.0 && first.volume > 0.0);
        // high/low envelopes are sane
        assert!(first.high >= first.low);
        // ascending trade dates
        for pair in rows.windows(2) {
            assert!(pair[0].trade_date < pair[1].trade_date);
        }
    }

    #[test]
    fn parses_etf_kline_fixture() {
        let body = include_str!("fixtures/kline_159915.json");
        let rows = parse_kline_response(body).expect("etf fixture must parse");
        assert!(rows.len() >= 20);
        assert_eq!(rows[0].trade_date, "2026-07-01");
    }

    #[test]
    fn parses_fund_nav_fixture() {
        let body = include_str!("fixtures/fund_012734.json");
        let rows = parse_fund_nav_response(body).expect("nav fixture must parse");
        // The endpoint caps pages at 20 rows; the fixture captured one page.
        assert_eq!(rows.len(), 20);
        assert_eq!(rows[0].trade_date, "2026-08-14");
        assert!((rows[0].nav - 2.1091).abs() < 1e-9);
        // newest first from the API; sorted later by the caller
        assert!(rows[0].trade_date > rows[1].trade_date);
    }

    #[test]
    fn rejects_bodies_without_data() {
        assert!(parse_kline_response("{\"rc\":0,\"data\":null}").is_err());
        assert!(parse_kline_response("{\"rc\":0,\"data\":{\"klines\":[]}}").is_err());
        assert!(parse_kline_response("not json").is_err());
        // An empty NAV page is the end of history, not an error.
        assert_eq!(
            parse_fund_nav_response("{\"Data\":{\"LSJZList\":[]}}").expect("empty page is valid"),
            vec![]
        );
        assert!(parse_fund_nav_response("not json").is_err());
    }

    #[test]
    fn skips_malformed_kline_lines() {
        let body = r#"{"data":{"klines":[
            "2026-07-01,1,2,3,4,5",
            "broken,line",
            "2026-07-02,10,20,30,40,50"
        ]}}"#;
        let rows = parse_kline_response(body).expect("valid lines must survive");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].trade_date, "2026-07-01");
        assert_eq!(rows[1].close, 20.0);
    }
}
