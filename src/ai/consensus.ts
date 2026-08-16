import type { SignalIntelligence } from "@/intelligence/signal-intelligence";
import type { Recommendation } from "@/quant/types";
import type {
  AdviceSignal,
  AnalysisAdvice,
  CompositeReport,
  ProviderOutcome,
} from "./types";

export interface ParsedProviderSignal {
  signal: AdviceSignal;
  confidence: number;
  /** 干净摘要：剔除信号/置信度行后的正文前几行。 */
  summary: string;
  /** 依据行（以 - / • / 数字 开头的行，或含“依据/理由/因为”）。 */
  reasons: string[];
  /** 风险行（含“风险/注意/警惕/回撤/止损”）。 */
  risks: string[];
}

const SIGNAL_PATTERN =
  /信号\s*[:：]\s*(BUY|SELL|HOLD|WATCH|买入|卖出|持有|观望|加仓|减仓)/i;
const CONFIDENCE_PATTERN = /置信度\s*[:：]\s*(\d{1,3})/i;

function normalizeSignal(raw: string): AdviceSignal {
  const upper = raw.toUpperCase();
  if (upper.includes("BUY") || upper.includes("买入") || upper.includes("加仓")) return "buy";
  if (upper.includes("SELL") || upper.includes("卖出") || upper.includes("减仓")) return "sell";
  if (upper.includes("HOLD") || upper.includes("持有")) return "hold";
  return "watch";
}

/**
 * 从模型回复中解析结构化结论；解析失败回退为 watch 观望。
 * 返回的 summary 已剔除信号/置信度行，保证界面展示整洁。
 */
export function parseAdviceReply(content: string): ParsedProviderSignal {
  const signalMatch = content.match(SIGNAL_PATTERN);
  const confidenceMatch = content.match(CONFIDENCE_PATTERN);
  const confidence = confidenceMatch
    ? Math.max(0, Math.min(100, Number(confidenceMatch[1])))
    : 50;

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bodyLines = lines.filter(
    (line) => !SIGNAL_PATTERN.test(line) && !CONFIDENCE_PATTERN.test(line),
  );

  // 排除“核心依据：”“风险提示：”这类章节表头。
  const HEADER_PATTERN = /^(核心依据|风险提示|操作建议|结论|理由|依据|风险)[:：]?$/;
  const contentLines = bodyLines.filter((line) => !HEADER_PATTERN.test(line));

  const isRiskLine = (line: string) =>
    /风险|注意|警惕|回撤|止损|不及预期|谨慎/.test(line);

  const risks = contentLines.filter(isRiskLine);

  const reasons = contentLines.filter(
    (line) =>
      !isRiskLine(line) &&
      (/^[-•·*]|^\d+[.、]/.test(line) ||
        /依据|理由|因为|看好|看空|建议|支撑|压力|动能|估值/.test(line)),
  );

  return {
    signal: signalMatch ? normalizeSignal(signalMatch[1]) : "watch",
    confidence,
    summary: bodyLines.slice(0, 6).join("\n") || content.slice(0, 200),
    reasons: reasons.slice(0, 5),
    risks: risks.slice(0, 4),
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

export interface CompositeReportInput {
  outcomes: ProviderOutcome[];
  recommendation: Recommendation;
  intelligence: SignalIntelligence;
}

const SIGNAL_LABEL: Record<AdviceSignal, string> = {
  buy: "买入",
  sell: "卖出",
  hold: "持有",
  watch: "观望",
};

function verdictFor(signal: AdviceSignal, confidence: number): string {
  const strength = confidence >= 70 ? "较强" : confidence >= 55 ? "中等" : "较弱";
  switch (signal) {
    case "buy":
      return `当前多模型共识（置信度 ${confidence}%，${strength}）支持“关注买入”：适合分批建仓并预设止损，不追高。`;
    case "sell":
      return `当前多模型共识（置信度 ${confidence}%，${strength}）支持“考虑卖出/减仓”：宜在反弹中兑现风险敞口。`;
    case "hold":
      return `当前多模型共识（置信度 ${confidence}%，${strength}）为“继续持有”：暂不建议加减仓，跌破关键支撑再评估。`;
    case "watch":
      return `当前多模型共识（置信度 ${confidence}%，${strength}）为“观望”：信号方向未形成，等待明确后再决策。`;
  }
}

function actionFor(signal: AdviceSignal, intelligence: SignalIntelligence): string {
  const { support, resistance } = intelligence;
  switch (signal) {
    case "buy":
      return `关注回踩支撑位 ${support} 附近的分批机会；若有效跌破 ${support}，放弃并执行止损计划。`;
    case "sell":
      return `反弹至压力位 ${resistance} 附近可分批兑现；跌破支撑位 ${support} 应执行止损离场。`;
    case "hold":
      return `以持有为主；跌破支撑位 ${support} 后重新评估是否减仓。`;
    case "watch":
      return `等待价格突破压力位 ${resistance} 或回踩支撑位 ${support} 后再重新评估。`;
  }
}

/**
 * 组合分析报告：把多个模型的输出合并成一份明确结论（是否买入/卖出）、
 * 依据、分歧、风险与操作建议的结构化报告。
 */
export function buildCompositeReport(
  input: CompositeReportInput,
): CompositeReport {
  const ok = input.outcomes.filter((outcome) => outcome.status === "ok");
  const distribution: Record<AdviceSignal, number> = {
    buy: 0,
    sell: 0,
    hold: 0,
    watch: 0,
  };
  for (const outcome of ok) {
    distribution[outcome.signal ?? "watch"] += 1;
  }

  const consensus = buildConsensus(input.outcomes);
  const confidence = consensus.confidence;

  // 核心依据：各模型摘要首句 + 共识票数说明。
  const rationale: string[] = [`多数模型（${ok.length} 个有效结论）给出「${SIGNAL_LABEL[consensus.signal]}」信号。`];
  for (const outcome of ok.slice(0, 4)) {
    const firstLine = outcome.summary?.split("\n").find((line) => line.trim().length > 0);
    if (firstLine) {
      rationale.push(`${outcome.label}：${firstLine.slice(0, 80)}`);
    }
  }

  // 分歧说明。
  const votes = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .map(([signal, count]) => `${SIGNAL_LABEL[signal as AdviceSignal]} ${count} 票`)
    .join(" · ");
  const splitVotes = Object.values(distribution).filter((count) => count > 0).length > 1;
  const disagreement = splitVotes
    ? `模型存在分歧（${votes}）。共识置信度 ${confidence}%${
        confidence < 60 ? "，分歧较大，建议降低仓位或等待一致。" : "，可作参考但保留余量。"
      }`
    : `模型意见一致（${votes}），无显著分歧。`;

  // 风险提示：基础因子风险 + 模型提示合并去重。
  const riskSet = new Set<string>();
  for (const risk of input.recommendation.risks) riskSet.add(risk);
  for (const outcome of ok) {
    for (const risk of parseAdviceReply(outcome.summary ?? "").risks) {
      if (riskSet.size < 4) riskSet.add(risk);
    }
  }
  const risks = [...riskSet].slice(0, 4);
  if (risks.length === 0) risks.push("历史信号不代表未来收益，请结合自身风险承受能力决策。");

  return {
    signal: consensus.signal,
    confidence,
    verdict: verdictFor(consensus.signal, confidence),
    rationale: rationale.slice(0, 5),
    signalDistribution: distribution,
    disagreement,
    risks,
    action: actionFor(consensus.signal, input.intelligence),
  };
}
