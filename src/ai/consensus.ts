import type { AdviceSignal, AnalysisAdvice, ProviderOutcome } from "./types";

export interface ParsedProviderSignal {
  signal: AdviceSignal;
  confidence: number;
  summary: string;
}

const SIGNAL_PATTERN =
  /信号\s*[:：]\s*(BUY|SELL|HOLD|WATCH|买入|卖出|持有|观望)/i;
const CONFIDENCE_PATTERN = /置信度\s*[:：]\s*(\d{1,3})/i;

function normalizeSignal(raw: string): AdviceSignal {
  const upper = raw.toUpperCase();
  if (upper.includes("BUY") || upper.includes("买入")) return "buy";
  if (upper.includes("SELL") || upper.includes("卖出")) return "sell";
  if (upper.includes("HOLD") || upper.includes("持有")) return "hold";
  return "watch";
}

/** 从模型回复中解析结构化结论；解析失败回退为 watch 观望。 */
export function parseAdviceReply(content: string): ParsedProviderSignal {
  const signalMatch = content.match(SIGNAL_PATTERN);
  const confidenceMatch = content.match(CONFIDENCE_PATTERN);
  const confidence = confidenceMatch
    ? Math.max(0, Math.min(100, Number(confidenceMatch[1])))
    : 50;
  const summary = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .join("\n");
  return {
    signal: signalMatch ? normalizeSignal(signalMatch[1]) : "watch",
    confidence,
    summary: summary || content.slice(0, 200),
  };
}

function averageConfidence(outcomes: ProviderOutcome[]): number {
  const ok = outcomes.filter(
    (outcome) => outcome.status === "ok" && outcome.confidence !== undefined,
  );
  if (ok.length === 0) return 0;
  return Math.round(
    ok.reduce((total, outcome) => total + (outcome.confidence ?? 0), 0) /
      ok.length,
  );
}

/**
 * 多模型共识：取多数信号；平票时取平均置信度最高者；全部失败或平票且无
 * 置信度差异时回退 watch。置信度为平均置信度。
 */
export function buildConsensus(
  outcomes: ProviderOutcome[],
): AnalysisAdvice {
  const ok = outcomes.filter((outcome) => outcome.status === "ok");
  if (ok.length === 0) {
    return {
      signal: "watch",
      confidence: 0,
      summary: "所有模型均未返回有效结论，保持观望。",
    };
  }

  const votes = new Map<AdviceSignal, ProviderOutcome[]>();
  for (const outcome of ok) {
    const signal = outcome.signal ?? "watch";
    votes.set(signal, [...(votes.get(signal) ?? []), outcome]);
  }
  let best: AdviceSignal = "watch";
  let bestCount = 0;
  let bestConfidence = -1;
  for (const [signal, group] of votes) {
    const groupConfidence = averageConfidence(group);
    if (
      group.length > bestCount ||
      (group.length === bestCount && groupConfidence > bestConfidence)
    ) {
      best = signal;
      bestCount = group.length;
      bestConfidence = groupConfidence;
    }
  }

  const confidence = averageConfidence(ok);
  const summaries = ok
    .map((outcome) => outcome.summary)
    .filter((summary): summary is string => Boolean(summary));
  const summary =
    summaries.length > 0
      ? summaries.slice(0, 2).join("\n\n")
      : `${bestCount}/${ok.length} 个模型给出 ${best} 信号。`;

  return { signal: best, confidence, summary };
}
