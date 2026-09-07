import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Chạy riêng, luôn bắt buộc Postgres cô lập; npm test thường không nối DB.
export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    include: ["integration/lifecycle.pg.test.ts"], environment: "node",
    testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false,
  },
});
