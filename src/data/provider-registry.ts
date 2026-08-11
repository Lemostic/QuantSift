import type { MarketDataProvider } from "./market-data-provider";
import { akshareMarketDataProvider } from "./akshare-provider";
import { recordedMarketDataProvider } from "./recorded-provider";
import { loadRecommendations } from "./recommendation-service";
import type { Recommendation } from "@/quant/types";

export type DataSourceId = "akshare" | "recorded";

/**
 * Resolves which provider to use for a request.
 *
 * The AKShare sidecar is the live source; the recorded fixture is the
 * offline fallback that also keeps tests deterministic. Callers can force a
 * specific source (used by the preferences UI and tests), otherwise the
 * registry picks AKShare and transparently falls back to the fixtures when
 * the sidecar is unavailable.
 */
export class ProviderRegistry {
  private providers: Record<DataSourceId, MarketDataProvider>;

  constructor(providers: Partial<Record<DataSourceId, MarketDataProvider>> = {}) {
    this.providers = {
      akshare: providers.akshare ?? akshareMarketDataProvider,
      recorded: providers.recorded ?? recordedMarketDataProvider,
    };
  }

  provider(source: DataSourceId): MarketDataProvider {
    return this.providers[source];
  }
}

export const registry = new ProviderRegistry();

export interface LoadResult {
  recommendations: Recommendation[];
  source: DataSourceId;
  fellBack: boolean;
  error: string | null;
}

/**
 * Load recommendations preferring AKShare, falling back to recorded fixtures.
 */
export async function loadWithFallback(
  instrumentIds: string[],
  preferred: DataSourceId = "akshare",
): Promise<LoadResult> {
  if (preferred === "recorded") {
    try {
      const recommendations = await loadRecommendations(
        registry.provider("recorded"),
        instrumentIds,
      );
      return { recommendations, source: "recorded", fellBack: false, error: null };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { recommendations: [], source: "recorded", fellBack: false, error: message };
    }
  }

  try {
    const recommendations = await loadRecommendations(
      registry.provider("akshare"),
      instrumentIds,
    );
    return { recommendations, source: "akshare", fellBack: false, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    // Fall back to the offline fixtures so the dashboard still renders.
    try {
      const recommendations = await loadRecommendations(
        registry.provider("recorded"),
        instrumentIds,
      );
      return {
        recommendations,
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
        error: `${message}；离线样例也失败：${fallbackMessage}`,
      };
    }
  }
}
