import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.js";

// Broader than the four-module Trust Core boundary suite. Include unimported
// source so a missing test cannot silently remove executable code from coverage.
export default mergeConfig(baseConfig, defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,js}"],
      exclude: [
        "**/__tests__/**",
        "**/*.d.ts",
        "**/fixtures/**",
        "**/generated/**",
        // Separate Figma plugin targets, also excluded by tsconfig.build.json.
        "src/plugin/main/**",
        "src/plugin/ui/**",
      ],
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "coverage/core",
      reportOnFailure: true,
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
}));
