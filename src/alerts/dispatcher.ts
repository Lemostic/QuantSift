import type { AlertCandidate, AlertJob } from "./types";
import type { SmsGateway } from "./gateways";
import type { AlertOutboxStore } from "./repository";

export class AlertDispatcher {
  constructor(
    private readonly store: AlertOutboxStore,
    private readonly gateway: SmsGateway,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = () => crypto.randomUUID(),
  ) {}

  async enqueueForScan(
    scanId: string,
    recipient: string,
    candidates: AlertCandidate[],
  ): Promise<AlertJob[]> {
    const created: AlertJob[] = [];
    for (const candidate of candidates) {
      const dedupeKey = `${scanId}:${candidate.instrumentId}:${candidate.signal}`;
      if (await this.store.findByDedupeKey(dedupeKey)) continue;

      const job: AlertJob = {
        ...candidate,
        id: this.createId(),
        dedupeKey,
        scanId,
        recipient,
        status: "queued",
        createdAt: this.now().toISOString(),
        sentAt: null,
        attemptCount: 0,
        lastError: null,
        providerMessageId: null,
      };
      await this.store.saveJob(job);
      created.push(job);
    }
    return created;
  }

  async dispatchDue(): Promise<AlertJob[]> {
    const now = this.now();
    const due = (await this.store.listJobs()).filter(
      (job) => job.status === "queued" && Date.parse(job.scheduledFor) <= now.getTime(),
    );
    const completed: AlertJob[] = [];

    for (const job of due) {
      const sending: AlertJob = {
        ...job,
        status: "sending",
        attemptCount: job.attemptCount + 1,
        lastError: null,
      };
      await this.store.saveJob(sending);
      try {
        const result = await this.gateway.send({
          recipient: job.recipient,
          message: job.message,
          idempotencyKey: job.dedupeKey,
        });
        const sent: AlertJob = {
          ...sending,
          status: "sent",
          sentAt: this.now().toISOString(),
          providerMessageId: result.messageId,
        };
        await this.store.saveJob(sent);
        completed.push(sent);
      } catch (cause) {
        const failed: AlertJob = {
          ...sending,
          status: "failed",
          lastError: cause instanceof Error ? cause.message : String(cause),
        };
        await this.store.saveJob(failed);
        completed.push(failed);
      }
    }

    return completed;
  }

  async retry(jobId: string): Promise<AlertJob> {
    const job = await this.store.getJob(jobId);
    if (!job) throw new Error(`未找到提醒任务 ${jobId}`);
    if (job.status !== "failed") return job;

    const queued: AlertJob = {
      ...job,
      status: "queued",
      scheduledFor: this.now().toISOString(),
      lastError: null,
    };
    await this.store.saveJob(queued);
    await this.dispatchDue();
    return (await this.store.getJob(jobId))!;
  }
}
