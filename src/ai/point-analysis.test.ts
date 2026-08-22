import { describe, expect, it } from "vitest";
import type { KeyPoint } from "@/quant/key-points";
import type { Instrument } from "@/quant/types";
import {
  LocalPointAnalysisCache,
  pointAnalysisCacheKey,
} from "./point-analysis-cache";
import {
  buildPointAnalysisPrompt,
  parsePointAnalysis,
  runPointAnalysis,
} from "./point-analysis";
import { createRecordingLlmClient } from "./llm";
import type { LlmProviderConfig } from "./types";

const instrument: Instrument = {
  id: "CN:600519",
  symbol: "600519",
  name: "贵州茅台",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
};

const point: KeyPoint = {
  tradeDate: "2026-08-11",
  kind: "breakout",
  title: "放量突破",
  summary: "收盘突破前 20 日高点，涨幅 3.2%，趋势突破特征明显。",
  signal: "bullish",
  importance: 85,
  open: 1500,
  high: 1550,
  low: 1490,
  close: 1545,
  volume: 32_000_000,
  changePct: 3.2,
  indicators: {
    ma5: 1510,
    ma20: 1490,
    ma60: 1420,
    bollUpper: 1550,
    bollMid: 1495,
    bollLower: 1440,
    macdDif: 12.5,
    macdDea: 9.1,
    macdHist: 6.8,
    kdjK: 82,
    kdjD: 71,
    kdjJ: 104,
    rsi: 68,
    volumeRatio: 2.4,
  },
};

function providerConfig(): LlmProviderConfig {
  return {
    id: "a",
    label: "模型A",
    baseUrl: "https://example.invalid/v1",
    apiKey: "test-key",
    model: "test-model",
    enabled: true,
    isDefault: false,
  };
}

describe("buildPointAnalysisPrompt", () => {
  it("embeds the point data, indicator snapshot and template version", () => {
    const messages = buildPointAnalysisPrompt({
      instrument,
      point,
      templateVersion: 3,
    });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    const user = messages[1].content;
    expect(user).toContain("贵州茅台");
    expect(user).toContain("2026-08-11");
    expect(user).toContain("放量突破");
    expect(user).toContain("MA5 1510");
    expect(user).toContain("MACD DIF 12.5");
    expect(user).toContain("量比 2.4");
    expect(user).toContain("【提示词模板】v3");
  });

  it("injects the market calibration when provided", () => {
    const messages = buildPointAnalysisPrompt({
      instrument,
      point,
      marketContext: {
        asOfDate: "2026-08-14",
        fetchedAt: "2026-08-14T15:30:00+08:00",
        globalRegime: "risk_on",
        domesticRegime: "strong",
        summary: "全球风险偏好偏暖；沪深300 位于 MA60 上方。",
        indices: [],
      },
      templateVersion: 1,
    });
    expect(messages[1].content).toContain("【市场环境校准】");
    expect(messages[1].content).toContain("全球风险偏好偏暖");
  });

  it("keeps the parseable output format", () => {
    const [system] = buildPointAnalysisPrompt({ instrument, point, templateVersion: 1 });
    expect(system.content).toContain("信号: BUY / SELL / HOLD / WATCH");
    expect(system.content).toContain("置信度: 0-100 的整数");
  });
});

describe("parsePointAnalysis / runPointAnalysis", () => {
  it("parses the model reply into a structured result", () => {
    const result = parsePointAnalysis(
      "信号: BUY\n置信度: 78\n- 放量突破 20 日高点，动能强\n- 风险：追高回踩\n一句话提醒：回踩确认后关注。",
    );
    expect(result.signal).toBe("buy");
    expect(result.confidence).toBe(78);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.risks.length).toBeGreaterThan(0);
  });

  it("runs through the llm client and returns null on failure", async () => {
    const ok = await runPointAnalysis(
      createRecordingLlmClient({ a: "信号: HOLD\n置信度: 50\n观望。" }),
      providerConfig(),
      buildPointAnalysisPrompt({ instrument, point, templateVersion: 1 }),
    );
    expect(ok?.signal).toBe("hold");

    const failed = await runPointAnalysis(
      createRecordingLlmClient({}),
      providerConfig(),
      buildPointAnalysisPrompt({ instrument, point, templateVersion: 1 }),
    );
    expect(failed).toBeNull();
  });
});

describe("LocalPointAnalysisCache", () => {
  function memoryAdapter() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  it("round-trips entries and derives stable keys", () => {
    const cache = new LocalPointAnalysisCache(memoryAdapter());
    const key = pointAnalysisCacheKey("CN:600519", point, "a", "test-model", 3);
    expect(key).toContain("CN:600519");
    expect(key).toContain("2026-08-11");
    expect(cache.get(key)).toBeNull();
    cache.set(key, "信号: BUY");
    expect(cache.get(key)).toBe("信号: BUY");
    expect(cache.count()).toBe(1);
    // 不同模板版本不命中。
    const otherKey = pointAnalysisCacheKey("CN:600519", point, "a", "test-model", 4);
    expect(cache.get(otherKey)).toBeNull();
  });

  it("clears and evicts beyond the capacity", () => {
    const cache = new LocalPointAnalysisCache(memoryAdapter());
    for (let i = 0; i < 130; i += 1) {
      cache.set("k" + i, "c" + i);
    }
    expect(cache.count()).toBeLessThanOrEqual(120);
    cache.clear();
    expect(cache.count()).toBe(0);
  });

  it("treats expired entries as missing", () => {
    let now = 1_000_000;
    const cache = new LocalPointAnalysisCache(memoryAdapter(), "quantsift.point-analysis.v1", () => now);
    cache.set("k", "v");
    now += 31 * 24 * 60 * 60 * 1000;
    expect(cache.get("k")).toBeNull();
  });
});
