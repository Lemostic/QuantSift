import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { IndexSnapshot, MarketContext } from "@/ai/types";

export interface MarketContextProvider {
  readonly id: string;
  getMarketContext(): Promise<MarketContext>;
}

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const defaultInvoke: InvokeFn = (cmd, args) =>
  tauriInvoke(cmd, args as never);

function isIndexSnapshot(value: unknown): value is IndexSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<IndexSnapshot>;
  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.name === "string" &&
    (snapshot.region === "domestic" || snapshot.region === "global") &&
    typeof snapshot.asOfDate === "string" &&
    typeof snapshot.close === "number"
  );
}

/**
 * 市场环境校准数据提供方（Tauri 桥接）：调用 Rust 侧 market_get_context，
 * 通过免费回退链并发拉取国内外指数并做确定性统计。
 * 单次分析扫描只拉取一次，全部标的共用同一份环境校准。
 */
export function createInvokeMarketContextProvider(
  invoke: InvokeFn = defaultInvoke,
): MarketContextProvider {
  return {
    id: "native",
    async getMarketContext(): Promise<MarketContext> {
      const value = await invoke("market_get_context", {});
      const context = value as MarketContext;
      if (
        !context ||
        typeof context.summary !== "string" ||
        !Array.isArray(context.indices)
      ) {
        throw new Error("市场环境数据格式异常");
      }
      context.indices = context.indices.filter(isIndexSnapshot);
      return context;
    },
  };
}

/**
 * 录制型市场环境提供方：固定快照，用于确定性测试与浏览器演示
 * （无 Tauri 桥时页面不报错）。
 */
export function createOfflineMarketContextProvider(): MarketContextProvider {
  return {
    id: "offline",
    async getMarketContext(): Promise<MarketContext> {
      return {
        asOfDate: "2026-08-14",
        fetchedAt: "2026-08-15T15:30:00+08:00",
        globalRegime: "mixed",
        domesticRegime: "neutral",
        summary:
          "全球风险偏好分化（2/4 指数 20 日上涨）；沪深300围绕 MA60 震荡，A 股方向未定；A 股 3/5 指数 20 日上涨。",
        indices: [
          {
            id: "sh000300",
            name: "沪深300",
            region: "domestic",
            provider: "eastmoney",
            asOfDate: "2026-08-14",
            close: 3986.5,
            changePct: 0.42,
            change20dPct: 1.85,
            change60dPct: 4.12,
            aboveMa20: true,
            aboveMa60: true,
            volatility20d: 0.86,
            regimeLabel: "上行",
          },
          {
            id: "sh000001",
            name: "上证指数",
            region: "domestic",
            provider: "eastmoney",
            asOfDate: "2026-08-14",
            close: 3388.2,
            changePct: 0.28,
            change20dPct: 1.2,
            change60dPct: 3.4,
            aboveMa20: true,
            aboveMa60: true,
            volatility20d: 0.72,
            regimeLabel: "上行",
          },
          {
            id: "hkHSI",
            name: "恒生指数",
            region: "global",
            provider: "tencent",
            asOfDate: "2026-08-14",
            close: 21890.4,
            changePct: -0.31,
            change20dPct: -1.1,
            change60dPct: 5.2,
            aboveMa20: false,
            aboveMa60: true,
            volatility20d: 1.12,
            regimeLabel: "震荡",
          },
          {
            id: "usSPX",
            name: "标普500",
            region: "global",
            provider: "eastmoney",
            asOfDate: "2026-08-13",
            close: 6125.3,
            changePct: 0.55,
            change20dPct: 2.3,
            change60dPct: 6.8,
            aboveMa20: true,
            aboveMa60: true,
            volatility20d: 0.64,
            regimeLabel: "上行",
          },
          {
            id: "usNDX",
            name: "纳斯达克100",
            region: "global",
            provider: "eastmoney",
            asOfDate: "2026-08-13",
            close: 21540.2,
            changePct: 0.9,
            change20dPct: 3.1,
            change60dPct: 9.5,
            aboveMa20: true,
            aboveMa60: true,
            volatility20d: 1.05,
            regimeLabel: "上行",
          },
          {
            id: "usDJI",
            name: "道琼斯",
            region: "global",
            provider: "eastmoney",
            asOfDate: "2026-08-13",
            close: 42110.8,
            changePct: -0.12,
            change20dPct: -0.8,
            change60dPct: 3.1,
            aboveMa20: false,
            aboveMa60: true,
            volatility20d: 0.58,
            regimeLabel: "震荡",
          },
        ],
      };
    },
  };
}

export const offlineMarketContextProvider = createOfflineMarketContextProvider();
