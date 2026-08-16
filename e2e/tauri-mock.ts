import type { Page } from "@playwright/test";
import { recordedMarketDataProvider } from "../src/data/recorded-provider";

/**
 * Installs a Tauri-bridge mock before the page loads, so the SPA runs in a
 * plain browser as if the Rust backend were present. The mock serves the
 * same deterministic fixture data the recorded provider uses; pages that
 * depend on the live source (dashboard, watchlist, backtest) then render
 * their full UI instead of error/empty states.
 */
export async function installTauriMock(page: Page): Promise<void> {
  const instruments = await recordedMarketDataProvider.listInstruments();
  const barsByInstrument: Record<string, unknown[]> = {};
  for (const instrument of instruments) {
    barsByInstrument[instrument.id] = await recordedMarketDataProvider.getDailyBars(
      instrument.id,
      60,
    );
  }

  await page.addInitScript(
    ({ instruments, bars }) => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {
        invoke: async (cmd: string, args?: Record<string, unknown>) => {
          if (cmd === "eastmoney_list_instruments") return instruments;
          if (cmd === "eastmoney_get_daily_bars") {
            const list = (bars as Record<string, unknown[]>)[
              String(args?.instrumentId)
            ] ?? [];
            const limit = Number(args?.limit ?? 30);
            return list.slice(-limit);
          }
          throw new Error(`mock: unknown command ${cmd}`);
        },
      };
    },
    { instruments, bars: barsByInstrument },
  );
}
