import { describe, expect, it } from "vitest";
import { buildFactorVariation, defaultFactorConfig, mulberry32 } from "./factors";
import { DEFAULT_FACTOR_TAGS } from "./types";

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
