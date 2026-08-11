import { buildRecommendation } from "@/quant/recommendation";
import type {
  DailyBar,
  Recommendation,
  RecommendationSignal,
} from "@/quant/types";

export type MarketRegime =
  | "trend_up"
  | "trend_down"
  | "range"
  | "high_volatility";

export type IntelligenceConfidence = "high" | "medium" | "low";
export type ResearchPriority = "high" | "medium" | "low";

export interface RollingSignalPoint {
  asOfDate: string;
  signal: RecommendationSignal;
  score: number;
}

export interface SignalIntelligence {
  asOfDate: string;
  confidence: number;
  confidenceLevel: IntelligenceConfidence;
  factorConsensus: number;
  signalStability: number;
  dataCompleteness: number;
  regime: MarketRegime;
  regimeLabel: string;
  priority: ResearchPriority;
  actionTitle: string;
  actionSummary: string;
  support: number;
  resistance: number;
  downsideRoomPct: number;
  upsideRoomPct: number;
  nextChecks: string[];
  uncertainties: string[];
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function buildRollingSignalHistory(
  recommendation: Recommendation,
  bars: DailyBar[],
): RollingSignalPoint[] {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 21) return [];

  return sorted.slice(20).map((_, offset) => {
    const prefix = sorted.slice(0, offset + 21);
    const point = buildRecommendation(recommendation.instrument, prefix);
    return {
      asOfDate: point.asOfDate,
      signal: point.signal,
      score: point.score,
    };
  });
}

function signalMargin(recommendation: Recommendation): number {
  if (recommendation.signal === "buy_watch") {
    return clamp(55 + (recommendation.score - 70) * 1.8);
  }
  if (recommendation.signal === "avoid") {
    return clamp(55 + (45 - recommendation.score) * 1.8);
  }
  const distanceFromMiddle = Math.abs(recommendation.score - 57.5);
  return clamp(75 - distanceFromMiddle * 2);
}

function resolveRegime(recommendation: Recommendation): MarketRegime {
  const factors = new Map(
    recommendation.factors.map((factor) => [factor.key, factor.score]),
  );
  const trend = factors.get("trend") ?? 50;
  const momentum = factors.get("momentum") ?? 50;
  const risk = factors.get("risk") ?? 50;

  if (risk < 40) return "high_volatility";
  if (trend >= 68 && momentum >= 62) return "trend_up";
  if (trend <= 42 && momentum <= 42) return "trend_down";
  return "range";
}

const REGIME_LABEL: Record<MarketRegime, string> = {
  trend_up: "上行趋势",
  trend_down: "下行趋势",
  range: "区间整理",
  high_volatility: "高波动",
};

function resolveAction(
  recommendation: Recommendation,
  confidence: number,
  regime: MarketRegime,
): Pick<SignalIntelligence, "priority" | "actionTitle" | "actionSummary"> {
  if (recommendation.signal === "avoid") {
    return {
      priority: regime === "trend_down" ? "high" : "medium",
      actionTitle: "暂停新开仓研究",
      actionSummary: "趋势或动量尚未形成支持，先等待风险结构改善。",
    };
  }
  if (recommendation.signal === "buy_watch" && confidence >= 72) {
    return {
      priority: "high",
      actionTitle: "进入人工买入复核",
      actionSummary: "信号方向与滚动稳定度较一致，继续核验价格位置与风险边界。",
    };
  }
  if (recommendation.signal === "buy_watch") {
    return {
      priority: "medium",
      actionTitle: "等待信号进一步确认",
      actionSummary: "综合分已达观察线，但因子分歧或历史稳定度仍需改善。",
    };
  }
  return {
    priority: "low",
    actionTitle: "保持观察",
    actionSummary: "当前没有形成明确方向，等待价格或因子触发新的复核条件。",
  };
}

export function buildSignalIntelligence(
  recommendation: Recommendation,
  bars: DailyBar[],
): SignalIntelligence {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 21) {
    throw new Error("生成智能研判至少需要 21 个交易日的数据");
  }

  const factorScores = recommendation.factors.map((factor) => factor.score);
  const factorConsensus = clamp(100 - standardDeviation(factorScores) * 1.65);
  const rollingHistory = buildRollingSignalHistory(recommendation, sorted);
  const recentHistory = rollingHistory.slice(-5);
  const matchingSignals = recentHistory.filter(
    (point) => point.signal === recommendation.signal,
  ).length;
  const signalStability = clamp(
    recentHistory.length === 0
      ? 0
      : (matchingSignals / recentHistory.length) * 100,
  );
  const dataCompleteness = clamp((sorted.length / 30) * 100);
  const confidence = clamp(
    factorConsensus * 0.35 +
      signalStability * 0.35 +
      dataCompleteness * 0.2 +
      signalMargin(recommendation) * 0.1,
  );
  const confidenceLevel: IntelligenceConfidence =
    confidence >= 75 ? "high" : confidence >= 55 ? "medium" : "low";
  const regime = resolveRegime(recommendation);
  const action = resolveAction(recommendation, confidence, regime);

  const recentBars = sorted.slice(-10);
  const support = Math.min(...recentBars.map((bar) => bar.low));
  const resistance = Math.max(...recentBars.map((bar) => bar.high));
  const price = recommendation.price;
  const priceDigits = price >= 100 ? 2 : 3;
  const downsideRoomPct = round(((support - price) / price) * 100);
  const upsideRoomPct = round(((resistance - price) / price) * 100);
  const nextChecks = [
    `有效突破 ${resistance.toFixed(priceDigits)} 后复核趋势延续`,
    `跌破 ${support.toFixed(priceDigits)} 时重新评估风险`,
  ];
  if (regime === "high_volatility") {
    nextChecks.push("等待波动风险因子回到 40 分以上");
  } else if (recommendation.signal === "buy_watch") {
    nextChecks.push("确认 MA5 与 MA20 继续同向运行");
  }

  const uncertainties = [
    "可信度衡量因子一致性与近期稳定度，不代表上涨概率",
  ];
  if (dataCompleteness < 100) uncertainties.push("当前历史窗口不足 30 个交易日");
  if (factorConsensus < 60) uncertainties.push("趋势、动量与风险因子分歧较大");
  if (signalStability < 60) uncertainties.push("近期滚动信号切换较频繁");

  return {
    asOfDate: recommendation.asOfDate,
    confidence,
    confidenceLevel,
    factorConsensus,
    signalStability,
    dataCompleteness,
    regime,
    regimeLabel: REGIME_LABEL[regime],
    ...action,
    support: round(support, priceDigits),
    resistance: round(resistance, priceDigits),
    downsideRoomPct,
    upsideRoomPct,
    nextChecks,
    uncertainties,
  };
}
