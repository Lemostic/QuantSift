import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { loadRecommendations } from "@/data/recommendation-service";
import { buildScanAlerts } from "./policy";

describe("buildScanAlerts", () => {
  it("filters by score, signal, quiet hours, and message limit", async () => {
    const recommendations = await loadRecommendations(recordedMarketDataProvider);
    const alerts = buildScanAlerts(recommendations, {
      scanId: "scan-1",
      minimumScore: 80,
      signals: ["buy_watch"],
      quietHours: { start: "22:00", end: "07:00" },
      maxMessages: 2,
      now: new Date("2026-08-11T10:00:00+08:00"),
    });

    expect(alerts).toHaveLength(2);
    expect(alerts.map((alert) => alert.instrumentId)).toEqual([
      "CN:510300",
      "CN:600519",
    ]);
    expect(alerts[0].message).toContain("沪深300ETF");
  });

  it("suppresses all alerts during quiet hours", async () => {
    const recommendations = await loadRecommendations(recordedMarketDataProvider);

    expect(
      buildScanAlerts(recommendations, {
        scanId: "scan-2",
        minimumScore: 0,
        signals: ["buy_watch", "hold", "avoid"],
        quietHours: { start: "22:00", end: "07:00" },
        maxMessages: 10,
        now: new Date("2026-08-11T23:00:00+08:00"),
      }),
    ).toEqual([]);
  });
});
