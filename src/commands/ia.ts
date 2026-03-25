/**
 * IA Command — Information Architecture extraction, visualization, and validation.
 *
 * `memi ia extract <name>` — Extract IA from connected Figma file
 * `memi ia create <name>`  — Create an empty IA spec manually
 * `memi ia show [name]`    — Print IA tree to terminal
 * `memi ia validate [name]`— Validate IA cross-references
 * `memi ia list`           — List all IA specs
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { IASpec, IANode } from "../specs/types.js";
import { validateSpec, validateCrossRefs } from "../specs/validator.js";

/** Validate spec name is a valid identifier */
function validateName(name: string): void {
  if (!name || name.length === 0) {
    console.error("\n  IA spec name cannot be empty.\n");
    process.exit(1);
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    console.error("\n  IA spec name must start with a letter and contain only letters, numbers, hyphens, or underscores.\n");
    process.exit(1);
  }
}

/** Render an IA tree to terminal with box-drawing characters */
function printTree(node: IANode, prefix = "", isLast = true): void {
  const connector = isLast ? "└── " : "├── ";
  const typeTag = node.type.toUpperCase().padEnd(7);
  const linked = node.linkedPageSpec ? ` → ${node.linkedPageSpec}` : "";
  const notes = node.notes ? ` (${node.notes})` : "";

  console.log(`${prefix}${connector}[${typeTag}] ${node.label}${linked}${notes}`);

  const childPrefix = prefix + (isLast ? "    " : "│   ");
  for (let i = 0; i < node.children.length; i++) {
    printTree(node.children[i], childPrefix, i === node.children.length - 1);
  }
}

/** Count all nodes in an IA tree */
function countNodes(node: IANode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

export function registerIACommand(program: Command, engine: MemoireEngine) {
  const ia = program
    .command("ia")
    .description("Information architecture — extract, create, and visualize site structure");

  // ── memi ia extract <name> ──────────────────────────────
  ia
    .command("extract <name>")
    .description("Extract IA from connected Figma file's page structure")
    .option("-d, --depth <depth>", "Tree depth to extract", "2")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      if (!engine.figma.isConnected) {
        console.error("\n  Not connected to Figma. Run `memi connect` first.\n");
        process.exit(1);
      }

      const depth = parseInt(opts.depth, 10);
      if (isNaN(depth) || depth < 1 || depth > 10) {
        console.error("\n  Depth must be 1-10.\n");
        process.exit(1);
      }

      console.log(`\n  Extracting IA from Figma (depth ${depth})...`);

      const iaSpec = await engine.figma.extractIA(name, depth);

      const validation = validateSpec(iaSpec);
      if (!validation.valid) {
        console.error("\n  IA spec validation failed:");
        for (const err of validation.errors) {
          console.error(`    - ${err.path}: ${err.message}`);
        }
        process.exit(1);
      }

      for (const warn of validation.warnings) {
        console.log(`  ⚠ ${warn.path}: ${warn.message}`);
        if (warn.suggestion) console.log(`    → ${warn.suggestion}`);
      }

      await engine.registry.saveSpec(iaSpec);
      const nodeCount = countNodes(iaSpec.root);

      console.log(`\n  Created: specs/ia/${name}.json`);
      console.log(`  ${iaSpec.root.children.length} pages, ${nodeCount} total nodes`);
      console.log(`  Run \`memi ia show ${name}\` to visualize.\n`);
    });

  // ── memi ia create <name> ───────────────────────────────
  ia
    .command("create <name>")
    .description("Create an empty IA spec manually")
    .option("-p, --purpose <text>", "IA purpose")
    .action(async (name: string, opts) => {
      validateName(name);
      await engine.init();

      const iaSpec: IASpec = {
        name,
        type: "ia",
        purpose: opts.purpose ?? `${name} information architecture`,
        root: {
          id: "root",
          label: name,
          type: "page",
          children: [],
        },
        flows: [],
        entryPoints: [],
        globals: [],
        notes: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await engine.registry.saveSpec(iaSpec);
      console.log(`\n  Created: specs/ia/${name}.json`);
      console.log("  Edit the spec to add pages, sections, and navigation flows.\n");
    });

  // ── memi ia show [name] ─────────────────────────────────
  ia
    .command("show [name]")
    .description("Print IA tree to terminal")
    .action(async (name?: string) => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      const iaSpecs = specs.filter((s) => s.type === "ia") as IASpec[];

      if (iaSpecs.length === 0) {
        console.log("\n  No IA specs found. Run `memi ia extract <name>` or `memi ia create <name>`.\n");
        return;
      }

      const target = name
        ? iaSpecs.find((s) => s.name === name)
        : iaSpecs[0];

      if (!target) {
        console.error(`\n  IA spec "${name}" not found.\n`);
        process.exit(1);
      }

      const nodeCount = countNodes(target.root);
      console.log(`\n  IA: ${target.name} — ${nodeCount} nodes`);
      if (target.sourceFileKey) console.log(`  Figma file: ${target.sourceFileKey}`);
      console.log(`  Entry points: ${target.entryPoints.length > 0 ? target.entryPoints.join(", ") : "none"}`);
      console.log(`  Flows: ${target.flows.length}`);
      console.log();

      printTree(target.root);

      if (target.flows.length > 0) {
        console.log("\n  Navigation Flows:");
        for (const flow of target.flows) {
          const label = flow.label ? ` "${flow.label}"` : "";
          const cond = flow.condition ? ` [${flow.condition}]` : "";
          console.log(`    ${flow.from} → ${flow.to}${label} (${flow.trigger})${cond}`);
        }
      }

      if (target.globals.length > 0) {
        console.log("\n  Global Nav:");
        for (const g of target.globals) {
          const linked = g.linkedPageSpec ? ` → ${g.linkedPageSpec}` : "";
          console.log(`    • ${g.label}${linked}`);
        }
      }

      console.log();
    });

  // ── memi ia validate [name] ─────────────────────────────
  ia
    .command("validate [name]")
    .description("Validate IA spec cross-references against page specs")
    .action(async (name?: string) => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      const iaSpecs = specs.filter((s) => s.type === "ia") as IASpec[];
      const targets = name
        ? iaSpecs.filter((s) => s.name === name)
        : iaSpecs;

      if (targets.length === 0) {
        console.log(name
          ? `\n  IA spec "${name}" not found.\n`
          : "\n  No IA specs found.\n");
        return;
      }

      let totalWarnings = 0;

      for (const spec of targets) {
        const validation = validateSpec(spec);
        const crossRefs = await validateCrossRefs(spec, engine.registry);
        const allWarnings = [...validation.warnings, ...crossRefs];

        console.log(`\n  ${spec.name}: ${validation.valid ? "VALID" : "INVALID"}`);

        if (!validation.valid) {
          for (const err of validation.errors) {
            console.error(`    ✗ ${err.path}: ${err.message}`);
          }
        }

        for (const warn of allWarnings) {
          console.log(`    ⚠ ${warn.path}: ${warn.message}`);
          if (warn.suggestion) console.log(`      → ${warn.suggestion}`);
          totalWarnings++;
        }

        if (allWarnings.length === 0 && validation.valid) {
          console.log("    All cross-references valid.");
        }
      }

      console.log(`\n  ${targets.length} IA spec(s) checked, ${totalWarnings} warning(s).\n`);
    });

  // ── memi ia list ────────────────────────────────────────
  ia
    .command("list")
    .description("List all IA specs")
    .action(async () => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      const iaSpecs = specs.filter((s) => s.type === "ia") as IASpec[];

      if (iaSpecs.length === 0) {
        console.log("\n  No IA specs. Run `memi ia extract <name>` to create one from Figma.\n");
        return;
      }

      console.log(`\n  ${iaSpecs.length} IA spec(s):\n`);
      for (const s of iaSpecs) {
        const nodeCount = countNodes(s.root);
        const pages = s.root.children.length;
        console.log(`    ${s.name.padEnd(24)} ${pages} pages, ${nodeCount} nodes, ${s.flows.length} flows`);
      }
      console.log();
    });
}
