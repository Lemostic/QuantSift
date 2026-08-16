import { describe, expect, it } from "vitest";
import type { DailyBar } from "@/quant/types";
import {
  InMemoryBarCacheStore,
  LocalStorageBarCacheStore,
} from "./store";
import type { BarCacheStore } from "./types";

function bar(date: string, close: number, provider = "akshare"): DailyBar {
  return {
    instrumentId: "CN:TEST",
    tradeDate: date,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
    adjustment: "none",
    provider,
    fetchedAt: `2026-01-${date.slice(8)}T00:00:00.000Z`,
  };
}

function memoryStore(): BarCacheStore {
  return new InMemoryBarCacheStore({ maxBarsPerInstrument: 500 });
}

function localStorageStore(): { store: BarCacheStore; storage: Record<string, string> } {
  const storage: Record<string, string> = {};
  const adapter = {
    getItem: (key: string) => (key in storage ? storage[key] : null),
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
  };
  return {
    store: new LocalStorageBarCacheStore(adapter, { maxBarsPerInstrument: 500 }),
    storage,
  };
}

for (const [name, create] of [
  ["InMemoryBarCacheStore", memoryStore],
  ["LocalStorageBarCacheStore", () => localStorageStore().store],
] as const) {
  describe(name, () => {
    it("round-trips bars and derives instrument state", async () => {
      const store = create();
      await store.putBars("CN:TEST", [bar("2026-01-02", 2), bar("2026-01-01", 1)]);

      const bars = await store.getBars("CN:TEST");
      expect(bars.map((b) => b.tradeDate)).toEqual(["2026-01-01", "2026-01-02"]);

      const state = await store.getState("CN:TEST");
      expect(state).toMatchObject({
        instrumentId: "CN:TEST",
        lastTradeDate: "2026-01-02",
        barCount: 2,
        source: "akshare",
      });
    });

    it("merges subsequent puts instead of replacing history", async () => {
      const store = create();
      await store.putBars("CN:TEST", [bar("2026-01-01", 1), bar("2026-01-02", 2)]);
      await store.putBars("CN:TEST", [bar("2026-01-03", 3)]);
      const bars = await store.getBars("CN:TEST");
      expect(bars.map((b) => b.tradeDate)).toEqual([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
      ]);
    });

    it("overwrites a trade date with the newest bar", async () => {
      const store = create();
      await store.putBars("CN:TEST", [bar("2026-01-02", 2, "recorded")]);
      await store.putBars("CN:TEST", [bar("2026-01-02", 20, "akshare")]);
      const bars = await store.getBars("CN:TEST");
      expect(bars).toHaveLength(1);
      expect(bars[0].close).toBe(20);
      expect(bars[0].provider).toBe("akshare");
    });

    it("caps history at the configured max bars", async () => {
      const store = new InMemoryBarCacheStore({ maxBarsPerInstrument: 3 });
      await store.putBars(
        "CN:TEST",
        ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"].map((d) =>
          bar(d, Number(d.slice(9))),
        ),
      );
      const bars = await store.getBars("CN:TEST");
      expect(bars.map((b) => b.tradeDate)).toEqual([
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
      ]);
      expect((await store.getState("CN:TEST"))?.barCount).toBe(3);
    });

    it("removes one instrument without touching others", async () => {
      const store = create();
      await store.putBars("CN:A", [bar("2026-01-01", 1)]);
      await store.putBars("CN:B", [bar("2026-01-01", 2)]);
      await store.removeInstrument("CN:A");
      expect(await store.getBars("CN:A")).toEqual([]);
      expect(await store.getState("CN:A")).toBeNull();
      expect(await store.getBars("CN:B")).toHaveLength(1);
    });

    it("lists states newest-last-fetched first and clears everything", async () => {
      const store = create();
      await store.putBars("CN:A", [bar("2026-01-01", 1)]);
      await store.putBars("CN:B", [bar("2026-01-03", 3)]);
      const states = await store.listStates();
      expect(states.map((s) => s.instrumentId)).toEqual(["CN:B", "CN:A"]);
      await store.clear();
      expect(await store.listStates()).toEqual([]);
      expect(await store.getBars("CN:A")).toEqual([]);
    });

    it("keeps unknown instruments empty", async () => {
      const store = create();
      expect(await store.getBars("CN:UNKNOWN")).toEqual([]);
      expect(await store.getState("CN:UNKNOWN")).toBeNull();
    });
  });
}

describe("LocalStorageBarCacheStore", () => {
  it("repairs a corrupted document to an empty cache", async () => {
    const { store, storage } = localStorageStore();
    storage["quantsift.bar-cache.v1"] = "{not-json";
    expect(await store.getBars("CN:TEST")).toEqual([]);
    await store.putBars("CN:TEST", [bar("2026-01-01", 1)]);
    expect(await store.getBars("CN:TEST")).toHaveLength(1);
  });

  it("drops invalid entries from an unknown schema version", async () => {
    const { store, storage } = localStorageStore();
    storage["quantsift.bar-cache.v1"] = JSON.stringify({
      version: 99,
      instruments: { "CN:TEST": [bar("2026-01-01", 1)] },
    });
    expect(await store.getBars("CN:TEST")).toEqual([]);
    expect(await store.getState("CN:TEST")).toBeNull();
  });

  it("ignores structurally invalid bars inside a document", async () => {
    const { store, storage } = localStorageStore();
    storage["quantsift.bar-cache.v1"] = JSON.stringify({
      version: 1,
      instruments: {
        "CN:TEST": [
          { tradeDate: "2026-01-01", close: "broken" },
          bar("2026-01-02", 2),
        ],
      },
      states: {},
    });
    const bars = await store.getBars("CN:TEST");
    expect(bars.map((b) => b.tradeDate)).toEqual(["2026-01-02"]);
  });

  it("persists across store instances sharing the same storage", async () => {
    const { store, storage } = localStorageStore();
    await store.putBars("CN:TEST", [bar("2026-01-01", 1)]);
    const reloaded = new LocalStorageBarCacheStore(
      {
        getItem: (key) => (key in storage ? storage[key] : null),
        setItem: (key, value) => {
          storage[key] = value;
        },
      },
      { maxBarsPerInstrument: 500 },
    );
    expect(await reloaded.getBars("CN:TEST")).toHaveLength(1);
    expect((await reloaded.getState("CN:TEST"))?.lastTradeDate).toBe("2026-01-01");
  });
});
