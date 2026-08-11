import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "@/data/recorded-provider";
import { runWatchlistScan, type ScanHistoryStore } from "./scan-service";
import type { ScanRun } from "./types";

class MemoryScanStore implements ScanHistoryStore {
  runs: ScanRun[] = [];

  async saveRun(run: ScanRun) {
    const index = this.runs.findIndex((candidate) => candidate.id === run.id);
    if (index === -1) this.runs.unshift(run);
    else this.runs[index] = run;
  }
}

describe("runWatchlistScan", () => {
  it("records a completed scan summary", async () => {
    const store = new MemoryScanStore();

    const run = await runWatchlistScan({
      provider: recordedMarketDataProvider,
      instrumentIds: ["CN:510300", "CN:000001"],
      trigger: "manual",
      store,
      now: () => new Date("2026-08-11T16:00:00+08:00"),
      createId: () => "scan-1",
    });

    expect(run).toMatchObject({
      id: "scan-1",
      status: "completed",
      instrumentCount: 2,
      buyWatchCount: 1,
      avoidCount: 1,
    });
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0].status).toBe("completed");
  });

  it("keeps a completed scan successful when a post-scan alert hook fails", async () => {
    const store = new MemoryScanStore();

    const run = await runWatchlistScan({
      provider: recordedMarketDataProvider,
      instrumentIds: ["CN:510300"],
      trigger: "scheduled",
      store,
      createId: () => "scan-alert-failure",
      onCompleted: async () => {
        throw new Error("短信网关不可用");
      },
    });

    expect(run.status).toBe("completed");
    expect(store.runs[0].status).toBe("completed");
  });
});

