import type { LlmClient, LlmProviderConfig } from "./types";
import type { FactorTag } from "./types";
import {
  buildFactorReviewPrompt,
  mergeFactorSuggestions,
  parseFactorSuggestions,
  type FactorSuggestion,
} from "./factor-catalog";

const FACTOR_REVIEW_SYSTEM_PROMPT = `你是 QuantSift 的因子评审专家，负责维护量化研究中的“随机因子”目录。
随机因子是每次分析扫描时随机强调的市场观察视角（如全球市场、政策面、资金面等）。
请基于你对 A 股与公募基金市场的了解，给出增量、权威、可落地的因子建议。只输出“新增:”行。`;

export interface RefreshFactorCatalogRequest {
  /** 已启用（含密钥）的 AI 模型。 */
  providers: LlmProviderConfig[];
  llm: LlmClient;
  /** 当前完整因子目录（内置 + 历史 AI 新增）。 */
  currentTags: FactorTag[];
  /** 当前启用的因子 id。 */
  enabledTagIds: string[];
  /** 单次最多新增因子数。 */
  maxNew?: number;
}

export interface RefreshFactorCatalogResult {
  /** 合并后的完整目录。 */
  tags: FactorTag[];
  /** 本次新增的因子。 */
  added: FactorTag[];
  /** 各模型原始建议（审计用）。 */
  suggestions: FactorSuggestion[];
  /** 失败模型列表。 */
  errors: string[];
}

/**
 * 用所有启用的 AI 模型并行评审随机因子目录，多模型建议按票数合并后
 * 增量应用（每次刷新只新增，保证权威性与可审计性）。
 * 模型调用失败互不影响；无可用模型时直接报错。
 */
export async function refreshFactorCatalogWithAI(
  request: RefreshFactorCatalogRequest,
): Promise<RefreshFactorCatalogResult> {
  if (request.providers.length === 0) {
    throw new Error("未启用任何 AI 模型（含密钥），无法刷新因子目录");
  }

  const userPrompt = buildFactorReviewPrompt(
    request.currentTags,
    request.enabledTagIds,
  );
  const messages = [
    { role: "system" as const, content: FACTOR_REVIEW_SYSTEM_PROMPT },
    { role: "user" as const, content: userPrompt },
  ];

  const replies = await Promise.all(
    request.providers.map(async (provider) => {
      try {
        const content = await request.llm(provider, messages);
        return { providerId: provider.id, content, error: null as string | null };
      } catch (cause) {
        return {
          providerId: provider.id,
          content: "",
          error: cause instanceof Error ? cause.message : String(cause),
        };
      }
    }),
  );

  const suggestions: FactorSuggestion[] = [];
  const errors: string[] = [];
  for (const reply of replies) {
    if (reply.error) {
      errors.push(`${reply.providerId}: ${reply.error}`);
      continue;
    }
    suggestions.push(...parseFactorSuggestions(reply.content));
  }

  const merged = mergeFactorSuggestions(
    request.currentTags,
    suggestions,
    request.maxNew ?? 4,
  );

  return {
    tags: merged.tags,
    added: merged.added,
    suggestions,
    errors,
  };
}
