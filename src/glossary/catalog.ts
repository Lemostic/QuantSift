import glossaryJson from "../../docs/glossary.json";
import type { GlossaryTerm } from "./types";

/**
 * 内置术语手册：覆盖 A 股/公募基金研究与量化回测的高频专有名词。
 *
 * 词条以“便于小白理解”为准，与界面文案保持同一措辞以便自动匹配。
 * 数据来自 `docs/glossary.json`（同一文件也是“更新手册”功能的远程源）。
 */
export const BUILTIN_GLOSSARY: GlossaryTerm[] = glossaryJson as GlossaryTerm[];
