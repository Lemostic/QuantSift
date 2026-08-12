import { describe, expect, it } from "vitest";
import { migrateAppState } from "./app-store";

describe("app store migration", () => {
  it("adds live data defaults to state persisted before v6", () => {
    const migrated = migrateAppState({ theme: "dark" }, 5);

    expect(migrated).toMatchObject({
      marketDataSource: "akshare",
      allowOfflineFallback: true,
    });
  });

  it("preserves valid v6 data settings", () => {
    const migrated = migrateAppState(
      { marketDataSource: "recorded", allowOfflineFallback: false },
      6,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "recorded",
      allowOfflineFallback: false,
    });
  });

  it("repairs invalid persisted data settings", () => {
    const migrated = migrateAppState(
      { marketDataSource: "unknown", allowOfflineFallback: "yes" },
      6,
    );

    expect(migrated).toMatchObject({
      marketDataSource: "akshare",
      allowOfflineFallback: true,
    });
  });
});
