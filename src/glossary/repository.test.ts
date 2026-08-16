import { describe, expect, it } from "vitest";
import { BUILTIN_GLOSSARY } from "./catalog";
import {
  createHttpGlossarySource,
  LocalGlossaryRepository,
  updateGlossary,
  type RemoteGlossarySource,
  type StorageAdapter,
} from "./repository";
import type { GlossaryTerm } from "./types";

function memoryStorage(): StorageAdapter & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function repository(storage = memoryStorage()) {
  return new LocalGlossaryRepository(storage, BUILTIN_GLOSSARY);
}

const webTerm: GlossaryTerm = {
  id: "web-only",
  term: "新词条",
  category: "智能分析",
  summary: "网络更新词条",
  detail: "来自远程源的详细解释。",
};

const updatedBuiltin: GlossaryTerm = {
  ...BUILTIN_GLOSSARY[0],
  summary: "更新后的定义",
};

describe("LocalGlossaryRepository", () => {
  it("serves builtin terms when nothing is stored", async () => {
    const store = repository();
    const terms = await store.getTerms();
    expect(terms.length).toBe(BUILTIN_GLOSSARY.length);
    expect(await store.getUpdatedAt()).toBeNull();
  });

  it("merges web terms: adds new ids, overwrites same ids", async () => {
    const store = repository();
    await store.merge([webTerm, updatedBuiltin], "2026-08-20T00:00:00.000Z");
    const terms = await store.getTerms();
    const byId = new Map(terms.map((term) => [term.id, term]));
    expect(byId.get("web-only")?.term).toBe("新词条");
    expect(byId.get("web-only")?.source).toBe("web");
    expect(byId.get(BUILTIN_GLOSSARY[0].id)?.summary).toBe("更新后的定义");
    expect(await store.getUpdatedAt()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("persists across instances and survives corrupted documents", async () => {
    const storage = memoryStorage();
    const store = repository(storage);
    await store.merge([webTerm], "2026-08-20T00:00:00.000Z");

    storage.values.set("quantsift.glossary.v1", "{broken");
    const reloaded = repository(storage);
    expect(await reloaded.getTerms()).toHaveLength(BUILTIN_GLOSSARY.length);
  });
});

describe("updateGlossary", () => {
  it("fetches, merges and reports the update", async () => {
    const store = repository();
    const source: RemoteGlossarySource = {
      fetch: () => Promise.resolve([webTerm]),
    };
    const result = await updateGlossary({
      store,
      source,
      now: () => new Date("2026-08-20T00:00:00.000Z"),
    });
    expect(result).toEqual({
      count: 1,
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(await store.getUpdatedAt()).toBe("2026-08-20T00:00:00.000Z");
  });

  it("propagates source failures", async () => {
    const store = repository();
    const source: RemoteGlossarySource = {
      fetch: () => Promise.reject(new Error("网络不可用")),
    };
    await expect(
      updateGlossary({ store, source }),
    ).rejects.toThrow("网络不可用");
    expect(await store.getUpdatedAt()).toBeNull();
  });
});

describe("createHttpGlossarySource", () => {
  it("parses a valid remote array", async () => {
    const source = createHttpGlossarySource("https://example.invalid/glossary.json");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([webTerm]), { status: 200 })) as typeof fetch;
    try {
      const terms = await source.fetch();
      expect(terms).toHaveLength(1);
      expect(terms[0].term).toBe("新词条");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects invalid payloads", async () => {
    const source = createHttpGlossarySource("https://example.invalid/glossary.json");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ not: "array" }), { status: 200 })) as typeof fetch;
    try {
      await expect(source.fetch()).rejects.toThrow(/格式/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
