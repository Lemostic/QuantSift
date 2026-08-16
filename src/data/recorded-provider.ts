import type { MarketDataProvider } from "./market-data-provider";
import type { DailyBar, Instrument } from "@/quant/types";

const instruments: Instrument[] = [
  { id: "CN:510300", symbol: "510300", name: "沪深300ETF", kind: "fund", exchange: "SSE", currency: "CNY" },
  { id: "CN:600519", symbol: "600519", name: "贵州茅台", kind: "stock", exchange: "SSE", currency: "CNY" },
  { id: "CN:000001", symbol: "000001", name: "平安银行", kind: "stock", exchange: "SZSE", currency: "CNY" },
  { id: "CN:159915", symbol: "159915", name: "创业板ETF", kind: "fund", exchange: "SZSE", currency: "CNY" },
  { id: "CN:600036", symbol: "600036", name: "招商银行", kind: "stock", exchange: "SSE", currency: "CNY" },
  { id: "CN:012734", symbol: "012734", name: "易方达人工智能ETF联接C", kind: "fund", exchange: "OTC", currency: "CNY" },
];

const closeSeries: Record<string, number[]> = {
  "CN:510300": [3.82,3.84,3.81,3.86,3.88,3.9,3.89,3.94,3.97,3.96,4.01,4.03,4.05,4.04,4.08,4.11,4.13,4.12,4.17,4.2,4.22,4.25,4.27,4.3,4.33,4.31,4.36,4.4,4.43,4.47],
  "CN:600519": [1412,1420,1408,1431,1442,1438,1456,1468,1461,1479,1485,1498,1504,1492,1518,1525,1538,1544,1539,1556,1564,1572,1581,1575,1594,1602,1598,1614,1627,1639],
  "CN:000001": [11.9,11.82,11.76,11.69,11.72,11.64,11.58,11.61,11.52,11.46,11.39,11.43,11.35,11.28,11.22,11.17,11.11,11.06,11.09,11.02,10.96,10.91,10.85,10.88,10.81,10.75,10.7,10.66,10.62,10.57],
  "CN:159915": [1.78,1.8,1.76,1.82,1.85,1.83,1.89,1.86,1.92,1.95,1.91,1.98,2.02,1.99,2.05,2.09,2.06,2.12,2.17,2.13,2.2,2.24,2.2,2.28,2.34,2.29,2.38,2.43,2.39,2.48],
  "CN:600036": [38.2,38.4,38.1,38.6,38.8,38.5,38.9,39.1,38.8,39.2,39.4,39.1,39.5,39.8,39.6,39.9,40.1,39.8,40.2,40.4,40.1,40.5,40.8,40.6,40.9,41.1,40.8,41.2,41.4,41.6],
  "CN:012734": [1.612,1.628,1.619,1.646,1.671,1.688,1.704,1.693,1.726,1.748,1.771,1.806,1.794,1.832,1.857,1.884,1.913,1.902,1.941,1.967,1.994,2.018,2.006,2.041,2.073,2.054,2.091,2.116,2.133,2.0759],
};

const tradeDates = [
  "2026-06-19", "2026-06-22", "2026-06-23", "2026-06-24", "2026-06-25",
  "2026-06-26", "2026-06-29", "2026-06-30", "2026-07-01", "2026-07-02",
  "2026-07-03", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09",
  "2026-07-10", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16",
  "2026-07-17", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23",
  "2026-07-24", "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30",
] as const;

function tradingDatesEndingOn(lastDate: string, count: number): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${lastDate}T00:00:00Z`);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates;
}

const fund012734TradeDates = tradingDatesEndingOn("2026-08-10", 30);

function makeBars(instrumentId: string): DailyBar[] {
  const closes = closeSeries[instrumentId];
  if (!closes) throw new Error(`未找到 ${instrumentId} 的离线行情`);

  const isOtcFund = instrumentId === "CN:012734";
  const dates = isOtcFund ? fund012734TradeDates : tradeDates;
  return closes.map((close, index) => ({
    instrumentId,
    tradeDate: dates[index],
    open: Number((close * (index % 2 === 0 ? 0.997 : 1.002)).toFixed(3)),
    high: Number((close * 1.012).toFixed(3)),
    low: Number((close * 0.988).toFixed(3)),
    close,
    volume: isOtcFund ? 6_800_000 + index * 210_000 : 18_000_000 + index * 530_000,
    adjustment: isOtcFund ? "none" : "forward",
    provider: "recorded-fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  }));
}

export const recordedMarketDataProvider: MarketDataProvider = {
  id: "recorded-fixture",
  async listInstruments() {
    return instruments;
  },
  async getDailyBars(instrumentId, limit) {
    return makeBars(instrumentId).slice(-limit);
  },
  async searchInstruments(query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return instruments;
    return instruments.filter(
      (instrument) =>
        instrument.name.toLowerCase().includes(normalized) ||
        instrument.symbol.includes(normalized),
    );
  },
};
