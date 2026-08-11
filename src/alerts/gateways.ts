export interface SmsSendRequest {
  recipient: string;
  message: string;
  idempotencyKey: string;
}

export interface SmsSendResult {
  messageId: string;
}

export interface SmsGateway {
  readonly id: string;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}

export class SimulationSmsGateway implements SmsGateway {
  readonly id = "simulation";

  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  async send(): Promise<SmsSendResult> {
    return { messageId: `sim-${this.createId()}` };
  }
}

export class WebhookSmsGateway implements SmsGateway {
  readonly id = "https-webhook";

  constructor(
    private readonly config: {
      endpoint: string;
      secret: string;
      enabled: boolean;
    },
    private readonly request: typeof fetch = fetch,
  ) {}

  async send(payload: SmsSendRequest): Promise<SmsSendResult> {
    if (!this.config.enabled) throw new Error("HTTPS Webhook 尚未明确启用");

    const endpoint = new URL(this.config.endpoint);
    if (endpoint.protocol !== "https:") throw new Error("Webhook 地址必须使用 HTTPS");

    const response = await this.request(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.secret
          ? { Authorization: `Bearer ${this.config.secret}` }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Webhook 返回 HTTP ${response.status}`);

    const body = (await response.json().catch(() => ({}))) as { messageId?: unknown };
    return {
      messageId:
        typeof body.messageId === "string"
          ? body.messageId
          : `webhook-${payload.idempotencyKey}`,
    };
  }
}
