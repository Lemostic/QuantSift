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
});

