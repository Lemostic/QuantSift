import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { MarketDataProvider } from "./market-data-provider";
import { mergeInstruments, getInstrumentDirectory } from "./instrument-directory";
import type { DailyBar, Instrument } from "@/quant/types";

/**
 * The Tauri invoke bridge is injected so tests can substitute a fake without
 * the real @tauri-apps/api/core touching `window`.
 */
export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const defaultInvoke: InvokeFn = (cmd, args) =>
  tauriInvoke(cmd, args as never);

/**
 * Response shapes returned by the Rust market commands.
 * Field names are camelCase because the Rust structs use
 * `#[serde(rename_all = "camelCase")]`.
 */
interface MarketInstrument {
  id: string;
  symbol: string;
  name: string;
  kind: "stock" | "fund";
  exchange: "SSE" | "SZSE" | "OTC";
  currency: "CNY";
}

interface MarketBar {
  instrumentId: string;
  tradeDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustment: "none" | "forward" | "backward";
  provider: string;
  fetchedAt: string;
}

export class EastMoneyError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "EastMoneyError";
  }
}

function toInstrument(value: MarketInstrument): Instrument {
  return {
    id: value.id,
    symbol: value.symbol,
    name: value.name,
    kind: value.kind,
    exchange: value.exchange,
    currency: value.currency,
  };
}

function toDailyBar(value: MarketBar): DailyBar {
  return {
    instrumentId: value.instrumentId,
    tradeDate: value.tradeDate,
    open: value.open,
    high: value.high,
    low: value.low,
    close: value.close,
    volume: value.volume,
    adjustment: value.adjustment,
    provider: value.provider,
    fetchedAt: value.fetchedAt,
  };
}

function normalizeError(cause: unknown): EastMoneyError {
  if (cause instanceof EastMoneyError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  // The Rust commands serialize fetch failures with a 网络/Network marker so
  // the UI can show a freshness/fallback notice instead of a hard error.
  const code = /网络|Network|timeout|Timeout|Max retries/i.test(message)
    ? "network_error"
    : "market_error";
  return new EastMoneyError(message, code);
}

/**
 * MarketDataProvider backed by the native Rust market commands, which fetch
 * A-share/ETF daily bars and fund NAVs through the free-source chain.
 * UI and strategy code keep depending on the provider contract; they never
 * talk to vendor endpoints directly.
 *
 * @param source 数据源选择："auto"（智能回退，默认）/ "eastmoney" / "sina" / "tencent"。
 *               指定单一源时不静默回退，失败即报错。
 */
export function createEastMoneyMarketDataProvider(
  invokeFn: InvokeFn = defaultInvoke,
  source: string = "auto",
): MarketDataProvider {
  return {
    id: source === "auto" ? "eastmoney" : source,

    async listInstruments(): Promise<Instrument[]> {
      try {
        const values = await invokeFn("eastmoney_list_instruments", {});
        const catalog = (values as MarketInstrument[]).map(toInstrument);
        // 合并目录外标的（用户搜索添加过的），保证全站可解析。
        return getInstrumentDirectory().mergedWith(catalog);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },

    async getDailyBars(
      instrumentId: string,
      limit: number,
    ): Promise<DailyBar[]> {
      try {
        // 目录外标的把元数据带给原生命令，用于解析行情通道
        // （场外基金走净值、股票/ETF 走 K 线）。
        const known = getInstrumentDirectory().lookup(instrumentId);
        const args: Record<string, unknown> = {
          instrumentId,
          limit,
          source,
        };
        if (known) {
          args.exchange = known.exchange;
          args.kind = known.kind;
        }
        const values = await invokeFn("eastmoney_get_daily_bars", args);
        return (values as MarketBar[]).map(toDailyBar);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },

    async searchInstruments(query: string): Promise<Instrument[]> {
      try {
        const values = await invokeFn("eastmoney_search_instruments", {
          keyword: query,
        });
        const instruments = (values as MarketInstrument[]).map(toInstrument);
        // 搜索命中即入目录，后续添加/持仓/图表都能解析。
        mergeInstruments(instruments);
        return instruments;
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
  };
}

export const eastMoneyMarketDataProvider: MarketDataProvider =
  createEastMoneyMarketDataProvider();
