import type { DailyBar } from "@/quant/types";

/**
 * Merges cached history with a freshly fetched tail. Rules:
 *
 * - Bars are keyed by `tradeDate`; a fetched bar replaces a cached bar for
 *   the same date (live data wins over the previously persisted copy).
 * - The merged list is sorted ascending by trade date and capped at
 *   `maxBars` keeping the most recent bars.
 * - Either input may be empty; the result is deterministic.
 */
export function mergeDailyBars(
  cached: DailyBar[],
  fetched: DailyBar[],
  maxBars: number,
): DailyBar[] {
  if (maxBars <= 0) return [];
  const byDate = new Map<string, DailyBar>();
  for (const bar of cached) byDate.set(bar.tradeDate, bar);
  for (const bar of fetched) byDate.set(bar.tradeDate, bar);
  return [...byDate.values()]
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
    .slice(-maxBars);
}
