import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: { include: ["integration/security.pg.test.ts"], environment: "node",
    testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
