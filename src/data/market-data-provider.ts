import type { DailyBar, Instrument } from "@/quant/types";

export interface MarketDataProvider {
  readonly id: string;
  listInstruments(): Promise<Instrument[]>;
  getDailyBars(instrumentId: string, limit: number): Promise<DailyBar[]>;
  /**
   * 可选：按代码/名称搜索市场标的（自选添加）。未实现的 provider 可不
   * 提供，调用方需回退到 listInstruments 的静态目录。
   */
  searchInstruments?(query: string): Promise<Instrument[]>;
}
