import type { DailyBar } from "./types";

/**
 * 图表图例用指标计算：与 klinecharts 指标保持同一公式与参数
 * （MA5/MA20、BOLL(20,2)、MACD(12,26,9)、KDJ(9,3,3)、RSI(14)），
 * 全部为确定性纯函数，便于测试与审计。
 */

export interface LegendStats {
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** 相对前收盘的涨跌额。 */
  changeAmount: number;
  changePct: number;
  ma5: number | null;
  ma20: number | null;
  bollUpper: number | null;
  bollMid: number | null;
  bollLower: number | null;
  rsi: number | null;
  kdjK: number | null;
  kdjD: number | null;
  kdjJ: number | null;
  macdDif: number | null;
  macdDea: number | null;
  macdHist: number | null;
}

export function sma(values: number[], period: number, index: number): number | null {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += values[i];
  return sum / period;
}

export function ema(values: number[], period: number, index: number): number {
  // 迭代实现，避免递归的指数级重复计算。
  const multiplier = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i <= index; i += 1) {
    result = (values[i] - result) * multiplier + result;
  }
  return result;
}

export function rsi(closes: number[], period: number, index: number): number | null {
  if (index < period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = index - period + 1; i <= index; i += 1) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  if (gains + losses === 0) return 50;
  return (gains / (gains + losses)) * 100;
}

export function kdj(
  bars: DailyBar[],
  period: number,
  index: number,
): { k: number; d: number; j: number } | null {
  if (index + 1 < period) return null;
  let k = 50;
  let d = 50;
  for (let i = 0; i <= index; i += 1) {
    const window = bars.slice(Math.max(0, i - period + 1), i + 1);
    const highest = Math.max(...window.map((bar) => bar.high));
    const lowest = Math.min(...window.map((bar) => bar.low));
    const rsv = highest === lowest ? 50 : ((bars[i].close - lowest) / (highest - lowest)) * 100;
    k = (2 / 3) * k + (1 / 3) * rsv;
    d = (2 / 3) * d + (1 / 3) * k;
  }
  return { k, d, j: 3 * k - 2 * d };
}

export function macd(
  closes: number[],
  index: number,
): { dif: number; dea: number; hist: number } | null {
  if (index + 1 < 26) return null;
  // DIF 从第 26 根开始才有定义；DEA 为 DIF 序列的 9 日 EMA（与主流软件一致）。
  const difs: number[] = [];
  for (let i = 25; i <= index; i += 1) {
    difs.push(ema(closes, 12, i) - ema(closes, 26, i));
  }
  const dif = difs.at(-1)!;
  const dea = ema(difs, 9, difs.length - 1);
  return { dif, dea, hist: (dif - dea) * 2 };
}

export function boll(
  closes: number[],
  period: number,
  multiplier: number,
  index: number,
): { upper: number; mid: number; lower: number } | null {
  const mid = sma(closes, period, index);
  if (mid === null) return null;
  const window = closes.slice(index - period + 1, index + 1);
  const mean = mid;
  const variance =
    window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  return {
    upper: mid + multiplier * stddev,
    mid,
    lower: mid - multiplier * stddev,
  };
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** 计算最新一根 K 线的图例统计（含全部指标当前值）。 */
export function computeLegendStats(bars: DailyBar[]): LegendStats | null {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 2) return null;
  const latest = sorted.at(-1)!;
  const previous = sorted.at(-2)!;
  const closes = sorted.map((bar) => bar.close);
  const lastIndex = sorted.length - 1;

  const ma5 = sma(closes, 5, lastIndex);
  const ma20 = sma(closes, 20, lastIndex);
  const bollValue = boll(closes, 20, 2, lastIndex);
  const rsiValue = rsi(closes, 14, lastIndex);
  const kdjValue = kdj(sorted, 9, lastIndex);
  const macdValue = macd(closes, lastIndex);

  const changeAmount = latest.close - previous.close;

  return {
    tradeDate: latest.tradeDate,
    open: latest.open,
    high: latest.high,
    low: latest.low,
    close: latest.close,
    volume: latest.volume,
    changeAmount,
    changePct: previous.close === 0 ? 0 : (changeAmount / previous.close) * 100,
    ma5: ma5 === null ? null : round(ma5),
    ma20: ma20 === null ? null : round(ma20),
    bollUpper: bollValue === null ? null : round(bollValue.upper),
    bollMid: bollValue === null ? null : round(bollValue.mid),
    bollLower: bollValue === null ? null : round(bollValue.lower),
    rsi: rsiValue === null ? null : round(rsiValue),
    kdjK: kdjValue === null ? null : round(kdjValue.k),
    kdjD: kdjValue === null ? null : round(kdjValue.d),
    kdjJ: kdjValue === null ? null : round(kdjValue.j),
    macdDif: macdValue === null ? null : round(macdValue.dif),
    macdDea: macdValue === null ? null : round(macdValue.dea),
    macdHist: macdValue === null ? null : round(macdValue.hist),
  };
}

/** 按交易日找到某根 K 线的图例统计（用于十字光标读数）。 */
export function computeBarStats(
  bars: DailyBar[],
  tradeDate: string,
): LegendStats | null {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const index = sorted.findIndex((bar) => bar.tradeDate === tradeDate);
  if (index < 0) return null;
  const slice = sorted.slice(0, index + 1);
  return computeLegendStats(slice);
}

/**
 * 过滤掉晚于“今天”的 K 线（按上海时区），保证图表只展示过去到当前时间点、
 * 绝不出现未来时间。now 可注入以便确定性测试。
 */
export function filterBarsUpToToday(
  bars: DailyBar[],
  now: Date = new Date(),
): DailyBar[] {
  const shanghaiToday = new Date(now.getTime() + 8 * 3600_000)
    .toISOString()
    .slice(0, 10);
  return bars.filter((bar) => bar.tradeDate <= shanghaiToday);
}

/**
 * 计算让 K 线精确铺满容器宽度的 barSpace：
 * space = (容器宽 - Y 轴预留 - 右缘留白) / 根数，并夹在 [min, max] 内。
 * 铺满后最后一根 K 线紧贴右缘，时间轴不会延伸出未来日期。
 */
export function computeFillBarSpace(
  containerWidth: number,
  barCount: number,
  yAxisReserve = 68,
  edgePadding = 8,
  minSpace = 4,
  maxSpace = 160,
): number {
  if (containerWidth <= 0 || barCount <= 0) return minSpace;
  const usable = Math.max(1, containerWidth - yAxisReserve - edgePadding);
  return Math.max(minSpace, Math.min(maxSpace, usable / barCount));
}
