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
      expect(code).not.toContain("??");
      expect(code).not.toContain("?.");
      expect(html).not.toContain("??");
      expect(html).not.toContain("?.");
      expect(hasRawObjectSpread(code)).toBe(false);
      expect(hasRawObjectSpread(html)).toBe(false);
      expect(meta).toContain('"widgetVersion": "2"');
      expect(meta).toContain('"packageVersion": "0.2.1"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});

function hasRawObjectSpread(source: string): boolean {
  const stack: string[] = [];
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      stack.pop();
      continue;
    }

    if (char === "." && source.slice(index, index + 3) === "...") {
      if (stack[stack.length - 1] === "{") {
        return true;
      }
    }
  }

  return false;
}
