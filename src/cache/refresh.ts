import type { MarketDataProvider } from "@/data/market-data-provider";
import type { DailyBar } from "@/quant/types";
import { computeCacheFreshness } from "./freshness";
import { mergeDailyBars } from "./merge";
import {
  DEFAULT_CACHE_CONFIG,
  type BarCacheStore,
  type CacheConfig,
  type InstrumentRefreshResult,
  type RefreshOutcome,
} from "./types";

export interface RefreshInstrumentRequest {
  cache: BarCacheStore;
  provider: MarketDataProvider;
  instrumentId: string;
  config?: Partial<CacheConfig>;
  now?: () => Date;
}

/**
 * Refreshes one instrument's cached history:
 *
 * 1. Reads the cached history (may be empty on first run).
 * 2. Fetches the provider's most recent `refreshLimit` bars.
 * 3. Merges the fetched tail over the cached history (fetched bars win per
 *    trade date), persists the merged result, and returns it.
 *
 * A provider failure never destroys the cache: the cached history is kept
 * and reported with `outcome: "failed"` plus the error message.
 */
export async function refreshInstrumentCache(
  request: RefreshInstrumentRequest,
): Promise<InstrumentRefreshResult> {
  const config: CacheConfig = { ...DEFAULT_CACHE_CONFIG, ...request.config };
  const now = request.now ?? (() => new Date());
  const cached = await request.cache.getBars(request.instrumentId);

  let fetched: DailyBar[] = [];
  let fetchedCount = 0;
  let outcome: RefreshOutcome;
  let error: string | null = null;
  try {
    fetched = await request.provider.getDailyBars(
      request.instrumentId,
      config.refreshLimit,
    );
    fetchedCount = fetched.length;
    outcome = fetchedCount > 0 ? "updated" : "unchanged";
  } catch (cause) {
    outcome = "failed";
    error = cause instanceof Error ? cause.message : String(cause);
  }

  const merged =
    outcome === "failed"
      ? cached
      : mergeDailyBars(cached, fetched, config.maxBarsPerInstrument);
  if (merged.length > 0) {
    await request.cache.putBars(request.instrumentId, merged);
  }
  const state = await request.cache.getState(request.instrumentId);
  const freshness = computeCacheFreshness(state, now(), config.maxStaleDays);

  return {
    instrumentId: request.instrumentId,
    outcome,
    bars: merged,
    fetchedCount,
    freshness,
    error,
  };
}

export interface RefreshWatchlistRequest {
  cache: BarCacheStore;
  provider: MarketDataProvider;
  instrumentIds: string[];
  config?: Partial<CacheConfig>;
  now?: () => Date;
}

/**
 * Refreshes every requested instrument concurrently. A failed instrument is
 * reported in its own result and does not abort the remaining instruments;
 * concurrency keeps one slow/dead source from stalling the whole dashboard.
 */
export async function refreshWatchlistCache(
  request: RefreshWatchlistRequest,
): Promise<InstrumentRefreshResult[]> {
  const results = await Promise.all(
    request.instrumentIds.map((instrumentId) =>
      refreshInstrumentCache({
        cache: request.cache,
        provider: request.provider,
        instrumentId,
        config: request.config,
        now: request.now,
      }),
    ),
  );
  return results;
}
