import { describe, expect, it } from "vitest";
import { buildConsensus, parseAdviceReply } from "./consensus";
import type { ProviderOutcome } from "./types";

function ok(
  providerId: string,
  signal: ProviderOutcome["signal"],
  confidence: number,
): ProviderOutcome {
  return {
    providerId,
    label: providerId,
    model: "test",
    status: "ok",
    signal,
    confidence,
    summary: `${providerId} 结论`,
    durationMs: 10,
  };
}

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
