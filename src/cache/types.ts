import type { DailyBar } from "@/quant/types";

/**
 * Persisted bookkeeping for one instrument's cached daily bars.
 */
export interface CachedInstrumentState {
  instrumentId: string;
  /** Most recent trade date present in the cached bars (YYYY-MM-DD). */
  lastTradeDate: string | null;
  /** ISO timestamp of the last successful write into the cache. */
  lastFetchedAt: string;
  /** Number of cached bars. */
  barCount: number;
  /** Provider id of the most recent write (e.g. "akshare" or "recorded"). */
  source: string;
}

/**
 * Storage seam for the local daily-bar cache. UI and strategy code depend on
 * this contract; the adapters (in-memory, localStorage, and later SQLite)
 * are interchangeable without touching callers.
 */
export interface BarCacheStore {
  getBars(instrumentId: string): Promise<DailyBar[]>;
  /**
   * Upserts bars for one instrument: bars already present for the same trade
   * date are replaced, the list is kept sorted by trade date, and any
   * instrument metadata is updated. Implementations may cap the history.
   */
  putBars(instrumentId: string, bars: DailyBar[]): Promise<void>;
  getState(instrumentId: string): Promise<CachedInstrumentState | null>;
  removeInstrument(instrumentId: string): Promise<void>;
  /** All persisted states, newest last-fetched first. */
  listStates(): Promise<CachedInstrumentState[]>;
  /** Removes every cached instrument. */
  clear(): Promise<void>;
}

export interface CacheConfig {
  /** How many trade dates a cache entry may lag before it counts as stale. */
  maxStaleDays: number;
  /** How many bars are kept per instrument. */
  maxBarsPerInstrument: number;
  /** Bars fetched from the live provider on a refresh (tail of history). */
  refreshLimit: number;
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxStaleDays: 2,
  maxBarsPerInstrument: 500,
  refreshLimit: 30,
};

export type CacheFreshnessStatus = "fresh" | "stale" | "missing";

export interface CacheFreshness {
  status: CacheFreshnessStatus;
  /** Trade dates the cached history lags behind the expected market date. */
  daysOld: number | null;
  lastTradeDate: string | null;
  /** The most recent expected trading day at the time of the check. */
  expectedTradeDate: string | null;
}

export type RefreshOutcome = "updated" | "unchanged" | "failed";

export interface InstrumentRefreshResult {
  instrumentId: string;
  outcome: RefreshOutcome;
  /** Full merged history after the refresh attempt. */
  bars: DailyBar[];
  /** Bars that were actually fetched from the live provider this run. */
  fetchedCount: number;
  /** Freshness of the merged history after the attempt. */
  freshness: CacheFreshness;
  error: string | null;
}

/**
 * Where a served data snapshot actually came from. `cache` means the result
 * was computed from persisted local bars; `live` means it was refreshed from
 * the configured provider first.
 */
export type ServedFrom = "cache" | "live";

export interface CacheLoadMeta {
  servedFrom: ServedFrom;
  /** Per-instrument freshness after the refresh attempt. */
  states: CachedInstrumentState[];
  /** True when at least one instrument was rendered from stale cache. */
  anyStale: boolean;
  /** Non-fatal refresh errors (live fetch failed but cache was usable). */
  refreshErrors: string[];
  refreshedAt: string;
}
