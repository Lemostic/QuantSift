import type { GlossaryTerm } from "./types";

export interface TermMatch {
  start: number;
  end: number;
  term: GlossaryTerm;
  /** 命中的词面（term 或别名）。 */
  matchedText: string;
}

/**
 * 在文本中标记已知术语：按词长降序构造正则（保证同位置最长匹配优先），
 * 全局非重叠扫描。中英文混合文本均可，最小匹配长度为 2。
 */
export function findTermMatches(
  text: string,
  terms: GlossaryTerm[],
): TermMatch[] {
  if (text.length < 2 || terms.length === 0) return [];

  const keys: Array<{ key: string; term: GlossaryTerm }> = [];
  for (const term of terms) {
    if (term.term.length >= 2) keys.push({ key: term.term, term });
    for (const alias of term.aliases ?? []) {
      if (alias.length >= 2) keys.push({ key: alias, term });
    }
  }
  // 长度降序 → 正则交替按“最长优先”尝试；相同长度保持稳定顺序。
  keys.sort((a, b) => b.key.length - a.key.length);
  const pattern = new RegExp(
    keys.map((entry) => escapeRegExp(entry.key)).join("|"),
    "g",
  );

  const matches: TermMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    const key = match[0];
    const entry = keys.find((candidate) => candidate.key === key);
    if (!entry) continue;
    matches.push({
      start: index,
      end: index + key.length,
      term: entry.term,
      matchedText: key,
    });
  }
  return matches;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
