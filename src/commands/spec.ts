import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";
import type { ComponentSpec, PageSpec, DataVizSpec, DesignSpec } from "../specs/types.js";
import { validateSpec } from "../specs/validator.js";

/** Validate spec name is a valid identifier */
function validateName(name: string): void {
  if (!name || name.length === 0) {
    console.error("\n  Spec name cannot be empty.\n");
    process.exit(1);
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    console.error("\n  Spec name must start with a letter and contain only letters, numbers, hyphens, or underscores.\n");
    process.exit(1);
  }
}

export function registerSpecCommand(program: Command, engine: ArkEngine) {
  const spec = program
    .command("spec")
    .description("Create or edit specs");

  spec
    .command("component <name>")
    .description("Create a new component spec")
    .option("-b, --base <components...>", "shadcn base components", ["Card"])
    .option("-p, --purpose <text>", "Component purpose")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      const newSpec: ComponentSpec = {
        name,
        type: "component",
        level: "atom",
        composesSpecs: [],
        codeConnect: { props: {}, mapped: false },
        purpose: opts.purpose ?? `${name} component`,
        researchBacking: [],
        designTokens: { source: "none", mapped: false },
        variants: ["default"],
        props: {},
        shadcnBase: opts.base,
        accessibility: { ariaLabel: "optional", keyboardNav: false },
        dataviz: null,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const validation = validateSpec(newSpec);
      if (!validation.valid) {
        console.error("\n  Spec validation failed:");
        for (const err of validation.errors) {
          console.error(`    - ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }

      for (const warn of validation.warnings) {
        console.log(`  ⚠ ${warn.path}: ${warn.message}`);
        if (warn.suggestion) console.log(`    → ${warn.suggestion}`);
      }

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/components/${name}.json`);
      console.log(`  Run \`ark generate ${name}\` to generate code.\n`);
    });

  spec
    .command("page <name>")
    .description("Create a new page spec")
    .option("-l, --layout <layout>", "Page layout", "full-width")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      const newSpec: PageSpec = {
        name,
        type: "page",
        purpose: `${name} page`,
        researchBacking: [],
        layout: opts.layout,
        sections: [],
        shadcnLayout: [],
        responsive: { mobile: "stack", tablet: "grid-2", desktop: "grid-4" },
        meta: {},
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/pages/${name}.json`);
      console.log("  Edit the spec to add sections, then run `ark generate`.\n");
    });

  spec
    .command("dataviz <name>")
    .description("Create a new dataviz spec")
    .option("-t, --type <chartType>", "Chart type", "line")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      const newSpec: DataVizSpec = {
        name,
        type: "dataviz",
        purpose: `${name} chart`,
        chartType: opts.type,
        library: "recharts",
        dataShape: { x: "date", y: "number" },
        interactions: ["hover-tooltip"],
        accessibility: { altText: "required", keyboardNav: true, dataTableFallback: true },
        responsive: {
          mobile: { height: 200, simplify: true },
          desktop: { height: 400 },
        },
        shadcnWrapper: "Card",
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/dataviz/${name}.json`);
      console.log("  Edit the spec to define data shape, then run `ark generate`.\n");
    });

  spec
    .command("design <name>")
    .description("Create a new design spec with pixel-level annotations")
    .option("-p, --purpose <text>", "Design spec purpose")
    .option("-n, --node <nodeId>", "Figma node ID to link")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      const newSpec: DesignSpec = {
        name,
        type: "design",
        purpose: opts.purpose ?? `${name} design specification`,
        sourceNodeId: opts.node,
        spacing: [],
        interactions: [],
        typography: [],
        colors: [],
        borderRadius: {},
        shadows: [],
        notes: [],
        linkedSpecs: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const validation = validateSpec(newSpec);
      if (!validation.valid) {
        console.error("\n  Spec validation failed:");
        for (const err of validation.errors) {
          console.error(`    - ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }

      for (const warn of validation.warnings) {
        console.log(`  ⚠ ${warn.path}: ${warn.message}`);
        if (warn.suggestion) console.log(`    → ${warn.suggestion}`);
      }

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/design/${name}.json`);
      console.log("  Edit the spec to add spacing, interactions, and typography notes.\n");
    });

  spec
    .command("list")
    .description("List all specs")
    .action(async () => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      if (specs.length === 0) {
        console.log("\n  No specs found. Create one with `ark spec component <name>`.\n");
        return;
      }

      console.log(`\n  ${specs.length} specs:\n`);
      for (const s of specs) {
        const gen = engine.registry.getGenerationState(s.name);
        const status = gen ? "✔ generated" : "○ pending";
        console.log(`    ${status}  ${s.type.padEnd(10)} ${s.name}`);
      }
      console.log();
    });
}
