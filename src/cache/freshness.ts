import type { CachedInstrumentState, CacheFreshness } from "./types";

/**
 * Most recent expected A-share trading day for a given wall-clock moment.
 * Weekends are excluded; exchange holidays are not modeled (documented
 * limitation — a holiday simply shows one extra stale day).
 */
export function latestExpectedTradeDate(now: Date): string {
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

function tradingDaysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  let count = 0;
  const cursor = new Date(from);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor.getTime() <= to.getTime()) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Computes how old a cached instrument history is relative to the latest
 * expected trading day. Lag is measured in trading days (weekends are
 * skipped, matching the scan scheduler's workday model), so Friday data
 * checked on Monday is one day old, not three.
 *
 * - No cached state: `missing`.
 * - History lags the expected trade date by more than `maxStaleDays`
 *   trading days: `stale` with the lag in days.
 * - Otherwise: `fresh`.
 */
export function computeCacheFreshness(
  state: CachedInstrumentState | null,
  now: Date,
  maxStaleDays: number,
): CacheFreshness {
  const expectedTradeDate = latestExpectedTradeDate(now);
  if (!state || !state.lastTradeDate) {
    return {
      status: "missing",
      daysOld: null,
      lastTradeDate: state?.lastTradeDate ?? null,
      expectedTradeDate,
    };
  }
  const daysOld = tradingDaysBetween(state.lastTradeDate, expectedTradeDate);
  return {
    status: daysOld > maxStaleDays ? "stale" : "fresh",
    daysOld,
    lastTradeDate: state.lastTradeDate,
    expectedTradeDate,
  };
}

export function isFresh(state: CachedInstrumentState | null, now: Date, maxStaleDays: number): boolean {
  return computeCacheFreshness(state, now, maxStaleDays).status === "fresh";
}
