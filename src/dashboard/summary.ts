import type { Recommendation } from "@/quant/types";

export type FreshnessState = "fresh" | "aging" | "stale" | "missing";

export interface DashboardSummary {
  total: number;
  averageScore: number;
  strongest: Recommendation | null;
  signalCounts: {
    buyWatch: number;
    hold: number;
    avoid: number;
  };
  freshness: {
    state: FreshnessState;
    daysOld: number | null;
  };
}

function daysBetweenMarketDate(marketDate: string, now: Date): number {
  const marketTime = Date.parse(`${marketDate}T00:00:00+08:00`);
  return Math.max(0, Math.floor((now.getTime() - marketTime) / 86_400_000));
}

function freshnessFor(daysOld: number): FreshnessState {
  if (daysOld <= 1) return "fresh";
  if (daysOld <= 3) return "aging";
  return "stale";
}

export function summarizeDashboard(
  recommendations: Recommendation[],
  now = new Date(),
): DashboardSummary {
  if (recommendations.length === 0) {
    return {
      total: 0,
      averageScore: 0,
      strongest: null,
      signalCounts: { buyWatch: 0, hold: 0, avoid: 0 },
      freshness: { state: "missing", daysOld: null },
    };
  }

  const strongest = recommendations.reduce((best, item) =>
    item.score > best.score ? item : best,
  );
  const newestMarketDate = recommendations.reduce(
    (latest, item) => item.asOfDate > latest ? item.asOfDate : latest,
    recommendations[0].asOfDate,
  );
  const daysOld = daysBetweenMarketDate(newestMarketDate, now);

  return {
    total: recommendations.length,
    averageScore: Math.round(
      recommendations.reduce((total, item) => total + item.score, 0) /
        recommendations.length,
    ),
    strongest,
    signalCounts: {
      buyWatch: recommendations.filter((item) => item.signal === "buy_watch").length,
      hold: recommendations.filter((item) => item.signal === "hold").length,
      avoid: recommendations.filter((item) => item.signal === "avoid").length,
    },
    freshness: {
      state: freshnessFor(daysOld),
      daysOld,
    },
  };
}

