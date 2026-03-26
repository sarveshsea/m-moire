import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Registry } from "../registry.js";
import type { ComponentSpec, PageSpec } from "../../specs/types.js";

let testDir: string;
let arkDir: string;
let registry: Registry;

beforeEach(async () => {
  testDir = join(tmpdir(), `memoire-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  arkDir = join(testDir, ".memoire");
  await mkdir(arkDir, { recursive: true });
  registry = new Registry(arkDir);
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

function makeComponentSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    name: "TestCard",
    type: "component",
    level: "atom",
    purpose: "A test card component",
    researchBacking: [],
    designTokens: { source: "none", mapped: false },
    variants: ["default"],
    props: { title: "string" },
    shadcnBase: ["Card"],
    composesSpecs: [],
    codeConnect: { props: {}, mapped: false },
    accessibility: { ariaLabel: "optional", keyboardNav: false },
    dataviz: null,
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Registry.load", () => {
  it("creates .memoire directory if missing", async () => {
    const freshDir = join(testDir, "fresh", ".memoire");
    const freshRegistry = new Registry(freshDir);
    await freshRegistry.load();

    const files = await readdir(join(testDir, "fresh"));
    expect(files).toContain(".memoire");
  });
});

describe("Registry.saveSpec", () => {
  it("writes component spec to specs/components directory", async () => {
    await registry.load();
    const spec = makeComponentSpec();
    await registry.saveSpec(spec);

    const filePath = join(testDir, "specs", "components", "TestCard.json");
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("TestCard");
    expect(parsed.type).toBe("component");
  });

  it("writes page spec to specs/pages directory", async () => {
    await registry.load();
    const spec: PageSpec = {
      name: "Dashboard",
      type: "page",
      purpose: "Main dashboard",
      researchBacking: [],
      layout: "dashboard",
      sections: [],
      shadcnLayout: [],
      responsive: { mobile: "stack", tablet: "grid-2", desktop: "grid-4" },
      meta: {},
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await registry.saveSpec(spec);

    const filePath = join(testDir, "specs", "pages", "Dashboard.json");
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.name).toBe("Dashboard");
    expect(parsed.type).toBe("page");
  });

  it("stores spec in memory for getSpec retrieval", async () => {
    await registry.load();
    const spec = makeComponentSpec();
    await registry.saveSpec(spec);

    const retrieved = await registry.getSpec("TestCard");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.name).toBe("TestCard");
  });
});

describe("Registry.getSpec", () => {
  it("returns null for missing specs", async () => {
    await registry.load();
    const result = await registry.getSpec("NonExistent");
    expect(result).toBeNull();
  });
});

describe("Registry.getAllSpecs", () => {
  it("returns all loaded specs", async () => {
    await registry.load();
    await registry.saveSpec(makeComponentSpec({ name: "CardA" }));
    await registry.saveSpec(makeComponentSpec({ name: "CardB" }));
    await registry.saveSpec(makeComponentSpec({ name: "CardC" }));

    const all = await registry.getAllSpecs();
    expect(all).toHaveLength(3);
    const names = all.map((s) => s.name).sort();
    expect(names).toEqual(["CardA", "CardB", "CardC"]);
  });
});

describe("assertSafeName (via saveSpec)", () => {
  it("rejects path traversal attempts", async () => {
    await registry.load();
    await expect(
      registry.saveSpec(makeComponentSpec({ name: "../../etc" }))
    ).rejects.toThrow(/Invalid spec name/);
  });

  it("rejects names with special characters", async () => {
    await registry.load();
    for (const badName of ["foo bar", "foo.bar", "foo/bar", "@foo", "$bar", "foo!bar"]) {
      await expect(
        registry.saveSpec(makeComponentSpec({ name: badName }))
      ).rejects.toThrow(/Invalid spec name/);
    }
  });

  it("rejects names starting with a number", async () => {
    await registry.load();
    await expect(
      registry.saveSpec(makeComponentSpec({ name: "123Card" }))
    ).rejects.toThrow(/Invalid spec name/);
  });

  it("rejects names starting with a hyphen", async () => {
    await registry.load();
    await expect(
      registry.saveSpec(makeComponentSpec({ name: "-Card" }))
    ).rejects.toThrow(/Invalid spec name/);
  });

  it("accepts valid names with letters, numbers, hyphens, underscores", async () => {
    await registry.load();
    for (const goodName of ["Card", "MetricCard", "metric-card", "metric_card", "Card2", "A"]) {
      await expect(
        registry.saveSpec(makeComponentSpec({ name: goodName }))
      ).resolves.toBeUndefined();
    }
  });
});

describe("Registry.updateDesignSystem", () => {
  it("persists design system and can be reloaded", async () => {
    await registry.load();
    const ds = {
      tokens: [
        {
          name: "primary-color",
          collection: "colors",
          type: "color" as const,
          values: { light: "#000000" },
          cssVariable: "--primary-color",
        },
      ],
      components: [],
      styles: [],
      lastSync: new Date().toISOString(),
    };
    await registry.updateDesignSystem(ds);

    // Create new registry and load from disk
    const registry2 = new Registry(arkDir);
    await registry2.load();
    expect(registry2.designSystem.tokens).toHaveLength(1);
    expect(registry2.designSystem.tokens[0].name).toBe("primary-color");
  });
});

describe("Registry.recordGeneration", () => {
  it("persists generation state and can be reloaded", async () => {
    await registry.load();
    const state = {
      specName: "TestCard",
      generatedAt: new Date().toISOString(),
      files: ["TestCard.tsx", "index.ts"],
      specHash: "abc123",
    };
    await registry.recordGeneration(state);

    // Verify in-memory
    const retrieved = registry.getGenerationState("TestCard");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.files).toEqual(["TestCard.tsx", "index.ts"]);

    // Verify on disk
    const genPath = join(arkDir, "generations.json");
    const raw = await readFile(genPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].specName).toBe("TestCard");
  });
});

describe("Registry.load reads specs from disk", () => {
  it("loads specs written by saveSpec after fresh load", async () => {
    await registry.load();
    await registry.saveSpec(makeComponentSpec({ name: "PersistTest" }));

    // Fresh registry, load from disk
    const registry2 = new Registry(arkDir);
    await registry2.load();
    const spec = await registry2.getSpec("PersistTest");
    expect(spec).not.toBeNull();
    expect(spec!.name).toBe("PersistTest");
  });
});
