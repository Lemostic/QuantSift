import type { MarketDataProvider } from "@/data/market-data-provider";
import type { DailyBar, Instrument } from "@/quant/types";
import { computeCacheFreshness } from "./freshness";
import { refreshInstrumentCache } from "./refresh";
import {
  DEFAULT_CACHE_CONFIG,
  type BarCacheStore,
  type CacheConfig,
  type CacheFreshness,
} from "./types";

export type ServedFrom = "cache" | "live";

export interface CachedBarsResult {
  bars: DailyBar[];
  /** Where the bars actually came from this call. */
  servedFrom: ServedFrom;
  /** Non-null when the cache was the only usable source. */
  fallbackError: string | null;
  freshness: CacheFreshness;
}

export interface CachedProviderOptions {
  /** Skip the network when the cached history is still fresh. */
  serveFreshFromCache: boolean;
  /** Injectable clock for deterministic freshness decisions. */
  now: () => Date;
}

export const DEFAULT_CACHED_PROVIDER_OPTIONS: CachedProviderOptions = {
  serveFreshFromCache: true,
  now: () => new Date(),
};

/**
 * A `MarketDataProvider` wrapper that reads through the local bar cache:
 *
 * - No cache yet: fetch from the base provider and persist the result.
 * - Fresh cache: serve the cached bars without touching the network
 *   (offline-friendly and fast) when `serveFreshFromCache` is enabled.
 * - Stale cache: fetch the latest tail, merge it over the history, persist,
 *   and serve the merged result.
 * - Base provider failure: keep serving the cached bars and report the
 *   failure through `getDailyBarsCached` metadata.
 *
 * The plain `getDailyBars` keeps the `MarketDataProvider` contract (bars or
 * throw); use `getDailyBarsCached` when the caller needs provenance.
 */
export function createCachedMarketDataProvider(
  base: MarketDataProvider,
  cache: BarCacheStore,
  config: Partial<CacheConfig> = {},
  options: Partial<CachedProviderOptions> = {},
): MarketDataProvider & { getDailyBarsCached: (id: string, limit: number) => Promise<CachedBarsResult> } {
  const resolvedConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG, ...config };
  const resolvedOptions: CachedProviderOptions = {
    ...DEFAULT_CACHED_PROVIDER_OPTIONS,
    ...options,
  };

  async function getDailyBarsCached(
    instrumentId: string,
    limit: number,
  ): Promise<CachedBarsResult> {
    const now = resolvedOptions.now();
    const cached = await cache.getBars(instrumentId);
    const state = await cache.getState(instrumentId);
    const freshness = computeCacheFreshness(
      state,
      now,
      resolvedConfig.maxStaleDays,
    );

    if (cached.length > 0 && freshness.status === "fresh" && resolvedOptions.serveFreshFromCache) {
      return {
        bars: cached.slice(-limit),
        servedFrom: "cache",
        fallbackError: null,
        freshness,
      };
    }

    const result = await refreshInstrumentCache({
      cache,
      provider: base,
      instrumentId,
      config: resolvedConfig,
      now: () => now,
    });
    if (result.error) {
      // The live provider failed. Keep serving the cached history when one
      // exists; otherwise the call fails like the base provider would.
      if (result.bars.length > 0) {
        return {
          bars: result.bars.slice(-limit),
          servedFrom: "cache",
          fallbackError: result.error,
          freshness: result.freshness,
        };
      }
      throw new Error(result.error);
    }
    return {
      bars: result.bars.slice(-limit),
      servedFrom: "live",
      fallbackError: null,
      freshness: result.freshness,
    };
  }

  return {
    id: `${base.id}+cache`,
    async listInstruments(): Promise<Instrument[]> {
      return base.listInstruments();
    },
    async getDailyBars(instrumentId: string, limit: number): Promise<DailyBar[]> {
      return (await getDailyBarsCached(instrumentId, limit)).bars;
    },
    getDailyBarsCached,
  };
}
