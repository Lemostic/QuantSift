import { describe, expect, it } from "vitest";
import { buildRecommendation } from "@/quant/recommendation";
import type { DailyBar, Instrument } from "@/quant/types";
import {
  BacktestConfigError,
  BacktestDataError,
  runBacktest,
} from "./engine";

const stock: Instrument = {
  id: "CN:600519",
  symbol: "600519",
  name: "贵州茅台",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
};

const fund: Instrument = {
  id: "CN:510300",
  symbol: "510300",
  name: "沪深300ETF",
  kind: "fund",
  exchange: "SSE",
  currency: "CNY",
};

function barsFromCloses(
  closes: number[],
  instrument: Instrument = stock,
): DailyBar[] {
  return closes.map((close, index) => ({
    instrumentId: instrument.id,
    tradeDate: new Date(Date.UTC(2026, 0, 1 + index))
      .toISOString()
      .slice(0, 10),
    open: close * 0.99,
    high: close * 1.03,
    low: close * 0.97,
    close,
    volume: 10_000_000 + index * 100_000,
    adjustment: "forward",
    provider: "fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  }));
}

function noFeeConfig(overrides: Record<string, unknown> = {}) {
  return {
    commissionRate: 0,
    minimumCommission: 0,
    stampDutyRate: 0,
    slippageBps: 0,
    ...overrides,
  };
}

describe("runBacktest", () => {
  it("rejects undersized history and invalid fee configuration", () => {
    expect(() => runBacktest(stock, barsFromCloses([1, 2, 3]))).toThrow(
      BacktestDataError,
    );
    const bars = barsFromCloses(Array.from({ length: 30 }, (_, i) => 10 + i));
    expect(() => runBacktest(stock, bars, { initialCapital: 0 })).toThrow(
      BacktestConfigError,
    );
    expect(() => runBacktest(stock, bars, { slippageBps: -1 })).toThrow(
      BacktestConfigError,
    );
  });

  it("enters at the next open after a buy signal and closes at data end", () => {
    const closes = Array.from({ length: 40 }, (_, index) => 10 + index * 0.2);
    const bars = barsFromCloses(closes);

    const result = runBacktest(
      stock,
      bars,
      noFeeConfig({ takeProfitPct: 100 }),
    );

    expect(result.points[0].tradeDate).toBe(bars[21].tradeDate);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryDate).toBe(bars[21].tradeDate);
    expect(result.trades[0].entryPrice).toBeCloseTo(bars[21].open, 6);
    expect(result.trades[0].exitReason).toBe("data_end");
    expect(result.trades[0].exitDate).toBe(bars.at(-1)!.tradeDate);
  });

  it("exits at the open after an avoid signal without using future bars", () => {
    const closes = [
      ...Array.from({ length: 40 }, (_, index) => 10 + index * 0.2),
      ...Array.from({ length: 40 }, (_, index) => 18 - index * 0.25),
    ];
    const bars = barsFromCloses(closes);
    let firstAvoidIndex = -1;
    for (let index = 20; index < bars.length; index += 1) {
      if (
        buildRecommendation(stock, bars.slice(0, index + 1)).signal === "avoid"
      ) {
        firstAvoidIndex = index;
        break;
      }
    }
    expect(firstAvoidIndex).toBeGreaterThanOrEqual(21);

    const result = runBacktest(
      stock,
      bars,
      noFeeConfig({ takeProfitPct: 100 }),
    );

    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0].exitReason).toBe("signal");
    expect(result.trades[0].exitDate).toBe(bars[firstAvoidIndex + 1].tradeDate);
  });

  it("triggers stop loss at the configured boundary", () => {
    const closes = Array.from({ length: 24 }, (_, index) => 10 + index * 0.2);
    const bars = barsFromCloses(closes);
    bars[22] = {
      ...bars[22],
      low: bars[22].close * 0.85,
      close: bars[22].close * 0.9,
    };

    const result = runBacktest(stock, bars, noFeeConfig());

    expect(result.trades[0].exitReason).toBe("stop_loss");
    expect(result.trades[0].exitPrice).toBeCloseTo(
      result.trades[0].entryPrice * 0.92,
      6,
    );
  });

  it("triggers take profit at the configured target", () => {
    const closes = Array.from({ length: 24 }, (_, index) => 10 + index * 0.2);
    const bars = barsFromCloses(closes);
    bars[22] = {
      ...bars[22],
      high: bars[22].close * 1.25,
      close: bars[22].close * 1.05,
    };

    const result = runBacktest(stock, bars, noFeeConfig());

    expect(result.trades[0].exitReason).toBe("take_profit");
    expect(result.trades[0].exitPrice).toBeCloseTo(
      result.trades[0].entryPrice * 1.2,
      6,
    );
  });

  it("applies stamp duty only when selling stocks", () => {
    const closes = Array.from({ length: 40 }, (_, index) => 10 + index * 0.2);

    const stockResult = runBacktest(
      stock,
      barsFromCloses(closes, stock),
      noFeeConfig({ takeProfitPct: 100, stampDutyRate: 0.0005 }),
    );
    const fundResult = runBacktest(
      fund,
      barsFromCloses(closes, fund),
      noFeeConfig({ takeProfitPct: 100, stampDutyRate: 0.0005 }),
    );
    const stockTrade = stockResult.trades[0];
    const fundTrade = fundResult.trades[0];

    expect(stockTrade.shares).toBe(fundTrade.shares);
    const stampDuty = stockTrade.shares * stockTrade.exitPrice * 0.0005;
    expect(fundTrade.netProfit - stockTrade.netProfit).toBeCloseTo(
      stampDuty,
      2,
    );
  });

  it("respects the maximum holding window", () => {
    const closes = Array.from({ length: 40 }, (_, index) => 10 + index * 0.2);
    const bars = barsFromCloses(closes);

    const result = runBacktest(stock, bars, noFeeConfig({ maxHoldingDays: 3 }));

    expect(result.trades[0].exitReason).toBe("time_stop");
    expect(result.trades[0].exitDate).toBe(bars[24].tradeDate);
    expect(result.trades[0].holdingDays).toBe(3);
  });

  it("computes drawdown, win rate, and total return", () => {
    const closes = [
      ...Array.from({ length: 30 }, (_, index) => 10 + index * 0.2),
      ...Array.from({ length: 20 }, (_, index) => 16 - index * 0.18),
    ];

    const result = runBacktest(stock, barsFromCloses(closes), noFeeConfig());

    expect(result.points).toHaveLength(closes.length - 21);
    expect(result.metrics.maxDrawdownPct).toBeGreaterThan(0);
    expect(result.metrics.winRate).toBeGreaterThanOrEqual(0);
    expect(result.metrics.totalReturnPct).toBeCloseTo(
      (result.metrics.finalEquity / 100_000 - 1) * 100,
      2,
    );
  });

  it("keeps earlier trades and equity unchanged when future bars change", () => {
    const closes = Array.from({ length: 80 }, (_, index) =>
      index < 40 ? 10 + index * 0.2 : 18 - (index - 40) * 0.12,
    );
    const baseBars = barsFromCloses(closes);
    const futureBars = barsFromCloses(closes);
    futureBars[60] = {
      ...futureBars[60],
      open: 3,
      high: 25,
      low: 2.5,
      close: 4,
    };

    const base = runBacktest(stock, baseBars, noFeeConfig());
    const future = runBacktest(stock, futureBars, noFeeConfig());
    const cutoff = baseBars[59].tradeDate;

    expect(future.points.filter((point) => point.tradeDate <= cutoff)).toEqual(
      base.points.filter((point) => point.tradeDate <= cutoff),
    );
    expect(future.trades.filter((trade) => trade.exitDate <= cutoff)).toEqual(
      base.trades.filter((trade) => trade.exitDate <= cutoff),
    );
  });
});
