import type {
  FactorConfig,
  FactorTag,
  FactorVariation,
  FactorVariationEntry,
} from "./types";

/** mulberry32 — 小而确定的伪随机数生成器。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function defaultFactorConfig(tags: FactorTag[]): FactorConfig {
  return {
    tags: tags.map((tag) => ({ tagId: tag.id, enabled: true })),
    randomness: 30,
  };
}

/**
 * 把目录中存在但配置数组中缺失的因子设置补齐（新因子默认启用）。
 * 用于 AI 增量新增因子后同步启用设置，以及修复历史存量数据；
 * 已存在的设置保持不变。
 */
export function ensureFactorTagSettings(
  config: FactorConfig,
  tags: FactorTag[],
): FactorConfig {
  const existing = new Set(config.tags.map((setting) => setting.tagId));
  const missing = tags
    .filter((tag) => !existing.has(tag.id))
    .map((tag) => ({ tagId: tag.id, enabled: true }));
  if (missing.length === 0) return config;
  return { ...config, tags: [...config.tags, ...missing] };
}

/**
 * 基于种子的随机因子变体：同一 seed + 同一配置 → 完全相同的变体；
 * 不同 seed → 不同变体；未启用的 tag 永不出现。
 *
 * 随机性只影响分析的“强调角度”，不改变确定性基础因子。
 */
export function buildFactorVariation(
  seed: number,
  config: FactorConfig,
  tags: FactorTag[],
): FactorVariation {
  const rng = mulberry32(seed);
  const strength = Math.max(0, Math.min(100, config.randomness)) / 100;
  const entries: FactorVariationEntry[] = [];
  for (const setting of config.tags) {
    if (!setting.enabled) continue;
    const tag = tags.find((candidate) => candidate.id === setting.tagId);
    if (!tag) continue;
    const emphasis = Math.max(
      10,
      Math.round(40 + rng() * 60 * strength),
    );
    const roll = rng();
    const direction =
      roll < 0.35 ? "positive" : roll < 0.7 ? "negative" : "neutral";
    entries.push({ tagId: tag.id, label: tag.label, emphasis, direction });
  }
  return { seed, entries };
}
