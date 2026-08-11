import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "./recorded-provider";
import { buildRecommendation } from "@/quant/recommendation";

describe("MarketDataProvider contract", () => {
  it("returns normalized, traceable daily bars for every instrument", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    const bars = await recordedMarketDataProvider.getDailyBars(
      instruments[0].id,
      30,
    );

    expect(instruments.length).toBeGreaterThanOrEqual(4);
    expect(bars).toHaveLength(30);
    expect(bars[0]).toMatchObject({
      instrumentId: instruments[0].id,
      adjustment: "forward",
      provider: "recorded-fixture",
    });
    expect(bars.at(-1)!.tradeDate > bars[0].tradeDate).toBe(true);
    expect(
      bars.every((bar) => ![0, 6].includes(new Date(bar.tradeDate).getUTCDay())),
    ).toBe(true);
  });

  it("includes fund 012734 with an auditable buy-watch analysis", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    const fund = instruments.find((instrument) => instrument.symbol === "012734");

    expect(fund).toMatchObject({
      name: "易方达人工智能ETF联接C",
      kind: "fund",
      exchange: "OTC",
    });

    const bars = await recordedMarketDataProvider.getDailyBars(fund!.id, 30);
    const recommendation = buildRecommendation(fund!, bars);

    expect(recommendation.signal).toBe("buy_watch");
    expect(recommendation.reasons).toContain("短期均线位于长期均线上方");
    expect(recommendation.provider).toBe("recorded-fixture");
  });
});
