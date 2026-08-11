import { describe, expect, it } from "vitest";
import { buildScanAlerts, maskPhoneNumber } from "./alert-builder";
import { AlertDispatcher } from "./dispatcher";
import type { SmsGateway, SmsSendRequest } from "./gateways";
import type { AlertOutboxStore } from "./repository";
import { DEFAULT_ALERT_SETTINGS, type AlertJob } from "./types";
import type { Recommendation } from "@/quant/types";

function recommendation(
  symbol: string,
  score: number,
  signal: Recommendation["signal"] = "buy_watch",
): Recommendation {
  return {
    instrument: {
      id: `CN:${symbol}`,
      symbol,
      name: `标的 ${symbol}`,
      kind: "stock",
      exchange: "SSE",
      currency: "CNY",
    },
    signal,
    score,
    asOfDate: "2026-08-11",
    price: 12.345,
    dailyChangePct: 1.2,
    reasons: ["短期均线位于长期均线上方"],
    risks: ["历史信号不代表未来收益"],
    factors: [],
    provider: "fixture",
    fetchedAt: "2026-08-11T15:30:00+08:00",
  };
}

class MemoryOutbox implements AlertOutboxStore {
  jobs: AlertJob[] = [];

  async listJobs() {
    return this.jobs;
  }
  async getJob(jobId: string) {
    return this.jobs.find((job) => job.id === jobId) ?? null;
  }
  async findByDedupeKey(dedupeKey: string) {
    return this.jobs.find((job) => job.dedupeKey === dedupeKey) ?? null;
  }
  async saveJob(job: AlertJob) {
    const index = this.jobs.findIndex((item) => item.id === job.id);
    if (index === -1) this.jobs.unshift(job);
    else this.jobs[index] = job;
  }
}

class RecordingGateway implements SmsGateway {
  readonly id = "recording";
  requests: SmsSendRequest[] = [];

  async send(request: SmsSendRequest) {
    this.requests.push(request);
    return { messageId: `message-${this.requests.length}` };
  }
}

describe("buildScanAlerts", () => {
  it("filters, ranks, limits, and defers messages during quiet hours", () => {
    const policy = {
      ...DEFAULT_ALERT_SETTINGS.policy,
      enabled: true,
      minimumScore: 80,
      maxMessagesPerScan: 2,
    };

    const alerts = buildScanAlerts({
      recommendations: [
        recommendation("600001", 81),
        recommendation("600002", 95),
        recommendation("600003", 79),
        recommendation("600004", 90, "hold"),
        recommendation("600005", 88),
      ],
      policy,
      now: new Date("2026-08-11T23:10:00+08:00"),
    });

    expect(alerts.map((alert) => alert.instrumentId)).toEqual([
      "CN:600002",
      "CN:600005",
    ]);
    expect(alerts[0].scheduledFor).toBe("2026-08-12T00:00:00.000Z");
    expect(alerts[0].message).toContain("仅供个人研究");
    expect(maskPhoneNumber("+86 13812345678")).toBe("138 **** 5678");
  });
});

describe("AlertDispatcher", () => {
  it("enqueues a scan once and records a successful send", async () => {
    const outbox = new MemoryOutbox();
    const gateway = new RecordingGateway();
    const now = () => new Date("2026-08-11T16:00:00+08:00");
    const dispatcher = new AlertDispatcher(outbox, gateway, now, () => "job-1");
    const candidates = buildScanAlerts({
      recommendations: [recommendation("600001", 90)],
      policy: {
        ...DEFAULT_ALERT_SETTINGS.policy,
        enabled: true,
        quietHours: { enabled: false, start: "22:00", end: "08:00" },
      },
      now: now(),
    });

    await dispatcher.enqueueForScan("scan-1", "13812345678", candidates);
    await dispatcher.enqueueForScan("scan-1", "13812345678", candidates);
    const result = await dispatcher.dispatchDue();

    expect(outbox.jobs).toHaveLength(1);
    expect(gateway.requests).toHaveLength(1);
    expect(result[0]).toMatchObject({
      status: "sent",
      attemptCount: 1,
      providerMessageId: "message-1",
    });
  });
});
