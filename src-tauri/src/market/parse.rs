//! Pure response parsing for the free market-data endpoints.
//!
//! These functions never touch the network; they map the raw JSON bodies
//! (captured as fixtures under `fixtures/`) into normalized rows so the
//! command layer stays thin and the parsing stays deterministically
//! testable. Three free sources are supported:
//! - EastMoney push2his kline + fund lsjz NAV
//! - Sina Finance kline (`quotes.sina.cn`)
//! - Tencent kline (`web.ifzq.gtimg.cn`) + EastMoney fundmobapi NAV

use serde::Deserialize;

/// One OHLCV row parsed from a kline response.
#[derive(Debug, Clone, PartialEq)]
pub struct KlineRow {
    pub trade_date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

/// One NAV row parsed from a fund-NAV response.
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
    if let Some(code) = response.rc {
        if code != 0 {
            return Err(format!("行情接口返回错误: rc={code}"));
        }
    }
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

// ---------------------------------------------------------------------------
// Sina Finance kline
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct SinaKlineRow {
    day: Option<String>,
    open: Option<String>,
    high: Option<String>,
    low: Option<String>,
    close: Option<String>,
    volume: Option<String>,
}

/// Parses a Sina `CN_MarketDataService.getKLineData` body (ascending order).
/// Sina reports volume in shares (股); EastMoney/Tencent report in lots (手),
/// so volume is normalized to lots by dividing by 100.
pub fn parse_sina_kline_response(body: &str) -> Result<Vec<KlineRow>, String> {
    let rows: Vec<SinaKlineRow> =
        serde_json::from_str(body).map_err(|e| format!("新浪行情响应解析失败: {e}"))?;
    let mut out: Vec<KlineRow> = rows
        .iter()
        .filter_map(|row| {
            let trade_date = row.day.as_deref()?.trim().to_string();
            if trade_date.is_empty() {
                return None;
            }
            Some(KlineRow {
                trade_date,
                open: parse_f64(row.open.as_deref()?)?,
                high: parse_f64(row.high.as_deref()?)?,
                low: parse_f64(row.low.as_deref()?)?,
                close: parse_f64(row.close.as_deref()?)?,
                volume: parse_f64(row.volume.as_deref()?)? / 100.0,
            })
        })
        .collect();
    // Sina returns ascending; make it a hard invariant for the callers.
    out.sort_by(|a, b| a.trade_date.cmp(&b.trade_date));
    if out.is_empty() {
        return Err("新浪无行情数据".to_string());
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Tencent kline
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct TencentResponse {
    code: Option<i64>,
    data: Option<serde_json::Map<String, serde_json::Value>>,
}

/// Tencent row layout: [date, open, close, high, low, volume(手), ...].
fn parse_tencent_row(row: &serde_json::Value) -> Option<KlineRow> {
    let parts = row.as_array()?;
    let date = parts.first()?.as_str()?.trim();
    if date.is_empty() || parts.len() < 6 {
        return None;
    }
    Some(KlineRow {
        trade_date: date.to_string(),
        open: parse_f64(parts.get(1)?.as_str()?)?,
        close: parse_f64(parts.get(2)?.as_str()?)?,
        high: parse_f64(parts.get(3)?.as_str()?)?,
        low: parse_f64(parts.get(4)?.as_str()?)?,
        volume: parse_f64(parts.get(5)?.as_str()?)?,
    })
}

/// Parses a Tencent `web.ifzq.gtimg.cn/appstock/app/fqkline/get` body.
/// The data object keys `qfqday` (adjusted) and `day` (raw) are both
/// accepted; rows are ascending.
pub fn parse_tencent_kline_response(body: &str) -> Result<Vec<KlineRow>, String> {
    let response: TencentResponse =
        serde_json::from_str(body).map_err(|e| format!("腾讯行情响应解析失败: {e}"))?;
    if !matches!(response.code, Some(0)) {
        return Err(format!("腾讯行情接口错误: code={:?}", response.code));
    }
    let data = response.data.unwrap_or_default();
    let mut out: Vec<KlineRow> = Vec::new();
    for (_symbol, value) in data {
        let Some(object) = value.as_object() else { continue };
        for key in ["qfqday", "day"] {
            let Some(rows) = object.get(key).and_then(|v| v.as_array()) else {
                continue;
            };
            for row in rows {
                if let Some(parsed) = parse_tencent_row(row) {
                    out.push(parsed);
                }
            }
        }
    }
    out.sort_by(|a, b| a.trade_date.cmp(&b.trade_date));
    out.dedup_by(|a, b| a.trade_date == b.trade_date);
    if out.is_empty() {
        return Err("腾讯无行情数据".to_string());
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// Fund NAV (EastMoney lsjz + fundmobapi fallback)
// ---------------------------------------------------------------------------

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

#[derive(Debug, Deserialize)]
struct FundMobResponse {
    #[serde(rename = "Datas")]
    datas: Option<Vec<FundNavRowJson>>,
}

/// Parses a `fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList` body.
/// Same row shape (newest first) as the desktop lsjz endpoint.
pub fn parse_fund_mob_nav_response(body: &str) -> Result<Vec<NavRow>, String> {
    let response: FundMobResponse =
        serde_json::from_str(body).map_err(|e| format!("净值响应解析失败: {e}"))?;
    let rows: Vec<NavRow> = response
        .datas
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
    fn parses_sina_kline_body() {
        let body = r#"[
            {"day":"2026-07-01","open":"1420.000","high":"1435.000","low":"1410.000","close":"1425.000","volume":"2871000"},
            {"day":"2026-07-02","open":"1426.000","high":"1450.000","low":"1420.000","close":"1445.000","volume":"3120000"}
        ]"#;
        let rows = parse_sina_kline_response(body).expect("sina body must parse");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].trade_date, "2026-07-01");
        assert_eq!(rows[0].close, 1425.0);
        assert_eq!(rows[0].high, 1435.0);
        // volume normalized from shares to lots
        assert_eq!(rows[0].volume, 28710.0);
        assert_eq!(rows[1].trade_date, "2026-07-02");
    }

    #[test]
    fn parses_sina_ascending_order_and_rejects_empty() {
        // Out-of-order input is still sorted ascending.
        let body = r#"[
            {"day":"2026-07-02","open":"1","high":"2","low":"0.5","close":"1.5","volume":"100"},
            {"day":"2026-07-01","open":"1","high":"2","low":"0.5","close":"1.5","volume":"100"}
        ]"#;
        let rows = parse_sina_kline_response(body).expect("parses");
        assert_eq!(rows[0].trade_date, "2026-07-01");
        assert!(parse_sina_kline_response("[]").is_err());
        assert!(parse_sina_kline_response("not json").is_err());
    }

    #[test]
    fn parses_tencent_kline_body() {
        let body = r#"{"code":0,"msg":"","data":{"sh600519":{"qfqday":[
            ["2026-07-01","1420.00","1425.00","1435.00","1410.00","28710.00",0],
            ["2026-07-02","1426.00","1445.00","1450.00","1420.00","31200.00",0]
        ]}}}"#;
        let rows = parse_tencent_kline_response(body).expect("tencent body must parse");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].trade_date, "2026-07-01");
        assert_eq!(rows[0].open, 1420.0);
        assert_eq!(rows[0].close, 1425.0);
        assert_eq!(rows[0].high, 1435.0);
        assert_eq!(rows[0].low, 1410.0);
        assert_eq!(rows[0].volume, 28710.0);
    }

    #[test]
    fn tencent_accepts_raw_day_key_and_rejects_errors() {
        let body = r#"{"code":0,"data":{"sz000001":{"day":[["2026-07-01","10.0","10.5","10.6","9.9","100.0"]]}}}"#;
        let rows = parse_tencent_kline_response(body).expect("raw day key works");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].close, 10.5);
        assert!(parse_tencent_kline_response(r#"{"code":-1,"msg":"rate limited"}"#).is_err());
        assert!(parse_tencent_kline_response("not json").is_err());
    }

    #[test]
    fn parses_fund_mob_nav_body() {
        let body = r#"{"Datas":[
            {"FSRQ":"2026-08-14","DWJZ":"2.1091","LJJZ":"2.5000"},
            {"FSRQ":"2026-08-13","DWJZ":"2.1000","LJJZ":"2.4900"}
        ],"TotalCount":2}"#;
        let rows = parse_fund_mob_nav_response(body).expect("mob nav body must parse");
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].trade_date, "2026-08-14");
        assert!((rows[0].nav - 2.1091).abs() < 1e-9);
        // empty list is valid (end of history)
        assert_eq!(
            parse_fund_mob_nav_response(r#"{"Datas":[]}"#).expect("empty is valid"),
            vec![]
        );
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
