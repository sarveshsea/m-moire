import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { DesignSystem, DesignToken } from "../../engine/registry.js";
import { ComponentSpecSchema, type ComponentSpec } from "../../specs/types.js";
import { componentSpecToShadcnItem } from "../mapper.js";
import { exportShadcnRegistry, buildShadcnRegistry } from "../exporter.js";
import { ShadcnRegistryItemSchema, parseShadcnRegistry, parseShadcnRegistryItem, toShadcnItemName } from "../schema.js";
import { designTokensToShadcnCssVars } from "../tokens.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("shadcn registry v2", () => {
  it("parses registry items with files, targets, dependencies, and cssVars", () => {
    const parsed = ShadcnRegistryItemSchema.parse({
      "$schema": "https://ui.shadcn.com/schema/registry-item.json",
      name: "hello-world",
      type: "registry:block",
      title: "Hello World",
      registryDependencies: ["button", "@acme/input-form", "https://example.com/r/foo"],
      dependencies: ["motion"],
      devDependencies: ["tw-animate-css"],
      files: [{
        path: "registry/hello-world/hello-world.tsx",
        type: "registry:component",
        target: "components/blocks/hello-world.tsx",
      }],
      cssVars: {
        theme: { "font-heading": "Poppins, sans-serif" },
        light: { brand: "oklch(0.205 0.015 18)" },
        dark: { brand: "oklch(0.985 0 0)" },
      },
    });

    expect(parsed.files[0]?.target).toBe("components/blocks/hello-world.tsx");
    expect(parsed.registryDependencies).toContain("@acme/input-form");
    expect(parsed.cssVars?.light?.brand).toContain("oklch");
  });

  it("maps component specs into shadcn items with Atomic Design metadata", () => {
    const spec = makeSpec({ name: "HeroSection", level: "organism", shadcnBase: ["Button", "Card"] });
    const item = componentSpecToShadcnItem(spec);

    expect(item.name).toBe("hero-section");
    expect(item.type).toBe("registry:block");
    expect(item.registryDependencies).toEqual(["button", "card"]);
    expect(item.files[0]).toMatchObject({
      type: "registry:component",
      target: "components/organisms/hero-section.tsx",
    });
    expect(item.meta?.memoire).toMatchObject({ atomicLevel: "organism", specName: "HeroSection" });
  });

  it("exports token reports into shadcn cssVars", () => {
    const cssVars = designTokensToShadcnCssVars([
      token("background", "color", "--background", { default: "#ffffff", dark: "#020617" }),
      token("primary", "color", "--color-primary", { default: "#2563eb", dark: "#60a5fa" }),
      token("radius.lg", "radius", "--radius-lg", { default: "0.75rem" }),
      token("font.heading", "typography", "--font-heading", { default: "Poppins, sans-serif" }),
    ]);

    expect(cssVars.light?.background).toBe("#ffffff");
    expect(cssVars.dark?.primary).toBe("#60a5fa");
    expect(cssVars.theme?.["color-primary"]).toBe("#2563eb");
    expect(cssVars.theme?.["radius-lg"]).toBe("0.75rem");
    expect(cssVars.theme?.["font-heading"]).toContain("Poppins");
  });

  it("writes deterministic registry indexes and item routes", async () => {
    const first = await mkdtemp(join(tmpdir(), "memoire-shadcn-a-"));
    const second = await mkdtemp(join(tmpdir(), "memoire-shadcn-b-"));
    try {
      const input = {
        name: "@acme/design-system",
        designSystem: makeDesignSystem(),
        specs: [makeSpec({ name: "Button", level: "atom", shadcnBase: ["Button"] })],
        memoireVersion: "0.14.1",
        generatedAt: "2026-04-26T00:00:00.000Z",
      };

      await exportShadcnRegistry({ ...input, outDir: first });
      await exportShadcnRegistry({ ...input, outDir: second });

      expect(await readOutput(first)).toEqual(await readOutput(second));

      const registry = parseShadcnRegistry(JSON.parse(await readFile(join(first, "registry.json"), "utf8")));
      expect(registry.items.map((item) => item.name)).toEqual(["memoire-theme", "button"]);
      expect(registry.items[1]?.meta?.memoire).toMatchObject({ itemRoute: "/r/button.json" });

      const item = parseShadcnRegistryItem(JSON.parse(await readFile(join(first, "button.json"), "utf8")));
      expect(item.files[0]?.content).toContain("export function Button");
    } finally {
      await rm(first, { recursive: true, force: true });
      await rm(second, { recursive: true, force: true });
    }
  });

  it("builds shadcn-compatible registries from every example preset", async () => {
    const presetDir = join(root, "examples", "presets");
    const slugs = (await readdir(presetDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "__tests__")
      .map((entry) => entry.name)
      .sort();

    expect(slugs.length).toBeGreaterThanOrEqual(11);

    for (const slug of slugs) {
      const registry = JSON.parse(await readFile(join(presetDir, slug, "registry.json"), "utf8"));
      const specs = await Promise.all(registry.components.map(async (component: { href: string }) => {
        const raw = JSON.parse(await readFile(join(presetDir, slug, component.href.replace(/^\.\//, "")), "utf8"));
        return ComponentSpecSchema.parse(raw);
      }));

      const shadcnRegistry = buildShadcnRegistry({
        name: registry.name,
        designSystem: makeDesignSystem([]),
        specs,
        memoireVersion: "0.14.1",
        generatedAt: "2026-04-26T00:00:00.000Z",
      });

      expect(() => parseShadcnRegistry(shadcnRegistry)).not.toThrow();
      expect(shadcnRegistry.items.map((item) => item.name)).toEqual(
        [...specs].sort((a, b) => toShadcnItemName(a.name).localeCompare(toShadcnItemName(b.name))).map((spec) => toShadcnItemName(spec.name)),
      );
      for (const item of shadcnRegistry.items) {
        expect(() => parseShadcnRegistryItem(item)).not.toThrow();
      }
    }
  });
});

function makeSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return ComponentSpecSchema.parse({
    name: "Button",
    type: "component",
    level: "atom",
    purpose: "Primary action component.",
    shadcnBase: [],
    props: {},
    variants: ["default"],
    tags: ["test"],
    ...overrides,
  });
}

function makeDesignSystem(tokens: DesignToken[] = [token("background", "color", "--background", { default: "#fff", dark: "#000" })]): DesignSystem {
  return {
    tokens,
    components: [],
    styles: [],
    lastSync: "2026-04-26T00:00:00.000Z",
  };
}

function token(
  name: string,
  type: DesignToken["type"],
  cssVariable: string,
  values: Record<string, string | number>,
): DesignToken {
  return {
    name,
    type,
    cssVariable,
    values,
    collection: "test",
  };
}

async function readOutput(dir: string): Promise<Record<string, unknown>> {
  const entries = await readdir(dir);
  const output: Record<string, unknown> = {};
  for (const entry of entries.sort()) {
    output[entry] = JSON.parse(await readFile(join(dir, entry), "utf8"));
  }
  return output;
}
