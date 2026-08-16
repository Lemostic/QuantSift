import { describe, expect, it } from "vitest";
import { mergeDailyBars } from "./merge";
import type { DailyBar } from "@/quant/types";

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
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("mergeDailyBars", () => {
  it("returns fetched bars when the cache is empty", () => {
    const fetched = [bar("2026-01-02", 2), bar("2026-01-01", 1)];
    const merged = mergeDailyBars([], fetched, 500);
    expect(merged.map((b) => b.tradeDate)).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("keeps cached bars outside the fetched window", () => {
    const cached = [bar("2026-01-01", 1), bar("2026-01-05", 5)];
    const fetched = [bar("2026-01-06", 6), bar("2026-01-05", 50)];
    const merged = mergeDailyBars(cached, fetched, 500);
    expect(merged.map((b) => b.tradeDate)).toEqual([
      "2026-01-01",
      "2026-01-05",
      "2026-01-06",
    ]);
  });

  it("prefers fetched bars for overlapping trade dates", () => {
    const cached = [bar("2026-01-03", 3, "recorded")];
    const fetched = [bar("2026-01-03", 30, "akshare")];
    const merged = mergeDailyBars(cached, fetched, 500);
    expect(merged).toHaveLength(1);
    expect(merged[0].close).toBe(30);
    expect(merged[0].provider).toBe("akshare");
  });

  it("sorts ascending and caps at maxBars keeping the newest bars", () => {
    const cached = [bar("2026-01-01", 1), bar("2026-01-04", 4)];
    const fetched = [bar("2026-01-03", 3), bar("2026-01-02", 2)];
    const merged = mergeDailyBars(cached, fetched, 3);
    expect(merged.map((b) => b.tradeDate)).toEqual([
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("returns an empty list for a zero cap", () => {
    expect(mergeDailyBars([bar("2026-01-01", 1)], [], 0)).toEqual([]);
  });

  it("does not mutate either input", () => {
    const cached = [bar("2026-01-01", 1)];
    const fetched = [bar("2026-01-02", 2)];
    const snapshotCached = [...cached];
    const snapshotFetched = [...fetched];
    mergeDailyBars(cached, fetched, 500);
    expect(cached).toEqual(snapshotCached);
    expect(fetched).toEqual(snapshotFetched);
  });
});
