import type { RecommendationSignal } from "@/quant/types";

export type AlertJobStatus = "queued" | "sent" | "failed";
export type SmsGatewayMode = "simulation" | "webhook";

export interface QuietHours {
  start: string;
  end: string;
}

export interface AlertPolicy {
  enabled: boolean;
  recipient: string;
  minimumScore: number;
  signals: RecommendationSignal[];
  quietHours: QuietHours;
  maxMessages: number;
  gatewayMode: SmsGatewayMode;
  webhookUrl: string;
  bearerToken: string;
}

export interface AlertJob {
  id: string;
  scanId: string;
  instrumentId: string;
  recipient: string;
  message: string;
  status: AlertJobStatus;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
}
