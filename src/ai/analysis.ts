import type { MarketDataProvider } from "@/data/market-data-provider";
import { buildSignalIntelligence } from "@/intelligence/signal-intelligence";
import { buildRecommendation } from "@/quant/recommendation";
import type { DailyBar, Instrument, Recommendation } from "@/quant/types";
import { parseAdviceReply, buildConsensus, buildCompositeReport } from "./consensus";
import { buildFactorVariation } from "./factors";
import { buildAnalysisMessages } from "./prompt";
import type {
  AnalysisSession,
  AnalysisTrigger,
  FactorConfig,
  FactorTag,
  LlmClient,
  LlmMessage,
  LlmProviderConfig,
  ProviderOutcome,
  WebResearchProvider,
} from "./types";

export interface RunAnalysisRequest {
  instrument: Instrument;
  bars: DailyBar[];
  recommendation: Recommendation;
  providers: LlmProviderConfig[];
  llm: LlmClient;
  researchProvider: WebResearchProvider;
  researchApiKey?: string;
  factorConfig: FactorConfig;
  factorTags: FactorTag[];
  seed?: number;
  trigger: AnalysisTrigger;
  memory: AnalysisSession[];
  now?: () => Date;
  createId?: () => string;
}

async function runProvider(
  config: LlmProviderConfig,
  llm: LlmClient,
  messages: LlmMessage[],
): Promise<ProviderOutcome> {
  const startedAt = Date.now();
  try {
    const content = await llm(config, messages);
    const parsed = parseAdviceReply(content);
    return {
      providerId: config.id,
      label: config.label,
      model: config.model,
      status: "ok",
      signal: parsed.signal,
      confidence: parsed.confidence,
      summary: parsed.summary,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    return {
      providerId: config.id,
      label: config.label,
      model: config.model,
      status: "error",
      error: cause instanceof Error ? cause.message : String(cause),
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * 单标的智能分析：基础因子 + 随机因子变体 + 网络研究 + 历史记忆 →
 * 并行调用所有启用模型 → 共识结论 → 生成并返回会话。
 * 单个模型失败不影响其他模型，也不阻塞会话生成。
 */
export async function runAnalysis(
  request: RunAnalysisRequest,
): Promise<AnalysisSession> {
  const now = request.now ?? (() => new Date());
  const createId = request.createId ?? (() => crypto.randomUUID());
  const seed = request.seed ?? Math.floor(Math.random() * 2_147_483_647);
  const variation = buildFactorVariation(seed, request.factorConfig, request.factorTags);

  const research = await request.researchProvider.research(request.instrument, {
    factorEntries: variation.entries,
    apiKey: request.researchApiKey,
  });

  const messages = buildAnalysisMessages({
    instrumentName: request.instrument.name,
    symbol: request.instrument.symbol,
    kind: request.instrument.kind === "fund" ? "基金" : "A 股",
    asOfDate: request.recommendation.asOfDate,
    price: request.recommendation.price,
    baseScore: request.recommendation.score,
    recommendation: request.recommendation,
    intelligence: buildSignalIntelligence(
      request.recommendation,
      request.bars,
    ),
    variation,
    research,
    memory: request.memory.slice(0, 3),
  });

  const outcomes = await Promise.all(
    request.providers.map((config) => runProvider(config, request.llm, messages)),
  );
  const advice = buildConsensus(outcomes);
  const intelligence = buildSignalIntelligence(request.recommendation, request.bars);
  const report = buildCompositeReport({
    outcomes,
    recommendation: request.recommendation,
    intelligence,
  });

  const session: AnalysisSession = {
    id: createId(),
    instrumentId: request.instrument.id,
    instrumentName: request.instrument.name,
    trigger: request.trigger,
    createdAt: now().toISOString(),
    asOfDate: request.recommendation.asOfDate,
    seed,
    factorTagIds: variation.entries.map((entry) => entry.tagId),
    factorVariation: variation.entries,
    research,
    providers: outcomes,
    advice,
    report,
    messages: [
      {
        id: createId(),
        role: "user",
        content: messages.find((message) => message.role === "user")?.content ?? "",
        createdAt: now().toISOString(),
      },
      ...outcomes
        .filter((outcome) => outcome.status === "ok" && outcome.summary)
        .map((outcome) => ({
          id: createId(),
          role: "assistant" as const,
          providerId: outcome.providerId,
          content: outcome.summary ?? "",
          createdAt: now().toISOString(),
        })),
    ],
    priceAtAnalysis: request.recommendation.price,
    baseScore: request.recommendation.score,
  };

  return session;
}

export interface RunIntelligentScanRequest {
  provider: MarketDataProvider;
  instrumentIds: string[];
  llmProviders: LlmProviderConfig[];
  llm: LlmClient;
  researchProvider: WebResearchProvider;
  researchApiKey?: string;
  factorConfig: FactorConfig;
  factorTags: FactorTag[];
  listInstruments: () => Promise<Instrument[]>;
  listMemory: (instrumentId: string) => Promise<AnalysisSession[]>;
  seed?: number;
  trigger: AnalysisTrigger;
  now?: () => Date;
  createId?: () => string;
}

/**
 * 定时/手动智能扫描：对每个参与标的拉取日线 → 基础推荐 → 记忆 → 分析。
 * 单个标的分析失败记录到 `errors`，不影响其他标的。
 */
export async function runIntelligentScan(
  request: RunIntelligentScanRequest,
): Promise<{ sessions: AnalysisSession[]; errors: string[] }> {
  const catalog = await request.listInstruments();
  const wanted = new Set(request.instrumentIds);
  const sessions: AnalysisSession[] = [];
  const errors: string[] = [];

  for (const instrument of catalog.filter((item) => wanted.has(item.id))) {
    try {
      const bars = await request.provider.getDailyBars(instrument.id, 60);
      if (bars.length < 21) continue;
      const recommendation = buildRecommendation(instrument, bars);
      const memory = await request.listMemory(instrument.id);
      const session = await runAnalysis({
        instrument,
        bars,
        recommendation,
        providers: request.llmProviders,
        llm: request.llm,
        researchProvider: request.researchProvider,
        researchApiKey: request.researchApiKey,
        factorConfig: request.factorConfig,
        factorTags: request.factorTags,
        seed: request.seed,
        trigger: request.trigger,
        memory,
        now: request.now,
        createId: request.createId,
      });
      sessions.push(session);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      errors.push(`${instrument.id}: ${message}`);
    }
  }

  return { sessions, errors };
}
