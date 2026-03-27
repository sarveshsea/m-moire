/**
 * Heartbeat Command — Autonomous health checker for the Memoire design engine.
 * Checks spec staleness, token orphans, generation drift, atomic integrity,
 * and Code Connect coverage. Writes results to .memoire/heartbeat.json.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { ComponentSpec, AnySpec } from "../specs/types.js";
import type { GenerationState } from "../engine/registry.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

interface HeartbeatCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  items?: string[];
}

interface HeartbeatResult {
  checkedAt: string;
  status: "healthy" | "warnings" | "unhealthy";
  checks: HeartbeatCheck[];
  nextCheck?: string;
}

const STALENESS_DAYS = 7;
const DEFAULT_INTERVAL_MINUTES = 30;

function isComponentSpec(spec: AnySpec): spec is ComponentSpec {
  return spec.type === "component";
}

async function runHeartbeat(engine: MemoireEngine, watchIntervalMs?: number): Promise<HeartbeatResult> {
  await engine.init();
  await engine.registry.load();

  const specs = await engine.registry.getAllSpecs();
  const ds = engine.registry.designSystem;
  const checks: HeartbeatCheck[] = [];
  const now = new Date();

  // 1. Spec staleness — flag specs not updated in > 7 days
  {
    const staleSpecs: string[] = [];
    for (const spec of specs) {
      if ("updatedAt" in spec && typeof spec.updatedAt === "string") {
        const updated = new Date(spec.updatedAt);
        const diffDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > STALENESS_DAYS) {
          staleSpecs.push(spec.name);
        }
      }
    }

    if (staleSpecs.length === 0) {
      checks.push({
        name: "spec-staleness",
        status: "pass",
        detail: `All ${specs.length} specs fresh`,
      });
    } else {
      checks.push({
        name: "spec-staleness",
        status: "warn",
        detail: `${staleSpecs.length} specs not updated in ${STALENESS_DAYS}+ days`,
        items: staleSpecs,
      });
    }
  }

  // 2. Token orphans — tokens not referenced by any spec's designTokens
  {
    const referencedTokens = new Set<string>();
    for (const spec of specs) {
      if ("designTokens" in spec && spec.designTokens && typeof spec.designTokens === "object") {
        const dt = spec.designTokens as Record<string, unknown>;
        // Collect any token name references from the designTokens object
        if ("mapped" in dt && Array.isArray((dt as { mapped?: unknown }).mapped)) {
          for (const t of (dt as { mapped: string[] }).mapped) {
            referencedTokens.add(t);
          }
        }
      }
    }

    // If no specs reference tokens at all, skip orphan detection
    if (referencedTokens.size === 0 && ds.tokens.length > 0) {
      checks.push({
        name: "token-orphans",
        status: "warn",
        detail: `${ds.tokens.length} tokens in design system, none referenced by specs`,
      });
    } else {
      const orphans = ds.tokens
        .filter((t) => !referencedTokens.has(t.name) && !referencedTokens.has(t.cssVariable))
        .map((t) => t.name);

      if (orphans.length === 0) {
        checks.push({
          name: "token-orphans",
          status: "pass",
          detail: "All tokens referenced by specs",
        });
      } else {
        checks.push({
          name: "token-orphans",
          status: "warn",
          detail: `${orphans.length} tokens not referenced by any spec`,
          items: orphans.slice(0, 20), // Cap to avoid huge output
        });
      }
    }
  }

  // 3. Generation drift — specs modified after their last generation
  {
    const drifted: string[] = [];
    for (const spec of specs) {
      const genState: GenerationState | null = engine.registry.getGenerationState(spec.name);
      if (genState) {
        // Compare the stored spec hash with what would be current
        // If updatedAt is after generatedAt, there is likely drift
        if ("updatedAt" in spec && typeof spec.updatedAt === "string") {
          const specUpdated = new Date(spec.updatedAt);
          const generatedAt = new Date(genState.generatedAt);
          if (specUpdated > generatedAt) {
            drifted.push(spec.name);
          }
        }
      }
    }

    if (drifted.length === 0) {
      checks.push({
        name: "generation-drift",
        status: "pass",
        detail: "All generated code is up to date",
      });
    } else {
      checks.push({
        name: "generation-drift",
        status: "warn",
        detail: `${drifted.length} specs modified since last gen`,
        items: drifted,
      });
    }
  }

  // 4. Atomic integrity — atoms composing other specs, molecules not composing atoms
  {
    const violations: string[] = [];
    const componentSpecs = specs.filter(isComponentSpec);

    for (const spec of componentSpecs) {
      if (spec.level === "atom" && spec.composesSpecs.length > 0) {
        violations.push(`${spec.name}: atom composes other specs`);
      }
      if (spec.level === "molecule" && spec.composesSpecs.length === 0) {
        violations.push(`${spec.name}: molecule does not compose any atoms`);
      }
    }

    if (violations.length === 0) {
      checks.push({
        name: "atomic-integrity",
        status: "pass",
        detail: "All atomic levels are well-formed",
      });
    } else {
      checks.push({
        name: "atomic-integrity",
        status: "warn",
        detail: `${violations.length} atomic design violations`,
        items: violations,
      });
    }
  }

  // 5. Missing Code Connect — component specs without codeConnect.mapped = true
  {
    const componentSpecs = specs.filter(isComponentSpec);
    const unmapped = componentSpecs
      .filter((s) => !s.codeConnect?.mapped)
      .map((s) => s.name);

    if (componentSpecs.length === 0) {
      checks.push({
        name: "code-connect",
        status: "pass",
        detail: "No component specs to check",
      });
    } else if (unmapped.length === 0) {
      checks.push({
        name: "code-connect",
        status: "pass",
        detail: `All ${componentSpecs.length} components have Code Connect`,
      });
    } else {
      checks.push({
        name: "code-connect",
        status: "warn",
        detail: `${unmapped.length}/${componentSpecs.length} components missing Code Connect`,
        items: unmapped,
      });
    }
  }

  // Determine overall status
  const hasFailure = checks.some((c) => c.status === "fail");
  const hasWarning = checks.some((c) => c.status === "warn");
  const overallStatus: HeartbeatResult["status"] = hasFailure
    ? "unhealthy"
    : hasWarning
      ? "warnings"
      : "healthy";

  const result: HeartbeatResult = {
    checkedAt: now.toISOString(),
    status: overallStatus,
    checks,
  };

  if (watchIntervalMs) {
    result.nextCheck = new Date(now.getTime() + watchIntervalMs).toISOString();
  }

  return result;
}

async function writeHeartbeat(engine: MemoireEngine, result: HeartbeatResult): Promise<string> {
  const memoireDir = join(engine.config.projectRoot, ".memoire");
  await mkdir(memoireDir, { recursive: true });
  const outPath = join(memoireDir, "heartbeat.json");
  await writeFile(outPath, JSON.stringify(result, null, 2), "utf-8");
  return outPath;
}

function printHeartbeat(result: HeartbeatResult): void {
  const icon: Record<string, string> = { pass: "+", warn: "!", fail: "x" };

  console.log(`\n  Heartbeat [${result.checkedAt}]`);
  console.log(`  Status: ${result.status}\n`);

  for (const check of result.checks) {
    console.log(`  ${icon[check.status]} ${check.name}: ${check.detail}`);
    if (check.items && check.items.length > 0) {
      for (const item of check.items) {
        console.log(`      - ${item}`);
      }
    }
  }

  if (result.nextCheck) {
    console.log(`\n  Next check: ${result.nextCheck}`);
  }
  console.log();
}

export function registerHeartbeatCommand(program: Command, engine: MemoireEngine): void {
  program
    .command("heartbeat")
    .description("Check design system health, spec staleness, and token drift")
    .option("--watch", "Run continuously on an interval")
    .option("--interval <minutes>", "Interval in minutes for watch mode", String(DEFAULT_INTERVAL_MINUTES))
    .action(async (opts: { watch?: boolean; interval?: string }) => {
      const intervalMinutes = parseInt(opts.interval ?? String(DEFAULT_INTERVAL_MINUTES), 10);
      const intervalMs = intervalMinutes * 60 * 1000;

      // Run once immediately
      const result = await runHeartbeat(engine, opts.watch ? intervalMs : undefined);
      printHeartbeat(result);
      const outPath = await writeHeartbeat(engine, result);
      console.log(`  Written to ${outPath}\n`);

      if (!opts.watch) {
        return;
      }

      // Watch mode — run on interval, clean up on signals
      console.log(`  Watching every ${intervalMinutes} minutes. Press Ctrl+C to stop.\n`);

      const timer = setInterval(async () => {
        try {
          const cycleResult = await runHeartbeat(engine, intervalMs);
          printHeartbeat(cycleResult);
          await writeHeartbeat(engine, cycleResult);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  Heartbeat cycle failed: ${msg}`);
        }
      }, intervalMs);

      const cleanup = () => {
        clearInterval(timer);
        console.log("\n  Heartbeat stopped.\n");
        process.exit(0);
      };

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
    });
}
