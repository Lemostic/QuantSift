import type { SignalIntelligence } from "@/intelligence/signal-intelligence";
import type { Recommendation } from "@/quant/types";
import type {
  AnalysisSession,
  AnalysisTemplate,
  FactorVariation,
  LlmMessage,
  MarketContext,
  ResearchBrief,
  TemplateParams,
} from "./types";

export const DEFAULT_TEMPLATE_PARAMS: TemplateParams = {
  reasoningDepth: "standard",
  strictness: 75,
  riskFocus: 60,
  calibrationWeight: 70,
  verbosity: 45,
};

export const DEFAULT_ANALYSIS_TEMPLATE: AnalysisTemplate = {
  version: 1,
  params: DEFAULT_TEMPLATE_PARAMS,
};

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
  /** 市场环境校准（可选；由 runIntelligentScan 每轮扫描拉取一次）。 */
  marketContext?: MarketContext;
  /** 本次分析使用的提示词模板（含版本号，用于模板自迭代追踪）。 */
  template: AnalysisTemplate;
}

const OUTPUT_FORMAT = `输出格式（严格遵守，使用简体中文）：
1. 第一行：信号: BUY / SELL / HOLD / WATCH（买入/卖出/持有/观望亦可）
2. 第二行：置信度: 0-100 的整数
3. 核心依据：2-4 条，每条一行，以"- "开头，说明为什么给出该信号（趋势、动量、风险、估值、消息面等）
4. 风险提示：1-3 条，每条一行，以"- "开头
5. 最后一行：一句话操作建议（是否买入/卖出/持有及仓位思路）`;

function wordLimit(verbosity: number): string {
  if (verbosity <= 25) return "200";
  if (verbosity <= 50) return "300";
  if (verbosity <= 75) return "400";
  return "500";
}

function reasoningInstruction(depth: TemplateParams["reasoningDepth"]): string {
  switch (depth) {
    case "concise":
      return "直接给出结论，不要展开推理过程；只保留结论与依据。";
    case "detailed":
      return "按 市场校准 → 因子解读 → 交叉验证 → 结论 的步骤简要展示推理链条，再按格式输出最终结论。";
    default:
      return "先在心里完成 市场校准 → 因子解读 → 交叉验证 的推理，再按格式输出结论（不要输出推理过程）。";
  }
}

function strictnessInstruction(strictness: number): string {
  if (strictness >= 80) {
    return "格式为硬性要求：信号行、置信度行、核心依据、风险提示、操作建议五部分缺一不可，任何一部分缺失都会被判定为不合格。";
  }
  if (strictness <= 40) {
    return "输出格式可适当灵活，但信号与置信度两行必须存在。";
  }
  return "请按格式输出；若个别部分无内容，写明原因而非留空。";
}

function riskInstruction(riskFocus: number): string {
  if (riskFocus >= 70) {
    return "风险提示至少 2 条，且尽量给出具体价位或数据条件（如“跌破 XX 止损”），避免套话。";
  }
  if (riskFocus <= 40) {
    return "风险提示 1-2 条即可，保持简洁。";
  }
  return "风险提示须具体，禁止使用“投资有风险”之类的空话。";
}

function calibrationInstruction(calibrationWeight: number): string {
  if (calibrationWeight >= 70) {
    return "市场环境校准是结论的重要权重之一：全球 risk_off 环境中，买入信号需要更高置信度与更强依据支撑；A 股中期结构偏弱时，避免给出激进的买入/加仓建议。环境与个股信号矛盾时，倾向环境优先并相应下调置信度。";
  }
  if (calibrationWeight <= 40) {
    return "市场环境校准仅作背景参考，结论以个股因子数据为主。";
  }
  return "市场环境校准应作为结论的背景约束：顺风环境可适度上调置信度，逆风环境应下调并加强风险提示。";
}

/**
 * 提示词模板系统提示（由可调参数驱动）。参数由模板精炼器
 * （template-refinery）根据每次分析后的反馈自动迭代。
 */
export function buildSystemPrompt(params: TemplateParams): string {
  return `你是 QuantSift 的量化研究助手，为个人投资者提供研究结论参考。你不是交易指令，结论仅供用户决策参考。

【工作流程】
1. 市场环境校准：先阅读“市场环境校准”一节（全球风险偏好、A 股指数位置），判断当前环境对目标标的是顺风还是逆风；环境数据不足时不做臆测。
2. 因子解读：逐一解读基础因子与智能研判（趋势、动量、风险、支撑/压力位），识别信号强度与短板。
3. 交叉验证：结合网络研究简报与历史分析记忆检验结论；与本地因子数据矛盾时以本地数据为准并说明。
4. 结论输出：给出方向明确的研究结论。

${OUTPUT_FORMAT}

【推理方式】${reasoningInstruction(params.reasoningDepth)}
【格式要求】${strictnessInstruction(params.strictness)}
【风险要求】${riskInstruction(params.riskFocus)}
【校准要求】${calibrationInstruction(params.calibrationWeight)}
【篇幅要求】总字数控制在 ${wordLimit(params.verbosity)} 字以内。

【质量底线】
- 结论必须明确方向，不要含糊其辞；没有把握时给出 HOLD/WATCH 并说明原因。
- 只依据给定数据，绝不编造新闻、数字、事件或公告。
- 风险提示必须具体，禁止套话。
- 你是研究辅助工具，结论仅供用户决策参考。`;
}

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

const GLOBAL_REGIME_LABEL: Record<MarketContext["globalRegime"], string> = {
  risk_on: "风险偏好偏暖（risk on）",
  risk_off: "风险偏好偏冷（risk off）",
  mixed: "风险偏好分化（mixed）",
  unknown: "数据不足（unknown）",
};

const DOMESTIC_REGIME_LABEL: Record<MarketContext["domesticRegime"], string> = {
  strong: "A 股中期结构偏强（沪深300 位于 MA60 上方）",
  neutral: "A 股方向未定（沪深300 围绕 MA60 震荡）",
  weak: "A 股中期结构偏弱（沪深300 跌破 MA60）",
  unknown: "A 股指数数据缺失",
};

function formatMarketContext(context: MarketContext | undefined): string {
  if (!context) return "（本次未获取到市场环境数据，请勿臆测外部行情）";
  const rows = context.indices
    .map(
      (index) =>
        `- ${index.name}（${index.region === "domestic" ? "国内" : "全球"}）${index.close}　20日 ${index.change20dPct >= 0 ? "+" : ""}${index.change20dPct}%　60日 ${index.change60dPct >= 0 ? "+" : ""}${index.change60dPct}%　${index.aboveMa60 ? "MA60上方" : "MA60下方"}（${index.regimeLabel}）`,
    )
    .join("\n");
  return [
    `【总览】${context.summary}`,
    `【全球】${GLOBAL_REGIME_LABEL[context.globalRegime]}`,
    `【国内】${DOMESTIC_REGIME_LABEL[context.domesticRegime]}`,
    `【指数明细】`,
    rows,
    `（数据日期 ${context.asOfDate}，来源：${[...new Set(context.indices.map((i) => i.provider))].join(" / ")}）`,
  ].join("\n");
}

export function buildUserPrompt(input: PromptInput): string {
  return `请分析以下标的并给出研究结论。

【标的】${input.instrumentName}（${input.symbol}，${input.kind}）
【行情日期】${input.asOfDate}　【现价】${input.price}
【基础评分】${input.baseScore}/100　【信号】${input.recommendation.signal}

【基础因子】
${formatFactors(input.recommendation)}

【智能研判】
市场状态：${input.intelligence.regimeLabel}；一致性置信度：${input.intelligence.confidence}/100
支撑位 ${input.intelligence.support}，压力位 ${input.intelligence.resistance}

【市场环境校准】
${formatMarketContext(input.marketContext)}

【随机因子（种子 ${input.variation.seed}，本次扫描的强调角度）】
${formatVariation(input.variation)}

【网络研究简报】
${formatResearch(input.research)}

【历史分析记忆（同标的近期结论参考）】
${formatMemory(input.memory)}

【提示词模板】v${input.template.version}

请按系统要求输出研究结论。`;
}

export function buildAnalysisMessages(input: PromptInput): LlmMessage[] {
  return [
    { role: "system", content: buildSystemPrompt(input.template.params) },
    { role: "user", content: buildUserPrompt(input) },
  ];
}
