# EastMoney Data Provider Design

QuantSift v0.6 replaced the AKShare Python sidecar with a native Rust data
service. The live source is now the EastMoney public JSON endpoints, fetched
directly from the Tauri backend — no Python runtime, no V8/JS engine, no API
key.

## Architecture

```
┌──────────────┐   MarketDataProvider    ┌──────────────────┐   HTTP/JSON   ┌──────────────────┐
│  React UI    │ ─────────────────────► │  Tauri (Rust)    │ ─────────────► │  EastMoney API   │
│  (provider)  │ ◄───────────────────── │  market commands │ ◄───────────── │  (public)        │
└──────────────┘                        └──────────────────┘                └──────────────────┘
```

- UI and strategy code depend only on `MarketDataProvider`; they never import
  vendor endpoints directly (AGENTS.md boundary).
- `src-tauri/src/market/catalog.rs` — static watchlist catalog (stocks, ETFs,
  OTC funds) plus civil-date helpers.
- `src-tauri/src/market/client.rs` — the only code that talks to a vendor
  HTTP endpoint (reqwest, 20s timeout, browser User-Agent).
- `src-tauri/src/market/parse.rs` — pure JSON response parsing, tested against
  recorded fixtures under `src-tauri/src/market/fixtures/`.
- `src-tauri/src/market/mod.rs` — `eastmoney_list_instruments` and
  `eastmoney_get_daily_bars` Tauri commands, error mapping.
- Frontend `src/data/eastmoney-provider.ts` — `MarketDataProvider` impl via
  Tauri invoke; `provider-registry.ts` prefers it and falls back to recorded
  fixtures.

## Endpoints

| Instrument kind | Endpoint | Params |
|---|---|---|
| Stock / ETF (前复权日 K) | `push2his.eastmoney.com/api/qt/stock/kline/get` | `secid={market}.{symbol}` (1=SSE, 0=SZSE), `klt=101`, `fqt=1` (qfq), `fields2=f51,f52,f53,f54,f55,f56` (date,open,close,high,low,volume), `beg`/`end` date window |
| OTC fund (单位净值) | `api.fund.eastmoney.com/f10/lsjz` | `fundCode`, `pageIndex`, `pageSize`, `Referer: http://fundf10.eastmoney.com/` |

Both endpoints are the same ones the previous AKShare wrapper used, so data
semantics (前复权, 净值单价格 bar) are unchanged. The kline `beg` window is
computed from the requested limit with a weekend/holiday buffer, so responses
stay small.

## Normalization

- `tradeDate` is `YYYY-MM-DD`; bars are returned oldest first, weekend rows
  excluded by the API itself.
- Stock/ETF bars: `adjustment = "forward"`, real OHLCV; OTC fund bars:
  `adjustment = "none"`, open=high=low=close=nav, volume=0.
- `provider = "eastmoney"`, `fetchedAt` is the backend wall clock in
  Asia/Shanghai (`+08:00`).
- Fetch failures serialize as errors containing `网络` / `Network` so the
  frontend classifies them as `network_error` and the dashboard can fall
  back to the local cache or recorded fixtures.

## Failure handling

- Network/timeout/HTTP errors → typed `network_error`; the app keeps the last
  cached bars and shows a freshness notice.
- Empty or unparseable bodies → `无行情数据` / parse errors; the app falls
  back to recorded fixtures.
- Unknown instrument id → `未知标的: ...`; the catalog is static by design.

## Testing

- Rust unit tests (`cargo test --lib`) parse recorded fixture responses
  (`src-tauri/src/market/fixtures/`) — no network, deterministic.
- Frontend tests inject a fake invoke bridge and verify the command names,
  argument shape, and error classification.
