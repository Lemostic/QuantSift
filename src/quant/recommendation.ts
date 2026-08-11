import type {
  DailyBar,
  FactorScore,
  Instrument,
  Recommendation,
  RecommendationSignal,
} from "./types";

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function percentChange(current: number, previous: number): number {
  return previous === 0 ? 0 : ((current - previous) / previous) * 100;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function signalForScore(score: number): RecommendationSignal {
  if (score >= 70) return "buy_watch";
  if (score >= 45) return "hold";
  return "avoid";
}

export function buildRecommendation(
  instrument: Instrument,
  bars: DailyBar[],
): Recommendation {
  if (bars.length < 21) {
    throw new Error("生成推荐至少需要 21 个交易日的数据");
  }

  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const closes = sorted.map((bar) => bar.close);
  const latest = sorted.at(-1)!;
  const previous = sorted.at(-2)!;
  const sma5 = average(closes.slice(-5));
  const sma20 = average(closes.slice(-20));
  const momentum20 = percentChange(latest.close, closes.at(-21)!);
  const returns = closes
    .slice(-21)
    .slice(1)
    .map((close, index) => percentChange(close, closes.slice(-21)[index]));
  const annualizedVolatility = standardDeviation(returns) * Math.sqrt(252);

  const trendScore = clampScore(50 + ((sma5 / sma20) - 1) * 1_200);
  const momentumScore = clampScore(50 + momentum20 * 3);
  const riskScore = clampScore(100 - annualizedVolatility * 2.2);
  const factors: FactorScore[] = [
    {
      key: "trend",
      label: "趋势",
      score: trendScore,
      weight: 0.45,
      detail: `MA5 ${sma5.toFixed(3)} / MA20 ${sma20.toFixed(3)}`,
    },
    {
      key: "momentum",
      label: "动量",
      score: momentumScore,
      weight: 0.35,
      detail: `20 日 ${momentum20 >= 0 ? "+" : ""}${momentum20.toFixed(2)}%`,
    },
    {
      key: "risk",
      label: "波动风险",
      score: riskScore,
      weight: 0.2,
      detail: `年化波动 ${annualizedVolatility.toFixed(1)}%`,
    },
  ];
  const score = clampScore(
    factors.reduce((total, factor) => total + factor.score * factor.weight, 0),
  );
  const reasons = [
    sma5 > sma20 ? "短期均线位于长期均线上方" : "短期均线尚未突破长期均线",
    momentum20 > 0 ? "20 日动量为正" : "20 日动量为负",
  ];
  const risks: string[] = [];
  if (annualizedVolatility > 35) risks.push("近期波动较高，建议缩小单笔仓位");
  if (latest.close > sma20 * 1.08) risks.push("价格偏离 20 日均线较远，谨防追高");
  if (risks.length === 0) risks.push("历史信号不代表未来收益");

  return {
    instrument,
    signal: signalForScore(score),
    score,
    asOfDate: latest.tradeDate,
    price: latest.close,
    dailyChangePct: percentChange(latest.close, previous.close),
    reasons,
    risks,
    factors,
    provider: latest.provider,
    fetchedAt: latest.fetchedAt,
  };
}

