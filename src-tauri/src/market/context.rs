//! Market environment context for AI calibration.
//!
//! Fetches daily klines for a fixed set of domestic and global indices
//! through the free fallback chain, computes deterministic regime statistics
//! (MA position, momentum, volatility) and aggregates them into a compact
//! "market environment" payload that the AI analysis prompt consumes.
//! No LLM call is involved: everything here is plain arithmetic on the
//! normalized index rows.

use serde::Serialize;

use super::client;
use super::parse::KlineRow;

/// One index known to the market-context service.
pub struct IndexMeta {
    pub id: &'static str,
    pub name: &'static str,
    pub region: &'static str,
    pub em_secid: &'static str,
    pub sina_symbol: Option<&'static str>,
    pub tencent_symbol: Option<&'static str>,
}

/// Domestic + global index set. All addresses point to free public
/// endpoints; global indices use the EastMoney secid scheme (100.*) with
/// Tencent fallback where the symbol is known.
pub const INDEX_CATALOG: &[IndexMeta] = &[
    IndexMeta { id: "sh000001", name: "上证指数", region: "domestic", em_secid: "1.000001", sina_symbol: Some("sh000001"), tencent_symbol: Some("sh000001") },
    IndexMeta { id: "sz399001", name: "深证成指", region: "domestic", em_secid: "0.399001", sina_symbol: Some("sz399001"), tencent_symbol: Some("sz399001") },
    IndexMeta { id: "sz399006", name: "创业板指", region: "domestic", em_secid: "0.399006", sina_symbol: Some("sz399006"), tencent_symbol: Some("sz399006") },
    IndexMeta { id: "sh000300", name: "沪深300", region: "domestic", em_secid: "1.000300", sina_symbol: Some("sh000300"), tencent_symbol: Some("sh000300") },
    IndexMeta { id: "sh000905", name: "中证500", region: "domestic", em_secid: "1.000905", sina_symbol: Some("sh000905"), tencent_symbol: Some("sh000905") },
    IndexMeta { id: "hkHSI", name: "恒生指数", region: "global", em_secid: "100.HSI", sina_symbol: None, tencent_symbol: Some("hkHSI") },
    IndexMeta { id: "usDJI", name: "道琼斯", region: "global", em_secid: "100.DJIA", sina_symbol: None, tencent_symbol: Some("usDJI") },
    IndexMeta { id: "usSPX", name: "标普500", region: "global", em_secid: "100.SPX", sina_symbol: None, tencent_symbol: Some("usINX") },
    IndexMeta { id: "usNDX", name: "纳斯达克100", region: "global", em_secid: "100.NDX", sina_symbol: None, tencent_symbol: Some("usNDX") },
    IndexMeta { id: "jpN225", name: "日经225", region: "global", em_secid: "100.N225", sina_symbol: None, tencent_symbol: None },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexSnapshot {
    pub id: &'static str,
    pub name: &'static str,
    pub region: &'static str,
    pub provider: &'static str,
    pub as_of_date: String,
    pub close: f64,
    pub change_pct: f64,
    pub change_20d_pct: f64,
    pub change_60d_pct: f64,
    pub above_ma20: bool,
    pub above_ma60: bool,
    pub volatility_20d: f64,
    pub regime_label: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketContextPayload {
    pub as_of_date: String,
    pub fetched_at: String,
    /// 全球风险偏好：risk_on / risk_off / mixed / unknown
    pub global_regime: &'static str,
    /// A 股中期位置：strong / neutral / weak / unknown
    pub domestic_regime: &'static str,
    pub summary: String,
    pub indices: Vec<IndexSnapshot>,
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn sma(closes: &[f64], period: usize) -> Option<f64> {
    if closes.len() < period {
        return None;
    }
    let window = &closes[closes.len() - period..];
    Some(window.iter().sum::<f64>() / period as f64)
}

fn pct_change(from: f64, to: f64) -> f64 {
    if from == 0.0 {
        return 0.0;
    }
    (to - from) / from * 100.0
}

fn daily_volatility(closes: &[f64], period: usize) -> f64 {
    if closes.len() < period + 1 {
        return 0.0;
    }
    let returns: Vec<f64> = closes[closes.len() - period..]
        .windows(2)
        .map(|pair| (pair[1] - pair[0]) / pair[0])
        .collect();
    if returns.is_empty() {
        return 0.0;
    }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns
        .iter()
        .map(|value| (value - mean) * (value - mean))
        .sum::<f64>()
        / returns.len() as f64;
    variance.sqrt() * 100.0
}

/// Computes the deterministic snapshot for one index. Requires at least 61
/// rows for the full MA60/60d picture; shorter histories degrade gracefully
/// (above_ma60/60d stats report false/0 when unavailable).
pub fn build_index_snapshot(
    meta: &IndexMeta,
    rows: &[KlineRow],
    provider: &'static str,
) -> Option<IndexSnapshot> {
    let last = rows.last()?;
    let closes: Vec<f64> = rows.iter().map(|row| row.close).collect();
    let ma20 = sma(&closes, 20)?;
    let close = last.close;

    let change_pct = if closes.len() >= 2 {
        pct_change(closes[closes.len() - 2], close)
    } else {
        0.0
    };
    let change_20d_pct = if closes.len() >= 21 {
        pct_change(closes[closes.len() - 21], close)
    } else {
        0.0
    };
    let change_60d_pct = if closes.len() >= 61 {
        pct_change(closes[closes.len() - 61], close)
    } else {
        0.0
    };
    let ma60 = sma(&closes, 60);
    let above_ma20 = close >= ma20;
    let above_ma60 = ma60.map_or(false, |value| close >= value);
    let regime_label = match (above_ma20, above_ma60) {
        (true, true) => "上行",
        (false, false) => "下行",
        _ => "震荡",
    };

    Some(IndexSnapshot {
        id: meta.id,
        name: meta.name,
        region: meta.region,
        provider,
        as_of_date: last.trade_date.clone(),
        close: round2(close),
        change_pct: round2(change_pct),
        change_20d_pct: round2(change_20d_pct),
        change_60d_pct: round2(change_60d_pct),
        above_ma20,
        above_ma60,
        volatility_20d: round2(daily_volatility(&closes, 20)),
        regime_label,
    })
}

fn days_since_epoch(date: &str) -> Option<i64> {
    let year: i64 = date.get(0..4)?.parse().ok()?;
    let month: u32 = date.get(5..7)?.parse().ok()?;
    let day: u32 = date.get(8..10)?.parse().ok()?;
    let adjusted_year = if month <= 2 { year - 1 } else { year };
    let era = if adjusted_year >= 0 {
        adjusted_year / 400
    } else {
        (adjusted_year - 399) / 400
    };
    let year_of_era = adjusted_year - era * 400;
    let month_prime = (month as i64 + 9) % 12;
    let day_of_year = (153 * month_prime + 2) / 5 + day as i64 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    Some(era * 146_097 + day_of_era - 719_468)
}

fn days_between(later: &str, earlier: &str) -> i64 {
    match (days_since_epoch(later), days_since_epoch(earlier)) {
        (Some(a), Some(b)) => a - b,
        _ => 0,
    }
}

/// Aggregates index snapshots into the market-environment payload.
pub fn build_market_context(snaps: Vec<IndexSnapshot>, today: &str) -> MarketContextPayload {
    let as_of_date = snaps
        .iter()
        .map(|snap| snap.as_of_date.as_str())
        .max()
        .unwrap_or(today)
        .to_string();

    let globals: Vec<&IndexSnapshot> = snaps
        .iter()
        .filter(|snap| snap.region == "global")
        .collect();
    let global_up = globals
        .iter()
        .filter(|snap| snap.change_20d_pct > 0.0)
        .count();
    let global_regime = if globals.is_empty() {
        "unknown"
    } else {
        let ratio = global_up as f64 / globals.len() as f64;
        if ratio >= 0.6 {
            "risk_on"
        } else if ratio <= 0.4 {
            "risk_off"
        } else {
            "mixed"
        }
    };

    let anchor = snaps
        .iter()
        .find(|snap| snap.id == "sh000300")
        .or_else(|| snaps.iter().find(|snap| snap.id == "sh000001"));
    let domestic_regime = match anchor {
        Some(snap) if snap.above_ma60 => "strong",
        Some(snap) if !snap.above_ma60 => "weak",
        Some(_) => "neutral",
        None => "unknown",
    };

    let domestic_up = snaps
        .iter()
        .filter(|snap| snap.region == "domestic" && snap.change_20d_pct > 0.0)
        .count();
    let domestic_total = snaps.iter().filter(|snap| snap.region == "domestic").count();

    let global_label = match global_regime {
        "risk_on" => "全球风险偏好偏暖",
        "risk_off" => "全球风险偏好偏冷",
        "mixed" => "全球风险偏好分化",
        _ => "全球风险偏好未知",
    };
    let global_detail = if globals.is_empty() {
        String::new()
    } else {
        format!("（{global_up}/{} 指数 20 日上涨）", globals.len())
    };
    let domestic_label = match (anchor, domestic_regime) {
        (Some(snap), "strong") => format!("{}位于 MA60 上方，A 股中期结构偏强", snap.name),
        (Some(snap), "weak") => format!("{}跌破 MA60，A 股中期结构偏弱", snap.name),
        (Some(snap), _) => format!("{}围绕 MA60 震荡，A 股方向未定", snap.name),
        _ => "A 股指数数据缺失".to_string(),
    };
    let mut summary = format!(
        "{global_label}{global_detail}；{domestic_label}；A 股 {domestic_up}/{domestic_total} 指数 20 日上涨。"
    );
    if days_between(today, &as_of_date) > 4 {
        summary.push_str("（指数数据可能滞后于周末/节假日）");
    }

    MarketContextPayload {
        as_of_date,
        fetched_at: super::catalog::shanghai_iso_now(),
        global_regime,
        domestic_regime,
        summary,
        indices: snaps,
    }
}

/// Fetches all index snapshots concurrently through the fallback chain.
/// Individual failures are tolerated; an empty result is an error.
pub async fn fetch_market_context(
    client: &reqwest::Client,
    today: &str,
) -> Result<MarketContextPayload, String> {
    let tasks = INDEX_CATALOG.iter().map(|meta| {
        let target = client::KlineTarget::for_index(
            meta.em_secid,
            meta.sina_symbol,
            meta.tencent_symbol,
        );
        let today = today.to_string();
        async move {
            match client::fetch_kline_with_fallback(client, &target, 70, &today).await {
                Ok((rows, provider)) => build_index_snapshot(meta, &rows, provider),
                Err(_) => None,
            }
        }
    });
    let snaps: Vec<IndexSnapshot> = futures::future::join_all(tasks)
        .await
        .into_iter()
        .flatten()
        .collect();
    if snaps.is_empty() {
        return Err("所有指数数据源均不可用".to_string());
    }
    Ok(build_market_context(snaps, today))
}

#[tauri::command]
pub async fn market_get_context() -> Result<MarketContextPayload, String> {
    let client = crate::market::http_client()?;
    fetch_market_context(client, &crate::market::catalog::shanghai_today()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(closes: &[f64], start_date: &str) -> Vec<KlineRow> {
        let mut day = 1;
        closes
            .iter()
            .map(|close| {
                // start_date is "YYYY-MM"; day counter keeps dates monotonic
                // (day may exceed the calendar month for long test windows).
                let date = format!("{}-{:02}", start_date, day);
                day += 1;
                KlineRow {
                    trade_date: date,
                    open: *close,
                    high: close + 1.0,
                    low: close - 1.0,
                    close: *close,
                    volume: 1000.0,
                }
            })
            .collect()
    }

    #[test]
    fn snapshot_detects_uptrend_and_stats() {
        // 80 days of steady uptrend: 100 -> 198
        let closes: Vec<f64> = (0..80).map(|i| 100.0 + i as f64 * 1.25).collect();
        let meta = &INDEX_CATALOG[3]; // 沪深300
        let snap = build_index_snapshot(meta, &rows(&closes, "2026-05"), "eastmoney").expect("snapshot");
        assert_eq!(snap.id, "sh000300");
        assert_eq!(snap.region, "domestic");
        assert!(snap.above_ma20 && snap.above_ma60);
        assert_eq!(snap.regime_label, "上行");
        assert!(snap.change_20d_pct > 0.0);
        assert!(snap.change_60d_pct > 0.0);
        assert!(snap.volatility_20d > 0.0);
        assert!((snap.close - 198.75).abs() < 0.01);
    }

    #[test]
    fn snapshot_detects_downtrend() {
        let closes: Vec<f64> = (0..80).map(|i| 200.0 - i as f64 * 1.0).collect();
        let meta = &INDEX_CATALOG[0]; // 上证指数
        let snap = build_index_snapshot(meta, &rows(&closes, "2026-05"), "tencent").expect("snapshot");
        assert_eq!(snap.regime_label, "下行");
        assert!(!snap.above_ma20 && !snap.above_ma60);
        assert!(snap.change_20d_pct < 0.0);
        assert_eq!(snap.provider, "tencent");
    }

    #[test]
    fn snapshot_degrades_gracefully_on_short_history() {
        let closes: Vec<f64> = (0..25).map(|i| 100.0 + i as f64).collect();
        let meta = &INDEX_CATALOG[4];
        let snap = build_index_snapshot(meta, &rows(&closes, "2026-07"), "sina").expect("snapshot");
        assert!(snap.above_ma20);
        assert!(!snap.above_ma60, "MA60 unavailable on short history");
        assert_eq!(snap.change_60d_pct, 0.0);
        assert!(build_index_snapshot(meta, &rows(&[1.0], "2026-08"), "sina").is_none());
    }

    #[test]
    fn aggregates_risk_on_and_strong_domestic() {
        let mut snaps = Vec::new();
        for (idx, meta) in INDEX_CATALOG.iter().enumerate() {
            let rising = meta.region == "global" || idx < 5;
            let closes: Vec<f64> = (0..70)
                .map(|i| if rising { 100.0 + i as f64 } else { 200.0 - i as f64 })
                .collect();
            snaps.push(
                build_index_snapshot(meta, &rows(&closes, "2026-05"), "eastmoney").expect("snap"),
            );
        }
        let payload = build_market_context(snaps, "2026-08-14");
        assert_eq!(payload.global_regime, "risk_on");
        assert_eq!(payload.domestic_regime, "strong");
        assert!(payload.summary.contains("全球风险偏好偏暖"));
        assert!(payload.summary.contains("沪深300"));
        assert_eq!(payload.indices.len(), INDEX_CATALOG.len());
        assert_eq!(payload.as_of_date, "2026-05-70");
    }

    #[test]
    fn aggregates_risk_off_and_weak_domestic() {
        let mut snaps = Vec::new();
        for meta in INDEX_CATALOG {
            let closes: Vec<f64> = (0..70).map(|i| 300.0 - i as f64).collect();
            snaps.push(
                build_index_snapshot(meta, &rows(&closes, "2026-05"), "eastmoney").expect("snap"),
            );
        }
        let payload = build_market_context(snaps, "2026-08-14");
        assert_eq!(payload.global_regime, "risk_off");
        assert_eq!(payload.domestic_regime, "weak");
        assert!(payload.summary.contains("跌破 MA60"));
    }

    #[test]
    fn flags_stale_index_dates() {
        let mut snaps = Vec::new();
        for meta in &INDEX_CATALOG[..2] {
            let closes: Vec<f64> = (0..70).map(|i| 100.0 + i as f64).collect();
            snaps.push(
                build_index_snapshot(meta, &rows(&closes, "2026-05"), "eastmoney").expect("snap"),
            );
        }
        let payload = build_market_context(snaps, "2026-08-14");
        assert!(
            payload.summary.contains("滞后"),
            "stale date must be flagged: {}",
            payload.summary
        );
    }
}
