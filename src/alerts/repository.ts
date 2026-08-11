import type { AlertJob, AlertPolicy } from "./types";

export interface AlertStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface AlertDocument {
  version: 1;
  policy: AlertPolicy;
  outbox: AlertJob[];
}

const STORAGE_KEY = "quantsift.alerts.v1";

export const DEFAULT_ALERT_POLICY: AlertPolicy = {
  enabled: false,
  recipient: "",
  minimumScore: 80,
  signals: ["buy_watch"],
  quietHours: { start: "22:00", end: "07:00" },
  maxMessages: 3,
  gatewayMode: "simulation",
  webhookUrl: "",
  bearerToken: "",
};

export class LocalAlertRepository {
  constructor(
    private readonly storage: AlertStorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  async getPolicy(): Promise<AlertPolicy> {
    return this.read().policy;
  }

  async setPolicy(policy: AlertPolicy): Promise<void> {
    this.write({ ...this.read(), policy });
  }

  async listJobs(): Promise<AlertJob[]> {
    return this.read().outbox;
  }

  async hasJob(id: string): Promise<boolean> {
    return this.read().outbox.some((job) => job.id === id);
  }

  async saveJob(job: AlertJob): Promise<void> {
    const document = this.read();
    const index = document.outbox.findIndex((item) => item.id === job.id);
    if (index === -1) document.outbox.unshift(job);
    else document.outbox[index] = job;
    document.outbox = document.outbox.slice(0, 100);
    this.write(document);
  }

  private read(): AlertDocument {
    const raw = this.storage.getItem(this.key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<AlertDocument>;
        if (parsed.version === 1 && parsed.policy && Array.isArray(parsed.outbox)) {
          return {
            version: 1,
            policy: { ...DEFAULT_ALERT_POLICY, ...parsed.policy },
            outbox: parsed.outbox.map((job) => ({
              ...job,
              attempts: job.attempts ?? 0,
              lastAttemptAt: job.lastAttemptAt ?? null,
              nextAttemptAt: job.nextAttemptAt ?? null,
            })),
          };
        }
      } catch {
        // A later valid write repairs the document.
      }
    }
    return { version: 1, policy: DEFAULT_ALERT_POLICY, outbox: [] };
  }

  private write(document: AlertDocument) {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}
