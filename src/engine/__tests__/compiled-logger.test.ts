import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { describe, expect, it } from "vitest";

describe("compiled logger transport", () => {
  it.each([
    ["file:///B:/~BUN/root/memi.exe", false],
    ["file:///B:/%7EBUN/root/probe.exe", false],
    ["file:///b:/%7ebun/root/probe.exe", false],
    ["file:///$bunfs/root/memi", false],
    ["file:///project/~BUN/src/engine/logger.ts", true],
  ])("selects the appropriate transport for module URL %s", (moduleUrl, expected) => {
    // Execute actual source with controlled module metadata; do not start a
    // worker transport or imply that this simulates a native Windows process.
    const built = buildSync({
      entryPoints: [resolve("src/engine/logger.ts")],
      bundle: true, platform: "node", format: "cjs", write: false,
      external: ["pino"],
      define: { "import.meta.url": JSON.stringify(moduleUrl) },
    });
    const module = { exports: {} as { shouldUsePrettyTransport(): boolean } };
    runInNewContext(built.outputFiles[0].text, {
      module, exports: module.exports, require: createRequire(import.meta.url),
      process: { argv: ["memi.exe", "diagnose"], env: {} },
    });
    expect(module.exports.shouldUsePrettyTransport()).toBe(expected);
  });
});
