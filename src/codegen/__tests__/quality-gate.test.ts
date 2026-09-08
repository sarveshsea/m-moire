import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodeGenerator } from "../generator.js";
import { ComponentSpecSchema } from "../../specs/types.js";
import type { ComponentSpec } from "../../specs/types.js";
import type { Registry, DesignToken } from "../../engine/registry.js";

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

function makeCtx(tokens: DesignToken[] = []) {
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
      tokens,
      components: [],
      styles: [],
      lastPulledAt: null,
      lastSync: new Date(0).toISOString(),
    },
  };
}

// primary-foreground/primary-background share the "primary" base name after
// stripping foreground/background per auditTokenContrast's pairing convention
// — near-identical values guarantee a real contrast failure.
const CONTRAST_FAILING_TOKENS: DesignToken[] = [
  { name: "primary-foreground", collection: "colors", type: "color", values: { Light: "#FFFFFF" }, cssVariable: "--primary-foreground" },
  { name: "primary-background", collection: "colors", type: "color", values: { Light: "#FEFEFE" }, cssVariable: "--primary-background" },
];

describe("CodeGenerator quality gate", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "memoire-quality-gate-test-"));
    configureExecutionPolicy({ projectRoot: outDir, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  });

  afterEach(async () => {
  resetExecutionPolicyForTests();
    await rm(outDir, { recursive: true, force: true });
  });

  it("blocks the write when a critical token-pair-contrast finding exists", async () => {
    const recordGeneration = vi.fn(async () => {});
    const registry = {
      getGenerationState: () => undefined,
      recordGeneration,
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    const result = await gen.generate(makeSpec(), makeCtx(CONTRAST_FAILING_TOKENS));

    expect(result.blocked).toBe(true);
    expect(result.findings.some((f) => f.rule === "token-pair-contrast" && f.severity === "critical")).toBe(true);
    expect(recordGeneration).not.toHaveBeenCalled();

    const written = await readdir(outDir).catch(() => []);
    expect(written).toHaveLength(0);
  });

  it("writes anyway when force:true is passed despite a critical finding", async () => {
    const recordGeneration = vi.fn(async () => {});
    const registry = {
      getGenerationState: () => undefined,
      recordGeneration,
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    const result = await gen.generate(makeSpec(), makeCtx(CONTRAST_FAILING_TOKENS), { force: true });

    expect(result.blocked).toBe(false);
    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(recordGeneration).toHaveBeenCalledOnce();

    const written = await readdir(join(outDir, "components", "ui", "Button")).catch(() => []);
    expect(written.length).toBeGreaterThan(0);
  });

  it("does not block when the design system has no contrast-failing token pairs", async () => {
    const registry = {
      getGenerationState: () => undefined,
      recordGeneration: async () => {},
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    const result = await gen.generate(makeSpec(), makeCtx([]));

    expect(result.blocked).toBe(false);
    expect(result.findings.filter((f) => f.severity === "critical")).toHaveLength(0);
  });

  it("returns structurally-present findings/blocked for a normal (non-cache-hit) generation", async () => {
    const registry = {
      getGenerationState: () => ({
        specName: "Button",
        generatedAt: new Date().toISOString(),
        files: ["components/ui/Button/Button.tsx"],
        specHash: "will-not-match-anyway",
      }),
      recordGeneration: async () => {},
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    // specHash won't match (real hash differs), so this exercises the normal
    // generation path, not the cache-hit branch directly — the cache-hit
    // branch itself is already covered by variant-emission.test.ts; this
    // confirms non-cache-hit results are still structurally well-formed.
    const result = await gen.generate(makeSpec(), makeCtx([]));
    expect(result.findings).toBeInstanceOf(Array);
    expect(typeof result.blocked).toBe("boolean");
  });

  it("preview() computes findings but never writes files or calls recordGeneration", async () => {
    const recordGeneration = vi.fn(async () => {});
    const registry = {
      getGenerationState: () => undefined,
      recordGeneration,
    } as unknown as Registry;

    const gen = new CodeGenerator({ outputDir: outDir, registry });
    const result = await gen.preview(makeSpec(), makeCtx(CONTRAST_FAILING_TOKENS));

    expect(result.findings.some((f) => f.severity === "critical")).toBe(true);
    expect(result.blocked).toBe(false);
    expect(recordGeneration).not.toHaveBeenCalled();

    const written = await readdir(outDir).catch(() => []);
    expect(written).toHaveLength(0);
  });
});
