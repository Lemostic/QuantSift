import { describe, expect, it, vi } from "vitest";
import type { MarketDataProvider } from "@/data/market-data-provider";
import type { DailyBar, Instrument } from "@/quant/types";
import { cacheStats, loadCachedMarketData, type CachedSnapshot } from "./service";
import { InMemoryBarCacheStore } from "./store";
import type { BarCacheStore } from "./types";

function bar(instrumentId: string, date: string, close: number): DailyBar {
  return {
    instrumentId,
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    adjustment: "none",
    provider: "akshare",
    fetchedAt: `${date}T09:00:00.000Z`,
  };
}

function series(
  instrumentId: string,
  start: string,
  count: number,
  direction: 1 | -1 = 1,
): DailyBar[] {
  const startDate = new Date(`${start}T00:00:00.000Z`);
  const bars: DailyBar[] = [];
  let cursor = new Date(startDate);
  let step = 0;
  while (bars.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      bars.push(
        bar(
          instrumentId,
          cursor.toISOString().slice(0, 10),
          direction === 1 ? 10 + step : 100 - step,
        ),
      );
      step += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return bars;
}

const instruments: Instrument[] = [
  {
    id: "CN:UP",
    symbol: "UP",
    name: "上升标的",
    kind: "stock",
    exchange: "SSE",
    currency: "CNY",
  },
  {
    id: "CN:DOWN",
    symbol: "DOWN",
    name: "下行标的",
    kind: "stock",
    exchange: "SZSE",
    currency: "CNY",
  },
];

function fakeProvider(options: { failBars?: boolean } = {}): MarketDataProvider {
  return {
    id: "akshare",
    async listInstruments() {
      return instruments;
    },
    async getDailyBars(instrumentId: string, limit: number) {
      if (options.failBars) throw new Error("网络不可用");
      const base =
        instrumentId === "CN:UP"
          ? series(instrumentId, "2025-12-01", 40, 1)
          : series(instrumentId, "2025-12-01", 40, -1);
      return base.slice(-limit);
    },
  };
}

const NOW = () => new Date("2026-01-05T00:00:00.000Z");

describe("loadCachedMarketData", () => {
  it("serves the cached snapshot first when history is cached", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:UP", series("CN:UP", "2025-12-01", 40, 1));
    await cache.putBars("CN:DOWN", series("CN:DOWN", "2025-12-01", 40, -1));

    const onCacheServed = vi.fn<(snapshot: CachedSnapshot) => void>();
    const result = await loadCachedMarketData({
      cache,
      provider: fakeProvider(),
      instrumentIds: ["CN:UP", "CN:DOWN"],
      now: NOW,
      onCacheServed,
    });

    expect(onCacheServed).toHaveBeenCalledTimes(1);
    const snapshot = onCacheServed.mock.calls[0][0];
    expect(snapshot.recommendations.map((r) => r.instrument.id)).toEqual([
      "CN:UP",
      "CN:DOWN",
    ]);
    expect(snapshot.states.map((s) => s.instrumentId)).toEqual(["CN:UP", "CN:DOWN"]);

    // The final result is the refreshed one.
    expect(result.recommendations.map((r) => r.instrument.id)).toEqual([
      "CN:UP",
      "CN:DOWN",
    ]);
    expect(result.meta.servedFrom).toBe("live");
  });

  it("does not call onCacheServed when the cache is too short", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:UP", series("CN:UP", "2026-01-01", 10, 1));
    const onCacheServed = vi.fn<(snapshot: CachedSnapshot) => void>();
    const result = await loadCachedMarketData({
      cache,
      provider: fakeProvider(),
      instrumentIds: ["CN:UP"],
      now: NOW,
      onCacheServed,
    });
    expect(onCacheServed).not.toHaveBeenCalled();
    expect(result.recommendations).toHaveLength(1);
    expect(result.meta.servedFrom).toBe("live");
  });

  it("keeps cached recommendations when the live refresh fails", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:UP", series("CN:UP", "2025-12-01", 40, 1));
    const onCacheServed = vi.fn<(snapshot: CachedSnapshot) => void>();
    const result = await loadCachedMarketData({
      cache,
      provider: fakeProvider({ failBars: true }),
      instrumentIds: ["CN:UP"],
      now: NOW,
      onCacheServed,
    });
    expect(onCacheServed).toHaveBeenCalledTimes(1);
    expect(result.recommendations.map((r) => r.instrument.id)).toEqual(["CN:UP"]);
    expect(result.meta.servedFrom).toBe("cache");
    expect(result.meta.refreshErrors).toEqual(["CN:UP: 网络不可用"]);
  });

  it("returns an empty load for an empty watchlist", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const result = await loadCachedMarketData({
      cache,
      provider: fakeProvider(),
      instrumentIds: [],
      now: NOW,
    });
    expect(result.recommendations).toEqual([]);
    expect(result.meta.refreshErrors).toEqual([]);
  });

  it("marks stale instruments in the metadata", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    // Cached history ends mid-December; the live provider keeps serving the
    // same December tail, so the merged result stays stale in early January.
    const staleBars = series("CN:UP", "2025-11-03", 30, 1);
    await cache.putBars("CN:UP", staleBars);
    const staleProvider: MarketDataProvider = {
      ...fakeProvider(),
      async getDailyBars(_instrumentId: string, limit: number) {
        return staleBars.slice(-limit);
      },
    };
    const result = await loadCachedMarketData({
      cache,
      provider: staleProvider,
      instrumentIds: ["CN:UP"],
      now: NOW,
    });
    expect(result.meta.anyStale).toBe(true);
  });

  it("ignores instruments missing from the provider catalog", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const result = await loadCachedMarketData({
      cache,
      provider: fakeProvider(),
      instrumentIds: ["CN:UNKNOWN"],
      now: NOW,
    });
    expect(result.recommendations).toEqual([]);
    // The unknown instrument still gets a refresh attempt without crashing.
    expect(result.meta.refreshErrors).toEqual([]);
  });
});

describe("cacheStats", () => {
  it("aggregates instrument states", () => {
    const stats = cacheStats([
      {
        instrumentId: "CN:A",
        lastTradeDate: "2026-01-02",
        lastFetchedAt: "2026-01-02T09:00:00.000Z",
        barCount: 30,
        source: "akshare",
      },
      {
        instrumentId: "CN:B",
        lastTradeDate: "2026-01-05",
        lastFetchedAt: "2026-01-05T09:00:00.000Z",
        barCount: 45,
        source: "akshare",
      },
    ]);
    expect(stats).toEqual({
      instruments: 2,
      bars: 75,
      latestTradeDate: "2026-01-05",
      lastFetchedAt: "2026-01-05T09:00:00.000Z",
    });
  });

  it("returns neutral values for an empty cache", () => {
    expect(cacheStats([])).toEqual({
      instruments: 0,
      bars: 0,
      latestTradeDate: null,
      lastFetchedAt: null,
    });
  });
});
