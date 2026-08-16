# QuantSift Project Instructions

## Product

QuantSift is a local-first Tauri desktop application for personal A-share and
public-fund research. It ranks a user-owned watchlist with transparent daily
factors. It does not promise returns or place trades.

## Stack

- Tauri 2 and Rust desktop shell
- React 19, TypeScript strict mode, Vite 7
- Tailwind CSS 4 with tokens in `src/index.css`
- Zustand for persisted client preferences
- Radix primitives and Lucide icons inherited from the Velora foundation
- Vitest for public behavior tests

## Boundaries

- UI and strategy code must depend on `MarketDataProvider`, never on AKShare,
  Tushare, or another vendor directly.
- Normalize provider data into `Instrument` and `DailyBar` before calculation.
- Every recommendation must retain market date, provider, fetch time, reasons,
  risks, and factor scores.
- Keep API credentials and phone numbers local. Never commit secrets.
- Treat recommendations as research signals, not trading instructions.

## Public Test Seams

- `MarketDataProvider`
- `buildRecommendation`
- `WatchlistRepository`
- `ScanScheduler.tick`
- `runWatchlistScan`
- `buildScanAlerts` and `AlertDispatcher`

Tests should describe behavior at these seams and use deterministic fixtures.
Do not depend on live financial endpoints in the test suite.

## UI Conventions

- This is a work-focused dashboard: compact hierarchy, predictable navigation,
  restrained color, and scan-friendly tables.
- Use the existing semantic tokens and one blue primary accent. Green, amber,
  and rose are reserved for real status meaning.
- Cards are limited to metrics, inspectors, modals, and repeated items. Do not
  wrap whole page sections in decorative cards.
- Use icons for familiar commands and tooltips for unfamiliar icon buttons.
- Provide loading, empty, error, stale, and disabled states.
- Validate at 1280x720 and a compact width before shipping UI changes.

## Commands

```powershell
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm tauri dev
pnpm tauri build
```

On this workstation, Smart App Control currently blocks unsigned Rust build
artifacts. `build-windows.cmd` detects the condition and guides the user to the
supported Windows setting before packaging.

## Browser Verification

Playwright (`@playwright/test`) verifies UI behavior in a real browser.
`pnpm test:e2e` boots the Vite dev server (`e2e/` specs, config in
`playwright.config.ts`); pages degrade to the recorded-fixture data source
when the Tauri bridge is absent, so specs stay deterministic. Use it to
validate fixes that a screenshot would catch — layout geometry, focus
states, empty/error states — before shipping UI changes.

## Packaging Requirement

Every development completion — feature, fix, or iteration — MUST end with:

1. `pnpm test` and `pnpm lint` passing,
2. `pnpm build` (frontend production build) passing,
3. the Windows installer packaged via `pnpm tauri build` (or
   `build-windows.cmd`), with the artifacts verified under
   `src-tauri\target\release\bundle\`.

Report the installer path in the delivery summary. This is a standing user
requirement; do not consider work finished until the installer exists.

## Git Delivery

- Keep commits scoped to one vertical feature.
- Run tests and type-checking before every feature commit.
- Use English conventional commit messages.
- Preserve the MIT license and upstream Velora attribution.

