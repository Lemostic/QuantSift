import { describe, expect, it } from "vitest";
import type { AnalysisSession } from "./types";
import {
  filterSessionsByDimension,
  LocalAnalysisSessionRepository,
  type StorageAdapter,
} from "./session-repository";

function session(
  id: string,
  instrumentId: string,
  createdAt: string,
): AnalysisSession {
  return {
    id,
    instrumentId,
    instrumentName: "测试",
    trigger: "manual",
    createdAt,
    asOfDate: "2026-08-19",
    seed: 1,
    factorTagIds: ["policy"],
    factorVariation: [],
    research: [],
    providers: [],
    advice: { signal: "watch", confidence: 50, summary: "s" },
    report: null,
    messages: [],
    priceAtAnalysis: 10,
    baseScore: 60,
  };
}

function localStorageStore(): {
  store: LocalAnalysisSessionRepository;
  storage: Record<string, string>;
} {
  const storage: Record<string, string> = {};
  const adapter: StorageAdapter = {
    getItem: (key) => (key in storage ? storage[key] : null),
    setItem: (key, value) => {
      storage[key] = value;
    },
  };
  return {
    store: new LocalAnalysisSessionRepository(adapter),
    storage,
  };
}

describe("LocalAnalysisSessionRepository", () => {
  it("round-trips sessions newest first", async () => {
    const { store } = localStorageStore();
    await store.save(session("a", "CN:1", "2026-08-18T09:00:00+08:00"));
    await store.save(session("b", "CN:1", "2026-08-19T09:00:00+08:00"));
    const list = await store.list();
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("lists by instrument", async () => {
    const { store } = localStorageStore();
    await store.save(session("a", "CN:1", "2026-08-18T09:00:00+08:00"));
    await store.save(session("b", "CN:2", "2026-08-19T09:00:00+08:00"));
    const byInstrument = await store.listByInstrument("CN:1");
    expect(byInstrument.map((s) => s.id)).toEqual(["a"]);
  });

  it("deduplicates by id and caps the history", async () => {
    const { store } = localStorageStore();
    await store.save(session("a", "CN:1", "2026-08-18T09:00:00+08:00"));
    await store.save(session("a", "CN:1", "2026-08-19T09:00:00+08:00"));
    expect(await store.list()).toHaveLength(1);
  });

  it("repairs corrupted documents to an empty store", async () => {
    const { store, storage } = localStorageStore();
    storage["quantsift.analysis-sessions.v1"] = "{broken";
    expect(await store.list()).toEqual([]);
    await store.save(session("a", "CN:1", "2026-08-19T09:00:00+08:00"));
    expect(await store.list()).toHaveLength(1);
  });

  it("clears everything", async () => {
    const { store } = localStorageStore();
    await store.save(session("a", "CN:1", "2026-08-19T09:00:00+08:00"));
    await store.clear();
    expect(await store.list()).toEqual([]);
  });
});

describe("filterSessionsByDimension", () => {
  const now = new Date(2026, 7, 19, 15, 0, 0); // 周三
  const sessions = [
    session("today", "CN:1", "2026-08-19T10:00:00+08:00"),
    session("thisWeek", "CN:1", "2026-08-17T10:00:00+08:00"), // 周一
    session("lastWeek", "CN:1", "2026-08-12T10:00:00+08:00"), // 上周三
    session("thisMonth", "CN:1", "2026-08-03T10:00:00+08:00"), // 本月
    session("old", "CN:1", "2026-07-20T10:00:00+08:00"),
  ];

  it("filters by today / week / month / all", () => {
    expect(
      filterSessionsByDimension(sessions, "today", now).map((s) => s.id),
    ).toEqual(["today"]);
    expect(
      filterSessionsByDimension(sessions, "week", now).map((s) => s.id),
    ).toEqual(["today", "thisWeek"]);
    expect(
      filterSessionsByDimension(sessions, "month", now).map((s) => s.id),
    ).toEqual(["today", "thisWeek", "lastWeek", "thisMonth"]);
    expect(filterSessionsByDimension(sessions, "all", now)).toHaveLength(5);
  });
});
