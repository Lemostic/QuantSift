import { describe, expect, it } from "vitest";
import {
  buildFactorVariation,
  defaultFactorConfig,
  ensureFactorTagSettings,
  mulberry32,
} from "./factors";
import { DEFAULT_FACTOR_TAGS, type FactorTag } from "./types";

describe("mulberry32", () => {
  it("is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    expect(seqA[0]).not.toBe(seqA[1]);
  });
});

describe("ensureFactorTagSettings", () => {
  it("appends missing tags as enabled without touching existing settings", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    config.tags[0].enabled = false;
    const extra: FactorTag[] = [
      {
        id: "ai_extra",
        label: "AI 新增因子",
        description: "由模型评审新增",
      },
      {
        id: "ai_extra2",
        label: "另一个新增",
        description: "测试",
      },
    ];
    const merged = ensureFactorTagSettings(config, [
      ...DEFAULT_FACTOR_TAGS,
      ...extra,
    ]);
    expect(merged.tags).toHaveLength(DEFAULT_FACTOR_TAGS.length + 2);
    // 已有设置保持原状（含已关闭的）。
    expect(
      merged.tags.find((setting) => setting.tagId === config.tags[0].tagId)
        ?.enabled,
    ).toBe(false);
    // 新因子默认启用。
    expect(
      merged.tags.find((setting) => setting.tagId === "ai_extra")?.enabled,
    ).toBe(true);
    expect(
      merged.tags.find((setting) => setting.tagId === "ai_extra2")?.enabled,
    ).toBe(true);
  });

  it("returns the same config when nothing is missing", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    const merged = ensureFactorTagSettings(config, DEFAULT_FACTOR_TAGS);
    expect(merged).toBe(config);
  });
});

describe("buildFactorVariation", () => {
  it("produces identical variation for the same seed and config", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    const a = buildFactorVariation(123, config, DEFAULT_FACTOR_TAGS);
    const b = buildFactorVariation(123, config, DEFAULT_FACTOR_TAGS);
    expect(a).toEqual(b);
  });

  it("produces different variation for different seeds", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    const a = buildFactorVariation(123, config, DEFAULT_FACTOR_TAGS);
    const b = buildFactorVariation(456, config, DEFAULT_FACTOR_TAGS);
    expect(a.entries).not.toEqual(b.entries);
  });

  it("never includes disabled tags", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    config.tags.forEach((setting) => {
      setting.enabled = setting.tagId === "policy";
    });
    const variation = buildFactorVariation(7, config, DEFAULT_FACTOR_TAGS);
    expect(variation.entries).toHaveLength(1);
    expect(variation.entries[0].tagId).toBe("policy");
  });

  it("respects the randomness strength", () => {
    const config = defaultFactorConfig(DEFAULT_FACTOR_TAGS);
    config.randomness = 0;
    const variation = buildFactorVariation(99, config, DEFAULT_FACTOR_TAGS);
    // randomness 0 → 无随机波动，强调度取最低档 40。
    expect(
      variation.entries.every((entry) => entry.emphasis === 40),
    ).toBe(true);
  });
});
