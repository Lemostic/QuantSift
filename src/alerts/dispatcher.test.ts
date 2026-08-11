import { describe, expect, it } from "vitest";
import { AlertDispatcher, type SmsGateway } from "./dispatcher";
import type { AlertJob } from "./types";

const job: AlertJob = {
  id: "scan-1:CN:510300",
  scanId: "scan-1",
  instrumentId: "CN:510300",
  recipient: "13800138000",
  message: "QuantSift 沪深300ETF 买入观察，评分 93。",
  status: "queued",
  attempts: 0,
  lastAttemptAt: null,
  nextAttemptAt: null,
  createdAt: "2026-08-11T10:00:00+08:00",
  sentAt: null,
  error: null,
};

describe("AlertDispatcher", () => {
  it("sends a queued job once and ignores duplicate dispatches", async () => {
    const sent: AlertJob[] = [];
    const gateway: SmsGateway = {
      mode: "simulation",
      async send(next) {
        sent.push(next);
      },
    };
    const dispatcher = new AlertDispatcher(gateway);

    const first = await dispatcher.dispatch(job);
    const second = await dispatcher.dispatch(first);

    expect(sent).toHaveLength(1);
    expect(first.status).toBe("sent");
    expect(second).toEqual(first);
  });
});
