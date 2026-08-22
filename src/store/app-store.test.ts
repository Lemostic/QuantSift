import { describe, expect, it } from "vitest";
import { migrateAppState } from "./app-store";

describe("app store migration", () => {
  it("adds live data defaults to state persisted before v6", () => {
    const migrated = migrateAppState({ theme: "dark" }, 5);

    expect(migrated).toMatchObject({
      marketDataSource: "auto",
      allowOfflineFallback: true,
    });
  });

  it("migrates the pre-v7 akshare source id to the auto chain", () => {
    const migrated = migrateAppState(
      { marketDataSource: "akshare", allowOfflineFallback: true },
      6,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "auto",
      allowOfflineFallback: true,
    });
  });

  it("preserves valid v7 data settings", () => {
    const migrated = migrateAppState(
      { marketDataSource: "recorded", allowOfflineFallback: false },
      7,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "recorded",
      allowOfflineFallback: false,
    });
  });

  it("repairs invalid persisted data settings", () => {
    const migrated = migrateAppState(
      { marketDataSource: "unknown", allowOfflineFallback: "yes" },
      7,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "auto",
      allowOfflineFallback: true,
    });
  });

  it("maps the legacy v9 eastmoney source to the auto chain (v10)", () => {
    const migrated = migrateAppState(
      { marketDataSource: "eastmoney", allowOfflineFallback: true },
      9,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "auto",
      allowOfflineFallback: true,
    });
  });

  it("preserves pinned live sources across the v10 migration", () => {
    for (const source of ["sina", "tencent", "recorded"]) {
      const migrated = migrateAppState(
        { marketDataSource: source, allowOfflineFallback: true },
        9,
      );
      expect(migrated).toMatchObject({ marketDataSource: source });
    }
  });

  it("adds v8 AI configuration defaults to pre-v8 state", () => {
    const migrated = migrateAppState(
      { marketDataSource: "eastmoney", allowOfflineFallback: true },
      7,
    ) as Record<string, unknown>;

    expect(migrated.aiProviders).toEqual([
      expect.objectContaining({
        id: "deepseek",
        enabled: false,
        isDefault: true,
      }),
    ]);
    expect(migrated.aiIntradaySchedule).toMatchObject({
      enabled: false,
      intervalMinutes: 15,
      startMinutes: 540,
      endMinutes: 900,
    });
    expect(migrated.aiFactorConfig).toMatchObject({
      randomness: 30,
      tags: expect.any(Array),
    });
    expect(migrated.aiFactorCatalog).toEqual([]);
  });
});
