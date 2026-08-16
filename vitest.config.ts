import path from "node:path";
import { defineConfig } from "vitest/config";

// Unit-test config. Playwright owns the `e2e/` specs; Vitest must not pick
// them up. The `@` alias mirrors vite.config.ts because vitest.config.ts
// takes precedence over it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});
