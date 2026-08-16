# Design: AI Intelligence Workbench (v0.7.0)

## Module Map

```
src/quant/buy-timing.ts       → extended: TradeTimingMarker { side: "buy" | "sell" }
src/ai/types.ts               → LLM provider config, messages, research, session, advice types
src/ai/factors.ts             → factor-tag catalog + seeded random variation (mulberry32)
src/ai/llm.ts                 → LLMClient seam: invoke-backed OpenAI-compatible + recording fake
src/ai/research.ts            → WebResearchProvider seam: offline adapter + tavily adapter
src/ai/prompt.ts              → prompt builder (base factors, intelligence, research, tags, memory)
src/ai/consensus.ts           → aggregate provider signals → consensus advice
src/ai/analysis.ts            → runAnalysis (parallel providers) + runIntelligentScan (bars→session)
src/ai/session-repository.ts  → localStorage versioned session store (cap 500)
src/ai/intraday-scheduler.ts  → getDueIntradayScan deterministic seam
src/ai/use-analysis-center.ts → UI hook (list/filter/run/reload, change events)
src/routes/intelligence-page.tsx → session list + conversation detail + memory panel
src-tauri/src/ai.rs           → llm_chat_completion + web_search_tavily commands
```

## Key Contracts

### LLM

```ts
interface LlmProviderConfig {
  id: string; label: string; baseUrl: string; apiKey: string;
  model: string; enabled: boolean; isDefault: boolean;
}
interface LlmMessage { role: "system" | "user" | "assistant"; content: string; }
type LlmClient = (config: LlmProviderConfig, messages: LlmMessage[]) => Promise<string>;
```

- Browser → Rust `llm_chat_completion(provider, messages)` → OpenAI-compatible
  `POST {baseUrl}/chat/completions` with `Authorization: Bearer`; Rust returns
  the first choice's content. Secrets travel per-call only.
- Recording client (tests): scripted responses keyed by provider id.

### Web research

```ts
interface ResearchBrief { source: string; title: string; url: string; snippet: string; fetchedAt: string; }
interface WebResearchProvider { readonly id: string; research(instrument: Instrument, tags: FactorTag[]): Promise<ResearchBrief[]>; }
```

- `offlineWebResearchProvider` — deterministic briefs per instrument
  (tests/demo, no network). `tavilyWebResearchProvider(invokeFn)` — Rust
  `web_search_tavily(query, apiKey)` → mapped briefs.

### Random factors

- Catalog of tag definitions; config stores `enabled: boolean` per tag +
  custom tags. `buildFactorVariation(seed, enabledTags)` returns
  `{ seed, entries: [{tagId, direction, emphasis}] }` via mulberry32
  (deterministic); prompt builder consumes it. The variation is recorded
  in the session (`seed`, tag list, entries).

### Consensus

- Each provider reply is parsed for a signal line
  (`信号: BUY/SELL/HOLD/WATCH` + confidence). Majority signal wins;
  ties resolved by average confidence; all provider texts stored.

### Sessions

```ts
interface AnalysisSession {
  id; instrumentId; instrumentName; createdAt; asOfDate;
  trigger: "manual" | "scheduled";
  seed: number; factorTags: string[];
  research: ResearchBrief[];
  providers: ProviderOutcome[];  // id, model, status, signal, confidence, error
  advice: { signal: AdviceSignal; confidence: number; summary: string };
  messages: AnalysisMessage[];
  priceAtAnalysis: number; baseScore: number;
}
```

- localStorage `quantsift.analysis-sessions.v1`, versioned doc, cap 500,
  corrupted → empty (same pattern as other repositories).
- Time dimensions computed from `createdAt`: 今日 / 本周 / 本月 / 全部.

### Intraday scheduler

- `getDueIntradayScan(schedule, now, lastRunAt)`:
  - disabled or weekend or outside window → null
  - next slot = window start, stepped by interval; due when
    `now >= slot && lastRunAt < slot`; returns `{ slotAt }`.
- Triggered from the existing 30s auto-scan poll in `useScanCenter`
  (new `useIntelligentAutoScan` hook).

### Rust

- `ai.rs` uses the existing reqwest client: `llm_chat_completion`
  (60s timeout), `web_search_tavily` (20s). Error strings carry 网络 markers
  for frontend classification. Unit tests parse recorded response fixtures.

## Watchlist

- `WatchlistEntry` gains `autoAnalyze: boolean` (schema v2 → v3 migration;
  existing docs default false). Watchlist page adds a per-row toggle;
  `useWatchlist.update` accepts it.

## UI

- New route `/intelligence` (智能分析): left = session list grouped by time
  dimension tabs; right = conversation view + advice banner + provider
  cards + research sources + factor chips + seed + memory panel.
- Preferences: AI providers editor, research provider/key, factor tags,
  intraday schedule — all in the existing SettingsGroup pattern.
- Home page: buy/sell markers on chart + marker strip shows both sides.
- Nav rail: add 智能分析 entry.

## Compatibility / Rollback

- All new modules are additive; nothing existing is removed.
- Watchlist migration is safe (v3 read falls back to v2 fields).
- LLM/research failures degrade to offline adapters / clear errors;
  the deterministic factor engine always works without keys.
