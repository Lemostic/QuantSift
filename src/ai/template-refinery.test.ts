import { describe, expect, it } from "vitest";
import type { AnalysisSession, TemplateParams } from "./types";
import {
  defaultTemplateState,
  evaluateTemplateFeedback,
  LocalTemplateRepository,
  refineTemplate,
  refineTemplateAfterScan,
  stateToTemplate,
} from "./template-refinery";

const NOW = () => new Date("2026-08-19T10:30:00+08:00");

function sessionFor(
  id: string,
  overrides: Partial<AnalysisSession> = {},
): AnalysisSession {
  return {
    id,
    instrumentId: "CN:600519",
    instrumentName: "贵州茅台",
    trigger: "manual",
    createdAt: "2026-08-19T10:30:00+08:00",
    asOfDate: "2026-08-19",
    seed: 1,
    factorTagIds: [],
    factorVariation: [],
    research: [],
    providers: [
      {
        providerId: "a",
        label: "模型A",
        model: "m",
        status: "ok",
        signal: "buy",
        signalExplicit: true,
        confidence: 72,
        summary: "趋势向上，均线多头排列，突破压力位后动能延续，成交量配合良好，中期结构健康，建议回踩支撑位分批关注并设置止损位，若跌破支撑则离场观望，等待趋势确认后再行介入。",
        durationMs: 100,
      },
      {
        providerId: "b",
        label: "模型B",
        model: "m",
        status: "ok",
        signal: "buy",
        signalExplicit: true,
        confidence: 68,
        summary: "基本面稳健，估值处于合理区间，机构持仓稳定，回踩支撑位后有望继续上行，属于可分批参与的优质标的，但需留意大盘系统性风险对估值的压制。",
        durationMs: 90,
      },
    ],
    advice: { signal: "buy", confidence: 70, summary: "看好" },
    report: {
      signal: "buy",
      confidence: 70,
      verdict: "买入",
      rationale: [],
      signalDistribution: { buy: 2, sell: 0, hold: 0, watch: 0 },
      disagreement: "",
      risks: ["跌破支撑位 1500 止损", "业绩不及预期"],
      action: "分批建仓",
    },
    messages: [],
    priceAtAnalysis: 1520,
    baseScore: 72,
    ...overrides,
  };
}

describe("evaluateTemplateFeedback", () => {
  it("scores a healthy session high", () => {
    const feedback = evaluateTemplateFeedback(sessionFor("s1"));
    expect(feedback.score).toBeGreaterThanOrEqual(80);
    expect(feedback.breakdown.format).toBe(100);
    expect(feedback.breakdown.risk).toBe(100);
    expect(feedback.breakdown.consensus).toBe(100);
    expect(feedback.sampleCount).toBe(2);
    // 摘要足够长，不会触发篇幅调整
    expect(feedback.averageSummaryLength).toBeGreaterThan(60);
  });

  it("penalizes missing explicit signal lines and thin risks", () => {
    const feedback = evaluateTemplateFeedback(
      sessionFor("s2", {
        providers: [
          {
            providerId: "a",
            label: "模型A",
            model: "m",
            status: "ok",
            signal: "watch",
            signalExplicit: false,
            confidence: 30,
            summary: "无明确信号，仅给出泛泛结论。",
            durationMs: 10,
          },
        ],
        report: null,
        baseScore: 60,
      }),
    );
    expect(feedback.breakdown.format).toBeLessThan(80);
    expect(feedback.breakdown.risk).toBe(20);
    // 0.35*75 + 0.25*55 + 0.2*20 + 0.2*70 = 58
    expect(feedback.score).toBeLessThan(60);
  });

  it("penalizes confidence far from the factor score", () => {
    const feedback = evaluateTemplateFeedback(
      sessionFor("s3", {
        providers: [
          {
            providerId: "a",
            label: "模型A",
            model: "m",
            status: "ok",
            signal: "buy",
            signalExplicit: true,
            confidence: 95,
            summary: "很强",
            durationMs: 10,
          },
        ],
        baseScore: 40,
      }),
    );
    // |95 - 40| * 1.5 = 82.5 → calibration ~17
    expect(feedback.breakdown.calibration).toBeLessThan(30);
  });
});

describe("refineTemplate", () => {
  it("bumps the version and records the changelog when format is poor", () => {
    const state = defaultTemplateState(NOW);
    const feedback = evaluateTemplateFeedback(
      sessionFor("s4", {
        providers: [
          {
            providerId: "a",
            label: "模型A",
            model: "m",
            status: "ok",
            signal: "watch",
            signalExplicit: false,
            confidence: 50,
            summary: "结论含糊，未按格式输出。",
            durationMs: 10,
          },
          {
            providerId: "b",
            label: "模型B",
            model: "m",
            status: "ok",
            signal: "watch",
            signalExplicit: false,
            confidence: 55,
            summary: "同样未按格式输出。",
            durationMs: 10,
          },
        ],
        report: null,
      }),
    );
    const next = refineTemplate(state, feedback, NOW);
    expect(next.version).toBe(state.version + 1);
    expect(next.params.strictness).toBeGreaterThan(state.params.strictness);
    expect(next.params.riskFocus).toBeGreaterThan(state.params.riskFocus);
    expect(next.changelog[0].version).toBe(next.version);
    expect(next.changelog[0].reason.length).toBeGreaterThan(0);
    expect(next.lastRefinedAt).not.toBeNull();
  });

  it("keeps the version when feedback is already good", () => {
    const state = {
      ...defaultTemplateState(NOW),
      // strictness at 60 sits below the "ease after stability" threshold,
      // so a healthy session triggers no adjustment at all.
      params: { ...defaultTemplateState(NOW).params, strictness: 60 },
    };
    const feedback = evaluateTemplateFeedback(sessionFor("s5"));
    const next = refineTemplate(state, feedback, NOW);
    expect(next.version).toBe(state.version);
    expect(next.params).toEqual(state.params);
  });

  it("eases strictness after long stability", () => {
    const state = {
      ...defaultTemplateState(NOW),
      params: { ...defaultTemplateState(NOW).params, strictness: 95 },
    };
    const feedback = evaluateTemplateFeedback(sessionFor("s6"));
    const next = refineTemplate(state, feedback, NOW);
    expect(next.version).toBe(state.version + 1);
    expect(next.params.strictness).toBe(90);
  });

  it("switches reasoning depth with verbosity", () => {
    const state = defaultTemplateState(NOW);
    const verbose = evaluateTemplateFeedback(
      sessionFor("s7", {
        providers: [
          {
            providerId: "a",
            label: "模型A",
            model: "m",
            status: "ok",
            signal: "buy",
            signalExplicit: true,
            confidence: 70,
            summary: "x".repeat(300),
            durationMs: 10,
          },
        ],
      }),
    );
    const next = refineTemplate(state, verbose, NOW);
    expect(next.params.verbosity).toBeLessThan(state.params.verbosity);
  });
});

describe("refineTemplateAfterScan", () => {
  it("refines at most the per-scan cap and records score history", () => {
    const state = defaultTemplateState(NOW);
    const badSession = () =>
      sessionFor("b", {
        providers: [
          {
            providerId: "a",
            label: "模型A",
            model: "m",
            status: "ok",
            signal: "watch",
            signalExplicit: false,
            confidence: 50,
            summary: "",
            durationMs: 10,
          },
        ],
        report: null,
      });
    const sessions = Array.from({ length: 10 }, (_, index) =>
      index % 2 === 0 ? badSession() : sessionFor("g" + index),
    );
    const { state: next, appliedRefinements } = refineTemplateAfterScan(state, sessions, NOW);
    expect(appliedRefinements).toBeGreaterThan(0);
    expect(appliedRefinements).toBeLessThanOrEqual(6);
    expect(next.version).toBeGreaterThan(state.version);
    expect(next.scores.length).toBeGreaterThan(0);
    expect(next.scores.every((entry) => entry.sessionId !== "unknown")).toBe(true);
  });
});

describe("LocalTemplateRepository", () => {
  function memoryAdapter() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
    };
  }

  it("returns the default state when empty and persists writes", () => {
    const repo = new LocalTemplateRepository(memoryAdapter());
    const initial = repo.read(NOW);
    expect(initial.version).toBe(1);
    expect(initial.params.strictness).toBe(75);

    const refined = refineTemplate(
      initial,
      evaluateTemplateFeedback(sessionFor("r1")),
      NOW,
    );
    repo.write(refined);
    const reread = repo.read(NOW);
    expect(reread.version).toBe(refined.version);
    expect(reread.params).toEqual(refined.params);
  });

  it("falls back to default on corrupt data and supports reset", () => {
    const adapter = memoryAdapter();
    adapter.setItem("quantsift.ai-template.v1", "{not json");
    const repo = new LocalTemplateRepository(adapter);
    expect(repo.read(NOW).version).toBe(1);
    repo.write({ ...repo.read(NOW), version: 9 });
    const reset = repo.reset(NOW);
    expect(reset.version).toBe(1);
  });
});

describe("stateToTemplate", () => {
  it("exposes a versioned template for the analysis engine", () => {
    const state = defaultTemplateState(NOW);
    const template = stateToTemplate(state);
    expect(template.version).toBe(1);
    const params: TemplateParams = template.params;
    expect(params.reasoningDepth).toBe("standard");
  });
});
