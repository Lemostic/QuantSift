import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { MarketDataProvider } from "./market-data-provider";
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
 * Response shapes returned by the Rust sidecar commands.
 * Field names are camelCase because the Rust structs use
 * `#[serde(rename_all = "camelCase")]`.
 */
interface SidecarInstrument {
  id: string;
  symbol: string;
  name: string;
  kind: "stock" | "fund";
  exchange: "SSE" | "SZSE" | "OTC";
  currency: "CNY";
}

interface SidecarBar {
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

export class AkShareSidecarError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "AkShareSidecarError";
  }
}

function toInstrument(value: SidecarInstrument): Instrument {
  return {
    id: value.id,
    symbol: value.symbol,
    name: value.name,
    kind: value.kind,
    exchange: value.exchange,
    currency: value.currency,
  };
}

function toDailyBar(value: SidecarBar): DailyBar {
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

function normalizeError(cause: unknown): AkShareSidecarError {
  if (cause instanceof AkShareSidecarError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  // The Rust command serializes SidecarError via to_string(); try to detect
  // the network case so the UI can show a freshness/fallback notice.
  const code = /网络|Network|timeout|Timeout|Max retries/i.test(message)
    ? "network_error"
    : "sidecar_error";
  return new AkShareSidecarError(message, code);
}

/**
 * MarketDataProvider backed by the AKShare Python sidecar through the Tauri
 * invoke bridge. UI and strategy code keep depending on the provider
 * contract; they never talk to AKShare or vendor endpoints directly.
 */
export function createAkShareMarketDataProvider(
  invokeFn: InvokeFn = defaultInvoke,
): MarketDataProvider {
  return {
    id: "akshare",

    async listInstruments(): Promise<Instrument[]> {
      try {
        const values = await invokeFn("sidecar_list_instruments", {});
        return (values as SidecarInstrument[]).map(toInstrument);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },

    async getDailyBars(
      instrumentId: string,
      limit: number,
    ): Promise<DailyBar[]> {
      try {
        const values = await invokeFn("sidecar_get_daily_bars", {
          instrumentId,
          limit,
        });
        return (values as SidecarBar[]).map(toDailyBar);
      } catch (cause) {
        throw normalizeError(cause);
      }
    },
  };
}

export const akshareMarketDataProvider: MarketDataProvider =
  createAkShareMarketDataProvider();
