import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { LlmClient, LlmMessage, LlmProviderConfig } from "./types";

export type InvokeFn = (
  cmd: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;

export const defaultInvoke: InvokeFn = (cmd, args) =>
  tauriInvoke(cmd, args as never);

/**
 * LLM 客户端接缝：浏览器侧不直接发 HTTP，全部经 Rust 命令
 * `llm_chat_completion`（避免 CORS），密钥每次调用随参数传递、绝不落盘。
 */
export function createInvokeLlmClient(
  invoke: InvokeFn = defaultInvoke,
): LlmClient {
  return async (config: LlmProviderConfig, messages: LlmMessage[]) => {
    try {
      const result = await invoke("llm_chat_completion", {
        provider: config,
        messages,
      });
      return (result as { content: string }).content;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      throw new Error(message);
    }
  };
}

/**
 * 录制型 LLM 客户端：按 provider id 返回脚本化回复，供确定性测试使用。
 */
export function createRecordingLlmClient(
  script: Record<
    string,
    string | ((messages: LlmMessage[]) => string)
  >,
): LlmClient {
  return async (config, messages) => {
    const entry = script[config.id];
    if (entry === undefined) {
      throw new Error(`recording: 未配置 ${config.id} 的回复`);
    }
    return typeof entry === "function" ? entry(messages) : entry;
  };
}
