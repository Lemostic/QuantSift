import type { FactorTag } from "./types";

/**
 * AI 因子目录评审：模型输出“新增/保留/删除”建议，应用层只做增量合并，
 * 保证权威性与可审计性（每次刷新只新增，不破坏现有配置）。
 */

export interface FactorSuggestion {
  action: "add" | "remove" | "keep";
  label: string;
  description: string;
}

/** 解析模型输出的因子建议行：`新增: 汇率波动 | 描述`。 */
export function parseFactorSuggestions(content: string): FactorSuggestion[] {
  const suggestions: FactorSuggestion[] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const addMatch = line.match(/^(?:新增|添加|建议新增|add)\s*[:：]\s*(.+)$/i);
    if (addMatch) {
      const [label, description = ""] = addMatch[1]
        .split(/\s*[|｜]\s*|\s*[,，]\s*/, 2)
        .map((part) => part.trim());
      if (label) {
        suggestions.push({ action: "add", label, description });
      }
      continue;
    }
    const removeMatch = line.match(/^(?:删除|移除|建议删除|remove)\s*[:：]\s*(.+)$/i);
    if (removeMatch) {
      const label = removeMatch[1].trim();
      if (label) suggestions.push({ action: "remove", label, description: "" });
    }
  }
  return suggestions;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, "");
}

function hashCode(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export interface FactorMergeResult {
  /** 合并后的完整因子目录（含原有与新增加）。 */
  tags: FactorTag[];
  /** 本次实际新增的因子。 */
  added: FactorTag[];
}

/**
 * 多模型建议合并（增量）：
 * - 仅接受 `add`；按规范化名称投票，票数高的优先；
 * - 已存在同名因子跳过；新增数量受 maxNew 上限；
 * - 因子 id 由名称稳定派生，便于跨会话复用。
 */
export function mergeFactorSuggestions(
  current: FactorTag[],
  suggestions: FactorSuggestion[],
  maxNew = 4,
): FactorMergeResult {
  const existingLabels = new Set(current.map((tag) => normalizeLabel(tag.label)));
  const votes = new Map<string, { label: string; description: string; count: number; firstSeen: number }>();
  let order = 0;
  for (const suggestion of suggestions) {
    if (suggestion.action !== "add") continue;
    const key = normalizeLabel(suggestion.label);
    if (existingLabels.has(key)) continue;
    const vote = votes.get(key);
    if (vote) {
      vote.count += 1;
      if (!vote.description && suggestion.description) {
        vote.description = suggestion.description;
      }
    } else {
      votes.set(key, {
        label: suggestion.label.trim(),
        description: suggestion.description.trim(),
        count: 1,
        firstSeen: order,
      });
      order += 1;
    }
  }

  const ranked = [...votes.values()].sort(
    (a, b) => b.count - a.count || a.firstSeen - b.firstSeen,
  );
  const added: FactorTag[] = ranked.slice(0, maxNew).map((vote) => ({
    id: `ai-${hashCode(vote.label)}`,
    label: vote.label,
    description: vote.description || "由 AI 因子评审新增",
  }));

  return { tags: [...current, ...added], added };
}

export function buildFactorReviewPrompt(
  current: FactorTag[],
  enabledTagIds: string[],
): string {
  const enabled = new Set(enabledTagIds);
  const list = current
    .map((tag) => `${tag.label}（${tag.description}${enabled.has(tag.id) ? "，已启用" : "，未启用"}）`)
    .join("\n");
  return `请评审以下量化研究的“随机因子”清单，并给出增量建议。

当前因子清单：
${list || "（空）"}

要求：
1. 结合当前 A 股市场、基金投资与量化研究的最新变化，建议 2-4 个值得新增的因子（如资金面、政策面、消息面之外的汇率、解禁、财报季、地缘、行业景气等视角）。
2. 输出格式，每行一条：
   新增: 因子名称 | 一句话说明该因子的关注点
3. 不要重复清单中已有的因子；只输出“新增:”行，不要解释。`;
}
