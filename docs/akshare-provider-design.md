# AKShare Data Provider Design

## Goal

Replace the hard-coded `recorded-market-data-provider` as the primary data
source with a real AKShare-backed provider while keeping the
`MarketDataProvider` contract intact. The app must continue to work offline
by falling back to the recorded fixtures.

## Architecture

```
┌──────────────┐   invoke (JSON)   ┌──────────────────┐   spawn + stdio   ┌────────────────────┐
│  React UI    │ ────────────────► │  Tauri (Rust)    │ ─────────────────► │  Python sidecar    │
│  (provider)  │ ◄──────────────── │  sidecar manager │ ◄───────────────── │  (akshare)         │
└──────────────┘                   └──────────────────┘                    └────────────────────┘
```

- Frontend depends only on `MarketDataProvider`. UI and strategy code never
  import AKShare or call vendor HTTP endpoints directly (AGENTS.md boundary).
- The Tauri layer owns the Python process lifecycle and JSON line protocol.
- The Python sidecar is the only code that talks to AKShare / eastmoney.

## Directory layout

```text
sidecar/
  quantsift_sidecar.py   # Python stdio JSON-RPC server (akshare)
  requirements.txt       # pinned deps (akshare, pandas, requests)
  fixtures/              # recorded responses for contract tests
    stock_600519.json
    fund_012734.json
    instruments.json
src-tauri/src/
  sidecar/
    mod.rs               # module wiring
    manager.rs           # process spawn/stop/health
    rpc.rs               # JSON-RPC client over stdio
src/data/
  akshare-provider.ts    # MarketDataProvider impl via Tauri invoke
  provider-registry.ts   # choose active provider + fallback
```

## JSON-RPC protocol (line-delimited)

Each request is a single JSON object on one line on the sidecar's stdin; each
response is a single JSON object on one line on stdout.

Request:
```json
{"id": 1, "method": "list_instruments", "params": {}}
{"id": 2, "method": "get_daily_bars", "params": {"instrumentId": "CN:600519", "limit": 30}}
```

Response:
```json
{"id": 1, "ok": true, "result": [{"id": "CN:600519", "symbol": "600519", "name": "贵州茅台", "kind": "stock", "exchange": "SSE", "currency": "CNY"}]}
{"id": 2, "ok": true, "result": [{"instrumentId": "CN:600519", "tradeDate": "2026-07-10", "open": 1182.2, "high": 1204.98, "low": 1170.28, "close": 1204.98, "volume": 52213, "adjustment": "forward", "provider": "akshare", "fetchedAt": "2026-08-11T12:00:00+08:00"}]}
{"id": 3, "ok": false, "error": {"code": "network_error", "message": "东财接口超时"}}
```

## Instrument catalog

The sidecar owns a small static catalog of known instruments (stocks + ETFs +
open-end funds) plus the watchlist defaults. This keeps `listInstruments`
cheap and deterministic. Live lookups happen in `get_daily_bars`.

## AKShare mapping

| Instrument kind | AKShare function | Notes |
|---|---|---|
| stock (SSE/SZSE) | `stock_zh_a_hist(symbol, period='daily', adjust='qfq')` | 前复权日线 |
| fund (ETF, SSE/SZSE) | `fund_etf_hist_em(symbol, period='daily', adjust='qfq')` | 场内 ETF 日 K |
| fund (OTC) | `fund_open_fund_info_em(symbol, indicator='单位净值走势')` | 场外净值，无 OHLC，构造单净值 bar |

Mapping rules:
- `kind=stock` and `kind=fund` (ETF) use OHLC columns.
- `kind=fund` (OTC) has only NAV; open=high=low=close=nav, volume=0.
- Column names are Chinese (日期/开盘/收盘/最高/最低/成交量). Map them to the
  normalized `DailyBar` fields explicitly. Never assume column order.
- `tradeDate` normalized to `YYYY-MM-DD`; `fetchedAt` is the sidecar wall clock
  in `Asia/Shanghai` ISO 8601 with offset.
- Sort ascending by date before returning; drop weekends.

## Failure handling

- Provider failures throw a typed error; the app keeps the last good data and
  shows a stale/freshness indicator (V0.md: UI 展示新鲜度、抓取失败和缓存回退状态).
- Sidecar crash → Rust manager restarts once; after 3 failures in a row it
  returns `sidecar_unavailable` and the app falls back to recorded fixtures.
- Python import errors are reported as `sidecar_startup_failed`.

## Test strategy

- Contract tests run against **recorded fixtures** (no network, no Python).
- Python sidecar has its own pytest suite using monkeypatched AKShare so CI
  does not depend on eastmoney availability.
- TypeScript provider tests use a fake Tauri invoke bridge.
