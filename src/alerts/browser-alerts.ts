import type { Recommendation } from "@/quant/types";
import type { ScanRun } from "@/scans/types";
import { buildScanAlerts, isValidMainlandMobile } from "./alert-builder";
import { AlertDispatcher } from "./dispatcher";
import { SimulationSmsGateway, WebhookSmsGateway, type SmsGateway } from "./gateways";
import { LocalAlertRepository } from "./repository";
import type { AlertSettings } from "./types";

export const ALERTS_CHANGED_EVENT = "quantsift:alerts-changed";

let browserRepository: LocalAlertRepository | null = null;

export function getAlertRepository(): LocalAlertRepository {
  if (browserRepository === null) {
    browserRepository = new LocalAlertRepository(window.localStorage);
  }
  return browserRepository;
}

export function announceAlertChange() {
  window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
}

function gatewayFor(settings: AlertSettings): SmsGateway {
  return settings.gateway.mode === "webhook"
    ? new WebhookSmsGateway({
        endpoint: settings.gateway.endpoint,
        secret: settings.gateway.secret,
        enabled: settings.gateway.webhookEnabled,
      })
    : new SimulationSmsGateway();
}

function canDispatch(settings: AlertSettings): boolean {
  return (
    settings.gateway.mode === "simulation" || settings.gateway.webhookEnabled
  );
}

export async function processCompletedScanAlerts(
  run: ScanRun,
  recommendations: Recommendation[],
): Promise<void> {
  const repository = getAlertRepository();
  const settings = await repository.getSettings();
  if (!settings.policy.enabled || !isValidMainlandMobile(settings.phoneNumber)) return;

  const dispatcher = new AlertDispatcher(repository, gatewayFor(settings));
  const candidates = buildScanAlerts({
    recommendations,
    policy: settings.policy,
  });
  await dispatcher.enqueueForScan(run.id, settings.phoneNumber, candidates);
  if (canDispatch(settings)) await dispatcher.dispatchDue();
  announceAlertChange();
}

export async function dispatchQueuedAlerts(): Promise<void> {
  const repository = getAlertRepository();
  const settings = await repository.getSettings();
  if (!canDispatch(settings)) return;
  await new AlertDispatcher(repository, gatewayFor(settings)).dispatchDue();
  announceAlertChange();
}

export async function retryAlert(jobId: string): Promise<void> {
  const repository = getAlertRepository();
  const settings = await repository.getSettings();
  if (!canDispatch(settings)) throw new Error("当前短信通道尚未启用");
  await new AlertDispatcher(repository, gatewayFor(settings)).retry(jobId);
  announceAlertChange();
}

export async function sendTestAlert(settings: AlertSettings): Promise<void> {
  if (!isValidMainlandMobile(settings.phoneNumber)) {
    throw new Error("请输入有效的中国大陆手机号码");
  }
  if (!canDispatch(settings)) throw new Error("请先明确启用 HTTPS Webhook");

  const repository = getAlertRepository();
  await repository.setSettings(settings);
  const now = new Date();
  const dispatcher = new AlertDispatcher(repository, gatewayFor(settings));
  await dispatcher.enqueueForScan(
    `test-${now.getTime()}`,
    settings.phoneNumber,
    [
      {
        instrumentId: "SYSTEM:TEST",
        score: 0,
        signal: "hold",
        message: "[QuantSift] 测试提醒；短信通道配置有效；仅供个人研究",
        marketDate: now.toISOString().slice(0, 10),
        provider: "system-test",
        fetchedAt: now.toISOString(),
        scheduledFor: now.toISOString(),
      },
    ],
  );
  await dispatcher.dispatchDue();
  announceAlertChange();
}
