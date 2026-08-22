import { describe, expect, it } from "vitest";
import {
  LocalWatchlistRepository,
  WatchlistDuplicateError,
  type StorageAdapter,
} from "./repository";

class MemoryStorage implements StorageAdapter {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("LocalWatchlistRepository", () => {
  it("seeds only a missing watchlist and preserves an intentionally empty one", async () => {
    const storage = new MemoryStorage();
    const repository = new LocalWatchlistRepository(storage);

    await repository.seedIfMissing(["CN:510300", "CN:600519"]);
    expect((await repository.list()).map((entry) => entry.instrumentId)).toEqual([
      "CN:510300",
      "CN:600519",
    ]);

    await repository.remove("CN:510300");
    await repository.remove("CN:600519");
    await repository.seedIfMissing(["CN:159915"]);
    expect(await repository.list()).toEqual([]);
  });

  it("prevents duplicates and persists note and tag updates", async () => {
    const repository = new LocalWatchlistRepository(new MemoryStorage());

    await repository.add("CN:510300");
    await expect(repository.add("CN:510300")).rejects.toBeInstanceOf(
      WatchlistDuplicateError,
    );

    await repository.update("CN:510300", {
      note: "等待回踩 20 日均线",
      tags: ["核心", "指数"],
    });

    expect(await repository.list()).toMatchObject([
      {
        instrumentId: "CN:510300",
        note: "等待回踩 20 日均线",
        tags: ["核心", "指数"],
        enabled: true,
      },
    ]);
  });

  it("applies a default migration once without re-adding a later removal", async () => {
    const repository = new LocalWatchlistRepository(new MemoryStorage());

    await repository.seedIfMissing(["CN:510300"]);
    await repository.applyMigration("add-012734", ["CN:012734"]);
    expect((await repository.list()).map((entry) => entry.instrumentId)).toEqual([
      "CN:510300",
      "CN:012734",
    ]);

    await repository.remove("CN:012734");
    await repository.applyMigration("add-012734", ["CN:012734"]);
    expect((await repository.list()).map((entry) => entry.instrumentId)).toEqual([
      "CN:510300",
    ]);
  });

  it("defaults autoAnalyze to false and persists its updates", async () => {
    const repository = new LocalWatchlistRepository(new MemoryStorage());

    await repository.add("CN:510300");
    expect((await repository.list())[0].autoAnalyze).toBe(false);

    await repository.update("CN:510300", { autoAnalyze: true });
    expect((await repository.list())[0].autoAnalyze).toBe(true);
  });

  it("cleans built-in sample seeds once and keeps real entries", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "quantsift.watchlist.v1",
      JSON.stringify({
        version: 3,
        appliedMigrations: [],
        entries: [
          // 内置种子（带"示例"标记）与早期迁移条目应被清理。
          {
            instrumentId: "CN:510300",
            note: "",
            tags: ["示例"],
            enabled: true,
            autoAnalyze: false,
            addedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            instrumentId: "CN:012734",
            note: "人工智能主题基金，等待回踩确认",
            tags: ["重点监控", "AI主题"],
            enabled: true,
            autoAnalyze: false,
            addedAt: "2026-01-01T00:00:00.000Z",
          },
          // 用户真实添加的标的不受影响。
          {
            instrumentId: "CN:017811",
            note: "真实持仓研究",
            tags: [],
            enabled: true,
            autoAnalyze: true,
            addedAt: "2026-08-20T10:00:00.000Z",
          },
        ],
      }),
    );
    const repository = new LocalWatchlistRepository(storage);

    await repository.applyBuiltinCleanup();
    expect((await repository.list()).map((entry) => entry.instrumentId)).toEqual([
      "CN:017811",
    ]);

    // 只执行一次：再次调用不会误删用户后添加的相同代码。
    await repository.add("CN:600519");
    await repository.applyBuiltinCleanup();
    expect((await repository.list()).map((entry) => entry.instrumentId)).toEqual([
      "CN:017811",
      "CN:600519",
    ]);
  });

  it("hydrates pre-v3 documents with autoAnalyze false", async () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "quantsift.watchlist.v1",
      JSON.stringify({
        version: 2,
        entries: [
          {
            instrumentId: "CN:600519",
            note: "旧数据",
            tags: [],
            enabled: true,
            addedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        appliedMigrations: [],
      }),
    );
    const repository = new LocalWatchlistRepository(storage);

    expect(await repository.list()).toMatchObject([
      {
        instrumentId: "CN:600519",
        autoAnalyze: false,
        enabled: true,
      },
    ]);
  });
});

