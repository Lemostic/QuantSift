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
  retries: 1,
  // 本机 Vite 冷编译较慢，放宽断言与用例超时。
  expect: { timeout: 15_000 },
  timeout: 90_000,
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
