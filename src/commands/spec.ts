import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec, DesignSpec } from "../specs/types.js";
import { validateSpec } from "../specs/validator.js";
import { inferAtomicLevel } from "../utils/naming.js";

// ── WA-204: Validation error formatter ──────────────────────────

interface FormattedValidationError {
  field: string;
  message: string;
}

/**
 * Format a validation result for terminal output or JSON.
 * On failure prints structured, human-readable errors that surface WCAG
 * criterion references rather than raw Zod path dumps.
 */
function handleValidationFailure(
  validation: ReturnType<typeof validateSpec>,
  opts: { json?: boolean }
): void {
  if (validation.valid) return;

  const formatted: FormattedValidationError[] = validation.errors.map((err) => ({
    field: err.path || "spec",
    message: err.message,
  }));

  if (opts.json) {
    console.error(JSON.stringify({ status: "error", errors: formatted }, null, 2));
  } else {
    console.error("\n  spec validation failed:");
    for (const e of formatted) {
      // Align field labels to a consistent width for readability
      const label = `[${e.field}]`.padEnd(20);
      console.error(`    ${label} ${e.message}`);
    }
    console.error();
  }
  process.exit(1);
}

type SpecListStatus = "generated" | "pending";

interface SpecListEntry {
  name: string;
  type: AnySpec["type"];
  status: SpecListStatus;
  generatedAt: string | null;
  files: string[];
}

interface SpecListPayload {
  options: {
    json: boolean;
  };
  summary: {
    total: number;
    generated: number;
    pending: number;
    byType: {
      component: number;
      page: number;
      dataviz: number;
      design: number;
      ia: number;
      other: number;
    };
  };
  specs: SpecListEntry[];
}

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

export function registerSpecCommand(program: Command, engine: MemoireEngine) {
  const spec = program
    .command("spec")
    .description("Create or edit specs");

  spec
    .command("component <name>")
    .description("Create a new component spec")
    .option("-b, --base <components...>", "shadcn base components", ["Card"])
    .option("-p, --purpose <text>", "Component purpose")
    .option("-l, --level <level>", "Atomic design level (atom|molecule|organism|template)")
    .option("--json", "Output errors as JSON")
    .action(async (name: string, opts: { base: string[]; purpose?: string; level?: string; json?: boolean }) => {
      validateName(name);
      await engine.init();

      // Auto-infer atomic level when --level is not provided
      const resolvedLevel = (opts.level as ComponentSpec["level"]) ?? inferAtomicLevel(name);
      if (!opts.level) {
        console.log(`  Inferred level: ${resolvedLevel} — use --level to override`);
      }

      const newSpec: ComponentSpec = {
        name,
        type: "component",
        level: resolvedLevel,
        composesSpecs: [],
        codeConnect: { props: {}, mapped: false },
        purpose: opts.purpose ?? `${name} component`,
        researchBacking: [],
        designTokens: { source: "none", mapped: false },
        variants: ["default"],
        props: {},
        shadcnBase: opts.base,
        accessibility: { ariaLabel: "optional", keyboardNav: false, focusStyle: "outline", focusWidth: "2px", touchTarget: "default", reducedMotion: false, liveRegion: "off", colorIndependent: true },
        dataviz: null,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const validation = validateSpec(newSpec);
      // WA-204: use structured formatter
      handleValidationFailure(validation, opts);

      for (const warn of validation.warnings) {
        console.log(`  [warn] ${warn.path}: ${warn.message}`);
        if (warn.suggestion) console.log(`    -> ${warn.suggestion}`);
      }

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/components/${name}.json`);
      console.log(`  Run \`memi generate ${name}\` to generate code.\n`);
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
        accessibility: { language: "en", landmarks: true, skipLink: true, headingHierarchy: true, consistentNav: true, consistentHelp: true },
        meta: {},
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/pages/${name}.json`);
      console.log("  Edit the spec to add sections, then run `memi generate`.\n");
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
        accessibility: { altText: "required", keyboardNav: true, dataTableFallback: true, patternFill: false, announceUpdates: false, highContrastMode: false },
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
      console.log("  Edit the spec to define data shape, then run `memi generate`.\n");
    });

  spec
    .command("design <name>")
    .description("Create a new design spec with pixel-level annotations")
    .option("-p, --purpose <text>", "Design spec purpose")
    .option("-n, --node <nodeId>", "Figma node ID to link")
    .option("--json", "Output errors as JSON")
    .action(async (name: string, opts: { purpose?: string; node?: string; json?: boolean }) => {
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
      // WA-204: use structured formatter
      handleValidationFailure(validation, opts);

      for (const warn of validation.warnings) {
        console.log(`  [warn] ${warn.path}: ${warn.message}`);
        if (warn.suggestion) console.log(`    -> ${warn.suggestion}`);
      }

      await engine.registry.saveSpec(newSpec);
      console.log(`\n  Created: specs/design/${name}.json`);
      console.log("  Edit the spec to add spacing, interactions, and typography notes.\n");
    });

  spec
    .command("list")
    .description("List all specs")
    .option("--json", "Output spec list as JSON")
    .action(async (opts: { json?: boolean }) => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      const payload = buildSpecListPayload(specs, engine, Boolean(opts.json));

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      if (specs.length === 0) {
        console.log("\n  No specs found. Create one with `memi spec component <name>`.\n");
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

function buildSpecListPayload(specs: Awaited<ReturnType<MemoireEngine["registry"]["getAllSpecs"]>>, engine: MemoireEngine, json: boolean): SpecListPayload {
  const entries = specs.map((spec) => {
    const generation = engine.registry.getGenerationState(spec.name);
    const entry: SpecListEntry = {
      name: spec.name,
      type: spec.type,
      status: generation ? "generated" : "pending",
      generatedAt: generation?.generatedAt ?? null,
      files: generation?.files ?? [],
    };
    return entry;
  });

  const byType = {
    component: 0,
    page: 0,
    dataviz: 0,
    design: 0,
    ia: 0,
    other: 0,
  };

  let generated = 0;
  for (const entry of entries) {
    if (entry.status === "generated") generated++;
    if (entry.type in byType) {
      byType[entry.type as keyof typeof byType]++;
    } else {
      byType.other++;
    }
  }

  return {
    options: { json },
    summary: {
      total: entries.length,
      generated,
      pending: entries.length - generated,
      byType,
    },
    specs: entries,
  };
}
