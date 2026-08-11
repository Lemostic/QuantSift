export type ScanTrigger = "manual" | "scheduled";
export type ScanRunStatus = "running" | "completed" | "failed";

export interface ScanRun {
  id: string;
  trigger: ScanTrigger;
  status: ScanRunStatus;
  startedAt: string;
  completedAt: string | null;
  scheduledWindowId: string | null;
  instrumentCount: number;
  buyWatchCount: number;
  holdCount: number;
  avoidCount: number;
  error: string | null;
}

