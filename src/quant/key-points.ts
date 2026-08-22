import type { DailyBar } from "./types";
import { boll, kdj, macd, rsi, sma } from "./indicators";

/**
 * K 线关键点识别引擎（确定性规则，不消耗 token）。
 *
 * 加载行情后本地识别"值得分析"的关键点：放量突破、均线金叉/死叉、
 * 趋势反转、支撑/压力测试等；每个关键点附带当日的全指标快照
 * （MA/BOLL/MACD/KDJ/RSI/量比）与规则解释、信号提醒。悬停图表标记时
 * 直接展示，无需调用 AI；需要深度解读时再按点调用 AI 模型（有缓存）。
 */

export type KeyPointKind =
  | "breakout"
  | "breakdown"
  | "golden_cross"
  | "death_cross"
  | "trend_reversal_up"
  | "trend_reversal_down"
  | "volume_spike"
  | "support_test"
  | "resistance_test";

export type KeyPointSignal = "bullish" | "bearish" | "neutral";

export interface KeyPointIndicators {
  ma5: number | null;
  ma20: number | null;
  ma60: number | null;
  bollUpper: number | null;
  bollMid: number | null;
  bollLower: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
  kdjK: number | null;
  kdjD: number | null;
  kdjJ: number | null;
  rsi: number | null;
  /** 当日成交量 / 前 20 日均量。 */
  volumeRatio: number;
}

export interface KeyPoint {
  tradeDate: string;
  kind: KeyPointKind;
  /** 简短标题，如"放量突破 20 日高点"。 */
  title: string;
  /** 规则解释：为什么这一天是关键点。 */
  summary: string;
  /** 信号提醒（多空倾向）。 */
  signal: KeyPointSignal;
  /** 0-100 重要度（多规则叠加、波动幅度加权）。 */
  importance: number;
  /** 当日 OHLCV 快照。 */
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct: number;
  indicators: KeyPointIndicators;
}

export const KEY_POINT_KIND_LABEL: Record<KeyPointKind, string> = {
  breakout: "放量突破",
  breakdown: "破位下行",
  golden_cross: "金叉",
  death_cross: "死叉",
  trend_reversal_up: "趋势反转向上",
  trend_reversal_down: "趋势反转向下",
  volume_spike: "放量异动",
  support_test: "支撑测试",
  resistance_test: "压力测试",
};

const KIND_SIGNAL: Record<KeyPointKind, KeyPointSignal> = {
  breakout: "bullish",
  breakdown: "bearish",
  golden_cross: "bullish",
  death_cross: "bearish",
  trend_reversal_up: "bullish",
  trend_reversal_down: "bearish",
  volume_spike: "neutral",
  support_test: "bullish",
  resistance_test: "bearish",
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

interface Candidate {
  kind: KeyPointKind;
  importance: number;
  summary: string;
}

function buildIndicators(
  bars: DailyBar[],
  closes: number[],
  index: number,
): KeyPointIndicators {
  const current = bars[index];
  const volumeWindow = bars.slice(Math.max(0, index - 20), index);
  const averageVolume =
    volumeWindow.length > 0
      ? volumeWindow.reduce((sum, bar) => sum + bar.volume, 0) / volumeWindow.length
      : 0;
  const bollValues = boll(closes, 20, 2, index);
  const kdjValues = kdj(bars, 9, index);
  const macdValues = macd(closes, index);
  return {
    ma5: sma(closes, 5, index),
    ma20: sma(closes, 20, index),
    ma60: sma(closes, 60, index),
    bollUpper: bollValues ? round2(bollValues.upper) : null,
    bollMid: bollValues ? round2(bollValues.mid) : null,
    bollLower: bollValues ? round2(bollValues.lower) : null,
    macdDif: macdValues ? round2(macdValues.dif) : null,
    macdDea: macdValues ? round2(macdValues.dea) : null,
    macdHist: macdValues ? round2(macdValues.hist) : null,
    kdjK: kdjValues ? round2(kdjValues.k) : null,
    kdjD: kdjValues ? round2(kdjValues.d) : null,
    kdjJ: kdjValues ? round2(kdjValues.j) : null,
    rsi: rsi(closes, 14, index),
    volumeRatio: averageVolume > 0 ? round2(current.volume / averageVolume) : 0,
  };
}

/**
 * 识别关键点。规则全部基于已发生的数据（当日及之前），不引入未来信息；
 * 相邻同类点会合并（10 个交易日内只保留重要度最高者）。
 *
 * @param bars 升序日线。
 * @param limit 返回的关键点数量上限（按重要度取前 N 个，最新优先）。
 */
export function buildKeyPoints(bars: DailyBar[], limit = 12): KeyPoint[] {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 25) return [];

  const closes = sorted.map((bar) => bar.close);
  const found: Array<{ index: number; candidates: Candidate[] }> = [];

  for (let index = 21; index < sorted.length; index += 1) {
    const candidates: Candidate[] = [];
    const current = sorted[index];
    const previous = sorted[index - 1];
    const ma5 = sma(closes, 5, index);
    const ma20 = sma(closes, 20, index);
    if (ma5 === null || ma20 === null || previous.close === 0) continue;

    const previousMa5 = sma(closes, 5, index - 1) ?? 0;
    const previousMa20 = sma(closes, 20, index - 1) ?? 0;
    const changePct = ((current.close - previous.close) / previous.close) * 100;

    // 1) 金叉 / 死叉：MA5 穿越 MA20。
    if (previousMa5 <= previousMa20 && ma5 > ma20 && current.close > ma20) {
      candidates.push({
        kind: "golden_cross",
        importance: 72,
        summary: "MA5 上穿 MA20 形成金叉，短期动能转强；收盘站稳 MA20 上方。",
      });
    }
    if (previousMa5 >= previousMa20 && ma5 < ma20 && current.close < ma20) {
      candidates.push({
        kind: "death_cross",
        importance: 72,
        summary: "MA5 下穿 MA20 形成死叉，短期动能转弱；收盘跌破 MA20。",
      });
    }

    // 2) 突破 / 破位：收盘突破前 20 日极值（不含当日）。
    if (index >= 21) {
      const priorHigh = Math.max(
        ...sorted.slice(index - 20, index).map((bar) => bar.high),
      );
      const priorLow = Math.min(
        ...sorted.slice(index - 20, index).map((bar) => bar.low),
      );
      if (
        current.close > priorHigh &&
        current.close > ma20 &&
        changePct > 1.5
      ) {
        candidates.push({
          kind: "breakout",
          importance: 85,
          summary:
            "收盘突破前 20 日高点" +
            round2(priorHigh).toFixed(2) +
            "，涨幅 " +
            round2(changePct).toFixed(2) +
            "%，趋势突破特征明显。",
        });
      }
      if (
        current.close < priorLow &&
        current.close < ma20 &&
        changePct < -1.5
      ) {
        candidates.push({
          kind: "breakdown",
          importance: 85,
          summary:
            "收盘跌破前 20 日低点" +
            round2(priorLow).toFixed(2) +
            "，跌幅 " +
            round2(changePct).toFixed(2) +
            "%，破位风险信号。",
        });
      }
    }

    // 3) 趋势反转：3 日极值 + 反向大阳/大阴。
    if (index >= 3) {
      const windowHigh = Math.max(
        ...sorted.slice(index - 3, index + 1).map((bar) => bar.high),
      );
      const windowLow = Math.min(
        ...sorted.slice(index - 3, index + 1).map((bar) => bar.low),
      );
      const priorFalling =
        sorted[index - 1].close < sorted[index - 2].close &&
        sorted[index - 2].close < sorted[index - 3].close;
      const priorRising =
        sorted[index - 1].close > sorted[index - 2].close &&
        sorted[index - 2].close > sorted[index - 3].close;
      if (current.high >= windowHigh && priorFalling && changePct > 2) {
        candidates.push({
          kind: "trend_reversal_up",
          importance: 78,
          summary:
            "连续回调后放量大阳（+" +
            round2(changePct).toFixed(2) +
            "%），创 3 日新高，疑似趋势反转向上。",
        });
      }
      if (current.low <= windowLow && priorRising && changePct < -2) {
        candidates.push({
          kind: "trend_reversal_down",
          importance: 78,
          summary:
            "连续上涨后大阴线（" +
            round2(changePct).toFixed(2) +
            "%），创 3 日新低，疑似趋势反转向下。",
        });
      }
    }

    // 4) 支撑 / 压力测试：收盘贴近 20 日极值且有长影线。
    if (index >= 21) {
      const priorLow = Math.min(
        ...sorted.slice(index - 20, index).map((bar) => bar.low),
      );
      const priorHigh = Math.max(
        ...sorted.slice(index - 20, index).map((bar) => bar.high),
      );
      const range = current.high - current.low;
      if (
        current.low <= priorLow * 1.005 &&
        range > 0 &&
        (current.close - current.low) / range > 0.6
      ) {
        candidates.push({
          kind: "support_test",
          importance: 64,
          summary:
            "下探 20 日低点" +
            round2(priorLow).toFixed(2) +
            "附近后收回，长下影线表明下方承接较强（支撑测试）。",
        });
      }
      if (
        current.high >= priorHigh * 0.995 &&
        range > 0 &&
        (current.high - current.close) / range > 0.6
      ) {
        candidates.push({
          kind: "resistance_test",
          importance: 64,
          summary:
            "上攻 20 日高点" +
            round2(priorHigh).toFixed(2) +
            "附近受阻回落，长上影线表明上方抛压较重（压力测试）。",
        });
      }
    }

    // 5) 放量异动：量比 >= 2 且涨跌幅 >= 0.5%。
    const volumeWindow = sorted.slice(Math.max(0, index - 20), index);
    const averageVolume =
      volumeWindow.length > 0
        ? volumeWindow.reduce((sum, bar) => sum + bar.volume, 0) /
          volumeWindow.length
        : 0;
    if (averageVolume > 0 && current.volume >= averageVolume * 2 && Math.abs(changePct) >= 0.5) {
      candidates.push({
        kind: "volume_spike",
        importance: 58,
        summary:
          "成交量放大至 20 日均量的 " +
          round2(current.volume / averageVolume).toFixed(1) +
          " 倍，涨跌幅 " +
          (changePct >= 0 ? "+" : "") +
          round2(changePct).toFixed(2) +
          "%，资金关注度显著提升。",
      });
    }

    if (candidates.length > 0) {
      found.push({ index, candidates });
    }
  }

  // 合并：按重要度排序后，10 个交易日内保留同类最高者。
  const merged: Array<{ index: number; candidates: Candidate[] }> = [];
  for (const item of found) {
    const bucket = merged.find(
      (existing) =>
        Math.abs(existing.index - item.index) <= 10 &&
        existing.candidates.some((candidate) =>
          item.candidates.some(
            (candidate2) => candidate2.kind === candidate.kind,
          ),
        ),
    );
    if (bucket) {
      bucket.candidates = [...bucket.candidates, ...item.candidates];
    } else {
      merged.push({ index: item.index, candidates: [...item.candidates] });
    }
  }

  const keyPoints: KeyPoint[] = [];
  for (const item of merged) {
    const bar = sorted[item.index];
    const closesBefore = closes.slice(0, item.index);
    const previousClose = closesBefore.length > 0 ? closesBefore.at(-1)! : bar.open;
    const changePct =
      previousClose > 0 ? ((bar.close - previousClose) / previousClose) * 100 : 0;
    // 合并候选：重要度最高的类型作为主类型，其余并入解释。
    const best = [...item.candidates].sort((a, b) => b.importance - a.importance)[0];
    const extras = item.candidates
      .filter((candidate) => candidate !== best)
      .map((candidate) => KEY_POINT_KIND_LABEL[candidate.kind]);
    const importance = Math.min(
      100,
      item.candidates.reduce((sum, candidate) => sum + candidate.importance, 0) +
        Math.min(10, Math.abs(changePct) * 2),
    );
    const summary =
      extras.length > 0
        ? best.summary + "（同时具备：" + extras.join("、") + "特征）"
        : best.summary;
    keyPoints.push({
      tradeDate: bar.tradeDate,
      kind: best.kind,
      title: KEY_POINT_KIND_LABEL[best.kind],
      summary,
      signal: KIND_SIGNAL[best.kind],
      importance: Math.round(importance),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
      changePct: round2(changePct),
      indicators: buildIndicators(sorted, closes, item.index),
    });
  }

  // 最新优先，按重要度截取。
  return keyPoints
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit)
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
}

/** 供面板展示的信号文案。 */
export function keyPointSignalLabel(signal: KeyPointSignal): string {
  switch (signal) {
    case "bullish":
      return "偏多";
    case "bearish":
      return "偏空";
    default:
      return "中性";
  }
}
