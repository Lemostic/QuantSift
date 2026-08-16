import { describe, expect, it } from "vitest";
import { LLM_PROVIDER_PRESETS, presetById } from "./provider-presets";

describe("LLM_PROVIDER_PRESETS", () => {
  it("covers the mainstream OpenAI-compatible providers", () => {
    const ids = LLM_PROVIDER_PRESETS.map((preset) => preset.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "deepseek",
        "minimax-intl",
        "minimax-cn",
        "openai",
        "moonshot",
        "qwen",
        "zhipu",
        "custom",
      ]),
    );
  });

  it("keeps ids unique and preset fields well-formed", () => {
    const seen = new Set<string>();
    for (const preset of LLM_PROVIDER_PRESETS) {
      expect(seen.has(preset.id)).toBe(false);
      seen.add(preset.id);
      expect(preset.label.length).toBeGreaterThan(0);
      if (preset.id !== "custom") {
        expect(preset.baseUrl).toMatch(/^https:\/\/.+/);
        expect(preset.model.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves presets by id", () => {
    expect(presetById("deepseek")).toMatchObject({
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
    expect(presetById("minimax-cn")).toMatchObject({
      baseUrl: "https://api.minimax.chat/v1",
      model: "abab6.5s-chat",
    });
    expect(presetById("nope")).toBeUndefined();
  });
});
