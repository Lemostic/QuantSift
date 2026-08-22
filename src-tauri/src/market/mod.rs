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

use catalog::{lookup_instrument, shanghai_iso_now, shanghai_today, CatalogEntry};
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
    pub instrument_id: &'static str,
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
    fn from_kline(entry: &CatalogEntry, row: KlineRow, provider: &'static str) -> Self {
        MarketBar {
            instrument_id: entry.id,
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

    fn from_nav(entry: &CatalogEntry, row: NavRow, provider: &'static str) -> Self {
        MarketBar {
            instrument_id: entry.id,
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
) -> Result<Vec<MarketBar>, String> {
    let entry = lookup_instrument(&instrument_id)?;
    let limit = limit.clamp(1, 500);
    let client = http_client()?;
    let today = shanghai_today();

    if entry.otc_fund {
        // The NAV endpoints cap each page at 20 rows (newest first), so the
        // requested tail may span several pages; an empty page ends the
        // history.
        const MAX_NAV_PAGES: u32 = 30;
        let mut rows: Vec<NavRow> = Vec::new();
        let mut provider: &'static str = "eastmoney";
        for page in 1..=MAX_NAV_PAGES {
            let (page_rows, page_provider) =
                client::fetch_fund_nav_with_fallback(client, entry.symbol, page).await?;
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
            .map(|row| MarketBar::from_nav(entry, row, provider))
            .collect())
    } else {
        let market = entry
            .market
            .ok_or_else(|| format!("{} 缺少市场前缀", entry.id))?;
        let target = client::KlineTarget::for_market(market, entry.symbol);
        let (rows, provider) =
            client::fetch_kline_with_fallback(client, &target, limit, &today).await?;
        Ok(tail(rows, limit)
            .into_iter()
            .map(|row| MarketBar::from_kline(entry, row, provider))
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

/// 体检所有免费数据源（K 线三源 + 净值两源 + 搜索），供偏好页展示。
#[tauri::command]
pub async fn market_check_sources() -> Vec<SourceCheck> {
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
