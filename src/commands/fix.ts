import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { buildUiFixPlan, type UiFixPlan } from "../app-quality/fix-plan.js";
import { ui } from "../tui/format.js";

interface FixPlanOptions {
  json?: boolean;
  maxFiles?: string;
  noWrite?: boolean;
}

export function registerFixCommand(program: Command, engine: MemoireEngine): void {
  const fix = program
    .command("fix")
    .description("Plan and apply safe UI quality fixes")
    .addHelpText("after", [
      "",
      "Examples:",
      "  memi fix plan",
      "  memi fix plan ./src --json",
    ].join("\n"));

  fix
    .command("plan [target]")
    .description("Generate a dry-run UI fix plan without modifying source files")
    .option("--json", "Output stable JSON")
    .option("--max-files <count>", "Maximum source files to scan", "500")
    .option("--no-write", "Do not write .memoire/app-quality/fix-plan reports")
    .action(async (target: string | undefined, opts: FixPlanOptions) => {
      const maxFiles = Number.parseInt(opts.maxFiles ?? "500", 10);
      const plan = await buildUiFixPlan({
        projectRoot: engine.config.projectRoot,
        target,
        maxFiles: Number.isFinite(maxFiles) ? maxFiles : 500,
        write: opts.noWrite ? false : true,
      });

      if (opts.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
      }

      printFixPlan(plan, opts.noWrite !== true);
    });
}

function printFixPlan(plan: UiFixPlan, wroteReports: boolean): void {
  console.log(ui.brand("Memoire UI Fix Plan"));
  console.log(ui.dots("Target", plan.target));
  console.log(ui.dots("Patches", String(plan.summary.patchCount)));
  console.log(ui.dots("Safe", String(plan.summary.safePatchCount)));
  console.log(ui.dots("Review", String(plan.summary.reviewPatchCount)));
  console.log(ui.dots("Manual", String(plan.summary.manualPatchCount)));
  console.log();

  if (plan.patches.length === 0) {
    console.log(ui.ok("No fix plan generated from the current diagnosis."));
  } else {
    for (const patch of plan.patches.slice(0, 8)) {
      console.log(`  [${patch.risk.toUpperCase()} ${patch.category}] ${patch.title}`);
      console.log(ui.dim(`      ${patch.rationale}`));
      if (patch.affectedFiles[0]) console.log(ui.dim(`      file: ${patch.affectedFiles[0]}`));
    }
  }

  console.log();
  console.log(ui.guide("memi fix apply --yes", "apply only writeSafe mechanical patches"));
  if (wroteReports) {
    console.log(ui.dim("  Reports written to .memoire/app-quality/fix-plan.{json,md}"));
  }
  console.log();
}
