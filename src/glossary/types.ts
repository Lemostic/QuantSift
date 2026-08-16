export type GlossaryCategory =
  | "行情交易"
  | "基金"
  | "技术指标"
  | "策略回测"
  | "智能分析";

export interface GlossaryTerm {
  id: string;
  /** 展示词条（匹配时优先使用）。 */
  term: string;
  /** 别名，也参与文本匹配（如 MA5 → 5 日均线）。 */
  aliases?: string[];
  category: GlossaryCategory;
  /** 一句话定义（tooltip 展示）。 */
  summary: string;
  /** 详细解释（手册面板展示）。 */
  detail: string;
  /** 来源标记：内置 / 网络更新。 */
  source?: "builtin" | "web";
  updatedAt?: string;
}

export interface GlossaryDocument {
  version: 1;
  updatedAt: string | null;
  terms: GlossaryTerm[];
}

export const GLOSSARY_CATEGORIES: GlossaryCategory[] = [
  "行情交易",
  "基金",
  "技术指标",
  "策略回测",
  "智能分析",
];
