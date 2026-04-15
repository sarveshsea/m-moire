import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodeGenerator } from "../generator.js";
import { ComponentSpecSchema } from "../../specs/types.js";
import type { ComponentSpec } from "../../specs/types.js";
import type { Registry } from "../../engine/registry.js";

function makeSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return ComponentSpecSchema.parse({
    name: "Button",
    type: "component",
    level: "atom",
    purpose: "Primary action",
    props: { children: "React.ReactNode" },
    ...overrides,
  });
}

function makeCtx() {
  return {
    project: {
      framework: "vite" as const,
      language: "typescript" as const,
      styling: { tailwind: true, cssModules: false, styledComponents: false },
      shadcn: { installed: true, components: [], config: {} },
      designTokens: { source: "none" as const, tokenCount: 0 },
      paths: { components: "src/components" },
      detectedAt: new Date().toISOString(),
    },
    designSystem: {
      tokens: [],
      components: [],
      styles: [],
      lastPulledAt: null,
      lastSync: new Date(0).toISOString(),
    },
  };
}

const fakeRegistry = {
  getGenerationState: () => undefined,
  recordGeneration: async () => {},
} as unknown as Registry;

describe("CodeGenerator variant emission", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "memoire-variant-test-"));
  });

  afterEach(async () => {
    await rm(outDir, { recursive: true, force: true });
  });

  it("emits one file per variant plus manifest and grid when variantAxes is declared", async () => {
    const spec = makeSpec({
      variantAxes: { size: ["sm", "lg"], tone: ["neutral", "brand"] },
    });
    const gen = new CodeGenerator({ outputDir: outDir, registry: fakeRegistry });
    const result = await gen.generate(spec, makeCtx());

    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain("components/ui/Button/variants/sm-brand.tsx");
    expect(paths).toContain("components/ui/Button/variants/sm-neutral.tsx");
    expect(paths).toContain("components/ui/Button/variants/lg-brand.tsx");
    expect(paths).toContain("components/ui/Button/variants/lg-neutral.tsx");
    expect(paths).toContain("components/ui/Button/variants/manifest.json");
    expect(paths).toContain("components/ui/Button/variants/index.html");
    expect(paths).toContain("components/ui/Button/index.ts");
    expect(paths).toContain("components/ui/Button/Button.stories.tsx");

    // Manifest describes the cartesian set
    const manifestContent = await readFile(join(outDir, "components/ui/Button/variants/manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestContent);
    expect(manifest.component).toBe("Button");
    expect(manifest.axes).toEqual(["size", "tone"]);
    expect(manifest.variants).toHaveLength(4);

    // Barrel re-exports every variant
    const barrel = await readFile(join(outDir, "components/ui/Button/index.ts"), "utf-8");
    expect(barrel).toContain("SmBrand");
    expect(barrel).toContain("LgNeutral");
    expect(barrel).toContain('export { Button }');
  });

  it("emits Storybook stories — one per variant — when stories are enabled", async () => {
    const spec = makeSpec({ variantAxes: { size: ["sm", "lg"] } });
    const gen = new CodeGenerator({ outputDir: outDir, registry: fakeRegistry });
    await gen.generate(spec, makeCtx());

    const story = await readFile(join(outDir, "components/ui/Button/Button.stories.tsx"), "utf-8");
    expect(story).toContain("export const Sm");
    expect(story).toContain("export const Lg");
  });

  it("skips stories when noStories is set", async () => {
    const spec = makeSpec({ variantAxes: { size: ["sm", "lg"] } });
    const gen = new CodeGenerator({ outputDir: outDir, registry: fakeRegistry, noStories: true });
    await gen.generate(spec, makeCtx());
    const written = await readdir(join(outDir, "components/ui/Button"));
    expect(written.find((f) => f.endsWith(".stories.tsx"))).toBeUndefined();
  });

  it("applies variantConstraints.forbid to prune combos before emission", async () => {
    const spec = makeSpec({
      variantAxes: { size: ["sm", "md", "lg"], tone: ["neutral", "brand"] },
      variantConstraints: { forbid: [{ size: "sm", tone: "brand" }] },
    });
    const gen = new CodeGenerator({ outputDir: outDir, registry: fakeRegistry });
    await gen.generate(spec, makeCtx());

    const manifest = JSON.parse(
      await readFile(join(outDir, "components/ui/Button/variants/manifest.json"), "utf-8"),
    );
    expect(manifest.variants).toHaveLength(5);
    expect(manifest.variants.find((v: { id: string }) => v.id === "sm-brand")).toBeUndefined();
  });

  it("falls back to single-file emission when variantAxes is empty", async () => {
    const spec = makeSpec({ variantAxes: {} });
    const gen = new CodeGenerator({ outputDir: outDir, registry: fakeRegistry });
    const result = await gen.generate(spec, makeCtx());

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain("components/ui/Button/Button.tsx");
    expect(paths).not.toContain("components/ui/Button/variants/manifest.json");
  });

  it("unchanged spec → no variant regeneration on second call (cache hit)", async () => {
    const spec = makeSpec({ variantAxes: { size: ["sm", "md"] } });
    const seenHashes: string[] = [];
    const registry = {
      getGenerationState: (name: string) => {
        const h = seenHashes[seenHashes.length - 1];
        return h ? { specName: name, generatedAt: "", files: [], specHash: h } : undefined;
      },
      recordGeneration: async (state: { specHash: string }) => {
        seenHashes.push(state.specHash);
      },
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    const first = await gen.generate(spec, makeCtx());
    expect(first.files.length).toBeGreaterThan(0);

    const second = await gen.generate(spec, makeCtx());
    // cache hit returns stubbed files with empty content
    expect(second.files.every((f) => f.content === "")).toBe(true);
  });
});
