import type { Page } from "@playwright/test";
import { recordedMarketDataProvider } from "../src/data/recorded-provider";
import { createOfflineMarketContextProvider } from "../src/data/market-context";

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
  const contextProvider = createOfflineMarketContextProvider();

  await page.addInitScript(
    ({ instruments, bars, contextProvider }) => {
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
          if (cmd === "eastmoney_search_instruments") {
            const keyword = String(args?.keyword ?? "").toLowerCase().trim();
            return (instruments as Array<{
              name: string;
              symbol: string;
            }>).filter(
              (instrument) =>
                instrument.name.toLowerCase().includes(keyword) ||
                instrument.symbol.includes(keyword),
            );
          }
          if (cmd === "market_get_context") {
            return contextProvider.getMarketContext();
          }
          if (cmd === "market_check_sources" || cmd === "market_source_status") {
            const checks = [
              { id: "eastmoney", label: "东方财富 K 线", kind: "kline", ok: true, detail: "OK（mock）" },
              { id: "sina", label: "新浪财经 K 线", kind: "kline", ok: true, detail: "OK（mock）" },
              { id: "tencent", label: "腾讯行情 K 线", kind: "kline", ok: true, detail: "OK（mock）" },
              { id: "nav", label: "东财基金净值（网页版）", kind: "nav", ok: true, detail: "OK（mock）" },
              { id: "nav_mob", label: "东财基金净值（移动版）", kind: "nav", ok: true, detail: "OK（mock）" },
              { id: "search", label: "标的搜索", kind: "search", ok: true, detail: "OK（mock）" },
            ];
            if (cmd === "market_source_status") {
              return { cachedAt: "2026-08-22T10:00:00+08:00", summary: "6/6 数据源可用（K 线源 3/3）", checks };
            }
            return checks;
          }
          throw new Error(`mock: unknown command ${cmd}`);
        },
      };
    },
    { instruments, bars: barsByInstrument, contextProvider },
  );
}
