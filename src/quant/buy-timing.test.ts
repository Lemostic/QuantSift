import { describe, expect, it } from "vitest";
import { buildBuyTimingMarkers, buildSellTimingMarkers } from "./buy-timing";
import type { DailyBar } from "./types";

function barsFromCloses(closes: number[]): DailyBar[] {
  return closes.map((close, index) => ({
    instrumentId: "CN:TEST",
    tradeDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    open: close * 0.995,
    high: close * 1.004,
    low: close * 0.99,
    close,
    volume: 10_000_000 + index * 200_000,
    adjustment: "forward",
    provider: "fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  }));
}

describe("buildBuyTimingMarkers", () => {
  it("marks spaced trend breakouts in a confirmed uptrend", () => {
    const bars = barsFromCloses(
      Array.from({ length: 30 }, (_, index) => 3.5 + index * 0.035),
    );

    const markers = buildBuyTimingMarkers(bars);

    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((marker) => marker.kind === "trend_breakout")).toBe(true);
    expect(markers[0].tradeDate).toBe("2026-07-21");
  });

  it("does not mark a declining series", () => {
    const bars = barsFromCloses(
      Array.from({ length: 30 }, (_, index) => 5.2 - index * 0.045),
    );

    expect(buildBuyTimingMarkers(bars)).toEqual([]);
  });
});

describe("buildSellTimingMarkers", () => {
  it("marks a broken uptrend after a steady decline", () => {
    const bars = barsFromCloses(
      Array.from({ length: 30 }, (_, index) => 5.2 - index * 0.045),
    );

    const markers = buildSellTimingMarkers(bars);

    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0].label).toBe("趋势破位");
    expect(markers.every((marker) => marker.tradeDate > "2026-07-01")).toBe(true);
  });

  it("does not mark a rising series", () => {
    const bars = barsFromCloses(
      Array.from({ length: 30 }, (_, index) => 3.5 + index * 0.035),
    );

    expect(buildSellTimingMarkers(bars)).toEqual([]);
  });

  it("flags an overextended rollover in a late-stage uptrend", () => {
    // A long rally followed by a sharp overextension and red candles.
    const closes = Array.from({ length: 30 }, (_, index) =>
      index < 24 ? 3.5 + index * 0.04 : 4.5 + index * 0.06,
    );
    const bars = barsFromCloses(closes).map((bar, index) =>
      index >= 24
        ? {
            ...bar,
            open: Number((bar.close * 1.01).toFixed(3)),
            high: Number((bar.close * 1.02).toFixed(3)),
          }
        : bar,
    );

    const markers = buildSellTimingMarkers(bars);

    expect(
      markers.some((marker) => marker.kind === "overextended"),
    ).toBe(true);
  });
});
