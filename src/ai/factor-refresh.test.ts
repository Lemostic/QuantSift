import { describe, expect, it } from "vitest";
import {
  buildFactorReviewPrompt,
  mergeFactorSuggestions,
  parseFactorSuggestions,
} from "./factor-catalog";
import { refreshFactorCatalogWithAI } from "./factor-refresh";
import { createRecordingLlmClient } from "./llm";
import { DEFAULT_FACTOR_TAGS, type LlmProviderConfig } from "./types";

function provider(id: string): LlmProviderConfig {
  return {
    id,
    label: id,
    baseUrl: "https://example.invalid/v1",
    apiKey: "test-key",
    model: "test",
    enabled: true,
    isDefault: false,
  };
}

describe("parseFactorSuggestions", () => {
  it("parses add lines with label and description", () => {
    const suggestions = parseFactorSuggestions(
      "新增: 汇率波动 | 人民币汇率对出口链的影响\n添加：解禁压力，大额解禁前后的抛压风险",
    );
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0]).toMatchObject({
      action: "add",
      label: "汇率波动",
      description: "人民币汇率对出口链的影响",
    });
    expect(suggestions[1].label).toBe("解禁压力");
  });

  it("ignores remove/keep lines and prose", () => {
    const suggestions = parseFactorSuggestions(
      "删除: 行业景气\n保留: 政策面\n下面是我的一些补充思考……",
    );
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ action: "remove", label: "行业景气" });
  });

  it("returns nothing for empty input", () => {
    expect(parseFactorSuggestions("")).toEqual([]);
  });
});

describe("mergeFactorSuggestions", () => {
  it("adds new factors incrementally and skips existing labels", () => {
    const result = mergeFactorSuggestions(DEFAULT_FACTOR_TAGS, [
      { action: "add", label: "汇率波动", description: "出口链影响" },
      { action: "add", label: "全球市场", description: "已存在" },
    ]);
    expect(result.added.map((tag) => tag.label)).toEqual(["汇率波动"]);
    expect(result.tags).toHaveLength(DEFAULT_FACTOR_TAGS.length + 1);
  });

  it("votes across models and ranks multi-vote factors first", () => {
    const result = mergeFactorSuggestions(
      DEFAULT_FACTOR_TAGS,
      [
        { action: "add", label: "解禁压力", description: "A" },
        { action: "add", label: "汇率波动", description: "B" },
        { action: "add", label: " 汇率波动 ", description: "C" },
      ],
      4,
    );
    expect(result.added[0].label).toBe("汇率波动");
    expect(result.added).toHaveLength(2);
  });

  it("respects the maxNew cap", () => {
    const result = mergeFactorSuggestions(
      DEFAULT_FACTOR_TAGS,
      [
        { action: "add", label: "因子一", description: "" },
        { action: "add", label: "因子二", description: "" },
        { action: "add", label: "因子三", description: "" },
      ],
      2,
    );
    expect(result.added).toHaveLength(2);
  });

  it("derives stable ids from labels", () => {
    const first = mergeFactorSuggestions(DEFAULT_FACTOR_TAGS, [
      { action: "add", label: "汇率波动", description: "" },
    ]);
    const second = mergeFactorSuggestions(DEFAULT_FACTOR_TAGS, [
      { action: "add", label: "汇率波动", description: "" },
    ]);
    expect(first.added[0].id).toBe(second.added[0].id);
    expect(first.added[0].id.startsWith("ai-")).toBe(true);
  });
});

describe("buildFactorReviewPrompt", () => {
  it("lists current factors with enabled state", () => {
    const prompt = buildFactorReviewPrompt(DEFAULT_FACTOR_TAGS, ["policy"]);
    expect(prompt).toContain("政策面");
    expect(prompt).toContain("已启用");
    expect(prompt).toContain("新增:");
  });
});

describe("refreshFactorCatalogWithAI", () => {
  it("merges suggestions from multiple models in parallel", async () => {
    const llm = createRecordingLlmClient({
      a: "新增: 汇率波动 | 出口链影响\n新增: 解禁压力 | 解禁抛压",
      b: "新增: 汇率波动 | 汇率对北向资金影响\n新增: 中报业绩 | 财报季预期差",
    });
    const result = await refreshFactorCatalogWithAI({
      providers: [provider("a"), provider("b")],
      llm,
      currentTags: DEFAULT_FACTOR_TAGS,
      enabledTagIds: [],
    });
    expect(result.added[0].label).toBe("汇率波动"); // 双模型投票
    expect(result.added.length).toBeGreaterThanOrEqual(3);
    expect(result.errors).toEqual([]);
    expect(result.tags.length).toBe(DEFAULT_FACTOR_TAGS.length + result.added.length);
  });

  it("isolates provider failures", async () => {
    const llm = createRecordingLlmClient({
      a: "新增: 汇率波动 | 出口链影响",
      // b 未配置 → 抛错
    });
    const result = await refreshFactorCatalogWithAI({
      providers: [provider("a"), provider("b")],
      llm,
      currentTags: DEFAULT_FACTOR_TAGS,
      enabledTagIds: [],
    });
    expect(result.added.map((tag) => tag.label)).toEqual(["汇率波动"]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("b");
  });

  it("throws when no providers are enabled", async () => {
    await expect(
      refreshFactorCatalogWithAI({
        providers: [],
        llm: createRecordingLlmClient({}),
        currentTags: DEFAULT_FACTOR_TAGS,
        enabledTagIds: [],
      }),
    ).rejects.toThrow("未启用");
  });
});
