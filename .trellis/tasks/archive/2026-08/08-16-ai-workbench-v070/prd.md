# PRD: AI Intelligence Workbench (v0.7.0)

## Goal

Turn QuantSift from a factor-ranking research desk into a scheduled,
AI-assisted analysis workbench: clear buy/sell marks on the home K-line
chart, multi-model LLM advice (enhanced by web research, stored locally),
intraday-trading-hours auto scans, and conversation-style session history
kept for later reference.

## Requirements

### R1 — Chart trade marks

- The home research chart must annotate clear BUY and SELL points
  (distinct colors/labels) derived deterministically from daily bars.
- Existing buy markers (trend breakout / pullback) stay; add sell markers
  (trend breakdown, MA5 under MA20, momentum reversal, overbought vs
  support/stop).

### R2 — Multi-model AI advice with web research

- Configure **multiple LLM providers** (OpenAI-compatible chat endpoints:
  DeepSeek / OpenAI / Qwen / Moonshot ...): label, baseUrl, apiKey, model,
  enabled, default. Keys stay local, masked in UI, never committed.
- An analysis run invokes **all enabled providers in parallel** and
  produces per-provider results plus a consensus advice
  (signal: buy/sell/hold/watch, confidence, reasoning).
- **Web research** improves accuracy: a `WebResearchProvider` seam with an
  offline/mock adapter (recorded briefs, no network) and a Tavily search
  adapter (configurable key). Research results are persisted with the
  session (本地留存网络分析结果).

### R3 — Random factors (tag system)

- A factor-tag catalog covering 全球市场 / 国内市场 / 政策面 / 资金面 /
  消息面 / 技术面 / 宏观数据 / 行业景气, each **checkbox-configurable**,
  plus user-defined tags.
- Each scan derives a **seeded random variation** of the enabled factors
  (seed stored in the session for reproducibility); the variation shapes
  the prompt emphasis, not the deterministic base factors.

### R4 — Intraday scheduled intelligent scans

- Schedule config: enabled, interval minutes (5/10/15/30/60), window
  09:00–15:00, workdays only (A-share calendar, weekends skipped).
- `getDueIntradayScan(schedule, now, lastRunAt)` is a deterministic public
  seam (one due run per interval window).
- Only instruments opted in per-watchlist-entry (`autoAnalyze`) participate.
- Each run: refresh bars → base factors → web research → parallel LLM
  analysis → persist session → dashboard freshness + session list update.

### R5 — Session history (conversation view + memory)

- `AnalysisSession` stores messages (user prompt + per-provider replies),
  advice, factor tags, random seed, research results, provider statuses,
  price/base score, as-of date.
- View sessions as conversations, filtered by time dimension
  (今日 / 本周 / 本月 / 全部); a "memory" panel lists past sessions of the
  same instrument, and the analysis prompt includes recent session
  summaries as reference context.

### R6 — Settings enhancements

- Preferences gains: AI model providers editor, web-research provider +
  key, random-factor tag toggles + custom tags, intraday scan schedule.
- Watchlist entries gain an `autoAnalyze` toggle (自动化推荐分析参与).

## Acceptance Criteria

- Chart: buy markers and sell markers render on the home chart with
  distinct labels; deterministic from bars (unit-tested).
- Analysis: with a fake LLM client (fixture responses), a run produces
  per-provider results + consensus; provider failures are isolated.
- Research: offline adapter returns recorded briefs without network;
  Tavily adapter test uses a fake invoke.
- Random factors: same seed + same inputs → identical prompt variation;
  different seed → different variation; disabled tags never appear.
- Scheduler: deterministic unit tests (weekend skip, interval windows,
  once-per-window).
- Sessions: repository round-trips, versioned, capped; time-dimension
  filters work; memory panel lists prior sessions.
- Watchlist `autoAnalyze` persists with migration from v2 documents.
- All unit tests, lint, production build pass; e2e still green.
- Installer packaged at the end (standing requirement).

## Constraints

- Local-first: LLM keys and research keys live in localStorage only.
- No live financial endpoints or live LLM calls in the test suite.
- LLM HTTP goes through the Rust backend (CORS-free); secrets passed per
  call, never persisted in Rust.
