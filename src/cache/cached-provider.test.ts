import { describe, expect, it } from "vitest";
import type { MarketDataProvider } from "@/data/market-data-provider";
import type { DailyBar, Instrument } from "@/quant/types";
import { createCachedMarketDataProvider } from "./cached-provider";
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

const instrument: Instrument = {
  id: "CN:TEST",
  symbol: "TEST",
  name: "测试标的",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
};

function fakeProvider(options: { fail?: boolean } = {}): MarketDataProvider & {
  callCount(): number;
} {
  let calls = 0;
  return {
    id: "akshare",
    async listInstruments() {
      return [instrument];
    },
    async getDailyBars(instrumentId: string, limit: number) {
      calls += 1;
      if (options.fail) throw new Error("网络不可用");
      const dates = ["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"];
      return dates.slice(-limit).map((date, index) =>
        bar(instrumentId, date, index + 1),
      );
    },
    callCount: () => calls,
  } as unknown as MarketDataProvider & { callCount(): number };
}

const NOW_FRESH = () => new Date("2026-01-05T00:00:00.000Z");

async function seedCache(cache: BarCacheStore, instrumentId: string) {
  await cache.putBars(instrumentId, [
    bar(instrumentId, "2025-12-29", 1),
    bar(instrumentId, "2025-12-30", 2),
    bar(instrumentId, "2025-12-31", 3),
    bar(instrumentId, "2026-01-02", 4),
    bar(instrumentId, "2026-01-05", 5),
  ]);
}

describe("createCachedMarketDataProvider", () => {
  it("fetches and persists when the cache is empty", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const base = fakeProvider();
    const provider = createCachedMarketDataProvider(base, cache, {}, { now: NOW_FRESH });
    const result = await provider.getDailyBarsCached("CN:TEST", 30);
    expect(result.servedFrom).toBe("live");
    expect(result.bars).toHaveLength(4);
    expect(await cache.getBars("CN:TEST")).toHaveLength(4);
  });

  it("serves fresh cached bars without touching the network", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await seedCache(cache, "CN:TEST");
    const base = fakeProvider();
    const provider = createCachedMarketDataProvider(base, cache, {}, { now: NOW_FRESH });
    const result = await provider.getDailyBarsCached("CN:TEST", 3);
    expect(result.servedFrom).toBe("cache");
    expect(result.fallbackError).toBeNull();
    expect(result.bars).toHaveLength(3);
    expect(base.callCount()).toBe(0);
  });

  it("respects the requested limit for cached bars", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await seedCache(cache, "CN:TEST");
    const provider = createCachedMarketDataProvider(fakeProvider(), cache, {}, { now: NOW_FRESH });
    const result = await provider.getDailyBarsCached("CN:TEST", 2);
    expect(result.bars.map((b) => b.tradeDate)).toEqual(["2026-01-02", "2026-01-05"]);
  });

  it("refreshes a stale cache and serves the merged history", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:TEST", [
      bar("CN:TEST", "2025-12-29", 1),
      bar("CN:TEST", "2025-12-30", 2),
    ]);
    const base = fakeProvider();
    const provider = createCachedMarketDataProvider(
      base,
      cache,
      {},
      { now: () => new Date("2026-01-07T00:00:00.000Z") },
    );
    const result = await provider.getDailyBarsCached("CN:TEST", 30);
    expect(result.servedFrom).toBe("live");
    expect(result.bars.map((b) => b.tradeDate)).toEqual([
      "2025-12-29",
      "2025-12-30",
      "2026-01-01",
      "2026-01-02",
      "2026-01-05",
      "2026-01-06",
    ]);
    expect(await cache.getBars("CN:TEST")).toHaveLength(6);
  });

  it("keeps serving cached bars when the live provider fails", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await seedCache(cache, "CN:TEST");
    const base = fakeProvider({ fail: true });
    const provider = createCachedMarketDataProvider(
      base,
      cache,
      {},
      // Monday after the cached Friday: outside the stale window, so a
      // refresh is attempted and the base provider is hit.
      { now: () => new Date("2026-01-12T00:00:00.000Z") },
    );
    const result = await provider.getDailyBarsCached("CN:TEST", 30);
    expect(result.servedFrom).toBe("cache");
    expect(result.fallbackError).toBe("网络不可用");
    expect(base.callCount()).toBe(1);
    // The cache survives the failure untouched.
    expect(await cache.getBars("CN:TEST")).toHaveLength(5);
  });

  it("keeps the plain contract: throws when live fails and nothing is cached", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = createCachedMarketDataProvider(
      fakeProvider({ fail: true }),
      cache,
      {},
      { now: NOW_FRESH },
    );
    await expect(provider.getDailyBars("CN:TEST", 30)).rejects.toThrow(
      "网络不可用",
    );
  });

  it("exposes base listInstruments through the wrapper", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = createCachedMarketDataProvider(fakeProvider(), cache, {}, { now: NOW_FRESH });
    const instruments = await provider.listInstruments();
    expect(instruments.map((i) => i.id)).toEqual(["CN:TEST"]);
  });
});
