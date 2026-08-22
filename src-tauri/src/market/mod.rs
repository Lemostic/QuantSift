//! Native market data commands.
//!
//! QuantSift fetches A-share/ETF daily bars and open-end fund NAVs through a
//! chain of free public endpoints (EastMoney primary; Sina and Tencent kline
//! plus EastMoney mobile NAV as automatic fallbacks), with no Python runtime
//! and no JS engine. UI and strategy code keep depending on the
//! `MarketDataProvider` contract; these commands are the vendor-facing seam.

pub mod catalog;
pub mod client;
pub mod context;
pub mod parse;
pub mod search;

#[cfg(test)]
mod live_check;

use futures::FutureExt;
use serde::Serialize;
use std::sync::OnceLock;

use catalog::{lookup_instrument, shanghai_iso_now, shanghai_today};
use parse::{parse_fund_nav_response, parse_kline_response, KlineRow, NavRow};

/// Boxed future alias so heterogeneous fetchers share one type in join_all.
type Fetcher = futures::future::BoxFuture<'static, Result<String, String>>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketInstrument {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub kind: String,
    pub exchange: String,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketBar {
    pub instrument_id: String,
    pub trade_date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub adjustment: &'static str,
    pub provider: &'static str,
    pub fetched_at: String,
}

impl MarketBar {
    fn from_kline(
        instrument_id: String,
        row: KlineRow,
        provider: &'static str,
    ) -> Self {
        MarketBar {
            instrument_id,
            trade_date: row.trade_date,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            adjustment: "forward",
            provider,
            fetched_at: shanghai_iso_now(),
        }
    }

    fn from_nav(
        instrument_id: String,
        row: NavRow,
        provider: &'static str,
    ) -> Self {
        MarketBar {
            instrument_id,
            trade_date: row.trade_date,
            open: row.nav,
            high: row.nav,
            low: row.nav,
            close: row.nav,
            volume: 0.0,
            adjustment: "none",
            provider,
            fetched_at: shanghai_iso_now(),
        }
    }
}

/// 为目录外标的解析行情通道。
///
/// exchange/kind 由前端搜索结果的元数据传入；缺失时按代码前缀推断。
/// 返回 (market, otc_fund)：market 为 K 线市场前缀（1=沪, 0=深），
/// otc_fund 为 true 时走基金净值通道。
fn resolve_unknown_instrument(
    symbol: &str,
    exchange: Option<&str>,
    kind: Option<&str>,
) -> (Option<u8>, bool) {
    if kind == Some("fund") && exchange == Some("OTC") {
        return (None, true);
    }
    let market = match exchange {
        Some("SSE") => Some(1),
        Some("SZSE") => Some(0),
        _ => infer_market_from_symbol(symbol),
    };
    match market {
        Some(market) => (Some(market), false),
        None => (None, true),
    }
}

/// 无元数据时的代码前缀推断（仅作兜底，正常路径由前端传入元数据）。
fn infer_market_from_symbol(symbol: &str) -> Option<u8> {
    let first = symbol.chars().next()?;
    match first {
        // 沪市：60/68 开头股票与科创板、51/56/58 开头 ETF。
        '5' | '6' => Some(1),
        // 深市：000/001/002/003/300/301 股票、159/16x ETF。
        '3' => Some(0),
        '0' if symbol.starts_with("000")
            || symbol.starts_with("001")
            || symbol.starts_with("002")
            || symbol.starts_with("003") =>
        {
            Some(0)
        }
        '1' if symbol.starts_with("159") || symbol.starts_with("16") => Some(0),
        _ => None,
    }
}

fn http_client() -> Result<&'static reqwest::Client, String> {
    static CLIENT: OnceLock<Result<reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| client::build_client())
        .as_ref()
        .map_err(|error| error.clone())
}

/// Keeps the last `limit` rows of an ascending list.
fn tail<T>(rows: Vec<T>, limit: u32) -> Vec<T> {
    let skip = rows.len().saturating_sub(limit as usize);
    rows.into_iter().skip(skip).collect()
}

#[tauri::command]
pub fn eastmoney_list_instruments() -> Vec<MarketInstrument> {
    catalog::CATALOG
        .iter()
        .map(|entry| MarketInstrument {
            id: entry.id.to_string(),
            symbol: entry.symbol.to_string(),
            name: entry.name.to_string(),
            kind: entry.kind.to_string(),
            exchange: entry.exchange.to_string(),
            currency: entry.currency.to_string(),
        })
        .collect()
}

#[tauri::command]
pub async fn eastmoney_search_instruments(
    keyword: String,
) -> Result<Vec<MarketInstrument>, String> {
    search::search_instruments(keyword).await
}

#[tauri::command]
pub async fn eastmoney_get_daily_bars(
    instrument_id: String,
    limit: u32,
    source: Option<String>,
    exchange: Option<String>,
    kind: Option<String>,
) -> Result<Vec<MarketBar>, String> {
    let limit = limit.clamp(1, 500);
    let client = http_client()?;
    let today = shanghai_today();
    // 数据源选择：auto（智能回退，默认）/ eastmoney / sina / tencent。
    // 场外基金净值只有东财链路，指定源对净值无效。
    let source = source.as_deref().unwrap_or("auto");
    let source = if client::KLINE_SOURCES.contains(&source) {
        source
    } else {
        "auto"
    };

    // 目录内标的沿用目录元数据；目录外标的（用户搜索添加）用前端传入的
    // exchange/kind 解析行情通道，缺失时按代码前缀兜底推断。
    let (symbol, otc_fund, market) = match lookup_instrument(&instrument_id) {
        Ok(entry) => (
            entry.symbol.to_string(),
            entry.otc_fund,
            entry.market,
        ),
        Err(_) => {
            let symbol = instrument_id
                .strip_prefix("CN:")
                .unwrap_or(instrument_id.as_str())
                .to_string();
            let (market, otc) =
                resolve_unknown_instrument(&symbol, exchange.as_deref(), kind.as_deref());
            (symbol, otc, market)
        }
    };
    let instrument_id_owned = instrument_id;

    if otc_fund {
        // The NAV endpoints cap each page at 20 rows (newest first), so the
        // requested tail may span several pages; an empty page ends the
        // history.
        const MAX_NAV_PAGES: u32 = 30;
        let mut rows: Vec<NavRow> = Vec::new();
        let mut provider: &'static str = "eastmoney";
        for page in 1..=MAX_NAV_PAGES {
            let (page_rows, page_provider) =
                client::fetch_fund_nav_with_fallback(client, &symbol, page).await?;
            provider = page_provider;
            if page_rows.is_empty() {
                break;
            }
            rows.extend(page_rows);
            if rows.len() >= limit as usize {
                break;
            }
        }
        rows.truncate(limit as usize);
        // The NAV APIs return newest first; normalize to ascending dates.
        rows.reverse();
        Ok(rows
            .into_iter()
            .map(|row| MarketBar::from_nav(instrument_id_owned.clone(), row, provider))
            .collect())
    } else {
        let market = market.ok_or_else(|| format!("{instrument_id_owned} 无法确定市场通道"))?;
        let target = client::KlineTarget::for_market(market, &symbol);
        let (rows, provider) =
            client::fetch_kline_with_source(client, &target, limit, &today, source).await?;
        Ok(tail(rows, limit)
            .into_iter()
            .map(|row| MarketBar::from_kline(instrument_id_owned.clone(), row, provider))
            .collect())
    }
}

// ---------------------------------------------------------------------------
// Data-source health check (preferences UI)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceCheck {
    pub id: &'static str,
    pub label: &'static str,
    pub kind: &'static str,
    pub ok: bool,
    pub detail: String,
}

async fn check_kline_source(
    id: &'static str,
    label: &'static str,
    fetcher: Fetcher,
) -> SourceCheck {
    let outcome = match tokio::time::timeout(std::time::Duration::from_secs(10), fetcher).await {
        Ok(Ok(body)) => match parse_kline_response(&body) {
            Ok(rows) => Ok(format!(
                "OK，{} 条日线（最新 {}）",
                rows.len(),
                rows.last().map(|row| row.trade_date.as_str()).unwrap_or("-")
            )),
            Err(err) => Err(format!("数据解析失败：{err}")),
        },
        Ok(Err(err)) => Err(err),
        Err(_) => Err("超时（10s）".to_string()),
    };
    SourceCheck {
        id,
        label,
        kind: "kline",
        ok: outcome.is_ok(),
        detail: outcome.unwrap_or_else(|err| err),
    }
}

async fn check_nav_source(
    id: &'static str,
    label: &'static str,
    fetcher: Fetcher,
) -> SourceCheck {
    let outcome = match tokio::time::timeout(std::time::Duration::from_secs(10), fetcher).await {
        Ok(Ok(body)) => match parse_fund_nav_response(&body) {
            Ok(rows) => Ok(format!(
                "OK，{} 条净值（最新 {}）",
                rows.len(),
                rows.first().map(|row| row.trade_date.as_str()).unwrap_or("-")
            )),
            Err(err) => Err(format!("数据解析失败：{err}")),
        },
        Ok(Err(err)) => Err(err),
        Err(_) => Err("超时（10s）".to_string()),
    };
    SourceCheck {
        id,
        label,
        kind: "nav",
        ok: outcome.is_ok(),
        detail: outcome.unwrap_or_else(|err| err),
    }
}

/// 执行一次完整的数据源体检（K 线三源 + 净值两源 + 搜索）。
async fn run_source_checks() -> Vec<SourceCheck> {
    let client = match http_client() {
        Ok(client) => client,
        Err(err) => {
            return vec![SourceCheck {
                id: "client",
                label: "网络客户端",
                kind: "client",
                ok: false,
                detail: err,
            }];
        }
    };
    let today = shanghai_today();
    let em = client::KlineTarget::for_market(1, "600519");

    // Each fetch is wrapped in an async-move block so the boxed future owns
    // its target/date and satisfies the 'static bound.
    let em_em = em.clone();
    let today_em = today.clone();
    let em_sina = em.clone();
    let em_tencent = em.clone();

    let kline_checks = futures::future::join_all(vec![
        check_kline_source(
            "eastmoney",
            "东方财富 K 线",
            async move {
                client::fetch_eastmoney_kline_body(client, &em_em, 5, &today_em).await
            }
            .boxed(),
        ),
        check_kline_source(
            "sina",
            "新浪财经 K 线",
            async move { client::fetch_sina_kline_body(client, &em_sina, 5).await }.boxed(),
        ),
        check_kline_source(
            "tencent",
            "腾讯行情 K 线",
            async move { client::fetch_tencent_kline_body(client, &em_tencent, 5).await }.boxed(),
        ),
    ])
    .await;

    let nav_checks = futures::future::join_all(vec![
        check_nav_source(
            "nav",
            "东财基金净值（网页版）",
            async move { client::fetch_fund_nav_body(client, "012734", 1).await }.boxed(),
        ),
        check_nav_source(
            "nav_mob",
            "东财基金净值（移动版）",
            async move { client::fetch_fund_mob_nav_body(client, "012734", 1).await }.boxed(),
        ),
    ])
    .await;

    let search_check = match search::search_instruments("茅台".to_string()).await {
        Ok(instruments) => SourceCheck {
            id: "search",
            label: "标的搜索",
            kind: "search",
            ok: true,
            detail: format!("OK，命中 {} 个标的", instruments.len()),
        },
        Err(err) => SourceCheck {
            id: "search",
            label: "标的搜索",
            kind: "search",
            ok: false,
            detail: err,
        },
    };

    let mut checks = Vec::new();
    checks.extend(kline_checks);
    checks.extend(nav_checks);
    checks.push(search_check);
    checks
}

#[cfg(test)]
mod resolution_tests {
    use super::*;

    #[test]
    fn resolves_otc_funds_from_metadata() {
        // 017811 东方人工智能主题混合C：场外基金。
        assert_eq!(
            resolve_unknown_instrument("017811", Some("OTC"), Some("fund")),
            (None, true)
        );
        assert_eq!(
            resolve_unknown_instrument("012734", Some("OTC"), Some("fund")),
            (None, true)
        );
    }

    #[test]
    fn resolves_exchanges_from_metadata() {
        assert_eq!(
            resolve_unknown_instrument("600519", Some("SSE"), Some("stock")),
            (Some(1), false)
        );
        assert_eq!(
            resolve_unknown_instrument("000001", Some("SZSE"), Some("stock")),
            (Some(0), false)
        );
        assert_eq!(
            resolve_unknown_instrument("510300", Some("SSE"), Some("fund")),
            (Some(1), false)
        );
    }

    #[test]
    fn infers_market_from_symbol_without_metadata() {
        assert_eq!(infer_market_from_symbol("600519"), Some(1));
        assert_eq!(infer_market_from_symbol("688981"), Some(1));
        assert_eq!(infer_market_from_symbol("510300"), Some(1));
        assert_eq!(infer_market_from_symbol("000001"), Some(0));
        assert_eq!(infer_market_from_symbol("300750"), Some(0));
        assert_eq!(infer_market_from_symbol("159915"), Some(0));
        assert_eq!(infer_market_from_symbol("161725"), Some(0));
        // 无法归类的 0/1 开头代码按场外基金净值处理。
        assert_eq!(infer_market_from_symbol("017811"), None);
        assert_eq!(infer_market_from_symbol("011479"), None);
        assert_eq!(infer_market_from_symbol("abc"), None);
    }

    #[test]
    fn resolver_falls_back_to_inference() {
        assert_eq!(
            resolve_unknown_instrument("600519", None, None),
            (Some(1), false)
        );
        assert_eq!(
            resolve_unknown_instrument("017811", None, None),
            (None, true)
        );
    }
}

/// 立即体检（手动"重新检测"按钮使用，不做缓存）。
#[tauri::command]
pub async fn market_check_sources() -> Vec<SourceCheck> {
    run_source_checks().await
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceStatus {
    pub cached_at: String,
    pub checks: Vec<SourceCheck>,
    pub summary: String,
}

static SOURCE_STATUS_CACHE: OnceLock<
    tokio::sync::Mutex<Option<(std::time::Instant, SourceStatus)>>
> = OnceLock::new();

fn source_status_cache() -> &'static tokio::sync::Mutex<Option<(std::time::Instant, SourceStatus)>> {
    SOURCE_STATUS_CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

fn source_status_summary(checks: &[SourceCheck]) -> String {
    let ok = checks.iter().filter(|check| check.ok).count();
    let kline_ok = checks
        .iter()
        .filter(|check| check.kind == "kline" && check.ok)
        .count();
    format!("{ok}/{} 数据源可用（K 线源 {kline_ok}/3）", checks.len())
}

/// 数据源连通性状态（5 分钟进程内缓存）：供偏好页进入时自动检测，
/// 无需每次打开页面都请求一遍所有端点。
#[tauri::command]
pub async fn market_source_status() -> SourceStatus {
    let now = std::time::Instant::now();
    let cache = source_status_cache();
    if let Some((cached_at, status)) = cache.lock().await.as_ref() {
        if cached_at.elapsed() < std::time::Duration::from_secs(300) {
            return status.clone();
        }
    }
    let checks = run_source_checks().await;
    let summary = source_status_summary(&checks);
    let status = SourceStatus {
        cached_at: shanghai_iso_now(),
        summary,
        checks,
    };
    let mut guard = cache.lock().await;
    *guard = Some((now, status.clone()));
    status
}
