import type { MarketDataProvider } from "@/data/market-data-provider";
import { buildRecommendation } from "@/quant/recommendation";
import type { DailyBar, Instrument, Recommendation } from "@/quant/types";
import { refreshWatchlistCache } from "./refresh";
import {
  DEFAULT_CACHE_CONFIG,
  type BarCacheStore,
  type CacheConfig,
  type CacheLoadMeta,
  type CachedInstrumentState,
} from "./types";

export interface CachedSnapshot {
  recommendations: Recommendation[];
  states: CachedInstrumentState[];
}

export interface LoadCachedMarketDataRequest {
  cache: BarCacheStore;
  provider: MarketDataProvider;
  instrumentIds: string[];
  config?: Partial<CacheConfig>;
  now?: () => Date;
  /**
   * Invoked with recommendations built from the persisted cache before the
   * live refresh starts, so the dashboard can render immediately.
   */
  onCacheServed?: (snapshot: CachedSnapshot) => void;
}

export interface CachedLoadResult {
  recommendations: Recommendation[];
  meta: CacheLoadMeta;
}

const MIN_BARS = 21;

function buildFromBars(
  catalog: Instrument[],
  barsById: Map<string, DailyBar[]>,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const instrument of catalog) {
    const bars = barsById.get(instrument.id);
    if (!bars || bars.length < MIN_BARS) continue;
    try {
      recommendations.push(buildRecommendation(instrument, bars));
    } catch {
      // Short or incomplete histories are skipped silently; they are
      // reported through the freshness metadata instead.
    }
  }
  return recommendations.sort((a, b) => b.score - a.score);
}

/**
 * Cache-first market data load:
 *
 * 1. Builds recommendations from persisted local bars and hands them to
 *    `onCacheServed` immediately when enough history exists.
 * 2. Refreshes every requested instrument from the live provider, merging
 *    the fetched tail into the cache.
 * 3. Rebuilds recommendations from the refreshed history and returns them
 *    together with provenance metadata.
 *
 * A live failure never drops previously cached recommendations; the error
 * is reported through `meta.refreshErrors` and the stale snapshot stays
 * usable, mirroring the offline fallback contract of the dashboard.
 */
export async function loadCachedMarketData(
  request: LoadCachedMarketDataRequest,
): Promise<CachedLoadResult> {
  const config: CacheConfig = { ...DEFAULT_CACHE_CONFIG, ...request.config };
  const now = request.now ?? (() => new Date());
  const instrumentIds = [...request.instrumentIds];

  const catalog = await request.provider.listInstruments();
  const requested = catalog.filter((instrument) =>
    instrumentIds.includes(instrument.id),
  );

  // Phase 1: serve whatever the cache already holds.
  const cachedStates: CachedInstrumentState[] = [];
  const cachedBarsById = new Map<string, DailyBar[]>();
  for (const instrumentId of instrumentIds) {
    const [state, bars] = await Promise.all([
      request.cache.getState(instrumentId),
      request.cache.getBars(instrumentId),
    ]);
    if (state) cachedStates.push(state);
    if (bars.length >= MIN_BARS) cachedBarsById.set(instrumentId, bars);
  }
  const cachedRecommendations = buildFromBars(requested, cachedBarsById);
  if (cachedRecommendations.length > 0) {
    request.onCacheServed?.({
      recommendations: cachedRecommendations,
      states: cachedStates,
    });
  }

  // Phase 2: incremental live refresh, then rebuild.
  const results = await refreshWatchlistCache({
    cache: request.cache,
    provider: request.provider,
    instrumentIds,
    config,
    now,
  });
  const refreshedBarsById = new Map(
    results.map((result) => [result.instrumentId, result.bars]),
  );
  const recommendations = buildFromBars(requested, refreshedBarsById);

  const states = await request.cache.listStates();
  const refreshedAny = results.some((result) => result.outcome === "updated");
  const refreshErrors = results
    .filter((result) => result.error)
    .map((result) => `${result.instrumentId}: ${result.error}`);

  const meta: CacheLoadMeta = {
    servedFrom: refreshedAny ? "live" : recommendations.length > 0 ? "cache" : "live",
    states,
    anyStale: states.some(
      (state) =>
        state.lastTradeDate !== null &&
        results.some(
          (result) =>
            result.instrumentId === state.instrumentId &&
            result.freshness.status === "stale",
        ),
    ),
    refreshErrors,
    refreshedAt: now().toISOString(),
  };

  return { recommendations, meta };
}

export interface CacheStats {
  instruments: number;
  bars: number;
  latestTradeDate: string | null;
  lastFetchedAt: string | null;
}

/** Aggregates persisted cache bookkeeping for a management view. */
export function cacheStats(states: CachedInstrumentState[]): CacheStats {
  return {
    instruments: states.length,
    bars: states.reduce((total, state) => total + state.barCount, 0),
    latestTradeDate: states.reduce<string | null>(
      (latest, state) =>
        state.lastTradeDate && (!latest || state.lastTradeDate > latest)
          ? state.lastTradeDate
          : latest,
      null,
    ),
    lastFetchedAt: states.reduce<string | null>(
      (latest, state) =>
        !latest || state.lastFetchedAt > latest ? state.lastFetchedAt : latest,
      null,
    ),
  };
}
