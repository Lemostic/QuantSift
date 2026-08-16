import { defineConfig } from "@playwright/test";

/**
 * Browser verification for QuantSift. The dev server serves the SPA; pages
 * degrade to the recorded-fixture data source when the Tauri bridge is
 * absent, so UI behavior stays verifiable without a Rust process.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
