import type { Recommendation, RecommendationSignal } from "@/quant/types";
import type { AlertJob, QuietHours } from "./types";

interface BuildScanAlertsOptions {
  scanId: string;
  recipient?: string;
  minimumScore: number;
  signals: RecommendationSignal[];
  quietHours: QuietHours;
  maxMessages: number;
  now: Date;
}

function minutesOfDay(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function shanghaiMinutes(now: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function isQuietTime(now: Date, quietHours: QuietHours): boolean {
  const current = shanghaiMinutes(now);
  const start = minutesOfDay(quietHours.start);
  const end = minutesOfDay(quietHours.end);
  if (start === end) return false;
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

const signalLabel: Record<RecommendationSignal, string> = {
  buy_watch: "买入观察",
  hold: "继续观察",
  avoid: "暂不交易",
};

export function buildScanAlerts(
  recommendations: Recommendation[],
  options: BuildScanAlertsOptions,
): AlertJob[] {
  if (isQuietTime(options.now, options.quietHours)) return [];

  return recommendations
    .filter(
      (item) =>
        item.score >= options.minimumScore && options.signals.includes(item.signal),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, options.maxMessages))
    .map((item) => ({
      id: `${options.scanId}:${item.instrument.id}`,
      scanId: options.scanId,
      instrumentId: item.instrument.id,
      recipient: options.recipient ?? "",
      message: `QuantSift ${item.instrument.name}(${item.instrument.symbol}) ${signalLabel[item.signal]}，评分 ${item.score}，收盘 ${item.price}。数据 ${item.asOfDate}，请自行核验。`,
      status: "queued" as const,
      attempts: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      createdAt: options.now.toISOString(),
      sentAt: null,
      error: null,
    }));
}
