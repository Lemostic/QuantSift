import type { DailyBar, Instrument } from "@/quant/types";

export interface MarketDataProvider {
  readonly id: string;
  listInstruments(): Promise<Instrument[]>;
  getDailyBars(instrumentId: string, limit: number): Promise<DailyBar[]>;
}

