/**
 * Publisher round-trip test — builds a registry on disk and verifies
 * all expected files exist + registry.json is parseable.
 */

import { describe, expect, it } from "vitest";
import { readFile, rm, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { publishRegistry } from "../publisher.js";
import { parseRegistry } from "../schema.js";
import type { ComponentSpec } from "../../specs/types.js";
import type { DesignSystem } from "../../engine/registry.js";

function makeSpec(name: string): ComponentSpec {
  return {
    name,
    type: "component",
    level: "atom",
    purpose: `${name} test component`,
    researchBacking: [],
    designTokens: { source: "none", mapped: false },
    variants: ["default"],
    props: { label: "string" },
    shadcnBase: ["Button"],
    composesSpecs: [],
    codeConnect: { props: {}, mapped: false },
    accessibility: {
      role: "button",
      ariaLabel: "optional",
      keyboardNav: true,
      focusStyle: "outline",
      focusWidth: "2px",
      touchTarget: "min-44",
      reducedMotion: false,
      liveRegion: "off",
      colorIndependent: true,
    },
    dataviz: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeDesignSystem(): DesignSystem {
  return {
    tokens: [
      { name: "primary", collection: "colors", type: "color", values: { default: "#0066ff" }, cssVariable: "--color-primary" },
      { name: "md", collection: "spacing", type: "spacing", values: { default: "16px" }, cssVariable: "--spacing-md" },
    ],
    components: [],
    styles: [],
    lastSync: new Date().toISOString(),
  };
}

describe("Registry publisher", () => {
  it("writes a complete registry package to disk", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "memoire-pub-"));
    try {
      const result = await publishRegistry({
        name: "@test/ds",
        version: "0.1.0",
        description: "Test design system",
        outDir,
        designSystem: makeDesignSystem(),
        specs: [makeSpec("Button"), makeSpec("Card")],
        memoireVersion: "0.11.0",
      });

      const files = result.filesWritten.map(f => f.replace(outDir, ""));
      expect(files.some(f => f.endsWith("registry.json"))).toBe(true);
      expect(files.some(f => f.endsWith("package.json"))).toBe(true);
      expect(files.some(f => f.endsWith("tokens.json"))).toBe(true);
      expect(files.some(f => f.endsWith("tokens.css"))).toBe(true);
      expect(files.some(f => f.endsWith("Button.json"))).toBe(true);
      expect(files.some(f => f.endsWith("Card.json"))).toBe(true);
      expect(files.some(f => f.endsWith("README.md"))).toBe(true);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("produces a parseable registry.json", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "memoire-pub-"));
    try {
      const result = await publishRegistry({
        name: "@test/ds",
        version: "0.1.0",
        outDir,
        designSystem: makeDesignSystem(),
        specs: [makeSpec("Button")],
        memoireVersion: "0.11.0",
        sourceFigmaUrl: "https://figma.com/design/abc",
      });

      const raw = await readFile(result.registryPath, "utf-8");
      const registry = parseRegistry(JSON.parse(raw));
      expect(registry.name).toBe("@test/ds");
      expect(registry.version).toBe("0.1.0");
      expect(registry.components).toHaveLength(1);
      expect(registry.components[0].name).toBe("Button");
      expect(registry.meta.sourceFigmaUrl).toBe("https://figma.com/design/abc");
      expect(registry.tokens?.format).toBe("w3c-dtcg");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("writes npm-ready README and marketplace package metadata", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "memoire-pub-"));
    try {
      await publishRegistry({
        name: "@test/ds",
        version: "0.1.0",
        description: "Test design system",
        outDir,
        designSystem: makeDesignSystem(),
        specs: [makeSpec("Button"), makeSpec("Card")],
        memoireVersion: "0.13.1",
        tags: ["saas", "conversion"],
      });

      const readme = await readFile(join(outDir, "README.md"), "utf-8");
      expect(readme).toContain("## Quickstart");
      expect(readme).toContain("npm install @test/ds");
      expect(readme).toContain("memi add Button --from @test/ds");
      expect(readme).toContain("memi add Button --from @test/ds --tokens");
      expect(readme).toContain("| Button | atom | react |");
      expect(readme).toContain(`@import "@test/ds/tokens/tokens.css";`);

      const pkg = JSON.parse(await readFile(join(outDir, "package.json"), "utf-8"));
      expect(pkg.keywords).toContain("shadcn-registry");
      expect(pkg.keywords).toContain("design-ci");
      expect(pkg.keywords).toContain("conversion");
      expect(pkg.memoire.marketplaceTags).toContain("saas");
      expect(pkg.memoire.marketplaceTags).toContain("button");
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it("handles zero components", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "memoire-pub-"));
    try {
      const result = await publishRegistry({
        name: "@test/tokens-only",
        version: "0.1.0",
        outDir,
        designSystem: makeDesignSystem(),
        specs: [],
        memoireVersion: "0.11.0",
      });
      const raw = await readFile(result.registryPath, "utf-8");
      const registry = parseRegistry(JSON.parse(raw));
      expect(registry.components).toHaveLength(0);
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});
