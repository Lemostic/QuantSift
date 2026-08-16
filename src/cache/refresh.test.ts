import { describe, expect, it } from "vitest";
import type { MarketDataProvider } from "@/data/market-data-provider";
import type { DailyBar, Instrument } from "@/quant/types";
import { InMemoryBarCacheStore } from "./store";
import {
  refreshInstrumentCache,
  refreshWatchlistCache,
} from "./refresh";
import type { BarCacheStore } from "./types";

function bar(
  instrumentId: string,
  date: string,
  close: number,
  provider = "akshare",
): DailyBar {
  return {
    instrumentId,
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    adjustment: "none",
    provider,
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

interface FakeProviderOptions {
  bars?: DailyBar[];
  fail?: boolean;
  /** Fail only the first getDailyBars call. */
  failFirstCall?: boolean;
}

interface FakeProvider extends MarketDataProvider {
  _calls: { instrumentId: string; limit: number }[];
}

function fakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  const calls: { instrumentId: string; limit: number }[] = [];
  return {
    id: "akshare",
    async listInstruments() {
      return [instrument];
    },
    async getDailyBars(instrumentId: string, limit: number) {
      calls.push({ instrumentId, limit });
      if (options.fail) throw new Error("网络不可用");
      if (options.failFirstCall && calls.length === 1) throw new Error("网络不可用");
      return [...(options.bars ?? [])];
    },
    _calls: calls,
  };
}

describe("refreshInstrumentCache", () => {
  it("populates an empty cache on first refresh", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = fakeProvider({
      bars: [bar("CN:TEST", "2026-01-02", 2), bar("CN:TEST", "2026-01-01", 1)],
    });
    const result = await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
      now: () => new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(result.outcome).toBe("updated");
    expect(result.fetchedCount).toBe(2);
    expect(result.freshness.status).toBe("fresh");
    expect(await cache.getBars("CN:TEST")).toHaveLength(2);
    expect(await cache.getState("CN:TEST")).toMatchObject({
      lastTradeDate: "2026-01-02",
      barCount: 2,
    });
  });

  it("extends the cached history with the fetched tail", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:TEST", [
      bar("CN:TEST", "2026-01-01", 1, "recorded"),
      bar("CN:TEST", "2026-01-02", 2, "recorded"),
    ]);
    const provider = fakeProvider({
      bars: [bar("CN:TEST", "2026-01-03", 3), bar("CN:TEST", "2026-01-04", 4)],
    });
    const result = await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
    });
    const bars = await cache.getBars("CN:TEST");
    expect(bars.map((b) => b.tradeDate)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
    expect(result.outcome).toBe("updated");
    expect(bars[0].provider).toBe("recorded");
  });

  it("keeps the cache intact and reports the error when the provider fails", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    await cache.putBars("CN:TEST", [bar("CN:TEST", "2026-01-01", 1)]);
    const provider = fakeProvider({ fail: true });
    const result = await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
    });
    expect(result.outcome).toBe("failed");
    expect(result.error).toBe("网络不可用");
    expect(result.bars).toHaveLength(1);
    expect(await cache.getBars("CN:TEST")).toHaveLength(1);
    expect((await cache.getState("CN:TEST"))?.barCount).toBe(1);
  });

  it("reports unchanged when the provider returns no bars", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = fakeProvider({ bars: [] });
    const result = await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
    });
    expect(result.outcome).toBe("unchanged");
    expect(result.fetchedCount).toBe(0);
    expect(result.bars).toEqual([]);
  });

  it("requests only the configured refresh limit", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = fakeProvider({ bars: [bar("CN:TEST", "2026-01-01", 1)] });
    await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
      config: { refreshLimit: 17 },
    });
    expect(provider._calls).toEqual([
      { instrumentId: "CN:TEST", limit: 17 },
    ]);
  });

  it("stays stale when the fetched tail does not reach the expected date", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    // Cached history ends Friday 2026-01-02; the provider lags behind and
    // only repeats that same Friday bar.
    await cache.putBars("CN:TEST", [
      bar("CN:TEST", "2025-12-29", 1),
      bar("CN:TEST", "2025-12-30", 2),
      bar("CN:TEST", "2025-12-31", 3),
      bar("CN:TEST", "2026-01-02", 4),
    ]);
    const provider = fakeProvider({
      bars: [bar("CN:TEST", "2026-01-02", 4)],
    });
    const result = await refreshInstrumentCache({
      cache,
      provider,
      instrumentId: "CN:TEST",
      now: () => new Date("2026-01-07T00:00:00.000Z"),
    });
    expect(result.freshness.status).toBe("stale");
    expect(result.freshness.daysOld).toBe(3);
  });
});

describe("refreshWatchlistCache", () => {
  it("refreshes every instrument and keeps per-instrument failures isolated", async () => {
    const cache: BarCacheStore = new InMemoryBarCacheStore();
    const provider = fakeProvider({
      bars: [bar("CN:A", "2026-01-01", 1)],
      failFirstCall: true,
    });
    const results = await refreshWatchlistCache({
      cache,
      provider,
      instrumentIds: ["CN:A", "CN:B"],
    });
    expect(results).toHaveLength(2);
    expect(results[0].outcome).toBe("failed");
    expect(results[1].outcome).toBe("updated");
    expect(await cache.getBars("CN:B")).toHaveLength(1);
  });
});
