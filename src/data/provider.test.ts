import { describe, expect, it } from "vitest";
import { recordedMarketDataProvider } from "./recorded-provider";

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
});
