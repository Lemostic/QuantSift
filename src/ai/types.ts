import type { Instrument } from "@/quant/types";

/** 研究建议信号。buy/sell 是明确方向，hold 为持有，watch 为观望。 */
export type AdviceSignal = "buy" | "sell" | "hold" | "watch";

export interface LlmProviderConfig {
  id: string;
  label: string;
  /** OpenAI 兼容接口基地址，如 https://api.deepseek.com */
  baseUrl: string;
  apiKey: string;
  model: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LlmClient = (
  config: LlmProviderConfig,
  messages: LlmMessage[],
) => Promise<string>;

export interface ResearchBrief {
  source: string;
  title: string;
  url: string;
  snippet: string;
  fetchedAt: string;
}

export interface ResearchContext {
  factorEntries: FactorVariationEntry[];
  apiKey?: string;
}

export interface WebResearchProvider {
  readonly id: string;
  research(
    instrument: Instrument,
    context: ResearchContext,
  ): Promise<ResearchBrief[]>;
}

export interface FactorTag {
  id: string;
  label: string;
  description: string;
  builtIn?: boolean;
}

export interface FactorTagSetting {
  tagId: string;
  enabled: boolean;
}

export interface FactorConfig {
  tags: FactorTagSetting[];
  /** 随机强调强度 0-100。0 表示不引入随机波动。 */
  randomness: number;
}

export interface FactorVariationEntry {
  tagId: string;
  label: string;
  /** 本次扫描中该因子的强调程度 0-100。 */
  emphasis: number;
  direction: "positive" | "negative" | "neutral";
}

export interface FactorVariation {
  seed: number;
  entries: FactorVariationEntry[];
}

export type AnalysisTrigger = "manual" | "scheduled";

export interface ProviderOutcome {
  providerId: string;
  label: string;
  model: string;
  status: "ok" | "error";
  signal?: AdviceSignal;
  confidence?: number;
  summary?: string;
  error?: string;
  durationMs: number;
}

export interface AnalysisMessage {
  id: string;
  role: "user" | "assistant" | "system";
  providerId?: string;
  content: string;
  createdAt: string;
}

export interface AnalysisAdvice {
  signal: AdviceSignal;
  /** 0-100，各模型信号一致性与置信度的综合。 */
  confidence: number;
  summary: string;
}

/** 多模型合并后的组合分析报告。 */
export interface CompositeReport {
  signal: AdviceSignal;
  confidence: number;
  /** 明确结论：是否应该买入/卖出。 */
  verdict: string;
  /** 为什么：多模型共识依据（分点）。 */
  rationale: string[];
  /** 各信号票数分布。 */
  signalDistribution: Record<AdviceSignal, number>;
  /** 模型分歧说明。 */
  disagreement: string;
  /** 风险提示（基础因子 + 模型提示合并去重）。 */
  risks: string[];
  /** 结合支撑/压力位的操作建议。 */
  action: string;
}

export interface AnalysisSession {
  id: string;
  instrumentId: string;
  instrumentName: string;
  trigger: AnalysisTrigger;
  createdAt: string;
  asOfDate: string;
  /** 随机因子种子，用于复现本次分析。 */
  seed: number;
  factorTagIds: string[];
  factorVariation: FactorVariationEntry[];
  /** 研究简报（本地留存）。 */
  research: ResearchBrief[];
  providers: ProviderOutcome[];
  advice: AnalysisAdvice;
  /** 多模型合并后的组合分析报告。 */
  report: CompositeReport | null;
  messages: AnalysisMessage[];
  priceAtAnalysis: number;
  baseScore: number;
}

export interface IntradaySchedule {
  enabled: boolean;
  /** 扫描间隔分钟：5/10/15/30/60。 */
  intervalMinutes: number;
  /** 窗口开始（分钟，自 00:00 起），默认 09:00。 */
  startMinutes: number;
  /** 窗口结束（分钟），默认 15:00。 */
  endMinutes: number;
}

export const DEFAULT_INTRADAY_SCHEDULE: IntradaySchedule = {
  enabled: false,
  intervalMinutes: 15,
  startMinutes: 9 * 60,
  endMinutes: 15 * 60,
};

export interface DueIntradayScan {
  slotAt: string;
  slotMinutes: number;
  intervalMinutes: number;
}

export const DEFAULT_FACTOR_TAGS: FactorTag[] = [
  {
    id: "global_market",
    label: "全球市场",
    description: "美股、欧股、亚太与大宗商品的联动影响",
    builtIn: true,
  },
  {
    id: "domestic_market",
    label: "国内市场",
    description: "A 股指数、板块轮动与成交热度",
    builtIn: true,
  },
  {
    id: "policy",
    label: "政策面",
    description: "财政、货币与产业政策动向",
    builtIn: true,
  },
  {
    id: "capital",
    label: "资金面",
    description: "北向资金、两融与主力资金流向",
    builtIn: true,
  },
  {
    id: "news",
    label: "消息面",
    description: "公司公告、行业新闻与舆情",
    builtIn: true,
  },
  {
    id: "technicals",
    label: "技术面",
    description: "量价、均线与技术指标结构",
    builtIn: true,
  },
  {
    id: "macro",
    label: "宏观数据",
    description: "CPI、PMI、社融等宏观指标",
    builtIn: true,
  },
  {
    id: "industry",
    label: "行业景气",
    description: "行业供需、库存与景气周期",
    builtIn: true,
  },
];
