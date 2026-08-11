import type { AlertJob, SmsGatewayMode } from "./types";

export interface SmsGateway {
  readonly mode: SmsGatewayMode;
  send(job: AlertJob): Promise<void>;
}

export class SimulationSmsGateway implements SmsGateway {
  readonly mode = "simulation" as const;

  async send(): Promise<void> {
    await Promise.resolve();
  }
}

export class WebhookSmsGateway implements SmsGateway {
  readonly mode = "webhook" as const;

  constructor(
    private readonly url: string,
    private readonly bearerToken: string,
  ) {}

  async send(job: AlertJob): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.bearerToken
          ? { Authorization: `Bearer ${this.bearerToken}` }
          : {}),
      },
      body: JSON.stringify({
        to: job.recipient,
        message: job.message,
        idempotencyKey: job.id,
      }),
    });
    if (!response.ok) {
      throw new Error(`短信 Webhook 返回 HTTP ${response.status}`);
    }
  }
}

export class AlertDispatcher {
  constructor(
    private readonly gateway: SmsGateway,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async dispatch(job: AlertJob): Promise<AlertJob> {
    if (job.status !== "queued") return job;
    const attemptAt = this.now().toISOString();
    const attempts = job.attempts + 1;
    try {
      await this.gateway.send(job);
      return {
        ...job,
        status: "sent",
        attempts,
        lastAttemptAt: attemptAt,
        nextAttemptAt: null,
        sentAt: attemptAt,
        error: null,
      };
    } catch (cause) {
      return {
        ...job,
        status: "failed",
        attempts,
        lastAttemptAt: attemptAt,
        nextAttemptAt: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }
}
