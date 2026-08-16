import { describe, expect, it } from "vitest";
import type { DailyBar } from "./types";
import {
  boll,
  computeBarStats,
  computeLegendStats,
  ema,
  kdj,
  macd,
  rsi,
  sma,
} from "./indicators";

function barsFromCloses(closes: number[]): DailyBar[] {
  return closes.map((close, index) => ({
    instrumentId: "CN:TEST",
    tradeDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    open: close * 0.995,
    high: close * 1.01,
    low: close * 0.99,
    close,
    volume: 10_000_000 + index * 100_000,
    adjustment: "forward",
    provider: "fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  }));
}

describe("indicator primitives", () => {
  it("sma returns null before enough data", () => {
    const closes = [1, 2, 3, 4];
    expect(sma(closes, 5, 3)).toBeNull();
    expect(sma(closes, 3, 2)).toBe(2);
  });

  it("ema weights recent values more", () => {
    expect(ema([1, 1, 1], 3, 2)).toBe(1);
    expect(ema([1, 2], 3, 1)).toBeCloseTo(1.5);
    expect(ema([1, 2, 3], 3, 2)).toBeGreaterThan(2);
  });

  it("rsi is bounded and null before the window", () => {
    const closes = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1];
    expect(rsi(closes, 14, 10)).toBeNull();
    const value = rsi(closes, 14, 14)!;
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(100);
  });

  it("kdj stays in the classic range", () => {
    const bars = barsFromCloses(Array.from({ length: 30 }, (_, i) => 10 + i));
    const value = kdj(bars, 9, 29)!;
    expect(value.k).toBeGreaterThan(0);
    expect(value.d).toBeGreaterThan(0);
    expect(value.j).toBeCloseTo(3 * value.k - 2 * value.d, 6);
  });

  it("boll mid equals sma and upper/lower are symmetric", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 10 + (i % 5));
    const value = boll(closes, 20, 2, 29)!;
    expect(value.mid).toBeCloseTo(sma(closes, 20, 29)!, 10);
    expect(value.upper - value.mid).toBeCloseTo(value.mid - value.lower, 6);
  });

  it("macd dif is fast ema minus slow ema", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 10 + i * 0.5);
    const value = macd(closes, 39)!;
    expect(value.dif).toBeCloseTo(ema(closes, 12, 39) - ema(closes, 26, 39), 8);
    expect(value.hist).toBeCloseTo((value.dif - value.dea) * 2, 8);
  });
});

describe("computeLegendStats", () => {
  it("computes the latest bar readout deterministically", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 10 + i * 0.4);
    const stats = computeLegendStats(barsFromCloses(closes))!;
    expect(stats.close).toBeCloseTo(10 + 29 * 0.4, 6);
    expect(stats.changeAmount).toBeCloseTo(0.4, 6);
    expect(stats.changePct).toBeCloseTo((0.4 / (10 + 28 * 0.4)) * 100, 6);
    expect(stats.ma5).not.toBeNull();
    expect(stats.ma20).not.toBeNull();
    expect(stats.bollUpper! > stats.bollMid!).toBe(true);
    expect(stats.bollLower! < stats.bollMid!).toBe(true);
    expect(stats.rsi).not.toBeNull();
    expect(stats.kdjK).not.toBeNull();
    expect(stats.macdDif).not.toBeNull();
    expect(stats.macdDea).not.toBeNull();
    expect(stats.macdHist).not.toBeNull();
  });

  it("returns null for too-short series", () => {
    expect(computeLegendStats(barsFromCloses([1]))).toBeNull();
  });

  it("computeBarStats uses only the prefix (no look-ahead)", () => {
    const bars = barsFromCloses(Array.from({ length: 30 }, (_, i) => 10 + i));
    // 在第 10 根的位置计算：MA5 应等于第 6-10 根收盘均值，且不含第 11 根之后的数据。
    const stats = computeBarStats(bars, "2026-07-10")!;
    const prefixCloses = bars
      .slice(0, 10)
      .map((bar) => bar.close);
    expect(stats.ma5).toBeCloseTo(
      prefixCloses.slice(-5).reduce((a, b) => a + b, 0) / 5,
      6,
    );
    expect(stats.changePct).toBeCloseTo(
      ((prefixCloses[9] - prefixCloses[8]) / prefixCloses[8]) * 100,
      6,
    );
  });
});
