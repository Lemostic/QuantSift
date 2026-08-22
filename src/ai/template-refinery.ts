import type { AnalysisSession, AnalysisTemplate, TemplateParams } from "./types";
import { DEFAULT_TEMPLATE_PARAMS } from "./prompt";

/**
 * 提示词模板自迭代引擎：每次智能分析完成后，根据会话反馈给模板打分，
 * 再按启发式规则小幅调整可调参数（严格度、风险关注、校准权重、篇幅、
 * 推理深度），产生新的模板版本并记录变更日志。所有状态保存在本地
 * localStorage（LocalTemplateRepository），随时可重置回默认模板。
 */

export interface TemplateFeedbackBreakdown {
  format: number;
  calibration: number;
  risk: number;
  consensus: number;
}

export interface TemplateFeedback {
  /** 综合得分 0-100。 */
  score: number;
  breakdown: TemplateFeedbackBreakdown;
  sampleCount: number;
  /** 有效模型摘要的平均长度（字符），用于篇幅调整。 */
  averageSummaryLength: number;
}

export interface TemplateChange {
  version: number;
  appliedAt: string;
  reason: string;
  delta: Partial<TemplateParams>;
}

export interface TemplateScoreEntry {
  version: number;
  sessionId: string;
  score: number;
  breakdown: TemplateFeedbackBreakdown;
}

export interface TemplateState {
  version: number;
  params: TemplateParams;
  changelog: TemplateChange[];
  scores: TemplateScoreEntry[];
  lastRefinedAt: string | null;
}

const MAX_CHANGELOG = 20;
const MAX_SCORES = 100;
const MAX_REFINEMENTS_PER_SCAN = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** 依据会话评估模板反馈。 */
export function evaluateTemplateFeedback(
  session: AnalysisSession,
): TemplateFeedback {
  const ok = session.providers.filter(
    (outcome) => outcome.status === "ok" && Boolean(outcome.summary),
  );
  const sampleCount = ok.length;

  // 格式分：显式信号行缺失或摘要为空都会扣分。
  let format = 100;
  for (const outcome of ok) {
    if (!outcome.signalExplicit) format -= 25;
    if (!outcome.summary || outcome.summary.trim().length === 0) format -= 15;
  }
  format = clamp(Math.max(0, format), 0, 100);

  // 校准分：模型平均置信度与基础因子分的偏差越小越好。
  const confidences = ok
    .map((outcome) => outcome.confidence)
    .filter((value): value is number => typeof value === "number");
  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : 50;
  const calibration = clamp(100 - Math.abs(averageConfidence - session.baseScore) * 1.5, 0, 100);

  // 风险分：组合报告中的具体风险条数。
  const riskCount = session.report?.risks.filter((risk) => risk.trim().length > 4).length ?? 0;
  const risk = riskCount >= 2 ? 100 : riskCount === 1 ? 60 : 20;

  // 共识分：多数模型占比（单模型无法证明共识，给基准分）。
  const votes = new Map<string, number>();
  for (const outcome of ok) {
    const signal = outcome.signal ?? "watch";
    votes.set(signal, (votes.get(signal) ?? 0) + 1);
  }
  const maxVotes = Math.max(0, ...votes.values());
  const consensus =
    ok.length === 0 ? 0 : ok.length === 1 ? 70 : Math.round((maxVotes / ok.length) * 100);

  const score = clamp(
    0.35 * format + 0.25 * calibration + 0.2 * risk + 0.2 * consensus,
    0,
    100,
  );

  const averageSummaryLength =
    ok.length > 0
      ? Math.round(
          ok.reduce((sum, outcome) => sum + (outcome.summary?.length ?? 0), 0) /
            ok.length,
        )
      : 0;

  return {
    score,
    breakdown: { format, calibration, risk, consensus },
    sampleCount,
    averageSummaryLength,
  };
}

function adjustParams(
  params: TemplateParams,
  delta: Partial<TemplateParams>,
): TemplateParams {
  return {
    reasoningDepth: delta.reasoningDepth ?? params.reasoningDepth,
    strictness: clamp(delta.strictness ?? params.strictness, 10, 100),
    riskFocus: clamp(delta.riskFocus ?? params.riskFocus, 10, 100),
    calibrationWeight: clamp(delta.calibrationWeight ?? params.calibrationWeight, 10, 100),
    verbosity: clamp(delta.verbosity ?? params.verbosity, 10, 90),
  };
}

function depthForVerbosity(verbosity: number): TemplateParams["reasoningDepth"] {
  if (verbosity >= 70) return "detailed";
  if (verbosity <= 25) return "concise";
  return "standard";
}

/**
 * 根据反馈精炼模板：每个维度只在确实欠佳时调整，步长小、边界收敛，
 * 避免来回抖动；稳定表现会适度放松严格度。
 */
export function refineTemplate(
  current: TemplateState,
  feedback: TemplateFeedback,
  now: () => Date,
): TemplateState {
  const delta: Partial<TemplateParams> = {};
  const reasons: string[] = [];
  const params = current.params;

  if (feedback.breakdown.format < 70) {
    delta.strictness = clamp(params.strictness + 10, 10, 100);
    reasons.push("格式合规率低，提高输出格式严格度");
  } else if (feedback.breakdown.format >= 90 && params.strictness > 60) {
    delta.strictness = params.strictness - 5;
    reasons.push("格式长期稳定，适度放宽严格度");
  }

  if (feedback.breakdown.risk < 60) {
    delta.riskFocus = clamp(params.riskFocus + 10, 10, 100);
    reasons.push("风险提示不足，提高风险关注强度");
  }

  if (feedback.breakdown.calibration < 60) {
    delta.calibrationWeight = clamp(params.calibrationWeight + 10, 10, 100);
    reasons.push("置信度与因子分偏差大，提高校准权重");
  }

  if (feedback.averageSummaryLength < 60) {
    delta.verbosity = clamp(params.verbosity + 10, 10, 90);
    reasons.push("模型输出过短，适当放开篇幅");
  } else if (feedback.averageSummaryLength > 260) {
    delta.verbosity = clamp(params.verbosity - 10, 10, 90);
    reasons.push("模型输出冗长，收紧篇幅要求");
  }

  const targetDepth = depthForVerbosity(delta.verbosity ?? params.verbosity);
  if (targetDepth !== params.reasoningDepth) {
    delta.reasoningDepth = targetDepth;
    reasons.push("按篇幅水平切换推理深度");
  }

  if (Object.keys(delta).length === 0) {
    return current;
  }

  return {
    version: current.version + 1,
    params: adjustParams(params, delta),
    changelog: [
      {
        version: current.version + 1,
        appliedAt: now().toISOString(),
        reason: reasons.join("；"),
        delta,
      },
      ...current.changelog,
    ].slice(0, MAX_CHANGELOG),
    scores: current.scores,
    lastRefinedAt: now().toISOString(),
  };
}

/**
 * 一轮扫描后批量精炼：对每个会话评估反馈并推进模板（每轮扫描最多
 * 应用 MAX_REFINEMENTS_PER_SCAN 次版本升级，防止参数剧烈漂移）。
 */
export function refineTemplateAfterScan(
  state: TemplateState,
  sessions: AnalysisSession[],
  now: () => Date,
): { state: TemplateState; appliedRefinements: number } {
  let current = state;
  let applied = 0;
  for (const session of sessions) {
    const feedback = evaluateTemplateFeedback(session);
    // 记录分数（无论是否升级版本）。
    current = {
      ...current,
      scores: [
        ...current.scores,
        {
          version: current.version,
          sessionId: session.id,
          score: feedback.score,
          breakdown: feedback.breakdown,
        },
      ].slice(-MAX_SCORES),
    };
    const next = refineTemplate(current, feedback, now);
    if (next.version > current.version) {
      current = next;
      applied += 1;
      if (applied >= MAX_REFINEMENTS_PER_SCAN) break;
    }
  }
  return { state: current, appliedRefinements: applied };
}

export function defaultTemplateState(_now?: () => Date): TemplateState {
  return {
    version: 1,
    params: { ...DEFAULT_TEMPLATE_PARAMS },
    changelog: [],
    scores: [],
    lastRefinedAt: null,
  };
}

export const DEFAULT_PARAMS: TemplateParams = DEFAULT_TEMPLATE_PARAMS;

export function stateToTemplate(state: TemplateState): AnalysisTemplate {
  return { version: state.version, params: { ...state.params } };
}

// ---------------------------------------------------------------------------
// 本地持久化
// ---------------------------------------------------------------------------

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface TemplateDocument {
  version: 1;
  state: TemplateState;
}

const STORAGE_KEY = "quantsift.ai-template.v1";

function isTemplateState(value: unknown): value is TemplateState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TemplateState>;
  return (
    typeof state.version === "number" &&
    typeof state.params === "object" &&
    state.params !== null &&
    typeof (state.params as TemplateParams).strictness === "number"
  );
}

export class LocalTemplateRepository {
  constructor(
    private readonly storage: StorageAdapter,
    private readonly key = STORAGE_KEY,
  ) {}

  read(now: () => Date = () => new Date()): TemplateState {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return defaultTemplateState(now);
    try {
      const parsed = JSON.parse(raw) as Partial<TemplateDocument>;
      if (parsed.version === 1 && isTemplateState(parsed.state)) {
        return parsed.state;
      }
    } catch {
      // 损坏数据回退默认模板。
    }
    return defaultTemplateState(now);
  }

  write(state: TemplateState): void {
    const document: TemplateDocument = { version: 1, state };
    this.storage.setItem(this.key, JSON.stringify(document));
  }

  reset(now: () => Date = () => new Date()): TemplateState {
    const state = defaultTemplateState(now);
    this.write(state);
    return state;
  }
}
