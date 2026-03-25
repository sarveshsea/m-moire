/**
 * Compose Command — Natural language design intent → structured execution.
 *
 * This is the autonomous agent entry point. Give it a design intent
 * and it will:
 *   1. Classify the intent (token-update, component-create, page-layout, etc.)
 *   2. Build a plan of sub-agent tasks with dependencies
 *   3. Execute tasks topologically (parallel where possible)
 *   4. Report results with mutations and timing
 *
 * Usage:
 *   memi compose "create a login page with email and password fields"
 *   memi compose "update the color palette to use warmer tones" --dry-run
 *   memi compose "audit the design system for accessibility" --verbose
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { AgentOrchestrator, classifyIntent } from "../agents/index.js";
import type { AgentPlan, SubTask } from "../agents/index.js";

export function registerComposeCommand(program: Command, engine: MemoireEngine) {
  program
    .command("compose <intent...>")
    .description("Execute a natural language design intent via the agent orchestrator")
    .option("--dry-run", "Show the execution plan without running it")
    .option("--verbose", "Show detailed sub-task progress")
    .option("--no-figma", "Skip Figma sync steps")
    .action(async (intentParts: string[], opts) => {
      const intent = intentParts.join(" ");

      await engine.init();

      // Classify first for quick feedback
      const category = classifyIntent(intent);
      console.log(`\n  Intent: "${intent}"`);
      console.log(`  Category: ${category}`);

      // Create orchestrator with live progress reporting
      const orchestrator = new AgentOrchestrator(engine, (plan: AgentPlan) => {
        if (opts.verbose) {
          console.log(`\n  Plan: ${plan.id} (${plan.subTasks.length} tasks)`);
          for (const task of plan.subTasks) {
            const deps = task.dependencies.length > 0
              ? ` [after: ${task.dependencies.join(", ")}]`
              : "";
            console.log(`    ${statusIcon(task.status)} ${task.name} (${task.agentType})${deps}`);
          }
        }
      });

      // Execute
      console.log(`\n  Executing...`);
      const startTime = Date.now();

      const result = await orchestrator.execute(intent, {
        dryRun: opts.dryRun,
        autoSync: !opts.noFigma,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // Report
      console.log(`\n  ────────────────────────────────`);
      console.log(`  Status: ${result.status}`);
      console.log(`  Tasks: ${result.completedTasks}/${result.totalTasks} completed`);
      console.log(`  Mutations: ${result.mutations.length}`);
      console.log(`  Figma synced: ${result.figmaSynced ? "yes" : "no"}`);
      console.log(`  Time: ${elapsed}s`);

      if (result.mutations.length > 0) {
        console.log(`\n  Changes:`);
        for (const m of result.mutations) {
          console.log(`    ${mutationIcon(m.type)} ${m.target}: ${m.detail}`);
        }
      }

      if (opts.dryRun) {
        console.log(`\n  (dry run — no changes applied)`);
      }

      console.log();
    });
}

function statusIcon(status: SubTask["status"]): string {
  switch (status) {
    case "completed": return "\u2714";
    case "running": return "\u25CB";
    case "failed": return "\u2716";
    default: return "\u00B7";
  }
}

function mutationIcon(type: string): string {
  if (type.includes("created")) return "+";
  if (type.includes("updated")) return "~";
  if (type.includes("deleted")) return "-";
  if (type.includes("pushed")) return "\u2191";
  if (type.includes("generated")) return "\u25A0";
  return "\u00B7";
}
