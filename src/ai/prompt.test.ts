import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/quant/recommendation";
import { buildSignalIntelligence } from "@/intelligence/signal-intelligence";
import type { DailyBar, Instrument } from "@/quant/types";
import { offlineMarketContextProvider } from "@/data/market-context";
import { buildAnalysisMessages, DEFAULT_ANALYSIS_TEMPLATE } from "./prompt";
import type { AnalysisTemplate, TemplateParams } from "./types";

function barsFor(instrumentId: string, count = 60): DailyBar[] {
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
        open: 10 + step,
        high: 10 + step + 1,
        low: 10 + step - 1,
        close: 10 + step,
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

function templateWith(params: Partial<TemplateParams>): AnalysisTemplate {
  return {
    version: 7,
    params: { ...DEFAULT_ANALYSIS_TEMPLATE.params, ...params },
  };
}

async function buildInput(template: AnalysisTemplate, withContext: boolean) {
  const bars = barsFor(instrument.id);
  const recommendation = buildRecommendation(instrument, bars);
  const intelligence = buildSignalIntelligence(recommendation, bars);
  const marketContext = withContext
    ? await offlineMarketContextProvider.getMarketContext()
    : undefined;
  return {
    instrumentName: instrument.name,
    symbol: instrument.symbol,
    kind: "A 股",
    asOfDate: recommendation.asOfDate,
    price: recommendation.price,
    baseScore: recommendation.score,
    recommendation,
    intelligence,
    variation: { seed: 42, entries: [] },
    research: [],
    memory: [],
    marketContext,
    template,
  };
}

describe("buildAnalysisMessages", () => {
  it("embeds the template version and market calibration section", async () => {
    const input = await buildInput(templateWith({}), true);
    const [, user] = buildAnalysisMessages(input);
    expect(user.content).toContain("【提示词模板】v7");
    expect(user.content).toContain("【市场环境校准】");
    expect(user.content).toContain(input.marketContext!.summary);
    expect(user.content).toContain("沪深300");
    expect(user.content).toContain("全球风险偏好分化");
  });

  it("says calibration data is missing when no context is provided", async () => {
    const input = await buildInput(templateWith({}), false);
    const [, user] = buildAnalysisMessages(input);
    expect(user.content).toContain("未获取到市场环境数据");
    expect(user.content).not.toContain("【指数明细】");
  });

  it("scales the word limit with verbosity", async () => {
    const quiet = await buildInput(templateWith({ verbosity: 15 }), false);
    const systemQuiet = buildAnalysisMessages(quiet)[0];
    expect(systemQuiet.content).toContain("200 字以内");

    const verbose = await buildInput(templateWith({ verbosity: 85 }), false);
    const systemVerbose = buildAnalysisMessages(verbose)[0];
    expect(systemVerbose.content).toContain("500 字以内");
  });

  it("hardens the format requirements when strictness is high", async () => {
    const strict = await buildInput(templateWith({ strictness: 90 }), false);
    const [system] = buildAnalysisMessages(strict);
    expect(system.content).toContain("硬性要求");
    expect(system.content).toContain("缺一不可");
  });

  it("weights calibration heavily at high calibration weight", async () => {
    const input = await buildInput(templateWith({ calibrationWeight: 85 }), false);
    const [system] = buildAnalysisMessages(input);
    expect(system.content).toContain("risk_off");
    expect(system.content).toContain("环境优先");
  });

  it("keeps the parseable output format in every template version", async () => {
    const input = await buildInput(templateWith({}), false);
    const [system] = buildAnalysisMessages(input);
    expect(system.content).toContain("信号: BUY / SELL / HOLD / WATCH");
    expect(system.content).toContain("置信度: 0-100 的整数");
    expect(system.content).toContain("核心依据");
    expect(system.content).toContain("风险提示");
  });
});
