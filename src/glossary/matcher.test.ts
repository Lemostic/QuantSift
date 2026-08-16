import { describe, expect, it } from "vitest";
import { findTermMatches } from "./matcher";
import { BUILTIN_GLOSSARY } from "./catalog";

describe("findTermMatches", () => {
  it("matches a simple term inside a sentence", () => {
    const matches = findTermMatches("止损线是风控核心", BUILTIN_GLOSSARY);
    expect(matches.map((match) => match.matchedText)).toEqual(["止损线"]);
    expect(matches[0].start).toBe(0);
    expect(matches[0].end).toBe(3);
  });

  it("matches aliases too", () => {
    const matches = findTermMatches("查看前复权价格", BUILTIN_GLOSSARY);
    expect(matches.map((match) => match.matchedText)).toEqual(["前复权"]);
  });

  it("prefers the longest match at the same position", () => {
    // “最大回撤” 应整体命中，而不是先命中其中的“回撤”…“回撤”非独立词条，
    // 改用可验证案例：同一位置 “MA20” 不会被 “MA” 截胡（“MA”不是词条，
    // 用“市盈率” vs “PE市盈率”别名验证）。
    const matches = findTermMatches("PE市盈率 12 倍", BUILTIN_GLOSSARY);
    expect(matches.map((match) => match.matchedText)).toEqual(["PE市盈率"]);
  });

  it("finds multiple non-overlapping matches", () => {
    const matches = findTermMatches(
      "涨停后次日换手率放大",
      BUILTIN_GLOSSARY,
    );
    const texts = matches.map((match) => match.matchedText);
    expect(texts).toContain("涨停");
    expect(texts).toContain("换手率");
  });

  it("returns nothing for text without terms", () => {
    expect(findTermMatches("普通的句子", BUILTIN_GLOSSARY)).toEqual([]);
  });

  it("does not crash on empty input", () => {
    expect(findTermMatches("", BUILTIN_GLOSSARY)).toEqual([]);
    expect(findTermMatches("你好", [])).toEqual([]);
  });
});
