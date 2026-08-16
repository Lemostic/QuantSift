# Implement: AI Intelligence Workbench (v0.7.0)

Order matters: domain first, UI last. Commit per vertical slice; run
quality gates before each commit; package installer at the very end.

## Slice A — Chart trade marks (commit: feat(chart))

- `src/quant/buy-timing.ts`: unify into `TradeTimingMarker { side, kind, ... }` —
  keep `buildBuyTimingMarkers` export, add `buildSellTimingMarkers`
  (MA5 下穿 MA20 / 趋势破位 / 动量反转 / 偏离过大回落); add tests.
- Home page: render both marker sets on klinecharts (simpleAnnotation,
  buy = emerald "B", sell = rose "S"); marker strip shows both.

## Slice B — Rust AI commands (commit: feat(data): ai commands)

- `src-tauri/src/ai.rs`: `llm_chat_completion` (OpenAI-compatible, 60s),
  `web_search_tavily` (POST api.tavily.com/search); register in lib.rs;
  unit tests with recorded fixtures (parse choices / results).

## Slice C — AI domain (commit: feat(ai): analysis engine)

- `src/ai/`: types, factors (seeded variation), llm (invoke adapter +
  recording fake), research (offline + tavily), prompt builder, consensus,
  analysis (runAnalysis parallel; runIntelligentScan), session-repository,
  intraday-scheduler. Full unit tests.

## Slice D — Watchlist autoAnalyze (commit: feat(watchlist): autoAnalyze)

- Repository schema v3 + migration; update + tests; row toggle UI.

## Slice E — Intelligence page + settings (commit: feat(ui): intelligence workbench)

- `/intelligence` route + nav entry; session list (time dims) + detail
  (conversation, providers, research, tags, seed, memory panel);
  run-now control.
- Preferences: AI providers editor, research config, factor tags,
  intraday schedule.
- Home: chart markers integration + "最新智能分析" chip.
- e2e: intelligence page renders; preferences toggles.

## Slice F — Docs + version + package

- Version 0.7.0 (4 files); README/V0/DEVELOPMENT_PLAN updates; design doc
  `docs/ai-workbench-design.md`; archive Trellis task.
- Full gates: pnpm test, test:e2e, lint, build, cargo test.
- `build-windows.ps1` packaging; verify artifacts.

## Quality gates (every slice)

1. `pnpm lint` (tsc --noEmit)
2. `pnpm test` (vitest)
3. New tests for every public seam
4. e2e after UI slices
5. Commit per slice (English conventional messages)
