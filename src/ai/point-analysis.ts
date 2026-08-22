import type { Instrument } from "@/quant/types";
import type { KeyPoint } from "@/quant/key-points";
import { parseAdviceReply } from "./consensus";
import type { LlmClient, LlmMessage, LlmProviderConfig, MarketContext } from "./types";

/**
 * K 线关键点的 AI 深度分析。
 *
 * 关键点本身由本地规则识别（不消耗 token）；只有用户主动点击
 * "AI 分析此点"时才调用模型，结果按 标的+日期+模型+模板版本 缓存。
 * 输出格式与主分析一致（信号行/置信度行），复用同一套解析器。
 */

export interface PointAnalysisResult {
  signal: "buy" | "sell" | "hold" | "watch";
  confidence: number;
  summary: string;
  reasons: string[];
  risks: string[];
}

export interface PointAnalysisInput {
  instrument: Instrument;
  point: KeyPoint;
  marketContext?: MarketContext;
  templateVersion: number;
}

function formatIndicators(point: KeyPoint): string {
  const value = (label: string, numberValue: number | null) =>
    numberValue === null ? null : label + " " + numberValue;
  const parts = [
    value("MA5", point.indicators.ma5),
    value("MA20", point.indicators.ma20),
    value("MA60", point.indicators.ma60),
    value("BOLL上", point.indicators.bollUpper),
    value("BOLL中", point.indicators.bollMid),
    value("BOLL下", point.indicators.bollLower),
    value("MACD DIF", point.indicators.macdDif),
    value("MACD DEA", point.indicators.macdDea),
    value("MACD 柱", point.indicators.macdHist),
    value("KDJ K", point.indicators.kdjK),
    value("KDJ D", point.indicators.kdjD),
    value("KDJ J", point.indicators.kdjJ),
    value("RSI", point.indicators.rsi),
  ];
  return (
    parts.filter((part): part is string => part !== null).join("；") +
    "；量比 " +
    point.indicators.volumeRatio
  );
}

const SYSTEM_PROMPT =
  "你是 QuantSift 的 K 线关键点分析助手。你只基于给定数据解读" +
  "某一交易日为何成为关键点、当时的量价与指标状态，并给出研究层面的信号提醒。\n" +
  "你不是交易指令，结论仅供用户决策参考。\n\n" +
  "输出格式（严格遵守，使用简体中文）：\n" +
  "1. 第一行：信号: BUY / SELL / HOLD / WATCH（买入/卖出/持有/观望亦可）\n" +
  "2. 第二行：置信度: 0-100 的整数\n" +
  "3. 分析要点：2-4 条，每条一行，以\"- \"开头（为什么这一天是关键点、多空力量、后续验证条件）\n" +
  "4. 风险提示：1-2 条，每条一行，以\"- \"开头\n" +
  "5. 最后一行：一句话信号提醒（研究层面）\n\n" +
  "要求：只依据给定数据，绝不编造行情或新闻；方向必须明确；总字数控制在 250 字以内。";

export function buildPointAnalysisPrompt(input: PointAnalysisInput): LlmMessage[] {
  const user =
    "请分析以下 K 线关键点。\n\n" +
    "【标的】" + input.instrument.name + "（" + input.instrument.symbol + "）\n" +
    "【关键点】" + input.point.tradeDate + " · " + input.point.title +
    "（重要度 " + input.point.importance + "/100）\n" +
    "【规则解释】" + input.point.summary + "\n\n" +
    "【当日行情】开 " + input.point.open + " 高 " + input.point.high +
    " 低 " + input.point.low + " 收 " + input.point.close +
    " 量 " + Math.round(input.point.volume) + " 涨跌 " +
    (input.point.changePct >= 0 ? "+" : "") + input.point.changePct + "%\n\n" +
    "【当日指标快照】\n" + formatIndicators(input.point) + "\n\n" +
    (input.marketContext
      ? "【市场环境校准】" + input.marketContext.summary + "\n\n"
      : "") +
    "【提示词模板】v" + input.templateVersion + "\n\n" +
    "请按系统要求输出分析结论。";

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: user },
  ];
}

export function parsePointAnalysis(content: string): PointAnalysisResult {
  const parsed = parseAdviceReply(content);
  return {
    signal: parsed.signal,
    confidence: parsed.confidence,
    summary: parsed.summary,
    reasons: parsed.reasons,
    risks: parsed.risks,
  };
}

/**
 * 调用指定模型分析关键点；失败返回 null（调用方展示错误）。
 */
export async function runPointAnalysis(
  llm: LlmClient,
  config: LlmProviderConfig,
  messages: LlmMessage[],
): Promise<PointAnalysisResult | null> {
  try {
    const content = await llm(config, messages);
    return parsePointAnalysis(content);
  } catch {
    return null;
  }
}
