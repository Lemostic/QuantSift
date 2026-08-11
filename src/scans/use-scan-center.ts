import { useCallback, useEffect, useState } from "react";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { LocalScanRepository, DEFAULT_SCAN_SCHEDULE } from "./repository";
import { getDueScan, type ScanSchedule } from "./scheduler";
import { runWatchlistScan } from "./scan-service";
import type { ScanRun, ScanTrigger } from "./types";
import { processCompletedScanAlerts } from "@/alerts/browser-alerts";

const SCANS_CHANGED_EVENT = "quantsift:scans-changed";
let browserRepository: LocalScanRepository | null = null;
let scanInFlight = false;

function getRepository() {
  if (browserRepository === null) {
    browserRepository = new LocalScanRepository(window.localStorage);
  }
  return browserRepository;
}

function announceChange() {
  window.dispatchEvent(new Event(SCANS_CHANGED_EVENT));
}

async function executeScan(
  instrumentIds: string[],
  trigger: ScanTrigger,
  scheduledWindowId: string | null = null,
) {
  if (scanInFlight) return null;
  scanInFlight = true;
  announceChange();
  try {
    return await runWatchlistScan({
      provider: recordedMarketDataProvider,
      instrumentIds,
      trigger,
      scheduledWindowId,
      store: getRepository(),
      onCompleted:
        trigger === "scheduled"
          ? (run, recommendations) =>
              processCompletedScanAlerts(run, recommendations)
          : undefined,
    });
  } finally {
    scanInFlight = false;
    announceChange();
  }
}

export function useScanCenter() {
  const [schedule, setScheduleState] = useState<ScanSchedule>(
    DEFAULT_SCAN_SCHEDULE,
  );
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(scanInFlight);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const repository = getRepository();
      setScheduleState(await repository.getSchedule());
      setRuns(await repository.listRuns());
      setRunning(scanInFlight);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handleChange = () => void reload();
    window.addEventListener(SCANS_CHANGED_EVENT, handleChange);
    return () => window.removeEventListener(SCANS_CHANGED_EVENT, handleChange);
  }, [reload]);

  const updateSchedule = useCallback(async (value: ScanSchedule) => {
    await getRepository().setSchedule(value);
    announceChange();
  }, []);

  const runNow = useCallback(async (instrumentIds: string[]) => {
    try {
      setError(null);
      return await executeScan(instrumentIds, "manual");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, []);

  return { schedule, runs, ready, running, error, updateSchedule, runNow, reload };
}

export function useAutomaticScan(instrumentIds: string[]) {
  const instrumentIdsKey = instrumentIds.join("|");

  useEffect(() => {
    let disposed = false;

    const tick = async () => {
      if (disposed || scanInFlight || instrumentIds.length === 0) return;
      const repository = getRepository();
      const schedule = await repository.getSchedule();
      const lastWindowId = await repository.getLastScheduledWindowId();
      const due = getDueScan(schedule, new Date(), lastWindowId);
      if (!due) return;

      await repository.claimScheduledWindow(due.windowId);
      announceChange();
      try {
        await executeScan(instrumentIds, "scheduled", due.windowId);
      } catch {
        // The failed run is persisted and surfaced by useScanCenter.
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 30_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [instrumentIdsKey]);
}

