import { describe, expect, it } from "vitest";
import type { Recommendation } from "@/quant/types";
import { LocalPortfolioRepository } from "./repository";
import { buildPositionSnapshot, summarizePortfolio } from "./risk";
import type { PortfolioPosition } from "./types";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const position: PortfolioPosition = {
  instrumentId: "CN:012734",
  quantity: 10_000,
  averageCost: 1.8,
  openedAt: "2026-07-01",
  stopLossPct: 8,
  takeProfitPct: 12,
  note: "等待趋势确认",
  updatedAt: "2026-08-11T00:00:00.000Z",
};

function recommendation(
  price: number,
  signal: Recommendation["signal"] = "buy_watch",
): Recommendation {
  return {
    instrument: {
      id: "CN:012734",
      symbol: "012734",
      name: "易方达人工智能ETF联接C",
      kind: "fund",
      exchange: "OTC",
      currency: "CNY",
    },
    signal,
    score: signal === "avoid" ? 32 : 86,
    asOfDate: "2026-08-10",
    price,
    dailyChangePct: 1.2,
    reasons: [],
    risks: [],
    factors: [],
    provider: "fixture",
    fetchedAt: "2026-08-10T15:30:00+08:00",
  };
}

describe("LocalPortfolioRepository", () => {
  it("persists updates by instrument without duplicating a position", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalPortfolioRepository(
      storage,
      () => new Date("2026-08-11T09:00:00.000Z"),
    );
    await repository.upsert({ ...position, quantity: 8_000 });
    await repository.upsert({ ...position, quantity: 12_000 });

    const items = await repository.list();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(12_000);
    expect(items[0].updatedAt).toBe("2026-08-11T09:00:00.000Z");
  });

  it("rejects invalid cost and removes positions", async () => {
    const repository = new LocalPortfolioRepository(new MemoryStorage());
    await expect(
      repository.upsert({ ...position, averageCost: 0 }),
    ).rejects.toThrow("平均成本必须大于 0");
    await repository.upsert(position);
    await repository.remove(position.instrumentId);
    await expect(repository.list()).resolves.toEqual([]);
  });
});

describe("portfolio risk", () => {
  it("calculates profit and emits a take-profit review", () => {
    const snapshot = buildPositionSnapshot(position, recommendation(2.1));
    expect(snapshot.marketValue).toBe(21_000);
    expect(snapshot.unrealizedPnl).toBe(3_000);
    expect(snapshot.unrealizedPnlPct).toBeCloseTo(16.67, 2);
    expect(snapshot.riskSignal).toBe("take_profit_review");
  });

  it("prioritizes the loss boundary and summarizes review counts", () => {
    const losing = buildPositionSnapshot(position, recommendation(1.62));
    const trendExit = buildPositionSnapshot(
      { ...position, averageCost: 2.1 },
      recommendation(2.05, "avoid"),
    );
    expect(losing.riskSignal).toBe("stop_loss_review");
    expect(trendExit.riskSignal).toBe("trend_exit_review");

    const summary = summarizePortfolio([losing, trendExit]);
    expect(summary.reviewCount).toBe(2);
    expect(summary.marketValue).toBe(36_700);
  });
});
