import type { Recommendation } from "@/quant/types";
import type {
  PortfolioPosition,
  PortfolioSummary,
  PositionRiskSignal,
  PositionSnapshot,
} from "./types";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function resolveRisk(
  position: PortfolioPosition,
  recommendation: Recommendation,
  pnlPct: number,
): { signal: PositionRiskSignal; reason: string } {
  if (pnlPct <= -position.stopLossPct) {
    return {
      signal: "stop_loss_review",
      reason: `浮亏达到 ${Math.abs(pnlPct).toFixed(1)}%，超过 ${position.stopLossPct}% 风险线`,
    };
  }
  if (recommendation.signal === "avoid") {
    return {
      signal: "trend_exit_review",
      reason: `研究信号转为暂不交易，综合评分 ${recommendation.score}`,
    };
  }
  if (pnlPct >= position.takeProfitPct) {
    return {
      signal: "take_profit_review",
      reason: `浮盈达到 ${pnlPct.toFixed(1)}%，超过 ${position.takeProfitPct}% 目标线`,
    };
  }
  return {
    signal: "hold",
    reason: `当前评分 ${recommendation.score}，尚未触发预设风险边界`,
  };
}

export function buildPositionSnapshot(
  position: PortfolioPosition,
  recommendation: Recommendation,
): PositionSnapshot {
  const price = recommendation.price;
  const costBasis = position.quantity * position.averageCost;
  const marketValue = position.quantity * price;
  const unrealizedPnl = marketValue - costBasis;
  const unrealizedPnlPct = costBasis === 0 ? 0 : (unrealizedPnl / costBasis) * 100;
  const previousPrice = price / (1 + recommendation.dailyChangePct / 100);
  const dailyPnl = position.quantity * (price - previousPrice);
  const risk = resolveRisk(position, recommendation, unrealizedPnlPct);

  return {
    position,
    price,
    marketValue: round(marketValue),
    costBasis: round(costBasis),
    unrealizedPnl: round(unrealizedPnl),
    unrealizedPnlPct: round(unrealizedPnlPct),
    dailyPnl: round(dailyPnl),
    riskSignal: risk.signal,
    riskReason: risk.reason,
  };
}

export function summarizePortfolio(
  snapshots: PositionSnapshot[],
): PortfolioSummary {
  const marketValue = snapshots.reduce((sum, item) => sum + item.marketValue, 0);
  const costBasis = snapshots.reduce((sum, item) => sum + item.costBasis, 0);
  const unrealizedPnl = marketValue - costBasis;

  return {
    marketValue: round(marketValue),
    costBasis: round(costBasis),
    unrealizedPnl: round(unrealizedPnl),
    unrealizedPnlPct:
      costBasis === 0 ? 0 : round((unrealizedPnl / costBasis) * 100),
    dailyPnl: round(
      snapshots.reduce((sum, item) => sum + item.dailyPnl, 0),
    ),
    reviewCount: snapshots.filter((item) => item.riskSignal !== "hold").length,
  };
}
