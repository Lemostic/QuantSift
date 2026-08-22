import { describe, expect, it } from "vitest";
import { LocalInstrumentDirectory } from "./instrument-directory";
import type { Instrument } from "@/quant/types";

const stock: Instrument = {
  id: "CN:600519",
  symbol: "600519",
  name: "贵州茅台",
  kind: "stock",
  exchange: "SSE",
  currency: "CNY",
};

const otcFund: Instrument = {
  id: "CN:017811",
  symbol: "017811",
  name: "东方人工智能主题混合C",
  kind: "fund",
  exchange: "OTC",
  currency: "CNY",
};

function memoryAdapter() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("LocalInstrumentDirectory", () => {
  it("merges instruments by id and persists across instances", () => {
    const adapter = memoryAdapter();
    const first = new LocalInstrumentDirectory(adapter);
    first.merge([stock, otcFund]);
    expect(first.list()).toHaveLength(2);

    const second = new LocalInstrumentDirectory(adapter);
    expect(second.lookup("CN:017811")?.name).toBe("东方人工智能主题混合C");
    // 重复合并不产生重复项。
    second.merge([stock]);
    expect(second.list()).toHaveLength(2);
  });

  it("mergedWith keeps catalog first and appends extras", () => {
    const directory = new LocalInstrumentDirectory(memoryAdapter());
    directory.merge([otcFund]);
    const merged = directory.mergedWith([stock]);
    expect(merged.map((item) => item.id)).toEqual(["CN:600519", "CN:017811"]);
    // 目录中已有 catalog 标的时不重复。
    directory.merge([stock]);
    expect(directory.mergedWith([stock])).toHaveLength(2);
  });

  it("falls back to an empty directory on corrupt data", () => {
    const adapter = memoryAdapter();
    adapter.setItem("quantsift.instrument-directory.v1", "{broken");
    const directory = new LocalInstrumentDirectory(adapter);
    expect(directory.list()).toEqual([]);
  });

  it("supports clear", () => {
    const directory = new LocalInstrumentDirectory(memoryAdapter());
    directory.merge([stock]);
    directory.clear();
    expect(directory.list()).toEqual([]);
  });
});
