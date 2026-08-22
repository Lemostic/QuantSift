import { describe, expect, it, vi } from "vitest";
import {
  createEastMoneyMarketDataProvider,
  EastMoneyError,
  type InvokeFn,
} from "./eastmoney-provider";
import {
  ProviderRegistry,
  configuredProvider,
  loadWithFallback,
} from "./provider-registry";
import type { MarketDataProvider } from "./market-data-provider";
import { recordedMarketDataProvider } from "./recorded-provider";
import { useAppStore } from "@/store/app-store";

/**
 * The EastMoney provider talks to Tauri via `invoke`. These tests inject a
 * fake bridge so the provider contract is verified without a Rust process
 * or a live network.
 */

const stockInstrument = {
  id: "CN:600519",
  symbol: "600519",
  name: "贵州茅台",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
} as const;

const stockBar = {
  instrumentId: "CN:600519",
  tradeDate: "2026-08-11",
  open: 1348,
  high: 1352.65,
  low: 1338,
  close: 1346.5,
  volume: 2707300,
  adjustment: "forward",
  provider: "eastmoney",
  fetchedAt: "2026-08-11T22:00:00+08:00",
} as const;

function fakeProvider(handler: InvokeFn) {
  return createEastMoneyMarketDataProvider(handler);
}

describe("eastMoneyMarketDataProvider", () => {
  it("normalizes listInstruments from the native commands", async () => {
    const provider = fakeProvider(async (cmd) => {
      expect(cmd).toBe("eastmoney_list_instruments");
      return [stockInstrument];
    });

    const instruments = await provider.listInstruments();
    expect(instruments).toHaveLength(1);
    expect(instruments[0]).toEqual({
      id: "CN:600519",
      symbol: "600519",
      name: "贵州茅台",
      kind: "stock",
      exchange: "SSE",
      currency: "CNY",
    });
  });

  it("normalizes getDailyBars from the native commands", async () => {
    const provider = fakeProvider(async (cmd, args) => {
      expect(cmd).toBe("eastmoney_get_daily_bars");
      expect(args).toEqual({ instrumentId: "CN:600519", limit: 30, source: "auto" });
      return [stockBar];
    });

    const bars = await provider.getDailyBars("CN:600519", 30);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      instrumentId: "CN:600519",
      tradeDate: "2026-08-11",
      adjustment: "forward",
      provider: "eastmoney",
    });
  });

  it("passes the pinned source to the native command", async () => {
    const pinned = createEastMoneyMarketDataProvider(async (_cmd, args) => {
      expect(args).toEqual({ instrumentId: "CN:600519", limit: 30, source: "sina" });
      return [stockBar];
    }, "sina");
    expect(pinned.id).toBe("sina");
    const bars = await pinned.getDailyBars("CN:600519", 30);
    expect(bars).toHaveLength(1);
  });

  it("maps every live source in the registry to the right source arg", async () => {
    const seen = new Map<string, string>();
    const handler: InvokeFn = async (_cmd, args) => {
      seen.set(String((args as { source?: string }).source), "ok");
      return [stockBar];
    };
    const reg = new ProviderRegistry({
      eastmoney: createEastMoneyMarketDataProvider(handler, "eastmoney"),
      sina: createEastMoneyMarketDataProvider(handler, "sina"),
      tencent: createEastMoneyMarketDataProvider(handler, "tencent"),
    });
    await reg.provider("eastmoney").getDailyBars("CN:600519", 30);
    await reg.provider("sina").getDailyBars("CN:600519", 30);
    await reg.provider("tencent").getDailyBars("CN:600519", 30);
    expect([...seen.keys()].sort()).toEqual(["eastmoney", "sina", "tencent"]);
  });

  it("classifies network failures as EastMoneyError", async () => {
    const provider = fakeProvider(async () => {
      throw new Error("网络错误: Max retries exceeded");
    });

    await expect(provider.listInstruments()).rejects.toBeInstanceOf(
      EastMoneyError,
    );
  });

  it("classifies non-network failures as market errors", async () => {
    const provider = fakeProvider(async () => {
      throw new Error("无行情数据");
    });

    await expect(provider.getDailyBars("CN:600519", 30)).rejects.toMatchObject({
      name: "EastMoneyError",
      code: "market_error",
    });
  });
});

describe("ProviderRegistry", () => {
  it("defaults to the live and recorded providers", () => {
    const reg = new ProviderRegistry();
    expect(reg.provider("auto").id).toBe("eastmoney");
    expect(reg.provider("eastmoney").id).toBe("eastmoney");
    expect(reg.provider("sina").id).toBe("sina");
    expect(reg.provider("tencent").id).toBe("tencent");
    expect(reg.provider("recorded").id).toBe("recorded-fixture");
  });

  it("accepts injected providers", () => {
    const stub: MarketDataProvider = {
      id: "stub",
      listInstruments: () => Promise.resolve([]),
      getDailyBars: () => Promise.resolve([]),
    };
    const reg = new ProviderRegistry({ eastmoney: stub });
    expect(reg.provider("eastmoney").id).toBe("stub");
  });

  it("returns only the provider selected in settings", () => {
    const previousSource = useAppStore.getState().marketDataSource;
    const persistWarning = vi.spyOn(console, "error").mockImplementation(() => {});
    const persistLog = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      useAppStore.getState().setMarketDataSource("recorded");
      expect(configuredProvider().id).toBe("recorded-fixture");

      useAppStore.getState().setMarketDataSource("eastmoney");
      expect(configuredProvider().id).toBe("eastmoney");
    } finally {
      useAppStore.getState().setMarketDataSource(previousSource);
      persistWarning.mockRestore();
      persistLog.mockRestore();
    }
  });
});

describe("loadWithFallback", () => {
  it("uses recorded source when preferred is recorded", async () => {
    const result = await loadWithFallback(["CN:600519"], "recorded");
    expect(result.source).toBe("recorded");
    expect(result.fellBack).toBe(false);
    expect(result.error).toBeNull();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("falls back to recorded when eastmoney is unavailable", async () => {
    const broken: MarketDataProvider = {
      id: "eastmoney",
      listInstruments: () => Promise.reject(new Error("网络错误: Max retries")),
      getDailyBars: () => Promise.reject(new Error("网络错误: Max retries")),
    };
    const reg = new ProviderRegistry({ eastmoney: broken });

    const result = await loadWithFallback(["CN:600519"], "eastmoney", true, reg);
    expect(result.source).toBe("recorded");
    expect(result.fellBack).toBe(true);
    expect(result.error).toMatch(/网络/);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("does not silently use fixtures when fallback is disabled", async () => {
    const broken: MarketDataProvider = {
      id: "eastmoney",
      listInstruments: () => Promise.reject(new Error("live provider unavailable")),
      getDailyBars: () => Promise.reject(new Error("live provider unavailable")),
    };
    const reg = new ProviderRegistry({ eastmoney: broken });

    const result = await loadWithFallback(
      ["CN:600519"],
      "eastmoney",
      false,
      reg,
    );

    expect(result.source).toBe("eastmoney");
    expect(result.fellBack).toBe(false);
    expect(result.recommendations).toEqual([]);
    expect(result.error).toMatch(/live provider unavailable/);
  });

  it("returns an error when both sources fail", async () => {
    const broken: MarketDataProvider = {
      id: "eastmoney",
      listInstruments: () => Promise.reject(new Error("网络错误")),
      getDailyBars: () => Promise.reject(new Error("网络错误")),
    };
    const alsoBroken: MarketDataProvider = {
      id: "recorded-fixture",
      listInstruments: () => Promise.reject(new Error("fixture 损坏")),
      getDailyBars: () => Promise.reject(new Error("fixture 损坏")),
    };
    const reg = new ProviderRegistry({ eastmoney: broken, recorded: alsoBroken });

    const result = await loadWithFallback(["CN:600519"], "eastmoney", true, reg);
    expect(result.recommendations).toHaveLength(0);
    expect(result.fellBack).toBe(true);
    expect(result.error).toMatch(/fixture 损坏/);
  });

  it("keeps live data when only some instruments fail", async () => {
    const bars = await recordedMarketDataProvider.getDailyBars("CN:600519", 30);
    const partial: MarketDataProvider = {
      id: "eastmoney",
      listInstruments: async () => [
        stockInstrument,
        { ...stockInstrument, id: "CN:999999", symbol: "999999" },
      ],
      getDailyBars: async (id) => {
        if (id === "CN:600519") return bars;
        throw new Error("网络错误: 该标的源不可达");
      },
    };
    const reg = new ProviderRegistry({ eastmoney: partial });

    const result = await loadWithFallback(
      ["CN:600519", "CN:999999"],
      "eastmoney",
      true,
      reg,
    );

    // 单个标失败不拖垮看板：保留实时数据，错误经 error 报告。
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0].instrument.id).toBe("CN:600519");
    expect(result.source).toBe("eastmoney");
    expect(result.fellBack).toBe(false);
    expect(result.error).toMatch(/CN:999999/);
  });

  it("loads through the pinned sina provider via the configured source", async () => {
    const bars = await recordedMarketDataProvider.getDailyBars("CN:600519", 30);
    const sinaProvider: MarketDataProvider = {
      id: "sina",
      listInstruments: async () => [stockInstrument],
      getDailyBars: async () => bars,
    };
    const reg = new ProviderRegistry({ sina: sinaProvider });

    const result = await loadWithFallback(["CN:600519"], "sina", true, reg);
    expect(result.source).toBe("sina");
    expect(result.fellBack).toBe(false);
    expect(result.recommendations).toHaveLength(1);
  });

  it("keeps recorded provider usable directly", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    expect(instruments.length).toBeGreaterThanOrEqual(4);
  });
});
