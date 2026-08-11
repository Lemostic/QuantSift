export type PositionRiskSignal =
  | "hold"
  | "take_profit_review"
  | "stop_loss_review"
  | "trend_exit_review";

export interface PortfolioPosition {
  instrumentId: string;
  quantity: number;
  averageCost: number;
  openedAt: string;
  stopLossPct: number;
  takeProfitPct: number;
  note: string;
  updatedAt: string;
}

export type PortfolioPositionDraft = Omit<PortfolioPosition, "updatedAt">;

export interface PositionSnapshot {
  position: PortfolioPosition;
  price: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dailyPnl: number;
  riskSignal: PositionRiskSignal;
  riskReason: string;
}

export interface PortfolioSummary {
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dailyPnl: number;
  reviewCount: number;
}
