import { defineConfig } from "vitest/config";

export default defineConfig({
  css: { postcss: {} },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    css: false,
  },
});
