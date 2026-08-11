import type { MarketDataProvider } from "@/data/market-data-provider";
import { loadRecommendations } from "@/data/recommendation-service";
import type { Recommendation } from "@/quant/types";
import type { ScanRun, ScanTrigger } from "./types";

export interface ScanHistoryStore {
  saveRun(run: ScanRun): Promise<void>;
}

export interface RunWatchlistScanRequest {
  provider: MarketDataProvider;
  instrumentIds: string[];
  trigger: ScanTrigger;
  scheduledWindowId?: string | null;
  store: ScanHistoryStore;
  now?: () => Date;
  createId?: () => string;
  onCompleted?: (
    run: ScanRun,
    recommendations: Recommendation[],
  ) => Promise<void>;
}

export async function runWatchlistScan({
  provider,
  instrumentIds,
  trigger,
  scheduledWindowId = null,
  store,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
  onCompleted,
}: RunWatchlistScanRequest): Promise<ScanRun> {
  const startedAt = now().toISOString();
  const running: ScanRun = {
    id: createId(),
    trigger,
    status: "running",
    startedAt,
    completedAt: null,
    scheduledWindowId,
    instrumentCount: instrumentIds.length,
    buyWatchCount: 0,
    holdCount: 0,
    avoidCount: 0,
    error: null,
  };
  await store.saveRun(running);

  try {
    const recommendations = await loadRecommendations(provider, instrumentIds);
    const completed: ScanRun = {
      ...running,
      status: "completed",
      completedAt: now().toISOString(),
      instrumentCount: recommendations.length,
      buyWatchCount: recommendations.filter((item) => item.signal === "buy_watch")
        .length,
      holdCount: recommendations.filter((item) => item.signal === "hold").length,
      avoidCount: recommendations.filter((item) => item.signal === "avoid").length,
    };
    await store.saveRun(completed);
    if (onCompleted) {
      try {
        await onCompleted(completed, recommendations);
      } catch {
        // Notification failures must not rewrite a successful market scan.
      }
    }
    return completed;
  } catch (cause) {
    const failed: ScanRun = {
      ...running,
      status: "failed",
      completedAt: now().toISOString(),
      error: cause instanceof Error ? cause.message : String(cause),
    };
    await store.saveRun(failed);
    throw cause;
  }
}

