import type { Instrument } from "@/quant/types";
import type { ResearchBrief, WebResearchProvider } from "./types";

/**
 * 离线研究提供方：返回录制好的简报模板（无网络），用于演示与确定性测试。
 * 简报标题/摘要按标的插值，保证可读且稳定。
 *
 * 分析结论完全由配置的 AI 模型（DeepSeek、MiniMax 等）给出；简报只作为
 * 可选的上下文信息随会话留存。`WebResearchProvider` 接缝保留，未来如需
 * 接入其他搜索源可在此扩展，无需改动分析引擎。
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
