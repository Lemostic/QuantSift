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

Goal: let the owner decide which stocks and funds QuantSift follows.

Deliverables:

- Instrument search across the provider catalog.
- Add/remove actions with duplicate prevention.
- Optional tags and a personal observation note per instrument.
- Local persisted watchlist with a versioned schema and safe migration.
- Empty state that leads directly to adding the first instrument.

Public test seam:

- `WatchlistRepository`: list, add, update note/tags, remove, and hydrate.

Acceptance criteria:

- Stock and fund entries use the same workflow while retaining their type.
- Restarting the app restores the watchlist and notes.
- Removing an item does not delete market data or scan history.

## Slice 3: Scheduled Scanning

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

Goal: notify the owner when a scheduled scan produces actionable signals.

Deliverables:

- Alert policy: minimum score, signal type, quiet hours, and maximum messages.
- Masked mobile-number configuration.
- `SmsGateway` boundary with simulation and generic HTTPS webhook adapters.
- Local outbox with queued/sent/failed states and retry metadata.
- Test-message action and scan-to-alert integration.

Public test seam:

- `buildScanAlerts`: deterministic filtering and message composition.
- `AlertDispatcher`: sends eligible alerts once and records the outcome.

Acceptance criteria:

- Simulation mode exercises the full flow without network access.
- Webhook mode sends only to the configured endpoint after explicit enablement.
- Duplicate scan results do not create duplicate SMS jobs.
- Phone numbers and secrets are masked in UI and excluded from Git.

## Later Slices

- AKShare Python sidecar with recorded contract fixtures.
- SQLite normalized cache and incremental refresh.
- Backtesting with fees, slippage, and look-ahead prevention.
- Portfolio positions, cost basis, and sell-risk signals.
- OS startup/background scheduling.
- Provider-specific SMS adapters after selecting a vendor and confirming terms.
