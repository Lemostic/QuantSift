import type { MarketDataProvider } from "./market-data-provider";
import { buildRecommendation } from "@/quant/recommendation";
import type { Recommendation } from "@/quant/types";

export async function loadRecommendations(
  provider: MarketDataProvider,
): Promise<Recommendation[]> {
  const instruments = await provider.listInstruments();
  const recommendations = await Promise.all(
    instruments.map(async (instrument) => {
      const bars = await provider.getDailyBars(instrument.id, 30);
      return buildRecommendation(instrument, bars);
    }),
  );
  return recommendations.sort((a, b) => b.score - a.score);
}

