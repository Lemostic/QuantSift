//! Free public market-data HTTP clients with automatic fallback.
//!
//! This is the only code in the project that talks to financial vendor
//! endpoints directly; everything above it consumes normalized bars through
//! the Tauri command surface. All endpoints are free public query APIs and
//! need no API keys:
//! - EastMoney push2his kline + fund lsjz NAV (primary)
//! - Sina Finance kline (fallback)
//! - Tencent ifzq kline (fallback) + EastMoney fundmobapi NAV (fallback)

use reqwest::Client;

use super::parse::{KlineRow, NavRow};

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const KLINE_EASTMONEY_URL: &str = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const KLINE_TOKEN: &str = "fa5fd1943c7b386f172d6893dbfba10b";
const KLINE_SINA_URL: &str = "https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData";
const KLINE_TENCENT_URL: &str = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get";
const NAV_URL: &str = "https://api.fund.eastmoney.com/f10/lsjz";
const NAV_MOB_URL: &str = "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList";

/// A normalized kline fetch target that every free source can address.
#[derive(Debug, Clone)]
pub struct KlineTarget {
    /// EastMoney secid, e.g. "1.600519" (SSE), "0.000001" (SZSE) or "100.HSI".
    pub em_secid: String,
    /// Sina symbol, e.g. "sh600519"; missing when the market is unsupported.
    pub sina_symbol: Option<String>,
    /// Tencent symbol, e.g. "sh600519" / "hkHSI" / "usDJI"; missing when unsupported.
    pub tencent_symbol: Option<String>,
}

impl KlineTarget {
    /// Builds the target for a catalog entry (A-shares/ETF with a market prefix).
    pub fn for_market(market: u8, symbol: &str) -> Self {
        let prefix = if market == 1 { "sh" } else { "sz" };
        KlineTarget {
            em_secid: format!("{market}.{symbol}"),
            sina_symbol: Some(format!("{prefix}{symbol}")),
            tencent_symbol: Some(format!("{prefix}{symbol}")),
        }
    }

    /// Builds the target for a global/domestic index.
    pub fn for_index(em_secid: &str, sina_symbol: Option<&str>, tencent_symbol: Option<&str>) -> Self {
        KlineTarget {
            em_secid: em_secid.to_string(),
            sina_symbol: sina_symbol.map(|s| s.to_string()),
            tencent_symbol: tencent_symbol.map(|s| s.to_string()),
        }
    }
}

pub fn build_client() -> Result<Client, String> {
    Client::builder()
        // 8s 总超时：死源/黑洞网络不应长时间拖住看板刷新（回退链会接力）。
        .timeout(std::time::Duration::from_secs(8))
        .connect_timeout(std::time::Duration::from_secs(5))
        .user_agent(USER_AGENT)
        .pool_max_idle_per_host(4)
        .build()
        .map_err(|err| format!("网络客户端初始化失败: {err}"))
}

// ---------------------------------------------------------------------------
// URL builders (pure, unit-tested)
// ---------------------------------------------------------------------------

/// The beg parameter for the EastMoney kline API: today minus a buffer large
/// enough for weekends and holidays, so a limit-bar window is always covered.
pub fn eastmoney_kline_url(target: &KlineTarget, limit: u32, today: &str) -> String {
    let begin = super::catalog::kline_begin_date(limit, today);
    format!(
        "{KLINE_EASTMONEY_URL}?secid={}&ut={KLINE_TOKEN}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg={begin}&end=20500101",
        target.em_secid
    )
}

pub fn sina_kline_url(target: &KlineTarget, limit: u32) -> String {
    let symbol = target
        .sina_symbol
        .as_deref()
        .unwrap_or(target.em_secid.as_str());
    format!("{KLINE_SINA_URL}?symbol={symbol}&scale=240&ma=no&datalen={limit}")
}

pub fn tencent_kline_url(target: &KlineTarget, limit: u32) -> String {
    let symbol = target
        .tencent_symbol
        .as_deref()
        .unwrap_or(target.em_secid.as_str());
    format!("{KLINE_TENCENT_URL}?param={symbol},day,,,{limit},qfq")
}

pub fn fund_nav_url(fund_code: &str, page_index: u32) -> String {
    format!("{NAV_URL}?fundCode={fund_code}&pageIndex={page_index}&pageSize=20")
}

pub fn fund_mob_nav_url(fund_code: &str, page_index: u32) -> String {
    format!("{NAV_MOB_URL}?FCODE={fund_code}&pageIndex={page_index}&pageSize=20&deviceid=Wap&plat=Wap&product=EFund&version=6.2.8")
}

// ---------------------------------------------------------------------------
// Per-source fetchers
// ---------------------------------------------------------------------------

async fn get_text(client: &Client, url: &str, referer: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header("Referer", referer)
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    if !status.is_success() {
        return Err(format!("网络请求失败: HTTP {status}"));
    }
    Ok(body)
}

/// EastMoney kline (primary source). Public endpoint, no token beyond the
/// shared ut constant used by the EastMoney web app itself.
pub async fn fetch_eastmoney_kline_body(
    client: &Client,
    target: &KlineTarget,
    limit: u32,
    today: &str,
) -> Result<String, String> {
    get_text(
        client,
        &eastmoney_kline_url(target, limit, today),
        "https://quote.eastmoney.com/",
    )
    .await
}

/// Sina Finance kline. Volume arrives in shares and is normalized to lots
/// by the parser so all sources agree on units.
pub async fn fetch_sina_kline_body(
    client: &Client,
    target: &KlineTarget,
    limit: u32,
) -> Result<String, String> {
    get_text(client, &sina_kline_url(target, limit), "https://finance.sina.com.cn/").await
}

/// Tencent ifzq kline (qfq). Volume is in lots, matching EastMoney units.
pub async fn fetch_tencent_kline_body(
    client: &Client,
    target: &KlineTarget,
    limit: u32,
) -> Result<String, String> {
    get_text(client, &tencent_kline_url(target, limit), "https://gu.qq.com/").await
}

/// EastMoney desktop fund NAV page (primary NAV source).
pub async fn fetch_fund_nav_body(
    client: &Client,
    fund_code: &str,
    page_index: u32,
) -> Result<String, String> {
    get_text(
        client,
        &fund_nav_url(fund_code, page_index),
        "http://fundf10.eastmoney.com/",
    )
    .await
}

/// EastMoney mobile fund NAV page (fallback NAV source).
pub async fn fetch_fund_mob_nav_body(
    client: &Client,
    fund_code: &str,
    page_index: u32,
) -> Result<String, String> {
    get_text(client, &fund_mob_nav_url(fund_code, page_index), "https://fund.eastmoney.com/").await
}

// ---------------------------------------------------------------------------
// Fallback chains
// ---------------------------------------------------------------------------

/// Fetches klines through the free-source fallback chain:
/// EastMoney (one retry) then Sina then Tencent. Returns the normalized rows
/// and the name of the source that actually served them.
pub async fn fetch_kline_with_fallback(
    client: &Client,
    target: &KlineTarget,
    limit: u32,
    today: &str,
) -> Result<(Vec<KlineRow>, &'static str), String> {
    // Primary: EastMoney, with one retry for transient failures.
    let mut last_error = String::new();
    for attempt in 0..2 {
        match fetch_eastmoney_kline_body(client, target, limit, today).await {
            Ok(body) => match super::parse::parse_kline_response(&body) {
                Ok(rows) => return Ok((rows, "eastmoney")),
                Err(err) => last_error = format!("东方财富解析失败: {err}"),
            },
            Err(err) => last_error = format!("东方财富不可用: {err}"),
        }
        if attempt == 0 {
            tokio::time::sleep(std::time::Duration::from_millis(120)).await;
        }
    }

    // Fallback 1: Sina.
    if target.sina_symbol.is_some() {
        match fetch_sina_kline_body(client, target, limit).await {
            Ok(body) => match super::parse::parse_sina_kline_response(&body) {
                Ok(rows) => return Ok((rows, "sina")),
                Err(err) => last_error = format!("新浪解析失败: {err}"),
            },
            Err(err) => last_error = format!("新浪不可用: {err}"),
        }
    }

    // Fallback 2: Tencent.
    if target.tencent_symbol.is_some() {
        match fetch_tencent_kline_body(client, target, limit).await {
            Ok(body) => match super::parse::parse_tencent_kline_response(&body) {
                Ok(rows) => return Ok((rows, "tencent")),
                Err(err) => last_error = format!("腾讯解析失败: {err}"),
            },
            Err(err) => last_error = format!("腾讯不可用: {err}"),
        }
    }

    Err(format!("所有免费行情源均失败（{last_error}）"))
}

/// The kline sources a caller can pin explicitly.
pub const KLINE_SOURCES: &[&str] = &["auto", "eastmoney", "sina", "tencent"];

/// Fetches klines using the requested source.
/// - "auto" (default): EastMoney with one retry, then Sina, then Tencent.
/// - "eastmoney" / "sina" / "tencent": pinned source only; a failure is an
///   error, never a silent fallback.
pub async fn fetch_kline_with_source(
    client: &Client,
    target: &KlineTarget,
    limit: u32,
    today: &str,
    source: &str,
) -> Result<(Vec<KlineRow>, &'static str), String> {
    match source {
        "eastmoney" => {
            let body = fetch_eastmoney_kline_body(client, target, limit, today).await?;
            let rows = super::parse::parse_kline_response(&body)?;
            Ok((rows, "eastmoney"))
        }
        "sina" => {
            let symbol = target
                .sina_symbol
                .as_deref()
                .ok_or_else(|| "该市场不支持新浪行情".to_string())?;
            let body = fetch_sina_kline_body(client, &KlineTarget::for_index(
                &target.em_secid, Some(symbol), target.tencent_symbol.as_deref(),
            ), limit).await?;
            let rows = super::parse::parse_sina_kline_response(&body)?;
            Ok((rows, "sina"))
        }
        "tencent" => {
            let symbol = target
                .tencent_symbol
                .as_deref()
                .ok_or_else(|| "该市场不支持腾讯行情".to_string())?;
            let body = fetch_tencent_kline_body(client, &KlineTarget::for_index(
                &target.em_secid, target.sina_symbol.as_deref(), Some(symbol),
            ), limit).await?;
            let rows = super::parse::parse_tencent_kline_response(&body)?;
            Ok((rows, "tencent"))
        }
        _ => fetch_kline_with_fallback(client, target, limit, today).await,
    }
}

/// Fetches one NAV page through the fallback chain:
/// EastMoney desktop lsjz then EastMoney mobile fundmobapi.
pub async fn fetch_fund_nav_with_fallback(
    client: &Client,
    fund_code: &str,
    page_index: u32,
) -> Result<(Vec<NavRow>, &'static str), String> {
    match fetch_fund_nav_body(client, fund_code, page_index).await {
        Ok(body) => match super::parse::parse_fund_nav_response(&body) {
            Ok(rows) => return Ok((rows, "eastmoney")),
            Err(err) => return Err(format!("净值解析失败: {err}")),
        },
        Err(_) => {}
    }
    match fetch_fund_mob_nav_body(client, fund_code, page_index).await {
        Ok(body) => match super::parse::parse_fund_mob_nav_response(&body) {
            Ok(rows) => return Ok((rows, "eastmoney_mob")),
            Err(err) => Err(format!("净值解析失败: {err}")),
        },
        Err(err) => Err(format!("所有免费净值源均失败（{err}）")),
    }
}

/// Compatibility wrapper used by live_check: builds the catalog target and
/// delegates to the EastMoney source only. Test-only; not part of the
/// runtime surface.
#[cfg(test)]
pub async fn fetch_kline_body(
    client: &Client,
    market: u8,
    symbol: &str,
    limit: u32,
    today: &str,
) -> Result<String, String> {
    fetch_eastmoney_kline_body(client, &KlineTarget::for_market(market, symbol), limit, today)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_eastmoney_kline_url() {
        let target = KlineTarget::for_market(1, "600519");
        let url = eastmoney_kline_url(&target, 30, "2026-08-14");
        assert!(url.starts_with(KLINE_EASTMONEY_URL));
        assert!(url.contains("secid=1.600519"));
        assert!(url.contains("klt=101"));
        assert!(url.contains("fqt=1"));
        assert!(url.contains("beg="), "beg date must be present");
    }

    #[test]
    fn builds_sina_and_tencent_urls() {
        let sse = KlineTarget::for_market(1, "600519");
        let szse = KlineTarget::for_market(0, "000001");
        assert_eq!(
            sina_kline_url(&sse, 60),
            format!("{KLINE_SINA_URL}?symbol=sh600519&scale=240&ma=no&datalen=60")
        );
        assert_eq!(
            tencent_kline_url(&szse, 60),
            format!("{KLINE_TENCENT_URL}?param=sz000001,day,,,60,qfq")
        );
    }

    #[test]
    fn builds_index_target_urls() {
        let hsi = KlineTarget::for_index("100.HSI", None, Some("hkHSI"));
        assert_eq!(eastmoney_kline_url(&hsi, 70, "2026-08-14").contains("secid=100.HSI"), true);
        assert_eq!(
            tencent_kline_url(&hsi, 70),
            format!("{KLINE_TENCENT_URL}?param=hkHSI,day,,,70,qfq")
        );
        // sina unavailable for the index -> falls back to the em secid string
        let ndx = KlineTarget::for_index("100.NDX", None, Some("usNDX"));
        assert!(sina_kline_url(&ndx, 70).ends_with("symbol=100.NDX&scale=240&ma=no&datalen=70"));
    }

    #[test]
    fn builds_nav_urls() {
        assert_eq!(
            fund_nav_url("012734", 2),
            format!("{NAV_URL}?fundCode=012734&pageIndex=2&pageSize=20")
        );
        assert!(fund_mob_nav_url("012734", 1).contains("FCODE=012734"));
        assert!(fund_mob_nav_url("012734", 1).contains("pageIndex=1"));
    }
}
