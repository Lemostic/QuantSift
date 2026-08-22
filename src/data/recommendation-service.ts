import type { MarketDataProvider } from "./market-data-provider";
import { buildRecommendation } from "@/quant/recommendation";
import type { Recommendation } from "@/quant/types";

export interface TolerantLoadResult {
  recommendations: Recommendation[];
  /** 逐标的错误（标的数据失败不影响其他标的）。 */
  errors: string[];
}

/**
 * 逐标的容错加载：单个标的数据拉取失败只记录错误，不拖垮整个加载。
 * 用于看板/自选等"尽量显示实时数据"的场景。
 */
export async function loadRecommendationsTolerant(
  provider: MarketDataProvider,
  instrumentIds?: string[],
): Promise<TolerantLoadResult> {
  const catalog = await provider.listInstruments();
  const allowed = instrumentIds ? new Set(instrumentIds) : null;
  const instruments = allowed
    ? catalog.filter((instrument) => allowed.has(instrument.id))
    : catalog;
  const recommendations: Recommendation[] = [];
  const errors: string[] = [];
  await Promise.all(
    instruments.map(async (instrument) => {
      try {
        const bars = await provider.getDailyBars(instrument.id, 30);
        recommendations.push(buildRecommendation(instrument, bars));
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        errors.push(instrument.id + ": " + message);
      }
    }),
  );
  recommendations.sort((a, b) => b.score - a.score);
  return { recommendations, errors };
}

export async function loadRecommendations(
  provider: MarketDataProvider,
  instrumentIds?: string[],
): Promise<Recommendation[]> {
  const result = await loadRecommendationsTolerant(provider, instrumentIds);
  if (result.errors.length > 0 && result.recommendations.length === 0) {
    throw new Error(result.errors.join("；"));
  }
  return result.recommendations;
}
