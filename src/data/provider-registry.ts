import type { MarketDataProvider } from "./market-data-provider";
import {
  createEastMoneyMarketDataProvider,
  eastMoneyMarketDataProvider,
} from "./eastmoney-provider";
import { recordedMarketDataProvider } from "./recorded-provider";
import { loadRecommendationsTolerant } from "./recommendation-service";
import type { Recommendation } from "@/quant/types";
import { useAppStore } from "@/store/app-store";

/**
 * 数据源标识。
 * - "auto"：智能回退（东财 → 新浪 → 腾讯），默认与推荐；
 * - "eastmoney" / "sina" / "tencent"：固定使用单一免费源，失败即报错；
 * - "recorded"：离线样本（演示/测试）。
 */
export type DataSourceId =
  | "auto"
  | "eastmoney"
  | "sina"
  | "tencent"
  | "recorded";

/** 所有实时（免费）源，供偏好页切换与连通性检测使用。 */
export const LIVE_SOURCE_IDS: readonly DataSourceId[] = [
  "auto",
  "eastmoney",
  "sina",
  "tencent",
];

export interface LiveSourceMeta {
  id: DataSourceId;
  label: string;
  detail: string;
}

export const LIVE_SOURCE_META: Record<
  Exclude<DataSourceId, "recorded">,
  LiveSourceMeta
> = {
  auto: {
    id: "auto",
    label: "智能回退",
    detail: "东财优先，失败自动切换新浪/腾讯（推荐）",
  },
  eastmoney: {
    id: "eastmoney",
    label: "东方财富",
    detail: "固定使用东财免费接口，失败即报错不静默回退",
  },
  sina: {
    id: "sina",
    label: "新浪财经",
    detail: "固定使用新浪免费行情接口",
  },
  tencent: {
    id: "tencent",
    label: "腾讯行情",
    detail: "固定使用腾讯免费行情接口",
  },
};
/**
 * Registers the providers available to the application.
 *
 * The live providers share the Rust fetch layer and differ only in the
 * source argument they send; the recorded fixture keeps tests
 * deterministic and can be explicitly selected. Fallback to fixtures is
 * handled only by loadWithFallback, which reports the actual outcome.
 */
export class ProviderRegistry {
  private providers: Record<DataSourceId, MarketDataProvider>;

  constructor(providers: Partial<Record<DataSourceId, MarketDataProvider>> = {}) {
    this.providers = {
      auto: providers.auto ?? eastMoneyMarketDataProvider,
      eastmoney:
        providers.eastmoney ??
        createEastMoneyMarketDataProvider(undefined, "eastmoney"),
      sina:
        providers.sina ?? createEastMoneyMarketDataProvider(undefined, "sina"),
      tencent:
        providers.tencent ?? createEastMoneyMarketDataProvider(undefined, "tencent"),
      recorded: providers.recorded ?? recordedMarketDataProvider,
    };
  }

  provider(source: DataSourceId): MarketDataProvider {
    return this.providers[source];
  }
}

export const registry = new ProviderRegistry();

export function configuredProvider(): MarketDataProvider {
  return registry.provider(useAppStore.getState().marketDataSource);
}

export interface LoadResult {
  recommendations: Recommendation[];
  source: DataSourceId;
  fellBack: boolean;
  /** 非空表示有标的加载失败（逐标的错误摘要）。 */
  error: string | null;
}

/**
 * 加载推荐数据：优先实时源（逐标的容错），全部失败才回退离线样例。
 * 部分成功不会拖垮整个看板 —— 失败标的经 error 字段报告。
 */
export async function loadWithFallback(
  instrumentIds: string[],
  preferred: DataSourceId = "auto",
  allowOfflineFallback = true,
  providerRegistry: ProviderRegistry = registry,
): Promise<LoadResult> {
  if (preferred === "recorded") {
    try {
      const { recommendations } = await loadRecommendationsTolerant(
        providerRegistry.provider("recorded"),
        instrumentIds,
      );
      return { recommendations, source: "recorded", fellBack: false, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { recommendations: [], source: "recorded", fellBack: false, error: message };
    }
  }

  try {
    const { recommendations, errors } = await loadRecommendationsTolerant(
      providerRegistry.provider(preferred),
      instrumentIds,
    );
    if (recommendations.length > 0) {
      return {
        recommendations,
        source: preferred,
        fellBack: false,
        error: errors.length > 0 ? errors.join("；") : null,
      };
    }
    const message = errors.join("；") || "实时数据源未返回任何行情";
    if (!allowOfflineFallback) {
      return { recommendations: [], source: preferred, fellBack: false, error: message };
    }
    // 全部失败才回退离线样例，保证看板仍可渲染。
    try {
      const { recommendations: offline } = await loadRecommendationsTolerant(
        providerRegistry.provider("recorded"),
        instrumentIds,
      );
      return {
        recommendations: offline,
        source: "recorded",
        fellBack: true,
        error: message,
      };
    } catch (fallbackCause) {
      const fallbackMessage =
        fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause);
      return {
        recommendations: [],
        source: "recorded",
        fellBack: true,
        error: message + "；离线样例也失败：" + fallbackMessage,
      };
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!allowOfflineFallback) {
      return { recommendations: [], source: preferred, fellBack: false, error: message };
    }
    try {
      const { recommendations: offline } = await loadRecommendationsTolerant(
        providerRegistry.provider("recorded"),
        instrumentIds,
      );
      return {
        recommendations: offline,
        source: "recorded",
        fellBack: true,
        error: message,
      };
    } catch (fallbackCause) {
      const fallbackMessage =
        fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause);
      return {
        recommendations: [],
        source: "recorded",
        fellBack: true,
        error: message + "；离线样例也失败：" + fallbackMessage,
      };
    }
  }
}

export function loadConfiguredMarketData(
  instrumentIds: string[],
): Promise<LoadResult> {
  const { marketDataSource, allowOfflineFallback } = useAppStore.getState();
  return loadWithFallback(instrumentIds, marketDataSource, allowOfflineFallback);
}