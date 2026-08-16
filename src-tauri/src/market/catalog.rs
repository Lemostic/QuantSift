//! Normalized instrument catalog and date helpers.
//!
//! The catalog is static and mirrors the previous AKShare sidecar's list:
//! QuantSift researches a personal watchlist, not the whole market.

use std::time::{SystemTime, UNIX_EPOCH};

pub struct CatalogEntry {
    pub id: &'static str,
    pub symbol: &'static str,
    pub name: &'static str,
    pub kind: &'static str,
    pub exchange: &'static str,
    pub currency: &'static str,
    /// EastMoney kline market prefix: 1 = SSE, 0 = SZSE.
    pub market: Option<u8>,
    /// Open-end funds publish NAV instead of OHLC.
    pub otc_fund: bool,
}

pub const CATALOG: &[CatalogEntry] = &[
    CatalogEntry {
        id: "CN:510300",
        symbol: "510300",
        name: "沪深300ETF",
        kind: "fund",
        exchange: "SSE",
        currency: "CNY",
        market: Some(1),
        otc_fund: false,
    },
    CatalogEntry {
        id: "CN:600519",
        symbol: "600519",
        name: "贵州茅台",
        kind: "stock",
        exchange: "SSE",
        currency: "CNY",
        market: Some(1),
        otc_fund: false,
    },
    CatalogEntry {
        id: "CN:000001",
        symbol: "000001",
        name: "平安银行",
        kind: "stock",
        exchange: "SZSE",
        currency: "CNY",
        market: Some(0),
        otc_fund: false,
    },
    CatalogEntry {
        id: "CN:159915",
        symbol: "159915",
        name: "创业板ETF",
        kind: "fund",
        exchange: "SZSE",
        currency: "CNY",
        market: Some(0),
        otc_fund: false,
    },
    CatalogEntry {
        id: "CN:600036",
        symbol: "600036",
        name: "招商银行",
        kind: "stock",
        exchange: "SSE",
        currency: "CNY",
        market: Some(1),
        otc_fund: false,
    },
    CatalogEntry {
        id: "CN:012734",
        symbol: "012734",
        name: "易方达人工智能ETF联接C",
        kind: "fund",
        exchange: "OTC",
        currency: "CNY",
        market: None,
        otc_fund: true,
    },
];

pub fn lookup_instrument(instrument_id: &str) -> Result<&'static CatalogEntry, String> {
    CATALOG
        .iter()
        .find(|entry| entry.id == instrument_id)
        .ok_or_else(|| format!("未知标的: {instrument_id}"))
}

// ---------------------------------------------------------------------------
// Civil-date helpers (Howard Hinnant algorithms), used to compute the kline
// `beg` parameter and the +08:00 fetchedAt timestamp without extra deps.
// ---------------------------------------------------------------------------

fn days_from_civil(year: i64, month: u32, day: u32) -> i64 {
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
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z / 146_097 } else { (z - 146_096) / 146_097 };
    let day_of_era = z - era * 146_097;
    let year_of_era = (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096)
        / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    } as u32;
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

fn unix_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

/// Current wall clock in Asia/Shanghai as ISO 8601 with the +08:00 offset.
pub fn shanghai_iso_now() -> String {
    let seconds = unix_seconds() + 8 * 3600;
    let days = seconds.div_euclid(86_400);
    let rem = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}+08:00",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// Today's date in Asia/Shanghai as `YYYY-MM-DD`.
pub fn shanghai_today() -> String {
    let seconds = unix_seconds() + 8 * 3600;
    let days = seconds.div_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

/// `beg` parameter for the kline API: today minus a buffer large enough for
/// weekends and holidays, so a `limit`-bar window is always fully covered.
pub fn kline_begin_date(limit: u32, today: &str) -> String {
    let year: i64 = today[0..4].parse().unwrap_or(2020);
    let month: u32 = today[5..7].parse().unwrap_or(1);
    let day: u32 = today[8..10].parse().unwrap_or(1);
    let buffer = limit.saturating_mul(3).saturating_add(10) as i64;
    let (y, m, d) = civil_from_days(days_from_civil(year, month, day) - buffer);
    format!("{y:04}{m:02}{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_lookup_round_trips() {
        for entry in CATALOG {
            let found = lookup_instrument(entry.id).expect("catalog ids must resolve");
            assert_eq!(found.id, entry.id);
        }
        assert!(lookup_instrument("CN:NOPE").is_err());
    }

    #[test]
    fn kline_begin_date_covers_the_window() {
        // A 30-bar request from a Friday needs to start well before the
        // weekend so 30 trading days fit in the window.
        let begin = kline_begin_date(30, "2026-08-14");
        assert!(begin.as_str() < "20260701", "begin should be ~100 days back, got {begin}");
        assert_eq!(begin.len(), 8);
        assert_eq!(kline_begin_date(500, "2026-08-14").len(), 8);
    }

    #[test]
    fn civil_date_round_trips() {
        for (y, m, d) in [(2026, 8, 14), (2024, 2, 29), (1970, 1, 1), (1999, 12, 31)] {
            let days = days_from_civil(y, m, d);
            assert_eq!(civil_from_days(days), (y, m, d));
        }
    }

    #[test]
    fn shanghai_iso_now_is_well_formed() {
        let stamp = shanghai_iso_now();
        assert!(stamp.len() >= 19);
        assert!(stamp.ends_with("+08:00"));
        assert_eq!(&stamp[4..5], "-");
        assert_eq!(&stamp[10..11], "T");
    }
}
