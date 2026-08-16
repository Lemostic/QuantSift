import { describe, expect, it } from "vitest";
import type { MarketDataProvider } from "@/data/market-data-provider";
import { buildRecommendation } from "@/quant/recommendation";
import type { DailyBar, Instrument } from "@/quant/types";
import { runAnalysis, runIntelligentScan } from "./analysis";
import { createRecordingLlmClient } from "./llm";
import { offlineWebResearchProvider } from "./research";
import {
  DEFAULT_FACTOR_TAGS,
  type FactorConfig,
  type LlmProviderConfig,
} from "./types";

function barsFor(instrumentId: string, base = 10, count = 40): DailyBar[] {
  const start = new Date("2026-06-01T00:00:00Z");
  const bars: DailyBar[] = [];
  let cursor = new Date(start);
  let step = 0;
  while (bars.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      bars.push({
        instrumentId,
        tradeDate: cursor.toISOString().slice(0, 10),
        open: base + step,
        high: base + step + 1,
        low: base + step - 1,
        close: base + step,
        volume: 10_000_000 + step * 100_000,
        adjustment: "forward",
        provider: "eastmoney",
        fetchedAt: "2026-08-15T15:30:00+08:00",
      });
      step += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

const instrument: Instrument = {
  id: "CN:600519",
  symbol: "600519",
  name: "贵州茅台",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
};

function providerConfig(id: string, label: string): LlmProviderConfig {
  return {
    id,
    label,
    baseUrl: "https://example.invalid/v1",
    apiKey: "test-key",
    model: "test-model",
    enabled: true,
    isDefault: false,
  };
}

const factorConfig: FactorConfig = {
  tags: DEFAULT_FACTOR_TAGS.map((tag) => ({ tagId: tag.id, enabled: true })),
  randomness: 30,
};

const NOW = () => new Date("2026-08-19T10:30:00+08:00");

describe("runAnalysis", () => {
  it("runs enabled providers in parallel and produces a session", async () => {
    const llm = createRecordingLlmClient({
      a: "信号: BUY\n置信度: 75\n结论摘要：趋势向上，逢低关注。",
      b: "信号: 买入\n置信度: 68\n结论摘要：均线多头排列。",
    });
    const bars = barsFor(instrument.id);
    const recommendation = buildRecommendation(instrument, bars);

    const session = await runAnalysis({
      instrument,
      bars,
      recommendation,
      providers: [providerConfig("a", "模型A"), providerConfig("b", "模型B")],
      llm,
      researchProvider: offlineWebResearchProvider,
      factorConfig,
      factorTags: DEFAULT_FACTOR_TAGS,
      seed: 42,
      trigger: "manual",
      memory: [],
      now: NOW,
      createId: () => "session-1",
    });

    expect(session.id).toBe("session-1");
    expect(session.seed).toBe(42);
    expect(session.trigger).toBe("manual");
    expect(session.advice.signal).toBe("buy");
    expect(session.advice.confidence).toBeGreaterThan(0);
    expect(session.providers).toHaveLength(2);
    expect(session.providers.every((p) => p.status === "ok")).toBe(true);
    // 网络研究简报已随会话留存
    expect(session.research.length).toBeGreaterThan(0);
    // 用户问题 + 两条模型结论消息
    expect(session.messages.length).toBe(3);
    expect(session.factorTagIds.length).toBe(DEFAULT_FACTOR_TAGS.length);
  });

  it("isolates provider failures while keeping the session", async () => {
    const llm = createRecordingLlmClient({
      a: "信号: SELL\n置信度: 80\n结论摘要：破位下行。",
      // b 未配置 → 抛错
    });
    const bars = barsFor(instrument.id, 5);
    const recommendation = buildRecommendation(instrument, bars);

    const session = await runAnalysis({
      instrument,
      bars,
      recommendation,
      providers: [
        providerConfig("a", "模型A"),
        providerConfig("b", "模型B"),
      ],
      llm,
      researchProvider: offlineWebResearchProvider,
      factorConfig,
      factorTags: DEFAULT_FACTOR_TAGS,
      seed: 7,
      trigger: "scheduled",
      memory: [],
      now: NOW,
      createId: () => "session-2",
    });

    expect(session.advice.signal).toBe("sell");
    expect(session.providers[0].status).toBe("ok");
    expect(session.providers[1].status).toBe("error");
    expect(session.providers[1].error).toContain("未配置");
  });

  it("records the seed so a run is reproducible", async () => {
    const llm = createRecordingLlmClient({
      a: "信号: HOLD\n置信度: 50\n结论摘要：观望。",
    });
    const bars = barsFor(instrument.id);
    const recommendation = buildRecommendation(instrument, bars);
    const run = () =>
      runAnalysis({
        instrument,
        bars,
        recommendation,
        providers: [providerConfig("a", "模型A")],
        llm,
        researchProvider: offlineWebResearchProvider,
        factorConfig,
        factorTags: DEFAULT_FACTOR_TAGS,
        seed: 99,
        trigger: "manual",
        memory: [],
        now: NOW,
        createId: () => "s",
      });
    const first = await run();
    const second = await run();
    expect(first.factorVariation).toEqual(second.factorVariation);
    expect(first.advice).toEqual(second.advice);
  });
});

describe("runIntelligentScan", () => {
  it("scans only requested instruments and skips short histories", async () => {
    const catalog: Instrument[] = [instrument];
    const provider: MarketDataProvider = {
      id: "eastmoney",
      async listInstruments() {
        return catalog;
      },
      async getDailyBars(id: string, _limit: number) {
        return id === "CN:600519"
          ? barsFor(id)
          : barsFor(id, 10, 5); // 过短
      },
    };
    const llm = createRecordingLlmClient({
      a: "信号: BUY\n置信度: 60\n结论摘要：看好。",
    });

    const result = await runIntelligentScan({
      provider,
      instrumentIds: ["CN:600519"],
      llmProviders: [providerConfig("a", "模型A")],
      llm,
      researchProvider: offlineWebResearchProvider,
      factorConfig,
      factorTags: DEFAULT_FACTOR_TAGS,
      listInstruments: () => Promise.resolve(catalog),
      listMemory: () => Promise.resolve([]),
      seed: 5,
      trigger: "scheduled",
      now: NOW,
    });

    expect(result.errors).toEqual([]);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].instrumentId).toBe("CN:600519");
    expect(result.sessions[0].advice.signal).toBe("buy");
  });

  it("reports per-instrument errors without failing the scan", async () => {
    const catalog: Instrument[] = [instrument];
    const provider: MarketDataProvider = {
      id: "eastmoney",
      async listInstruments() {
        return catalog;
      },
      async getDailyBars() {
        throw new Error("网络不可用");
      },
    };

    const result = await runIntelligentScan({
      provider,
      instrumentIds: ["CN:600519"],
      llmProviders: [],
      llm: createRecordingLlmClient({}),
      researchProvider: offlineWebResearchProvider,
      factorConfig,
      factorTags: DEFAULT_FACTOR_TAGS,
      listInstruments: () => Promise.resolve(catalog),
      listMemory: () => Promise.resolve([]),
      trigger: "manual",
      now: NOW,
    });

    expect(result.sessions).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("网络不可用");
  });
});
