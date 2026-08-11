export type InstrumentKind = "stock" | "fund";
export type Exchange = "SSE" | "SZSE" | "OTC";
export type AdjustmentMode = "none" | "forward" | "backward";

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  kind: InstrumentKind;
  exchange: Exchange;
  currency: "CNY";
}

export interface DailyBar {
  instrumentId: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustment: AdjustmentMode;
  provider: string;
  fetchedAt: string;
}

export type RecommendationSignal = "buy_watch" | "hold" | "avoid";

export interface FactorScore {
  key: "trend" | "momentum" | "risk";
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface Recommendation {
  instrument: Instrument;
  signal: RecommendationSignal;
  score: number;
  asOfDate: string;
  price: number;
  dailyChangePct: number;
  reasons: string[];
  risks: string[];
  factors: FactorScore[];
  provider: string;
  fetchedAt: string;
}

