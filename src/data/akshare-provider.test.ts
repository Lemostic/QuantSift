import { describe, expect, it, vi } from "vitest";
import {
  createAkShareMarketDataProvider,
  type InvokeFn,
} from "./akshare-provider";
import {
  ProviderRegistry,
  configuredProvider,
  loadWithFallback,
} from "./provider-registry";
import type { MarketDataProvider } from "./market-data-provider";
import { recordedMarketDataProvider } from "./recorded-provider";
import { useAppStore } from "@/store/app-store";

/**
 * The AKShare provider talks to Tauri via `invoke`. These tests inject a fake
 * bridge so the provider contract is verified without a Rust process or a
 * live network.
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
  provider: "akshare",
  fetchedAt: "2026-08-11T22:00:00+08:00",
} as const;

function fakeProvider(handler: InvokeFn) {
  return createAkShareMarketDataProvider(handler);
}

describe("akshareMarketDataProvider", () => {
  it("normalizes listInstruments from the sidecar", async () => {
    const provider = fakeProvider(async (cmd) => {
      expect(cmd).toBe("sidecar_list_instruments");
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

  it("normalizes getDailyBars from the sidecar", async () => {
    const provider = fakeProvider(async (cmd, args) => {
      expect(cmd).toBe("sidecar_get_daily_bars");
      expect(args).toEqual({ instrumentId: "CN:600519", limit: 30 });
      return [stockBar];
    });

    const bars = await provider.getDailyBars("CN:600519", 30);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({
      instrumentId: "CN:600519",
      tradeDate: "2026-08-11",
      adjustment: "forward",
      provider: "akshare",
    });
  });

  it("classifies sidecar failures as AkShareSidecarError", async () => {
    const { AkShareSidecarError } = await import("./akshare-provider");
    const provider = fakeProvider(async () => {
      throw new Error("网络错误: Max retries exceeded");
    });

    await expect(provider.listInstruments()).rejects.toBeInstanceOf(
      AkShareSidecarError,
    );
  });
});

describe("ProviderRegistry", () => {
  it("defaults to the AKShare and recorded providers", () => {
    const reg = new ProviderRegistry();
    expect(reg.provider("akshare").id).toBe("akshare");
    expect(reg.provider("recorded").id).toBe("recorded-fixture");
  });

  it("accepts injected providers", () => {
    const stub: MarketDataProvider = {
      id: "stub",
      listInstruments: () => Promise.resolve([]),
      getDailyBars: () => Promise.resolve([]),
    };
    const reg = new ProviderRegistry({ akshare: stub });
    expect(reg.provider("akshare").id).toBe("stub");
  });

  it("returns only the provider selected in settings", () => {
    const previousSource = useAppStore.getState().marketDataSource;
    const persistWarning = vi.spyOn(console, "error").mockImplementation(() => {});
    const persistLog = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      useAppStore.getState().setMarketDataSource("recorded");
      expect(configuredProvider().id).toBe("recorded-fixture");

      useAppStore.getState().setMarketDataSource("akshare");
      expect(configuredProvider().id).toBe("akshare");
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

  it("falls back to recorded when akshare is unavailable", async () => {
    const broken: MarketDataProvider = {
      id: "akshare",
      listInstruments: () => Promise.reject(new Error("网络错误: Max retries")),
      getDailyBars: () => Promise.reject(new Error("网络错误: Max retries")),
    };
    const reg = new ProviderRegistry({ akshare: broken });

    const result = await loadWithFallback(["CN:600519"], "akshare", true, reg);
    expect(result.source).toBe("recorded");
    expect(result.fellBack).toBe(true);
    expect(result.error).toMatch(/网络/);
    expect(result.recommendations.length).toBeGreaterThan(0);

  });

  it("does not silently use fixtures when fallback is disabled", async () => {
    const broken: MarketDataProvider = {
      id: "akshare",
      listInstruments: () => Promise.reject(new Error("live provider unavailable")),
      getDailyBars: () => Promise.reject(new Error("live provider unavailable")),
    };
    const reg = new ProviderRegistry({ akshare: broken });

    const result = await loadWithFallback(
      ["CN:600519"],
      "akshare",
      false,
      reg,
    );

    expect(result.source).toBe("akshare");
    expect(result.fellBack).toBe(false);
    expect(result.recommendations).toEqual([]);
    expect(result.error).toMatch(/live provider unavailable/);
  });

  it("returns an error when both sources fail", async () => {
    const broken: MarketDataProvider = {
      id: "akshare",
      listInstruments: () => Promise.reject(new Error("网络错误")),
      getDailyBars: () => Promise.reject(new Error("网络错误")),
    };
    const alsoBroken: MarketDataProvider = {
      id: "recorded-fixture",
      listInstruments: () => Promise.reject(new Error("fixture 损坏")),
      getDailyBars: () => Promise.reject(new Error("fixture 损坏")),
    };
    const reg = new ProviderRegistry({ akshare: broken, recorded: alsoBroken });

    const result = await loadWithFallback(["CN:600519"], "akshare", true, reg);
    expect(result.recommendations).toHaveLength(0);
    expect(result.fellBack).toBe(true);
    expect(result.error).toMatch(/fixture 损坏/);

  });

  it("keeps recorded provider usable directly", async () => {
    const instruments = await recordedMarketDataProvider.listInstruments();
    expect(instruments.length).toBeGreaterThanOrEqual(4);
  });
});
