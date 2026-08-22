import { describe, expect, it } from "vitest";
import {
  createInvokeMarketContextProvider,
  createOfflineMarketContextProvider,
} from "./market-context";

describe("offlineMarketContextProvider", () => {
  it("returns a deterministic market environment snapshot", async () => {
    const provider = createOfflineMarketContextProvider();
    const context = await provider.getMarketContext();
    expect(provider.id).toBe("offline");
    expect(context.summary.length).toBeGreaterThan(10);
    expect(context.globalRegime).toBe("mixed");
    expect(context.domesticRegime).toBe("neutral");
    expect(context.indices.length).toBeGreaterThanOrEqual(5);
    const global = context.indices.filter((index) => index.region === "global");
    const domestic = context.indices.filter((index) => index.region === "domestic");
    expect(global.length).toBeGreaterThan(0);
    expect(domestic.length).toBeGreaterThan(0);
    for (const index of context.indices) {
      expect(index.name.length).toBeGreaterThan(0);
      expect(index.provider.length).toBeGreaterThan(0);
      expect(index.close).toBeGreaterThan(0);
      expect(["上行", "震荡", "下行"]).toContain(index.regimeLabel);
    }
  });
});

describe("createInvokeMarketContextProvider", () => {
  it("maps the native payload and drops malformed snapshots", async () => {
    const invoke = async () => ({
      asOfDate: "2026-08-14",
      fetchedAt: "2026-08-14T15:30:00+08:00",
      globalRegime: "risk_on",
      domesticRegime: "strong",
      summary: "全球偏暖；A 股偏强。",
      indices: [
        {
          id: "sh000300",
          name: "沪深300",
          region: "domestic",
          provider: "eastmoney",
          asOfDate: "2026-08-14",
          close: 4000,
          changePct: 0.5,
          change20dPct: 2.0,
          change60dPct: 5.0,
          aboveMa20: true,
          aboveMa60: true,
          volatility20d: 0.9,
          regimeLabel: "上行",
        },
        { broken: true },
      ],
    });
    const provider = createInvokeMarketContextProvider(invoke);
    const context = await provider.getMarketContext();
    expect(context.indices).toHaveLength(1);
    expect(context.indices[0].id).toBe("sh000300");
    expect(context.globalRegime).toBe("risk_on");
  });

  it("throws on a malformed payload", async () => {
    const invoke = async () => ({ nope: true });
    const provider = createInvokeMarketContextProvider(invoke);
    await expect(provider.getMarketContext()).rejects.toThrow();
  });
});
