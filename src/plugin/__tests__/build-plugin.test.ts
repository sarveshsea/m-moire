import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPluginBundle } from "../../../scripts/build-plugin.mjs";

describe("plugin build pipeline", () => {
  it("emits plugin code.js and ui.html", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "memoire-plugin-test-"));
    const pluginDir = join(tempDir, "plugin");

    try {
      const result = await buildPluginBundle({ rootDir: process.cwd(), outDir: pluginDir });

      const code = await readFile(result.codePath, "utf8");
      const html = await readFile(result.htmlPath, "utf8");
      const meta = await readFile(result.metaPath, "utf8");

      expect(code).toContain("figma.showUI");
      expect(html).toContain("Operator Console");
      expect(html).toContain("<script>");
      expect(html).toContain("Jobs");
      expect(html).toContain("Selection");
      expect(html).toContain("System");
      expect(html).not.toContain('src="/assets/');
      expect(html).not.toContain('href="/assets/');
      expect(meta).toContain('"widgetVersion": "2"');
      expect(meta).toContain('"packageVersion": "0.2.1"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
