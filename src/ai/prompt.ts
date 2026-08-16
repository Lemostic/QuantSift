import type { SignalIntelligence } from "@/intelligence/signal-intelligence";
import type { Recommendation } from "@/quant/types";
import type {
  AnalysisSession,
  FactorVariation,
  LlmMessage,
  ResearchBrief,
} from "./types";

export interface PromptInput {
  instrumentName: string;
  symbol: string;
  kind: string;
  asOfDate: string;
  price: number;
  baseScore: number;
  recommendation: Recommendation;
  intelligence: SignalIntelligence;
  variation: FactorVariation;
  research: ResearchBrief[];
  memory: AnalysisSession[];
}

const SYSTEM_PROMPT = `你是 QuantSift 的量化研究助手。你基于本地因子数据、网络研究简报与历史分析记忆，给出一个研究结论。
要求：
1. 第一行输出“信号: BUY / SELL / HOLD / WATCH”（买入/卖出/持有/观望亦可）。
2. 第二行输出“置信度: 0-100 的整数”。
3. 随后输出：结论摘要、理由（分点）、风险提示。
4. 你是研究辅助工具，不是交易指令；结论仅供用户决策参考。
5. 回答控制在 400 字以内，使用简体中文。`;

function formatFactors(recommendation: Recommendation): string {
  return recommendation.factors
    .map((factor) => `${factor.label} ${factor.score}/100（权重 ${Math.round(factor.weight * 100)}%）`)
    .join("；");
}

function formatVariation(variation: FactorVariation): string {
  if (variation.entries.length === 0) return "（无启用因子）";
  return variation.entries
    .map(
      (entry) =>
        `${entry.label}：强调度 ${entry.emphasis}，倾向 ${entry.direction === "positive" ? "偏多" : entry.direction === "negative" ? "偏空" : "中性"}`,
    )
    .join("；");
}

function formatResearch(research: ResearchBrief[]): string {
  if (research.length === 0) return "（无网络研究简报）";
  return research
    .map((brief) => `- [${brief.source}] ${brief.title}：${brief.snippet}`)
    .join("\n");
}

function formatMemory(memory: AnalysisSession[]): string {
  if (memory.length === 0) return "（无历史分析记录）";
  return memory
    .map(
      (session) =>
        `- ${session.asOfDate} ${session.advice.signal}（置信度 ${session.advice.confidence}）：${session.advice.summary.slice(0, 80)}`,
    )
    .join("\n");
}

export function buildAnalysisMessages(input: PromptInput): LlmMessage[] {
  const userPrompt = `请分析以下标的并给出研究结论。

【标的】${input.instrumentName}（${input.symbol}，${input.kind}）
【行情日期】${input.asOfDate}　【现价】${input.price}
【基础评分】${input.baseScore}/100　【信号】${input.recommendation.signal}

【基础因子】
${formatFactors(input.recommendation)}

【智能研判】
市场状态：${input.intelligence.regimeLabel}；一致性置信度：${input.intelligence.confidence}/100
支撑位 ${input.intelligence.support}，压力位 ${input.intelligence.resistance}

【随机因子（种子 ${input.variation.seed}，本次扫描的强调角度）】
${formatVariation(input.variation)}

【网络研究简报】
${formatResearch(input.research)}

【历史分析记忆（同标的近期结论参考）】
${formatMemory(input.memory)}

请按系统要求输出研究结论。`;

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}
