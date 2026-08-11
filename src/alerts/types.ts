import type { RecommendationSignal } from "@/quant/types";

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface AlertPolicy {
  enabled: boolean;
  minimumScore: number;
  signals: RecommendationSignal[];
  quietHours: QuietHours;
  maxMessagesPerScan: number;
}

export type SmsGatewayMode = "simulation" | "webhook";

export interface AlertSettings {
  phoneNumber: string;
  policy: AlertPolicy;
  gateway: {
    mode: SmsGatewayMode;
    webhookEnabled: boolean;
    endpoint: string;
    secret: string;
  };
}

export interface AlertCandidate {
  instrumentId: string;
  score: number;
  signal: RecommendationSignal;
  message: string;
  marketDate: string;
  provider: string;
  fetchedAt: string;
  scheduledFor: string;
}

export type AlertJobStatus = "queued" | "sending" | "sent" | "failed";

export interface AlertJob extends AlertCandidate {
  id: string;
  dedupeKey: string;
  scanId: string;
  recipient: string;
  status: AlertJobStatus;
  createdAt: string;
  sentAt: string | null;
  attemptCount: number;
  lastError: string | null;
  providerMessageId: string | null;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  phoneNumber: "",
  policy: {
    enabled: false,
    minimumScore: 75,
    signals: ["buy_watch"],
    quietHours: {
      enabled: true,
      start: "22:00",
      end: "08:00",
    },
    maxMessagesPerScan: 3,
  },
  gateway: {
    mode: "simulation",
    webhookEnabled: false,
    endpoint: "",
    secret: "",
  },
};
