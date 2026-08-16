import type { Instrument } from "@/quant/types";
import type { ResearchBrief, WebResearchProvider } from "./types";

/**
 * 离线研究提供方：返回录制好的简报模板（无网络），用于演示与确定性测试。
 * 简报标题/摘要按标的插值，保证可读且稳定。
 */
export const offlineWebResearchProvider: WebResearchProvider = {
  id: "offline",
  async research(instrument: Instrument): Promise<ResearchBrief[]> {
    const fetchedAt = "2026-08-15T15:30:00+08:00";
    return [
      {
        source: "fixture",
        title: `${instrument.name}（${instrument.symbol}）近期机构观点汇总`,
        url: "https://fixture.local/institution",
        snippet: `多家机构关注 ${instrument.name} 的盈利修复节奏与估值位置，分歧集中在短期波动与中期趋势之间。`,
        fetchedAt,
      },
      {
        source: "fixture",
        title: "宏观与政策环境快评",
        url: "https://fixture.local/macro",
        snippet: "流动性环境总体平稳，政策面对资本市场保持呵护态度，关注后续数据验证。",
        fetchedAt,
      },
      {
        source: "fixture",
        title: "行业与资金面动态",
        url: "https://fixture.local/flow",
        snippet: "板块资金有所分化，龙头标的外资与两融资金近期出现边际变化。",
        fetchedAt,
      },
    ];
  },
};

/**
 * Tavily 网络研究提供方：通过 Rust 命令 `web_search_tavily` 搜索，密钥由
 * 调用方（前端配置）每次传入。测试注入假 invoke。
 */
export function createTavilyWebResearchProvider(
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>,
): WebResearchProvider {
  return {
    id: "tavily",
    async research(
      instrument: Instrument,
      context,
    ): Promise<ResearchBrief[]> {
      if (!context.apiKey) {
        throw new Error("未配置网络研究密钥（Tavily API Key）");
      }
      const tagWords = context.factorEntries
        .map((entry) => entry.label)
        .slice(0, 3)
        .join(" ");
      const query = `${instrument.name} ${instrument.symbol} 最新消息 ${tagWords}`;
      const results = (await invoke("web_search_tavily", {
        query,
        apiKey: context.apiKey,
        maxResults: 5,
      })) as Array<{
        title: string;
        url: string;
        snippet: string;
      }>;
      return results.map((result) => ({
        source: "tavily",
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        fetchedAt: new Date().toISOString(),
      }));
    },
  };
}
