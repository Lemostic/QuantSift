import type { DailyBar } from "./types";

export type BuyTimingKind = "trend_breakout" | "pullback_confirmed";

export interface BuyTimingMarker {
  tradeDate: string;
  price: number;
  kind: BuyTimingKind;
  label: string;
  detail: string;
}

export type SellTimingKind =
  | "trend_breakdown"
  | "momentum_reversal"
  | "overextended";

export interface SellTimingMarker {
  tradeDate: string;
  price: number;
  kind: SellTimingKind;
  label: string;
  detail: string;
}

export type TradeTimingMarker = BuyTimingMarker | SellTimingMarker;

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(bars: DailyBar[], endIndex: number, period: number): number {
  return average(
    bars.slice(endIndex - period + 1, endIndex + 1).map((bar) => bar.close),
  );
}

/**
 * Finds historical research windows from normalized bars. Signals require an
 * established 20-day trend and are spaced apart to avoid painting every bar.
 */
export function buildBuyTimingMarkers(bars: DailyBar[]): BuyTimingMarker[] {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 21) return [];

  const markers: BuyTimingMarker[] = [];
  let lastMarkerIndex = -10;

  for (let index = 20; index < sorted.length; index += 1) {
    if (index - lastMarkerIndex < 5) continue;

    const current = sorted[index];
    const ma5 = sma(sorted, index, 5);
    const ma20 = sma(sorted, index, 20);
    const previousMa5 = sma(sorted, index - 1, 5);
    const previousMa20 = sma(sorted, index - 1, 20);
    const fiveDayMomentum = current.close / sorted[index - 5].close - 1;
    const distanceFromTrend = current.close / ma20 - 1;
    const trendIsHealthy = ma5 > ma20 && fiveDayMomentum > 0;

    const crossedUp = previousMa5 <= previousMa20 && ma5 > ma20;
    const priorHigh = Math.max(...sorted.slice(index - 10, index).map((bar) => bar.high));
    const averageVolume = average(
      sorted.slice(index - 5, index).map((bar) => bar.volume),
    );
    const brokeOut =
      current.close > priorHigh &&
      current.volume >= averageVolume &&
      distanceFromTrend <= 0.12;

    const touchedTrend = current.low <= ma20 * 1.015;
    const closedBackAboveTrend = current.close >= ma20 && current.close > current.open;
    const pullbackConfirmed =
      trendIsHealthy && touchedTrend && closedBackAboveTrend && distanceFromTrend <= 0.05;

    if (crossedUp || (trendIsHealthy && brokeOut)) {
      markers.push({
        tradeDate: current.tradeDate,
        price: current.low,
        kind: "trend_breakout",
        label: "趋势突破",
        detail: crossedUp
          ? "MA5 上穿 MA20，短期趋势转强"
          : "价格突破近 10 日高点且趋势保持向上",
      });
      lastMarkerIndex = index;
    } else if (pullbackConfirmed) {
      markers.push({
        tradeDate: current.tradeDate,
        price: current.low,
        kind: "pullback_confirmed",
        label: "回踩确认",
        detail: "回踩 MA20 后收回，5 日动量仍为正",
      });
      lastMarkerIndex = index;
    }
  }

  return markers;
}

/**
 * Finds historical sell windows from normalized bars — the mirror image of
 * the buy rules: a broken uptrend, fading momentum, or an overextended
 * price rolling over. Spaced the same way to keep the chart readable.
 */
export function buildSellTimingMarkers(bars: DailyBar[]): SellTimingMarker[] {
  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 21) return [];

  const markers: SellTimingMarker[] = [];
  let lastMarkerIndex = -10;

  for (let index = 20; index < sorted.length; index += 1) {
    if (index - lastMarkerIndex < 5) continue;

    const current = sorted[index];
    const ma5 = sma(sorted, index, 5);
    const ma20 = sma(sorted, index, 20);
    const previousMa5 = sma(sorted, index - 1, 5);
    const previousMa20 = sma(sorted, index - 1, 20);
    const fiveDayMomentum = current.close / sorted[index - 5].close - 1;
    const distanceFromTrend = current.close / ma20 - 1;
    const trendIsBroken = ma5 < ma20 && fiveDayMomentum < 0;

    const crossedDown = previousMa5 >= previousMa20 && ma5 < ma20;
    const closedBelowTrend = current.close < ma20 && current.close < current.open;
    const breakdownConfirmed =
      trendIsBroken && closedBelowTrend && distanceFromTrend >= -0.15;

    const priorLow = Math.min(...sorted.slice(index - 10, index).map((bar) => bar.low));
    const averageVolume = average(
      sorted.slice(index - 5, index).map((bar) => bar.volume),
    );
    const brokeDown =
      current.close < priorLow &&
      current.volume >= averageVolume &&
      distanceFromTrend >= -0.15;

    const overextended = distanceFromTrend > 0.12;
    // A red candle after overextension is the early rollover sign; five-day
    // momentum may still be positive at the very top of a spike.
    const overextendedReversal = overextended && current.close < current.open;

    if (crossedDown || (trendIsBroken && brokeDown)) {
      markers.push({
        tradeDate: current.tradeDate,
        price: current.high,
        kind: "trend_breakdown",
        label: "趋势破位",
        detail: crossedDown
          ? "MA5 下穿 MA20，短期趋势转弱"
          : "价格跌破近 10 日低点且趋势保持向下",
      });
      lastMarkerIndex = index;
    } else if (breakdownConfirmed) {
      markers.push({
        tradeDate: current.tradeDate,
        price: current.high,
        kind: "momentum_reversal",
        label: "动量转弱",
        detail: "收盘跌破 MA20 且收阴，5 日动量已转负",
      });
      lastMarkerIndex = index;
    } else if (overextendedReversal) {
      markers.push({
        tradeDate: current.tradeDate,
        price: current.high,
        kind: "overextended",
        label: "高位回落",
        detail: "偏离 20 日均线过远后收阴，谨防回撤",
      });
      lastMarkerIndex = index;
    }
  }

  return markers;
}

export function movingAverageSeries(
  bars: DailyBar[],
  period: number,
): Array<number | null> {
  return bars.map((_, index) =>
    index + 1 < period ? null : sma(bars, index, period),
  );
}
