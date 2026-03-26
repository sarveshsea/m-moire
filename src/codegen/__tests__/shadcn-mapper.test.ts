import { describe, it, expect } from "vitest";
import { generateComponent } from "../shadcn-mapper.js";
import type { ComponentSpec } from "../../specs/types.js";
import type { DesignToken } from "../../engine/registry.js";

function makeSpec(overrides: Partial<ComponentSpec> = {}): ComponentSpec {
  return {
    name: "TestWidget",
    type: "component",
    level: "atom",
    purpose: "A test widget",
    researchBacking: [],
    designTokens: { source: "none", mapped: false },
    variants: ["default"],
    props: { title: "string", count: "number" },
    shadcnBase: [],
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
      lastSync: "never",
    },
  };
}

describe("generateComponent", () => {
  it("produces valid TypeScript with use client directive", () => {
    const { component } = generateComponent(makeSpec(), makeCtx());
    expect(component).toContain(`"use client"`);
    expect(component).toContain("import * as React");
    expect(component).toContain("export function TestWidget");
  });

  it("includes Card imports when shadcnBase contains Card", () => {
    const spec = makeSpec({ shadcnBase: ["Card"] });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).toContain("import { Card, CardContent");
    expect(component).toContain("CardHeader");
    expect(component).toContain("CardTitle");
  });

  it("builds correct props interface", () => {
    const spec = makeSpec({
      props: { title: "string", count: "number", isActive: "boolean" },
    });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).toContain("export interface TestWidgetProps");
    expect(component).toContain("title: string");
    expect(component).toContain("count: number");
    expect(component).toContain("isActive: boolean");
  });

  it("generates correct barrel export", () => {
    const { barrel } = generateComponent(makeSpec(), makeCtx());
    expect(barrel).toContain(`export { TestWidget } from "./TestWidget"`);
    expect(barrel).toContain(`export type { TestWidgetProps } from "./TestWidget"`);
  });

  it("generates variant union type when multiple variants", () => {
    const spec = makeSpec({ variants: ["default", "compact", "expanded"] });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).toContain('export type TestWidgetVariant = "default" | "compact" | "expanded"');
    expect(component).toContain("variant?: TestWidgetVariant");
    expect(component).toContain(`variant = "default"`);
  });

  it("produces no variant type for single variant", () => {
    const spec = makeSpec({ variants: ["default"] });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).not.toContain("TestWidgetVariant");
    expect(component).not.toContain("variant?");
  });

  it("produces no variant type for empty variants array", () => {
    const spec = makeSpec({ variants: [] });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).not.toContain("TestWidgetVariant");
  });

  it("maps design tokens to CSS variables when matching", () => {
    const tokens: DesignToken[] = [
      {
        name: "testwidget-bg",
        collection: "colors",
        type: "color",
        values: { light: "#ff0000" },
        cssVariable: "--testwidget-bg",
      },
    ];
    const { component } = generateComponent(makeSpec(), makeCtx(tokens));
    expect(component).toContain("var(--testwidget-bg)");
  });

  it("does not crash with unknown shadcnBase items", () => {
    const spec = makeSpec({ shadcnBase: ["NonExistentComponent", "Card"] });
    const { component } = generateComponent(spec, makeCtx());
    // Should still produce output — unknown items are silently skipped
    expect(component).toContain("export function TestWidget");
    // Card should still be imported
    expect(component).toContain("import { Card");
    // NonExistentComponent should NOT appear in imports
    expect(component).not.toContain("NonExistentComponent");
  });

  it("handles component with no props gracefully", () => {
    const spec = makeSpec({ props: {} });
    const { component } = generateComponent(spec, makeCtx());
    expect(component).toContain("export function TestWidget");
    expect(component).toContain("TestWidgetProps");
  });

  it("injects Card radius token when Card is in shadcnBase", () => {
    const tokens: DesignToken[] = [
      {
        name: "card-radius",
        collection: "radius",
        type: "radius",
        values: { default: 8 },
        cssVariable: "--card-radius",
      },
    ];
    const spec = makeSpec({ shadcnBase: ["Card"], props: { title: "string" } });
    const { component } = generateComponent(spec, makeCtx(tokens));
    expect(component).toContain("var(--card-radius)");
  });
});
