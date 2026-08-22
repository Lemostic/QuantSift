import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface SourceCheck {
  id: string;
  label: string;
  kind: "kline" | "nav" | "search" | "client";
  ok: boolean;
  detail: string;
}

export interface SourceStatus {
  cachedAt: string;
  checks: SourceCheck[];
  summary: string;
}

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const defaultInvoke: InvokeFn = (cmd, args) =>
  tauriInvoke(cmd, args as never);

/**
 * 数据源连通性状态（Rust 侧 5 分钟进程内缓存）：进入偏好页自动检测，
 * 不会每次打开页面都请求所有端点。
 */
export async function getSourceStatus(
  invoke: InvokeFn = defaultInvoke,
): Promise<SourceStatus> {
  const value = await invoke("market_source_status", {});
  if (!value || typeof value !== "object" || !Array.isArray((value as SourceStatus).checks)) {
    throw new Error("数据源连通性状态格式异常");
  }
  return value as SourceStatus;
}

/**
 * 强制重新检测全部免费数据源（不做缓存）。
 */
export async function checkAllSources(
  invoke: InvokeFn = defaultInvoke,
): Promise<SourceCheck[]> {
  const value = await invoke("market_check_sources", {});
  if (!Array.isArray(value)) throw new Error("数据源体检结果格式异常");
  return value as SourceCheck[];
}
