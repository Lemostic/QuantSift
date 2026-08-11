import { DEFAULT_ALERT_SETTINGS, type AlertJob, type AlertSettings } from "./types";

export interface AlertStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AlertOutboxStore {
  listJobs(): Promise<AlertJob[]>;
  getJob(jobId: string): Promise<AlertJob | null>;
  findByDedupeKey(dedupeKey: string): Promise<AlertJob | null>;
  saveJob(job: AlertJob): Promise<void>;
}

interface AlertDocument {
  version: 1;
  settings: AlertSettings;
  jobs: AlertJob[];
}

const STORAGE_KEY = "quantsift.alerts.v1";

function cloneDefaultSettings(): AlertSettings {
  return structuredClone(DEFAULT_ALERT_SETTINGS);
}

function normalizeSettings(value: AlertSettings): AlertSettings {
  return {
    phoneNumber: String(value.phoneNumber ?? "").trim(),
    policy: {
      enabled: Boolean(value.policy?.enabled),
      minimumScore: Math.max(0, Math.min(100, Number(value.policy?.minimumScore) || 0)),
      signals: Array.isArray(value.policy?.signals)
        ? value.policy.signals.filter((signal) =>
            ["buy_watch", "hold", "avoid"].includes(signal),
          )
        : ["buy_watch"],
      quietHours: {
        enabled: Boolean(value.policy?.quietHours?.enabled),
        start: value.policy?.quietHours?.start || "22:00",
        end: value.policy?.quietHours?.end || "08:00",
      },
      maxMessagesPerScan: Math.max(
        1,
        Math.min(10, Number(value.policy?.maxMessagesPerScan) || 1),
      ),
    },
    gateway: {
      mode: value.gateway?.mode === "webhook" ? "webhook" : "simulation",
      webhookEnabled: Boolean(value.gateway?.webhookEnabled),
      endpoint: String(value.gateway?.endpoint ?? "").trim(),
      secret: String(value.gateway?.secret ?? ""),
    },
  };
}

export class LocalAlertRepository implements AlertOutboxStore {
  constructor(
    private readonly storage: AlertStorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  async getSettings(): Promise<AlertSettings> {
    return this.read().settings;
  }

  async setSettings(settings: AlertSettings): Promise<void> {
    this.write({ ...this.read(), settings: normalizeSettings(settings) });
  }

  async listJobs(): Promise<AlertJob[]> {
    return this.read().jobs;
  }

  async getJob(jobId: string): Promise<AlertJob | null> {
    return this.read().jobs.find((job) => job.id === jobId) ?? null;
  }

  async findByDedupeKey(dedupeKey: string): Promise<AlertJob | null> {
    return this.read().jobs.find((job) => job.dedupeKey === dedupeKey) ?? null;
  }

  async saveJob(job: AlertJob): Promise<void> {
    const document = this.read();
    const index = document.jobs.findIndex((item) => item.id === job.id);
    if (index === -1) document.jobs.unshift(job);
    else document.jobs[index] = job;
    document.jobs = document.jobs.slice(0, 100);
    this.write(document);
  }

  private read(): AlertDocument {
    const raw = this.storage.getItem(this.key);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw) as Partial<AlertDocument>;
        if (parsed.version === 1 && parsed.settings && Array.isArray(parsed.jobs)) {
          return {
            version: 1,
            settings: normalizeSettings(parsed.settings),
            jobs: parsed.jobs,
          };
        }
      } catch {
        // The next successful write repairs invalid local data.
      }
    }
    return { version: 1, settings: cloneDefaultSettings(), jobs: [] };
  }

  private write(document: AlertDocument) {
    this.storage.setItem(this.key, JSON.stringify(document));
  }
}
