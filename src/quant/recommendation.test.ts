import { describe, expect, it } from "vitest";
import { buildRecommendation } from "./recommendation";
import type { DailyBar, Instrument } from "./types";

const instrument: Instrument = {
  id: "CN:510300",
  symbol: "510300",
  name: "沪深300ETF",
  kind: "fund",
  exchange: "SSE",
  currency: "CNY",
};

function barsFromCloses(closes: number[]): DailyBar[] {
  return closes.map((close, index) => ({
    instrumentId: instrument.id,
    tradeDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    open: close - 0.02,
    high: close + 0.04,
    low: close - 0.04,
    close,
    volume: 10_000_000 + index * 100_000,
    adjustment: "forward",
    provider: "fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  }));
}

describe("buildRecommendation", () => {
  it("marks a steady uptrend as a buy candidate with auditable reasons", () => {
    const closes = Array.from({ length: 30 }, (_, index) => 3.5 + index * 0.035);

    const result = buildRecommendation(instrument, barsFromCloses(closes));

    expect(result.signal).toBe("buy_watch");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain("短期均线位于长期均线上方");
    expect(result.reasons).toContain("20 日动量为正");
    expect(result.asOfDate).toBe("2026-07-30");
  });

  it("flags a sustained decline as unsuitable for a new trade", () => {
    const closes = Array.from({ length: 30 }, (_, index) => 5.2 - index * 0.045);

    const result = buildRecommendation(instrument, barsFromCloses(closes));

    expect(result.signal).toBe("avoid");
    expect(result.score).toBeLessThan(45);
    expect(result.reasons).toContain("20 日动量为负");
  });

  it("rejects an undersized history window", () => {
    expect(() =>
      buildRecommendation(instrument, barsFromCloses([3.5, 3.6, 3.7])),
    ).toThrow("至少需要 21 个交易日");
  });
});
