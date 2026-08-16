import { describe, expect, it } from "vitest";
import type { Recommendation } from "@/quant/types";
import type { SignalIntelligence } from "@/intelligence/signal-intelligence";
import {
  buildCompositeReport,
  buildConsensus,
  parseAdviceReply,
} from "./consensus";
import type { ProviderOutcome } from "./types";

function ok(
  providerId: string,
  signal: ProviderOutcome["signal"],
  confidence: number,
  summary = `${providerId} 结论`,
): ProviderOutcome {
  return {
    providerId,
    label: providerId,
    model: "test",
    status: "ok",
    signal,
    confidence,
    summary,
    durationMs: 10,
  };
}

const recommendation: Recommendation = {
  instrument: {
    id: "CN:600519",
    symbol: "600519",
    name: "贵州茅台",
    kind: "stock",
    exchange: "SSE",
    currency: "CNY",
  },
  signal: "buy_watch",
  score: 82,
  asOfDate: "2026-08-19",
  price: 1450,
  dailyChangePct: 1.2,
  reasons: ["短期均线位于长期均线上方"],
  risks: ["近期波动较高，建议缩小单笔仓位"],
  factors: [],
  provider: "eastmoney",
  fetchedAt: "2026-08-19T15:30:00+08:00",
};

const intelligence: SignalIntelligence = {
  asOfDate: "2026-08-19",
  confidence: 70,
  confidenceLevel: "medium",
  factorConsensus: 72,
  signalStability: 80,
  dataCompleteness: 100,
  regime: "trend_up",
  regimeLabel: "上行趋势",
  priority: "high",
  actionTitle: "进入人工买入复核",
  actionSummary: "信号方向与滚动稳定度较一致",
  support: 1400,
  resistance: 1520,
  downsideRoomPct: -3.4,
  upsideRoomPct: 4.8,
  nextChecks: [],
  uncertainties: [],
};

describe("parseAdviceReply", () => {
  it("parses signal and confidence from a Chinese reply", () => {
    const parsed = parseAdviceReply(
      "信号: 买入\n置信度: 72\n结论摘要：趋势与动量共振。",
    );
    expect(parsed.signal).toBe("buy");
    expect(parsed.confidence).toBe(72);
  });

  it("parses English BUY/SELL tokens", () => {
    expect(parseAdviceReply("信号: SELL\n置信度: 88").signal).toBe("sell");
    expect(parseAdviceReply("信号: HOLD").signal).toBe("hold");
  });

  it("falls back to watch when no signal line exists", () => {
    const parsed = parseAdviceReply("没有信号行，只有一段文字。");
    expect(parsed.signal).toBe("watch");
    expect(parsed.confidence).toBe(50);
  });
});

describe("buildConsensus", () => {
  it("picks the majority signal", () => {
    const advice = buildConsensus([
      ok("a", "buy", 70),
      ok("b", "buy", 65),
      ok("c", "sell", 80),
    ]);
    expect(advice.signal).toBe("buy");
    expect(advice.confidence).toBe(Math.round((70 + 65 + 80) / 3));
  });

  it("breaks ties by average confidence", () => {
    const advice = buildConsensus([
      ok("a", "buy", 90),
      ok("b", "buy", 85),
      ok("c", "sell", 60),
      ok("d", "sell", 55),
    ]);
    expect(advice.signal).toBe("buy");
  });

  it("ignores failed providers for the vote", () => {
    const advice = buildConsensus([
      ok("a", "hold", 50),
      { ...ok("b", "sell", 80), status: "error", error: "超时" },
    ]);
    expect(advice.signal).toBe("hold");
  });

  it("falls back to watch when every provider fails", () => {
    const advice = buildConsensus([
      { ...ok("a", "buy", 70), status: "error", error: "x" },
    ]);
    expect(advice.signal).toBe("watch");
    expect(advice.confidence).toBe(0);
  });
});

describe("buildCompositeReport", () => {
  it("produces a clear buy verdict with rationale, distribution and action", () => {
    const report = buildCompositeReport({
      outcomes: [
        ok("a", "buy", 78, "趋势与动量共振，站上 20 日均线。"),
        ok("b", "buy", 70, "资金面改善，看好后续修复。"),
        ok("c", "hold", 55, "估值不便宜，等待回踩。"),
      ],
      recommendation,
      intelligence,
    });
    expect(report.signal).toBe("buy");
    expect(report.verdict).toContain("关注买入");
    expect(report.verdict).toContain("68"); // 平均置信度 (78+70+55)/3
    expect(report.signalDistribution).toEqual({
      buy: 2,
      sell: 0,
      hold: 1,
      watch: 0,
    });
    expect(report.rationale[0]).toContain("多数模型");
    expect(report.rationale.some((line) => line.includes("趋势与动量共振"))).toBe(true);
    expect(report.disagreement).toContain("分歧");
    expect(report.action).toContain("1400"); // 支撑位
    expect(report.action).toContain("支撑位");
    expect(report.risks.length).toBeGreaterThan(0);
  });

  it("gives a sell verdict with a take-profit action on consensus sell", () => {
    const report = buildCompositeReport({
      outcomes: [
        ok("a", "sell", 80, "跌破关键支撑，动量转弱。"),
        ok("b", "sell", 75, "放量破位，建议减仓。"),
      ],
      recommendation,
      intelligence,
    });
    expect(report.signal).toBe("sell");
    expect(report.verdict).toContain("卖出");
    expect(report.disagreement).toContain("一致");
    expect(report.action).toContain("1520"); // 压力位
  });

  it("reports a unanimous watch when every provider watches", () => {
    const report = buildCompositeReport({
      outcomes: [ok("a", "watch", 40), ok("b", "watch", 45)],
      recommendation,
      intelligence,
    });
    expect(report.signal).toBe("watch");
    expect(report.verdict).toContain("观望");
    expect(report.signalDistribution.watch).toBe(2);
  });

  it("extracts reasons and risks from provider replies", () => {
    const parsed = parseAdviceReply(
      "信号: BUY\n置信度: 70\n核心依据：\n- 趋势向上，均线多头\n- 资金面流入\n风险提示：\n- 注意高位回调风险\n- 警惕大盘系统性下跌",
    );
    expect(parsed.signal).toBe("buy");
    expect(parsed.summary).not.toContain("信号:");
    expect(parsed.reasons).toHaveLength(2);
    expect(parsed.risks).toHaveLength(2);
    expect(parsed.risks[0]).toContain("回调");
  });
});
