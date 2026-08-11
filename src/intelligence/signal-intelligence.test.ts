import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { buildRecommendation } from "@/quant/recommendation";
import {
  buildRollingSignalHistory,
  buildSignalIntelligence,
} from "./signal-intelligence";

describe("signal intelligence", () => {
  it("builds an explainable trend assessment for fund 012734", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    const instrument = instruments.find((item) => item.id === "CN:012734")!;
    const bars = await recordedMarketDataProvider.getDailyBars(instrument.id, 30);
    const recommendation = buildRecommendation(instrument, bars);

    const intelligence = buildSignalIntelligence(recommendation, bars);

    expect(intelligence.regime).toBe("trend_up");
    expect(intelligence.confidence).toBeGreaterThanOrEqual(60);
    expect(intelligence.signalStability).toBeGreaterThanOrEqual(60);
    expect(intelligence.support).toBeLessThan(recommendation.price);
    expect(intelligence.resistance).toBeGreaterThan(recommendation.price);
    expect(intelligence.nextChecks).toHaveLength(3);
    expect(intelligence.uncertainties[0]).toContain("不代表上涨概率");
  });

  it("uses only bars available at each rolling decision date", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    const instrument = instruments.find((item) => item.id === "CN:510300")!;
    const bars = await recordedMarketDataProvider.getDailyBars(instrument.id, 30);
    const recommendation = buildRecommendation(instrument, bars);
    const original = buildRollingSignalHistory(recommendation, bars);
    const changedFuture = bars.map((bar, index) =>
      index === bars.length - 1
        ? { ...bar, close: bar.close * 0.65, low: bar.low * 0.65 }
        : bar,
    );
    const changed = buildRollingSignalHistory(recommendation, changedFuture);

    expect(original.slice(0, -1)).toEqual(changed.slice(0, -1));
    expect(original.at(-1)).not.toEqual(changed.at(-1));
    expect(original.map((point) => point.asOfDate)).toEqual(
      bars.slice(20).map((bar) => bar.tradeDate),
    );
  });

  it("rejects incomplete data", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    const instrument = instruments[0];
    const bars = await recordedMarketDataProvider.getDailyBars(instrument.id, 30);
    const recommendation = buildRecommendation(instrument, bars);

    expect(() => buildSignalIntelligence(recommendation, bars.slice(0, 20))).toThrow(
      "至少需要 21 个交易日",
    );
  });
});
