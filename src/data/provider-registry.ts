import type { MarketDataProvider } from "./market-data-provider";
import { akshareMarketDataProvider } from "./akshare-provider";
import { recordedMarketDataProvider } from "./recorded-provider";
import { loadRecommendations } from "./recommendation-service";
import type { Recommendation } from "@/quant/types";
import { useAppStore } from "@/store/app-store";

export type DataSourceId = "akshare" | "recorded";

/**
 * Registers the providers available to the application.
 *
 * The AKShare sidecar is the live source; the recorded fixture is the
 * offline fixture keeps tests deterministic and can be explicitly selected.
 * Fallback is handled only by `loadWithFallback`, which reports the actual
 * source to prevent callers from mixing live and fixture data silently.
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

export function configuredProvider(): MarketDataProvider {
  return registry.provider(useAppStore.getState().marketDataSource);
}

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
  allowOfflineFallback = true,
  providerRegistry: ProviderRegistry = registry,
): Promise<LoadResult> {
  if (preferred === "recorded") {
    try {
      const recommendations = await loadRecommendations(
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
    const recommendations = await loadRecommendations(
      providerRegistry.provider("akshare"),
      instrumentIds,
    );
    return { recommendations, source: "akshare", fellBack: false, error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (!allowOfflineFallback) {
      return {
        recommendations: [],
        source: "akshare",
        fellBack: false,
        error: message,
      };
    }
    // Fall back to the offline fixtures so the dashboard still renders.
    try {
      const recommendations = await loadRecommendations(
        providerRegistry.provider("recorded"),
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

export function loadConfiguredMarketData(
  instrumentIds: string[],
): Promise<LoadResult> {
  const { marketDataSource, allowOfflineFallback } = useAppStore.getState();
  return loadWithFallback(
    instrumentIds,
    marketDataSource,
    allowOfflineFallback,
  );
}
