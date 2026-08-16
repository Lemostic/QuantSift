# QuantSift Development Plan

## Product Direction

QuantSift is a local-first desktop research dashboard for a personal A-share
and public-fund watchlist. It ranks instruments after the market closes,
explains every signal, records what was scanned, and can notify the owner when
a configured threshold is met. It is not a broker terminal and does not place
orders.

## Delivery Rules

- Deliver one vertical feature at a time.
- Each feature must have a public behavioral seam and focused tests.
- Run the full frontend test suite and type-check before each commit.
- Verify user-facing changes at desktop and compact viewport sizes.
- Commit and push every completed feature to the active branch.
- Secrets and API credentials remain local and are never committed.

## Slice 0: Foundation

Status: implemented, pending baseline commit.

Deliverables:

- Tauri 2 and React 19 desktop foundation renamed to QuantSift.
- Normalized `Instrument`, `DailyBar`, factor, signal, and recommendation types.
- Replaceable `MarketDataProvider` contract and recorded fixture provider.
- Transparent trend, momentum, and volatility recommendation engine.
- Initial ranked recommendation view and Windows build assistant.

Acceptance criteria:

- Recorded daily bars exclude weekends and retain provider/fetch metadata.
- A rising series produces an auditable buy-watch signal.
- A falling series produces an avoid signal.
- Type-check, tests, and frontend production build pass.

## Slice 1: Dashboard

Status: implemented.

Goal: make the home screen an operational dashboard rather than a single
recommendation list.

Deliverables:

- Compact market/session header and last-scan freshness state.
- Watchlist breadth, signal distribution, and strongest-opportunity metrics.
- Ranked recommendation work queue with a focused detail inspector.
- Recent scan/notification activity section.
- Loading, empty, stale, and provider-error states.

Acceptance criteria:

- The first viewport answers: what needs attention, why, and how fresh it is.
- The layout is usable at 1280x720 and 390x844 without overlap.
- Selection, refresh, empty, and error paths are keyboard accessible.

## Slice 2: Personal Watchlist

Status: implemented and extended with chart-based signal review.

Goal: let the owner decide which stocks and funds QuantSift follows.

Deliverables:

- Instrument search across the provider catalog.
- Add/remove actions with duplicate prevention.
- Optional tags and a personal observation note per instrument.
- Local persisted watchlist with a versioned schema and safe migration.
- Empty state that leads directly to adding the first instrument.
- Default monitoring migration for fund 012734 (易方达人工智能ETF联接C).
- Stock and fund daily K-line review with deterministic historical buy-window markers.

Public test seam:

- `WatchlistRepository`: list, add, update note/tags, remove, and hydrate.

Acceptance criteria:

- Stock and fund entries use the same workflow while retaining their type.
- Restarting the app restores the watchlist and notes.
- Removing an item does not delete market data or scan history.
- K-line markers explain whether they represent a trend breakout or pullback confirmation.

## Slice 3: Scheduled Scanning

Status: implemented for the application-running lifecycle.

Goal: automatically evaluate the watchlist after a configured market-close
time while the desktop application is running.

Deliverables:

- Workday schedule with local timezone, enabled state, and scan time.
- Scheduler that avoids duplicate runs for the same schedule window.
- Manual run-now action using the same scan pipeline.
- Persisted scan history with started/completed/failed outcome and counts.
- Dashboard freshness and next-run indicators.

Public test seam:

- `ScanScheduler.tick(now)`: returns a due job at most once per schedule window.
- `runWatchlistScan`: persists one normalized scan result per run.

Acceptance criteria:

- Disabled schedules never run.
- Weekends are skipped by default.
- Closing and reopening the app does not repeat an already completed window.
- Provider failures appear in history and do not overwrite the last good result.

Constraint:

- V0 scheduling runs while QuantSift is open. OS background startup and
  execution will be a separate slice because it requires installer/startup
  permissions and lifecycle design.

## Slice 4: Scheduled SMS Alerts

Status: implemented with simulation and explicit HTTPS webhook modes.

Goal: notify the owner when a scheduled scan produces actionable signals.

Deliverables:

- Alert policy: minimum score, signal type, quiet hours, and maximum messages.
- Masked mobile-number configuration.
- `SmsGateway` boundary with simulation and generic HTTPS webhook adapters.
- Local outbox with queued/sent/failed states and retry metadata.
- Test-message action and scan-to-alert integration.
- Route-level code splitting for the dashboard, K-line tools, and alert center.

Public test seam:

- `buildScanAlerts`: deterministic filtering and message composition.
- `AlertDispatcher`: sends eligible alerts once and records the outcome.

Acceptance criteria:

- Simulation mode exercises the full flow without network access.
- Webhook mode sends only to the configured endpoint after explicit enablement.
- Duplicate scan results do not create duplicate SMS jobs.
- Phone numbers and secrets are masked in UI and excluded from Git.

## Slice 5: Portfolio Positions

Status: implemented with local cost-basis and exit-risk review.

Goal: close the loop between a research signal and a user's existing position
without connecting a broker or turning the product into an execution terminal.

Deliverables:

- Versioned local portfolio repository keyed by instrument.
- Quantity, average cost, opened date, note, stop-loss and take-profit review
  thresholds.
- Deterministic market-value, unrealized P/L, daily P/L and risk-review engine.
- Portfolio page with editable inspector and K-line handoff.
- Risk review states for stop-loss, take-profit and trend deterioration.

Public test seam:

- `PortfolioRepository`: list, upsert, validation and remove.
- `buildPositionSnapshot` and `summarizePortfolio`: deterministic cost-basis
  and risk calculations.

Acceptance criteria:

- Position records stay local and never imply an order or broker action.
- A recommendation provider failure does not corrupt saved cost basis.
- Risk labels explain the threshold or research signal that triggered review.
- Empty, loading, invalid-input and populated portfolio states are usable at
  desktop and compact widths.

## Slice 6: Explainable Signal Intelligence

Status: implemented with deterministic daily-bar analysis.

Goal: add an intelligence layer that prioritizes research without hiding the
evidence or sending local financial data to an external model.

Deliverables:

- Factor-consensus, rolling-signal-stability and data-completeness measures.
- Explainable market-regime classification and research priority.
- Ten-day support/resistance levels and explicit next-review conditions.
- Intelligence panels in the research dashboard and K-line workspace.
- Clear disclosure that confidence is consistency, not return probability.

Public test seam:

- `buildSignalIntelligence`: deterministic assessment from normalized bars.
- `buildRollingSignalHistory`: prefix-only historical decisions without
  look-ahead.

Acceptance criteria:

- Changing a future bar cannot alter an earlier rolling decision.
- Every action title includes evidence, uncertainty and a market date.
- Incomplete history is rejected instead of producing false confidence.
- The intelligence panel works for both stocks and funds.

## Slice 7: Deterministic Backtesting

Status: implemented.

Goal: let the owner stress-test the research signals against historical daily
bars with explicit cost assumptions and look-ahead prevention.

Deliverables:

- Prefix-only signal evaluation so future bars cannot change earlier decisions.
- Next-open entries after a buy signal and signal-based exits at the open after
  an avoid signal.
- Stop-loss, take-profit, maximum-holding and data-end exit boundaries.
- Commission, minimum commission, stock sell stamp duty, and slippage modeled
  in every trade.
- Equity curve, drawdown, win rate, profit factor, and annualized return
  metrics.
- Backtest research page with instrument selection, parameter controls, equity
  chart, and a trade-by-trade audit table.

Public test seam:

- `runBacktest`: deterministic trade generation and metrics from normalized
  bars and a `BacktestConfig`.

Acceptance criteria:

- Changing a future bar cannot alter an earlier equity point or closed trade.
- A buy signal executes at the next bar's open rather than the signal close.
- Stock sells include stamp duty while fund sells do not.
- Every trade records entry/exit dates, executed prices, reason, holding days,
  and net return.
- The page is usable at 1280x720 and compact widths with loading, empty, and
  error states.

## Slice 8: Local Bar Cache with Incremental Refresh

Status: implemented (v0.5.0).

Goal: persist normalized daily bars locally so the dashboard renders from
cache first, refreshes only the latest tail, and stays usable offline.

Deliverables:

- `BarCacheStore` storage seam with in-memory and versioned localStorage
  adapters; corrupted documents repair to an empty cache instead of
  throwing, and a SQLite adapter can replace localStorage without touching
  callers.
- `mergeDailyBars` deterministic merge: dedupe by trade date, fetched bars
  win, ascending sort, capped history per instrument.
- `refreshInstrumentCache` incremental refresh core: fetch the provider's
  latest tail, merge over cached history, persist; a provider failure never
  destroys the cache.
- Trading-day-aware freshness (`computeCacheFreshness`): weekends are
  skipped so Friday data checked on Monday is one day old; exchange
  holidays are a documented limitation.
- `createCachedMarketDataProvider`: contract-compliant `MarketDataProvider`
  wrapper that serves fresh cache without network, refreshes stale cache,
  and falls back to cached bars when the live source fails.
- `loadCachedMarketData` service: cache-first render via `onCacheServed`,
  then a live incremental refresh; provenance metadata (served-from, stale
  flags, refresh errors) keeps the dashboard honest about data age.
- Dashboard integration: CACHE/LIVE source label, amber "本地缓存行情" banner
  with cached-as-of date, cache row in the research snapshot, and a cache
  management group on the preferences page (stats + clear).

Public test seam:

- `BarCacheStore`: get/put/remove/clear with merge semantics.
- `mergeDailyBars`, `computeCacheFreshness`, `refreshInstrumentCache`:
  deterministic pure behavior.
- `createCachedMarketDataProvider` and `loadCachedMarketData`: cache-first,
  refresh, and offline-fallback flows with injected clocks.

Acceptance criteria:

- A second app start renders from cache before any network round-trip.
- Refreshing fetches only the configured tail and never shrinks cached
  history.
- A live-provider failure keeps the last cached snapshot usable and is
  reported, not silently swallowed.
- All tests run without network access and remain deterministic.

## Later Slices

- SQLite adapter for `BarCacheStore` and cache size management.
- OS startup/background scheduling.
- Provider-specific SMS adapters after selecting a vendor and confirming terms.
