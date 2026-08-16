/**
 * 常用 OpenAI 兼容模型的一键预设。选择预设后自动填入 Base URL 与模型名，
 * 用户只需粘贴自己的 API Key。
 */
export interface LlmProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  /** 可选地区说明（如 MiniMax 国际/国内站）。 */
  region?: string;
}

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
  },
  {
    id: "minimax-intl",
    label: "MiniMax 国际站",
    baseUrl: "https://api.minimaxi.com/v1",
    model: "MiniMax-Text-01",
    region: "platform.minimaxi.com",
  },
  {
    id: "minimax-cn",
    label: "MiniMax 国内站",
    baseUrl: "https://api.minimax.chat/v1",
    model: "abab6.5s-chat",
    region: "platform.minimax.chat",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "moonshot",
    label: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2",
  },
  {
    id: "qwen",
    label: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    region: "DashScope 兼容模式",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  {
    id: "custom",
    label: "自定义（OpenAI 兼容）",
    baseUrl: "",
    model: "",
  },
];

export function presetById(id: string): LlmProviderPreset | undefined {
  return LLM_PROVIDER_PRESETS.find((preset) => preset.id === id);
}
