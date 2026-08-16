import { describe, expect, it } from "vitest";
import { migrateAppState } from "./app-store";

describe("app store migration", () => {
  it("adds live data defaults to state persisted before v6", () => {
    const migrated = migrateAppState({ theme: "dark" }, 5);

    expect(migrated).toMatchObject({
      marketDataSource: "eastmoney",
      allowOfflineFallback: true,
    });
  });

  it("migrates the pre-v7 akshare source id to eastmoney", () => {
    const migrated = migrateAppState(
      { marketDataSource: "akshare", allowOfflineFallback: true },
      6,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "eastmoney",
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
      marketDataSource: "eastmoney",
      allowOfflineFallback: true,
    });
  });
});
