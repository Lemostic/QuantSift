import type { Recommendation } from "@/quant/types";
import {
  AlertDispatcher,
  SimulationSmsGateway,
  WebhookSmsGateway,
} from "./dispatcher";
import { buildScanAlerts } from "./policy";
import { LocalAlertRepository } from "./repository";
import type { AlertJob, AlertPolicy } from "./types";

export interface ProcessAlertsResult {
  created: number;
  sent: number;
  failed: number;
}
function validatePolicy(policy: AlertPolicy) {
  if (!/^1\d{10}$/.test(policy.recipient)) {
    throw new Error("请输入 11 位中国大陆手机号");
  }
  if (policy.gatewayMode === "webhook" && !policy.webhookUrl.startsWith("https://")) {
    throw new Error("Webhook 地址必须使用 https://");
  }
}

export async function processScanAlerts({
  scanId,
  recommendations,
  policy,
  repository,
  now = new Date(),
}: {
  scanId: string;
  recommendations: Recommendation[];
  policy: AlertPolicy;
  repository: LocalAlertRepository;
  now?: Date;
}): Promise<ProcessAlertsResult> {
  if (!policy.enabled) return { created: 0, sent: 0, failed: 0 };
  validatePolicy(policy);

  const candidates = buildScanAlerts(recommendations, {
    scanId,
    recipient: policy.recipient,
    minimumScore: policy.minimumScore,
    signals: policy.signals,
    quietHours: policy.quietHours,
    maxMessages: policy.maxMessages,
    now,
  });
  const gateway =
    policy.gatewayMode === "simulation"
      ? new SimulationSmsGateway()
      : new WebhookSmsGateway(policy.webhookUrl, policy.bearerToken);
  const dispatcher = new AlertDispatcher(gateway);
  const dispatched: AlertJob[] = [];

  for (const candidate of candidates) {
    if (await repository.hasJob(candidate.id)) continue;
    await repository.saveJob(candidate);
    const result = await dispatcher.dispatch(candidate);
    await repository.saveJob(result);
    dispatched.push(result);
  }

  return {
    created: dispatched.length,
    sent: dispatched.filter((job) => job.status === "sent").length,
    failed: dispatched.filter((job) => job.status === "failed").length,
  };
}
