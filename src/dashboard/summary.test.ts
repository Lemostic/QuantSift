import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { loadRecommendations } from "@/data/recommendation-service";
import { summarizeDashboard } from "./summary";

describe("summarizeDashboard", () => {
  it("builds an actionable overview from ranked recommendations", async () => {
    const recommendations = await loadRecommendations(recordedMarketDataProvider);

    const summary = summarizeDashboard(
      recommendations,
      new Date("2026-08-11T09:00:00+08:00"),
    );

    expect(summary.total).toBe(5);
    expect(summary.signalCounts).toEqual({ buyWatch: 4, hold: 0, avoid: 1 });
    expect(summary.strongest?.instrument.symbol).toBe("510300");
    expect(summary.averageScore).toBe(74);
    expect(summary.freshness).toEqual({ state: "stale", daysOld: 12 });
  });

  it("returns an explicit empty state when no instruments were scanned", () => {
    const summary = summarizeDashboard([], new Date("2026-08-11T09:00:00+08:00"));

    expect(summary.total).toBe(0);
    expect(summary.strongest).toBeNull();
    expect(summary.freshness.state).toBe("missing");
  });
});

