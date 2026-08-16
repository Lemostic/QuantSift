import { describe, expect, it } from "vitest";
import {
  computeCacheFreshness,
  isFresh,
  latestExpectedTradeDate,
} from "./freshness";
import type { CachedInstrumentState } from "./types";

function state(partial: Partial<CachedInstrumentState>): CachedInstrumentState {
  return {
    instrumentId: "CN:TEST",
    lastTradeDate: "2026-01-05",
    lastFetchedAt: "2026-01-05T09:00:00.000Z",
    barCount: 60,
    source: "akshare",
    ...partial,
  };
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("latestExpectedTradeDate", () => {
  it("returns the same weekday for a weekday", () => {
    expect(latestExpectedTradeDate(utcDate("2026-01-05"))).toBe("2026-01-05");
  });

  it("moves a Saturday back to Friday", () => {
    expect(latestExpectedTradeDate(utcDate("2026-01-10"))).toBe("2026-01-09");
  });

  it("moves a Sunday back to Friday", () => {
    expect(latestExpectedTradeDate(utcDate("2026-01-11"))).toBe("2026-01-09");
  });

  it("keeps a Monday as a trading day", () => {
    expect(latestExpectedTradeDate(utcDate("2026-01-12"))).toBe("2026-01-12");
  });
});

describe("computeCacheFreshness", () => {
  it("reports missing when no state exists", () => {
    const freshness = computeCacheFreshness(null, utcDate("2026-01-06"), 2);
    expect(freshness).toMatchObject({
      status: "missing",
      daysOld: null,
      lastTradeDate: null,
      expectedTradeDate: "2026-01-06",
    });
  });

  it("reports fresh when the history matches the expected trade date", () => {
    const freshness = computeCacheFreshness(
      state({ lastTradeDate: "2026-01-05" }),
      utcDate("2026-01-05"),
      2,
    );
    expect(freshness.status).toBe("fresh");
    expect(freshness.daysOld).toBe(0);
  });

  it("reports fresh within the stale window including weekends", () => {
    // Friday data checked on Monday is one trading day old (weekend gap).
    const freshness = computeCacheFreshness(
      state({ lastTradeDate: "2026-01-09" }),
      utcDate("2026-01-12"),
      2,
    );
    expect(freshness.status).toBe("fresh");
    expect(freshness.daysOld).toBe(1);
  });

  it("reports stale beyond the window with the trading-day lag", () => {
    // Thursday data checked on the following Tuesday is 3 trading days old.
    const freshness = computeCacheFreshness(
      state({ lastTradeDate: "2026-01-01" }),
      utcDate("2026-01-06"),
      2,
    );
    expect(freshness.status).toBe("stale");
    expect(freshness.daysOld).toBe(3);
  });

  it("treats an empty history (no last trade date) as missing", () => {
    const freshness = computeCacheFreshness(
      state({ lastTradeDate: null, barCount: 0 }),
      utcDate("2026-01-06"),
      2,
    );
    expect(freshness.status).toBe("missing");
  });
});

describe("isFresh", () => {
  it("is true for a fresh state and false for a stale one", () => {
    const now = utcDate("2026-01-06");
    expect(isFresh(state({ lastTradeDate: "2026-01-05" }), now, 2)).toBe(true);
    expect(isFresh(state({ lastTradeDate: "2026-01-01" }), now, 2)).toBe(false);
    expect(isFresh(null, now, 2)).toBe(false);
  });
});
