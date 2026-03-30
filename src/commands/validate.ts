/**
 * Validate Command — Check all specs against their schemas
 * and report errors, warnings, and cross-reference issues.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { validateSpec, validateCrossRefs } from "../specs/validator.js";
import { ui } from "../tui/format.js";

export interface ValidatePayload {
  status: "valid" | "invalid" | "empty";
  totalSpecs: number;
  valid: number;
  invalid: number;
  errors: number;
  warnings: number;
  results: Array<{
    name: string;
    type: string;
    valid: boolean;
    errors: Array<{ path: string; message: string }>;
    warnings: Array<{ path: string; message: string; suggestion?: string }>;
  }>;
}

export function registerValidateCommand(program: Command, engine: MemoireEngine): void {
  program
    .command("validate")
    .description("Validate all specs against their schemas and check cross-references")
    .option("--json", "Output validation results as JSON")
    .option("--fix", "Auto-fix common issues (add missing defaults)")
    .action(async (opts: { json?: boolean; fix?: boolean }) => {
      await engine.init();

      const specs = await engine.registry.getAllSpecs();
      if (specs.length === 0) {
        if (opts.json) {
          const payload: ValidatePayload = { status: "empty", totalSpecs: 0, valid: 0, invalid: 0, errors: 0, warnings: 0, results: [] };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log();
        console.log(ui.pending("No specs found. Create some with:"));
        console.log("    memi spec component <Name>");
        console.log("    memi pull");
        console.log();
        return;
      }

      const results: ValidatePayload["results"] = [];
      let totalErrors = 0;
      let totalWarnings = 0;

      for (const spec of specs) {
        const validation = validateSpec(spec);
        const crossRefWarnings = await validateCrossRefs(spec, engine.registry);

        const allWarnings = [
          ...validation.warnings,
          ...crossRefWarnings,
        ];

        results.push({
          name: spec.name,
          type: spec.type,
          valid: validation.valid,
          errors: validation.errors,
          warnings: allWarnings,
        });

        totalErrors += validation.errors.length;
        totalWarnings += allWarnings.length;
      }

      const validCount = results.filter((r) => r.valid).length;
      const invalidCount = results.filter((r) => !r.valid).length;

      if (opts.json) {
        const payload: ValidatePayload = {
          status: invalidCount > 0 ? "invalid" : "valid",
          totalSpecs: specs.length,
          valid: validCount,
          invalid: invalidCount,
          errors: totalErrors,
          warnings: totalWarnings,
          results,
        };
        console.log(JSON.stringify(payload, null, 2));
        process.exitCode = invalidCount > 0 ? 1 : 0;
        return;
      }

      // Human-readable output
      console.log();
      console.log(ui.section(`SPEC VALIDATION (${specs.length} specs)`));
      console.log();

      for (const r of results) {
        if (r.errors.length === 0 && r.warnings.length === 0) {
          console.log(`  ${ui.green("+")} ${r.name} (${r.type})`);
          continue;
        }

        if (r.errors.length > 0) {
          console.log(`  ${ui.red("x")} ${r.name} (${r.type}) — ${r.errors.length} error${r.errors.length > 1 ? "s" : ""}`);
          for (const err of r.errors) {
            console.log(`      ${ui.red(err.path)}: ${err.message}`);
          }
        } else {
          console.log(`  ${ui.dim("~")} ${r.name} (${r.type}) — ${r.warnings.length} warning${r.warnings.length > 1 ? "s" : ""}`);
        }

        for (const warn of r.warnings) {
          console.log(`      ${ui.dim(warn.path)}: ${warn.message}`);
          if (warn.suggestion) {
            console.log(`        ${ui.dim("fix:")} ${warn.suggestion}`);
          }
        }
      }

      console.log();
      if (invalidCount === 0) {
        console.log(ui.ok(`All ${specs.length} specs valid. ${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""}.`));
      } else {
        console.log(ui.fail(`${invalidCount} invalid spec${invalidCount > 1 ? "s" : ""}. ${totalErrors} error${totalErrors !== 1 ? "s" : ""}, ${totalWarnings} warning${totalWarnings !== 1 ? "s" : ""}.`));
      }
      console.log();

      process.exitCode = invalidCount > 0 ? 1 : 0;
    });
}
