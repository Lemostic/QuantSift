import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface SourceCheck {
  id: string;
  label: string;
  kind: "kline" | "nav" | "search" | "client";
  ok: boolean;
  detail: string;
}

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const defaultInvoke: InvokeFn = (cmd, args) =>
  tauriInvoke(cmd, args as never);

/**
 * 体检全部免费数据源（K 线三源 + 净值两源 + 搜索）。
 * Rust 侧并发执行并限时，返回逐源状态。
 */
export async function checkAllSources(
  invoke: InvokeFn = defaultInvoke,
): Promise<SourceCheck[]> {
  const value = await invoke("market_check_sources", {});
  if (!Array.isArray(value)) throw new Error("数据源体检结果格式异常");
  return value as SourceCheck[];
}
