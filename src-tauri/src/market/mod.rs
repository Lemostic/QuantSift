//! Native market data commands.
//!
//! QuantSift fetches A-share/ETF daily bars and open-end fund NAVs directly
//! from the EastMoney public endpoints (the same endpoints the previous
//! AKShare sidecar wrapped), with no Python runtime and no JS engine. UI
//! and strategy code keep depending on the `MarketDataProvider` contract;
//! these commands are the vendor-facing seam.

pub mod catalog;
pub mod client;
pub mod parse;

use serde::Serialize;
use std::sync::OnceLock;

use catalog::{lookup_instrument, shanghai_iso_now, shanghai_today, CatalogEntry};
use parse::{parse_fund_nav_response, parse_kline_response};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketInstrument {
    pub id: &'static str,
    pub symbol: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    pub exchange: &'static str,
    pub currency: &'static str,
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
    fn from_kline(entry: &CatalogEntry, row: parse::KlineRow) -> Self {
        MarketBar {
            instrument_id: entry.id,
            trade_date: row.trade_date,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
            volume: row.volume,
            adjustment: "forward",
            provider: "eastmoney",
            fetched_at: shanghai_iso_now(),
        }
    }

    fn from_nav(entry: &CatalogEntry, row: parse::NavRow) -> Self {
        MarketBar {
            instrument_id: entry.id,
            trade_date: row.trade_date,
            open: row.nav,
            high: row.nav,
            low: row.nav,
            close: row.nav,
            volume: 0.0,
            adjustment: "none",
            provider: "eastmoney",
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
            id: entry.id,
            symbol: entry.symbol,
            name: entry.name,
            kind: entry.kind,
            exchange: entry.exchange,
            currency: entry.currency,
        })
        .collect()
}

#[tauri::command]
pub async fn eastmoney_get_daily_bars(
    instrument_id: String,
    limit: u32,
) -> Result<Vec<MarketBar>, String> {
    let entry = lookup_instrument(&instrument_id)?;
    let limit = limit.clamp(1, 500);

    if entry.otc_fund {
        // The NAV endpoint caps each page at 20 rows (newest first), so the
        // requested tail may span several pages; an empty page ends the
        // history.
        const MAX_NAV_PAGES: u32 = 30;
        let mut rows: Vec<parse::NavRow> = Vec::new();
        for page in 1..=MAX_NAV_PAGES {
            let body = client::fetch_fund_nav_body(http_client()?, entry.symbol, page).await?;
            let page_rows = parse_fund_nav_response(&body)?;
            if page_rows.is_empty() {
                break;
            }
            rows.extend(page_rows);
            if rows.len() >= limit as usize {
                break;
            }
        }
        rows.truncate(limit as usize);
        // The NAV API returns newest first; normalize to ascending dates.
        rows.reverse();
        Ok(rows
            .into_iter()
            .map(|row| MarketBar::from_nav(entry, row))
            .collect())
    } else {
        let market = entry
            .market
            .ok_or_else(|| format!("{} 缺少市场前缀", entry.id))?;
        let body = client::fetch_kline_body(
            http_client()?,
            market,
            entry.symbol,
            limit,
            &shanghai_today(),
        )
        .await?;
        let rows = parse_kline_response(&body)?;
        Ok(tail(rows, limit)
            .into_iter()
            .map(|row| MarketBar::from_kline(entry, row))
            .collect())
    }
}
