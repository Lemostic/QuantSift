import type { DailyBar } from "@/quant/types";
import { mergeDailyBars } from "./merge";
import {
  DEFAULT_CACHE_CONFIG,
  type BarCacheStore,
  type CacheConfig,
  type CachedInstrumentState,
} from "./types";

function isDailyBar(value: unknown): value is DailyBar {
  if (!value || typeof value !== "object") return false;
  const bar = value as Partial<DailyBar>;
  return (
    typeof bar.instrumentId === "string" &&
    typeof bar.tradeDate === "string" &&
    typeof bar.open === "number" &&
    typeof bar.high === "number" &&
    typeof bar.low === "number" &&
    typeof bar.close === "number" &&
    typeof bar.volume === "number" &&
    typeof bar.adjustment === "string" &&
    typeof bar.provider === "string" &&
    typeof bar.fetchedAt === "string"
  );
}

function isCachedInstrumentState(value: unknown): value is CachedInstrumentState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<CachedInstrumentState>;
  return (
    typeof state.instrumentId === "string" &&
    (state.lastTradeDate === null || typeof state.lastTradeDate === "string") &&
    typeof state.lastFetchedAt === "string" &&
    typeof state.barCount === "number" &&
    typeof state.source === "string"
  );
}

/**
 * In-memory cache store. Used by tests and as a safe fallback when no
 * persistent adapter is available.
 */
export class InMemoryBarCacheStore implements BarCacheStore {
  private readonly barsByInstrument = new Map<string, DailyBar[]>();
  private readonly statesByInstrument = new Map<string, CachedInstrumentState>();
  private readonly config: CacheConfig;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  async getBars(instrumentId: string): Promise<DailyBar[]> {
    return [...(this.barsByInstrument.get(instrumentId) ?? [])];
  }

  async putBars(instrumentId: string, bars: DailyBar[]): Promise<void> {
    const merged = mergeDailyBars(
      this.barsByInstrument.get(instrumentId) ?? [],
      bars,
      this.config.maxBarsPerInstrument,
    );
    this.barsByInstrument.set(instrumentId, merged);
    const last = merged.at(-1) ?? null;
    this.statesByInstrument.set(instrumentId, {
      instrumentId,
      lastTradeDate: last?.tradeDate ?? null,
      lastFetchedAt: last?.fetchedAt ?? new Date().toISOString(),
      barCount: merged.length,
      source: last?.provider ?? "unknown",
    });
  }

  async getState(instrumentId: string): Promise<CachedInstrumentState | null> {
    return this.statesByInstrument.get(instrumentId) ?? null;
  }

  async removeInstrument(instrumentId: string): Promise<void> {
    this.barsByInstrument.delete(instrumentId);
    this.statesByInstrument.delete(instrumentId);
  }

  async listStates(): Promise<CachedInstrumentState[]> {
    return [...this.statesByInstrument.values()].sort((a, b) =>
      b.lastFetchedAt.localeCompare(a.lastFetchedAt),
    );
  }

  async clear(): Promise<void> {
    this.barsByInstrument.clear();
    this.statesByInstrument.clear();
  }
}

interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Versioned single-document cache persisted through a key/value storage
 * adapter (localStorage in the desktop webview). Corrupted or unknown
 * documents reset to an empty cache instead of throwing, matching the
 * watchlist repository's safe-migration behavior.
 */
export class LocalStorageBarCacheStore implements BarCacheStore {
  private readonly config: CacheConfig;

  constructor(
    private readonly storage: StorageAdapter,
    config: Partial<CacheConfig> = {},
    private readonly key = "quantsift.bar-cache.v1",
  ) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
  }

  async getBars(instrumentId: string): Promise<DailyBar[]> {
    return [...(this.read().instruments[instrumentId] ?? [])];
  }

  async putBars(instrumentId: string, bars: DailyBar[]): Promise<void> {
    const document = this.read();
    const merged = mergeDailyBars(
      document.instruments[instrumentId] ?? [],
      bars,
      this.config.maxBarsPerInstrument,
    );
    document.instruments[instrumentId] = merged;
    const last = merged.at(-1) ?? null;
    document.states[instrumentId] = {
      instrumentId,
      lastTradeDate: last?.tradeDate ?? null,
      lastFetchedAt: last?.fetchedAt ?? new Date().toISOString(),
      barCount: merged.length,
      source: last?.provider ?? "unknown",
    };
    this.write(document);
  }

  async getState(instrumentId: string): Promise<CachedInstrumentState | null> {
    return this.read().states[instrumentId] ?? null;
  }

  async removeInstrument(instrumentId: string): Promise<void> {
    const document = this.read();
    delete document.instruments[instrumentId];
    delete document.states[instrumentId];
    this.write(document);
  }

  async listStates(): Promise<CachedInstrumentState[]> {
    return Object.values(this.read().states).sort((a, b) =>
      b.lastFetchedAt.localeCompare(a.lastFetchedAt),
    );
  }

  async clear(): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify({ version: 1, instruments: {}, states: {} }));
  }

  private read(): CacheDocument {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return emptyDocument();
    try {
      const parsed = JSON.parse(raw) as Partial<CacheDocument>;
      if (parsed.version === 1 && parsed.instruments && parsed.states) {
        const instruments: Record<string, DailyBar[]> = {};
        for (const [id, bars] of Object.entries(parsed.instruments)) {
          if (Array.isArray(bars)) {
            // A single structurally broken bar must not discard the whole
            // instrument history; drop only the invalid entries.
            const valid = bars.filter(isDailyBar).sort((a, b) =>
              a.tradeDate.localeCompare(b.tradeDate),
            );
            if (valid.length > 0) instruments[id] = valid;
          }
        }
        const states: Record<string, CachedInstrumentState> = {};
        for (const [id, state] of Object.entries(parsed.states)) {
          if (isCachedInstrumentState(state) && state.instrumentId === id) {
            states[id] = state;
          }
        }
        return { version: 1, instruments, states };
      }
    } catch {
      // Corrupted payload: fall through to a safe empty document; the next
      // putBars call repairs the cache.
    }
    return emptyDocument();
  }

  private write(document: CacheDocument): void {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

interface CacheDocument {
  version: 1;
  instruments: Record<string, DailyBar[]>;
  states: Record<string, CachedInstrumentState>;
}

function emptyDocument(): CacheDocument {
  return { version: 1, instruments: {}, states: {} };
}
