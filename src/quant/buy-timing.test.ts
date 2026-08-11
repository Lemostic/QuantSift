import { describe, expect, it } from "vitest";
import { buildBuyTimingMarkers } from "./buy-timing";
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
