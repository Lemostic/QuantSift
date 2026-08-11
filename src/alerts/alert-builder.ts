import type { Recommendation, RecommendationSignal } from "@/quant/types";
import type { AlertCandidate, AlertPolicy } from "./types";

const SIGNAL_LABEL: Record<RecommendationSignal, string> = {
  buy_watch: "买入观察",
  hold: "继续观察",
  avoid: "暂不交易",
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("86") && digits.length === 13 ? digits.slice(2) : digits;
}

export function isValidMainlandMobile(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(normalizePhoneNumber(value));
}

export function maskPhoneNumber(value: string): string {
  const normalized = normalizePhoneNumber(value);
  if (normalized.length < 7) return normalized ? "••••" : "未设置";
  return `${normalized.slice(0, 3)} **** ${normalized.slice(-4)}`;
}

function shanghaiParts(now: Date): { date: string; time: string } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function scheduledFor(policy: AlertPolicy, now: Date): string {
  const quiet = policy.quietHours;
  if (
    !quiet.enabled ||
    !TIME_PATTERN.test(quiet.start) ||
    !TIME_PATTERN.test(quiet.end) ||
    quiet.start === quiet.end
  ) {
    return now.toISOString();
  }

  const parts = shanghaiParts(now);
  const crossesMidnight = quiet.start > quiet.end;
  const isQuiet = crossesMidnight
    ? parts.time >= quiet.start || parts.time < quiet.end
    : parts.time >= quiet.start && parts.time < quiet.end;
  if (!isQuiet) return now.toISOString();

  const endToday = new Date(`${parts.date}T${quiet.end}:00+08:00`);
  if (!crossesMidnight || parts.time < quiet.end) return endToday.toISOString();
  return new Date(endToday.getTime() + 86_400_000).toISOString();
}

function composeMessage(recommendation: Recommendation): string {
  const priceDigits = recommendation.price > 100 ? 2 : 3;
  return [
    `[QuantSift] ${recommendation.instrument.name}(${recommendation.instrument.symbol})`,
    `${SIGNAL_LABEL[recommendation.signal]} ${recommendation.score}分`,
    `参考价 ${recommendation.price.toFixed(priceDigits)}`,
    `日期 ${recommendation.asOfDate}`,
    recommendation.reasons[0],
    "仅供个人研究",
  ].join("；");
}

export function buildScanAlerts({
  recommendations,
  policy,
  now = new Date(),
}: {
  recommendations: Recommendation[];
  policy: AlertPolicy;
  now?: Date;
}): AlertCandidate[] {
  if (!policy.enabled) return [];

  return [...recommendations]
    .filter(
      (recommendation) =>
        policy.signals.includes(recommendation.signal) &&
        recommendation.score >= policy.minimumScore,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(10, policy.maxMessagesPerScan)))
    .map((recommendation) => ({
      instrumentId: recommendation.instrument.id,
      score: recommendation.score,
      signal: recommendation.signal,
      message: composeMessage(recommendation),
      marketDate: recommendation.asOfDate,
      provider: recommendation.provider,
      fetchedAt: recommendation.fetchedAt,
      scheduledFor: scheduledFor(policy, now),
    }));
}
