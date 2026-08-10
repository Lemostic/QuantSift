import type { ScanSchedule } from "./scheduler";
import type { ScanHistoryStore } from "./scan-service";
import type { ScanRun } from "./types";

export interface ScanStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ScanDocument {
  version: 1;
  schedule: ScanSchedule;
  lastScheduledWindowId: string | null;
  runs: ScanRun[];
}

const STORAGE_KEY = "quantsift.scans.v1";

export const DEFAULT_SCAN_SCHEDULE: ScanSchedule = {
  enabled: false,
  time: "15:30",
  timezone: "Asia/Shanghai",
  weekdaysOnly: true,
};

export class LocalScanRepository implements ScanHistoryStore {
  constructor(
    private readonly storage: ScanStorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  async getSchedule(): Promise<ScanSchedule> {
    return this.read().schedule;
  }

  async setSchedule(schedule: ScanSchedule): Promise<void> {
    this.write({ ...this.read(), schedule });
  }

  async listRuns(): Promise<ScanRun[]> {
    return this.read().runs;
  }

  async saveRun(run: ScanRun): Promise<void> {
    const document = this.read();
    const existingIndex = document.runs.findIndex((item) => item.id === run.id);
    if (existingIndex === -1) document.runs.unshift(run);
    else document.runs[existingIndex] = run;
    document.runs = document.runs.slice(0, 50);
    this.write(document);
  }

  async getLastScheduledWindowId(): Promise<string | null> {
    return this.read().lastScheduledWindowId;
  }

  async claimScheduledWindow(windowId: string): Promise<void> {
    this.write({ ...this.read(), lastScheduledWindowId: windowId });
  }

  private read(): ScanDocument {
    const raw = this.storage.getItem(this.key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<ScanDocument>;
        if (
          parsed.version === 1 &&
          parsed.schedule &&
          Array.isArray(parsed.runs)
        ) {
          return {
            version: 1,
            schedule: parsed.schedule,
            lastScheduledWindowId: parsed.lastScheduledWindowId ?? null,
            runs: parsed.runs,
          };
        }
      } catch {
        // A later write repairs an invalid local document.
      }
    }
    return {
      version: 1,
      schedule: DEFAULT_SCAN_SCHEDULE,
      lastScheduledWindowId: null,
      runs: [],
    };
  }

  private write(document: ScanDocument) {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}

