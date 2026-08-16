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

## Secrets Guard（死命令，任何情况下不可违反）

**用户的 AI 模型 Key、网络搜索 Key 等一切密钥，只允许存在于本机
localStorage（浏览器/WebView 本地存储），严禁进入 Git 仓库、提交记录、
代码、文档、测试夹具、e2e mock、日志或任何被跟踪的文件。**

- 每次提交前必须通过密钥扫描：
  - 本仓库已配置 `core.hooksPath = .githooks`，pre-commit 钩子自动扫描
    暂存文件（PowerShell 不可用时走 grep 兜底）；
  - `scripts/scan-secrets.ps1` 可手动运行：默认扫暂存区，`-All` 扫全树；
  - `build-windows.ps1` 打包流水线内置全树密钥扫描，命中即构建失败。
- 密钥相关约定：
  - 测试只允许使用显式假密钥（如 `test-key` / `sk-test-...`），禁止把真实
    Key 粘贴进任何文件后再提交；
  - 用户在偏好页填写的 Key 存于 zustand persist（localStorage），随
    `partialize` 持久化，不经过 Tauri/Rust 侧持久化；
  - `.gitignore` 已忽略 `.env*`、`*.pem`、`*.key`、`secrets*.json`、
    `credentials*` 等常见凭据文件。
- 若扫描命中疑似密钥：立即中止操作，确认内容是测试假值或移除真实密钥后
  再继续。任何“只是临时提交一下”的例外都不允许。

## Public Test Seams

- `MarketDataProvider`
- `buildRecommendation`
- `WatchlistRepository`
- `ScanScheduler.tick`
- `runWatchlistScan`
- `buildScanAlerts` and `AlertDispatcher`
- `buildSellTimingMarkers`
- `buildFactorVariation` and `getDueIntradayScan`
- `runAnalysis` / `runIntelligentScan` and `buildConsensus`
- `AnalysisSessionStore` and `filterSessionsByDimension`

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

<!-- TRELLIS:START -->
# Trellis Instructions

These instructions are for AI assistants working in this project.

This project is managed by Trellis. The working knowledge you need lives under `.trellis/`:

- `.trellis/workflow.md` — development phases, when to create tasks, skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines (read before writing code in a given layer)
- `.trellis/workspace/` — per-developer journals and session traces
- `.trellis/tasks/` — active and archived tasks (PRDs, research, jsonl context)

If a Trellis command is available on your platform (e.g. `/trellis:finish-work`, `/trellis:continue`), prefer it over manual steps. Not every platform exposes every command.

If you're using Codex or another agent-capable tool, additional project-scoped helpers may live in:
- `.agents/skills/` — reusable Trellis skills
- `.codex/agents/` — optional custom subagents

Managed by Trellis. Edits outside this block are preserved; edits inside may be overwritten by a future `trellis update`.

<!-- TRELLIS:END -->
