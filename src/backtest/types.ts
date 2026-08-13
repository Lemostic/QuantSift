import type { DailyBar, Instrument, RecommendationSignal } from "@/quant/types";

export interface BacktestConfig {
  initialCapital: number;
  buySignal: RecommendationSignal;
  exitOnAvoid: boolean;
  stopLossPct: number;
  takeProfitPct: number;
  maxHoldingDays: number;
  commissionRate: number;
  minimumCommission: number;
  stampDutyRate: number;
  slippageBps: number;
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCapital: 100_000,
  buySignal: "buy_watch",
  exitOnAvoid: true,
  stopLossPct: 8,
  takeProfitPct: 20,
  maxHoldingDays: 60,
  commissionRate: 0.0003,
  minimumCommission: 5,
  stampDutyRate: 0.0005,
  slippageBps: 5,
};

export type BacktestExitReason =
  | "signal"
  | "stop_loss"
  | "take_profit"
  | "time_stop"
  | "data_end";

export interface BacktestTrade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  invested: number;
  netProfit: number;
  returnPct: number;
  exitReason: BacktestExitReason;
  holdingDays: number;
}

export interface BacktestPoint {
  tradeDate: string;
  equity: number;
  drawdownPct: number;
  signal: RecommendationSignal | null;
}

export interface BacktestMetrics {
  finalEquity: number;
  peakEquity: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  maxDrawdownPct: number;
  tradeCount: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number | null;
}

export interface BacktestResult {
  instrument: Instrument;
  config: BacktestConfig;
  bars: DailyBar[];
  trades: BacktestTrade[];
  points: BacktestPoint[];
  metrics: BacktestMetrics;
}
