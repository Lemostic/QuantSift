import { buildRecommendation } from "@/quant/recommendation";
import type {
  DailyBar,
  Instrument,
  RecommendationSignal,
} from "@/quant/types";
import {
  DEFAULT_BACKTEST_CONFIG,
  type BacktestConfig,
  type BacktestExitReason,
  type BacktestMetrics,
  type BacktestPoint,
  type BacktestResult,
  type BacktestTrade,
} from "./types";

export class BacktestConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestConfigError";
  }
}

export class BacktestDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestDataError";
  }
}

interface Position {
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  shares: number;
  invested: number;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function validateConfig(config: BacktestConfig): void {
  if (!Number.isFinite(config.initialCapital) || config.initialCapital <= 0) {
    throw new BacktestConfigError("回测初始资金必须大于 0");
  }
  if (!Number.isFinite(config.stopLossPct) || config.stopLossPct <= 0) {
    throw new BacktestConfigError("止损复核线必须大于 0");
  }
  if (!Number.isFinite(config.takeProfitPct) || config.takeProfitPct <= 0) {
    throw new BacktestConfigError("止盈复核线必须大于 0");
  }
  if (
    !Number.isInteger(config.maxHoldingDays) ||
    config.maxHoldingDays < 1
  ) {
    throw new BacktestConfigError("最长持有天数必须为正整数");
  }
  if (
    config.commissionRate < 0 ||
    config.minimumCommission < 0 ||
    config.stampDutyRate < 0 ||
    config.slippageBps < 0
  ) {
    throw new BacktestConfigError("回测费率不能为负数");
  }
}

/**
 * Runs a deterministic daily-bar backtest. Decisions only see the prefix of
 * bars that ends at the signal date, and entries execute at the next open, so
 * future bars cannot leak into earlier trades.
 */
export function runBacktest(
  instrument: Instrument,
  bars: DailyBar[],
  config: Partial<BacktestConfig> = {},
): BacktestResult {
  const resolved: BacktestConfig = {
    ...DEFAULT_BACKTEST_CONFIG,
    ...config,
  };
  validateConfig(resolved);

  const sorted = [...bars].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  if (sorted.length < 21) {
    throw new BacktestDataError("回测至少需要 21 个交易日的数据");
  }

  let cash = resolved.initialCapital;
  let position: Position | null = null;
  let peakEquity = cash;
  let maxDrawdownPct = 0;
  const trades: BacktestTrade[] = [];
  const points: BacktestPoint[] = [];
  const signalCache = new Map<number, RecommendationSignal | null>();

  const signalAt = (index: number): RecommendationSignal | null => {
    if (index < 20) return null;
    const cached = signalCache.get(index);
    if (cached !== undefined) return cached;
    try {
      const signal = buildRecommendation(
        instrument,
        sorted.slice(0, index + 1),
      ).signal;
      signalCache.set(index, signal);
      return signal;
    } catch {
      signalCache.set(index, null);
      return null;
    }
  };

  const sellAt = (
    openPosition: Position,
    index: number,
    reason: BacktestExitReason,
    rawExitPrice: number,
  ): { cashProceeds: number; trade: BacktestTrade } => {
    const exitPrice =
      rawExitPrice * (1 - resolved.slippageBps / 10_000);
    const gross = openPosition.shares * exitPrice;
    const commission = Math.max(
      gross * resolved.commissionRate,
      resolved.minimumCommission,
    );
    const stampDuty =
      instrument.kind === "stock" ? gross * resolved.stampDutyRate : 0;
    const netProceeds = gross - commission - stampDuty;
    return {
      cashProceeds: netProceeds,
      trade: {
        entryDate: openPosition.entryDate,
        entryPrice: round(openPosition.entryPrice, 6),
        exitDate: sorted[index].tradeDate,
        exitPrice: round(exitPrice, 6),
        shares: openPosition.shares,
        invested: round(openPosition.invested),
        netProfit: round(netProceeds - openPosition.invested),
        returnPct: round(
          ((netProceeds - openPosition.invested) / openPosition.invested) * 100,
        ),
        exitReason: reason,
        holdingDays: index - openPosition.entryIndex,
      },
    };
  };

  const buyAt = (index: number): Position | null => {
    const bar = sorted[index];
    const entryPrice = bar.open * (1 + resolved.slippageBps / 10_000);
    let shares = Math.floor(
      cash / (entryPrice * (1 + resolved.commissionRate)),
    );
    while (shares > 0) {
      const gross = shares * entryPrice;
      const commission = Math.max(
        gross * resolved.commissionRate,
        resolved.minimumCommission,
      );
      if (gross + commission <= cash) break;
      shares -= 1;
    }
    if (shares <= 0) return null;

    const gross = shares * entryPrice;
    const commission = Math.max(
      gross * resolved.commissionRate,
      resolved.minimumCommission,
    );
    cash -= gross + commission;
    return {
      entryIndex: index,
      entryDate: bar.tradeDate,
      entryPrice,
      shares,
      invested: gross + commission,
    };
  };

  for (let index = 21; index < sorted.length; index += 1) {
    const bar = sorted[index];
    const signal = signalAt(index);
    const previousSignal = signalAt(index - 1);

    if (!position) {
      if (previousSignal === resolved.buySignal) position = buyAt(index);
    } else {
      const stopPrice = position.entryPrice * (1 - resolved.stopLossPct / 100);
      const targetPrice =
        position.entryPrice * (1 + resolved.takeProfitPct / 100);
      const holdingDays = index - position.entryIndex;
      let sale: { cashProceeds: number; trade: BacktestTrade } | null = null;

      if (resolved.exitOnAvoid && previousSignal === "avoid") {
        sale = sellAt(position, index, "signal", bar.open);
      } else if (bar.low <= stopPrice) {
        sale = sellAt(position, index, "stop_loss", stopPrice);
      } else if (bar.high >= targetPrice) {
        sale = sellAt(position, index, "take_profit", targetPrice);
      } else if (holdingDays >= resolved.maxHoldingDays) {
        sale = sellAt(position, index, "time_stop", bar.close);
      } else if (index === sorted.length - 1) {
        sale = sellAt(position, index, "data_end", bar.close);
      }
      if (sale) {
        cash += sale.cashProceeds;
        trades.push(sale.trade);
        position = null;
      }
    }

    const equity = cash + (position ? position.shares * bar.close : 0);
    peakEquity = Math.max(peakEquity, equity);
    const drawdownPct =
      peakEquity > 0 ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdownPct);
    points.push({
      tradeDate: bar.tradeDate,
      equity: round(equity),
      drawdownPct: round(drawdownPct),
      signal,
    });
  }

  const finalEquity = round(cash);
  const totalReturnPct = round(
    (finalEquity / resolved.initialCapital - 1) * 100,
  );
  const years = points.length > 1 ? points.length / 252 : 0;
  const annualizedReturnPct =
    years > 0
      ? round(
          (Math.pow(finalEquity / resolved.initialCapital, 1 / years) - 1) *
            100,
        )
      : 0;
  const winningTrades = trades.filter((trade) => trade.netProfit > 0).length;
  const losingTrades = trades.filter((trade) => trade.netProfit < 0).length;
  const grossProfit = trades
    .filter((trade) => trade.netProfit > 0)
    .reduce((sum, trade) => sum + trade.netProfit, 0);
  const grossLoss = trades
    .filter((trade) => trade.netProfit < 0)
    .reduce((sum, trade) => sum + Math.abs(trade.netProfit), 0);

  const metrics: BacktestMetrics = {
    finalEquity,
    peakEquity: round(peakEquity),
    totalReturnPct,
    annualizedReturnPct,
    maxDrawdownPct: round(maxDrawdownPct),
    tradeCount: trades.length,
    winningTrades,
    losingTrades,
    winRate: trades.length === 0 ? 0 : round((winningTrades / trades.length) * 100),
    profitFactor:
      trades.length === 0
        ? null
        : grossLoss === 0
          ? Number.POSITIVE_INFINITY
          : round(grossProfit / grossLoss),
  };

  return {
    instrument,
    config: resolved,
    bars: sorted,
    trades,
    points,
    metrics,
  };
}
