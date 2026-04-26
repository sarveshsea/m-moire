import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { diagnoseAppQuality, type AppQualityDiagnosis } from "../app-quality/engine.js";
import { ui } from "../tui/format.js";

interface DiagnoseOptions {
  json?: boolean;
  maxFiles?: string;
  noWrite?: boolean;
}

export function registerDiagnoseCommand(program: Command, engine: MemoireEngine): void {
  program
    .command("diagnose [target]")
    .description("Diagnose design debt in an existing web app from code or URL")
    .option("--json", "Output the diagnosis as JSON")
    .option("--max-files <count>", "Maximum source files to scan", "500")
    .option("--no-write", "Do not write .memoire/app-quality reports")
    .action(async (target: string | undefined, opts: DiagnoseOptions) => {
      try {
        const maxFiles = Number.parseInt(opts.maxFiles ?? "500", 10);
        const diagnosis = await diagnoseAppQuality({
          projectRoot: engine.config.projectRoot,
          target,
          maxFiles: Number.isFinite(maxFiles) ? maxFiles : 500,
          write: opts.noWrite ? false : true,
        });

        if (opts.json) {
          console.log(JSON.stringify(diagnosis, null, 2));
          return;
        }

        printDiagnosis(diagnosis, opts.noWrite !== true);
        if (diagnosis.issues.some((issue) => issue.severity === "critical")) {
          process.exitCode = 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ status: "failed", error: message }));
        } else {
          console.log(ui.fail(message));
        }
        process.exitCode = 1;
      }
    });
}

function printDiagnosis(diagnosis: AppQualityDiagnosis, wroteReports: boolean): void {
  console.log(ui.brand("Design CI for shadcn/Tailwind apps"));
  console.log(ui.dots("Target", diagnosis.target));
  console.log(ui.dots("Score", `${diagnosis.summary.score}/100`));
  console.log(ui.dots("Verdict", diagnosis.summary.verdict));
  console.log(ui.dots("Files", String(diagnosis.summary.scannedFiles)));
  console.log(ui.dots("Routes", String(diagnosis.summary.routes)));
  console.log(ui.dots("Components", String(diagnosis.summary.components)));
  console.log(ui.dots("Tailwind classes", String(diagnosis.summary.tailwindClasses)));
  console.log();

  console.log(ui.section("Highest impact issues"));
  if (diagnosis.issues.length === 0) {
    console.log(ui.ok("No major app-quality issues detected"));
  } else {
    for (const issue of diagnosis.issues.slice(0, 6)) {
      const label = `${issue.severity.toUpperCase()} ${issue.category}`;
      console.log(`  [${label}] ${issue.title}`);
      console.log(`      ${issue.recommendation}`);
    }
  }

  console.log(ui.section("Design directions"));
  for (const direction of diagnosis.directions) {
    console.log(`  ${direction.id}  ${direction.name}`);
    console.log(`      ${direction.fit}`);
  }

  console.log(ui.section("Next"));
  console.log(ui.guide("memi diagnose --json", "use in CI or automation"));
  console.log(ui.guide("memi theme import", "bring in a stronger visual direction"));
  console.log(ui.guide("memi publish", "package the improved system as a registry"));
  if (wroteReports) {
    console.log();
    console.log(ui.dim("  Reports written to .memoire/app-quality/diagnosis.{json,md}"));
  }
  console.log();
}
