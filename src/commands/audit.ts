/**
 * Audit Command — WCAG 2.2 accessibility audit for component specs.
 *
 * memi audit --wcag [--component <name>] [--json]
 *
 * Runs 5 checks per ComponentSpec:
 *   contrast  — colorContrast declared and assertedRatio >= 4.5 (AA)
 *   aria      — role defined and not "none", ariaLabel not "none"
 *   keyboard  — keyboardNav exists and not false/"none"
 *   touch     — touchTarget not "default" (default = unverified)
 *   focus     — focusStyle not "none"
 *
 * Exit code 1 when any spec fails on contrast (assertedRatio < 4.5) or
 * aria role is missing for interactive components.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { ComponentSpec } from "../specs/types.js";

// ── Types ──────────────────────────────────────────────────────────

type CheckStatus = "pass" | "warn" | "fail";

type CheckName = "contrast" | "aria" | "keyboard" | "touch" | "focus";

interface CheckResult {
  status: CheckStatus;
  detail: string;
}

interface SpecAuditResult {
  name: string;
  checks: Record<CheckName, CheckResult>;
  wcag_impact: string[];
}

interface AuditPayload {
  status: CheckStatus;
  specs: SpecAuditResult[];
  summary: {
    pass: number;
    warn: number;
    fail: number;
    total: number;
  };
}

// ── WCAG criterion codes per check ────────────────────────────────

const WCAG_CRITERIA: Record<CheckName, string[]> = {
  contrast: ["1.4.3", "1.4.6"],
  aria:     ["4.1.2"],
  keyboard: ["2.1.1"],
  touch:    ["2.5.8"],
  focus:    ["2.4.11"],
};

const ICON: Record<CheckStatus, string> = {
  pass: "+",
  warn: "!",
  fail: "x",
};

// ── Interactive component heuristic ───────────────────────────────

function isInteractive(name: string): boolean {
  return /button|input|select|checkbox|toggle|switch|link|tab|menu|dialog|modal|dropdown|accordion/i.test(name);
}

// ── Per-check logic ───────────────────────────────────────────────

function checkContrast(spec: ComponentSpec): CheckResult {
  const cc = spec.accessibility?.colorContrast;
  if (!cc) {
    return { status: "warn", detail: "no colorContrast declared" };
  }
  if (cc.assertedRatio === undefined || cc.assertedRatio === null) {
    return { status: "warn", detail: "colorContrast declared but assertedRatio missing" };
  }
  const threshold = cc.minimumLevel === "AAA" ? 7.0 : 4.5;
  if (cc.assertedRatio < threshold) {
    return {
      status: "fail",
      detail: `assertedRatio ${cc.assertedRatio} < ${threshold} (${cc.minimumLevel ?? "AA"})`,
    };
  }
  return {
    status: "pass",
    detail: `ratio=${cc.assertedRatio} meets ${cc.minimumLevel ?? "AA"}`,
  };
}

function checkAria(spec: ComponentSpec): CheckResult {
  const a11y = spec.accessibility;
  const role = a11y?.role;
  const ariaLabel = a11y?.ariaLabel;

  const noRole = !role || role === "none";
  const noLabel = ariaLabel === "none";

  if (noRole && isInteractive(spec.name)) {
    return { status: "fail", detail: "role missing for interactive component" };
  }
  if (noLabel) {
    return { status: "warn", detail: "ariaLabel=none — screen-reader users may lack context" };
  }
  if (noRole) {
    return { status: "warn", detail: "role not declared (non-interactive component)" };
  }
  const parts: string[] = [`role=${role}`];
  if (ariaLabel) parts.push(`ariaLabel=${ariaLabel}`);
  return { status: "pass", detail: parts.join(", ") };
}

function checkKeyboard(spec: ComponentSpec): CheckResult {
  const nav = spec.accessibility?.keyboardNav;
  // keyboardNav is boolean; false means "not declared/none"
  if (!nav) {
    return { status: "fail", detail: "keyboardNav=false or not set" };
  }
  return { status: "pass", detail: "keyboardNav=true" };
}

function checkTouch(spec: ComponentSpec): CheckResult {
  const target = spec.accessibility?.touchTarget;
  if (!target || target === "default") {
    return { status: "warn", detail: "touchTarget=default (unverified)" };
  }
  return { status: "pass", detail: `touchTarget=${target}` };
}

function checkFocus(spec: ComponentSpec): CheckResult {
  const style = spec.accessibility?.focusStyle;
  if (!style || style === "none") {
    return { status: "fail", detail: "focusStyle=none — no visible focus indicator" };
  }
  return { status: "pass", detail: `focusStyle=${style}` };
}

// ── Spec audit ────────────────────────────────────────────────────

function auditSpec(spec: ComponentSpec): SpecAuditResult {
  const checks: Record<CheckName, CheckResult> = {
    contrast: checkContrast(spec),
    aria:     checkAria(spec),
    keyboard: checkKeyboard(spec),
    touch:    checkTouch(spec),
    focus:    checkFocus(spec),
  };

  // Collect WCAG criteria for failed/warned checks
  const impact: string[] = [];
  for (const [name, result] of Object.entries(checks) as [CheckName, CheckResult][]) {
    if (result.status === "fail" || result.status === "warn") {
      for (const code of WCAG_CRITERIA[name]) {
        if (!impact.includes(code)) impact.push(code);
      }
    }
  }

  return { name: spec.name, checks, wcag_impact: impact };
}

// ── Aggregate status ──────────────────────────────────────────────

function rollup(results: SpecAuditResult[]): CheckStatus {
  let hasFail = false;
  let hasWarn = false;

  for (const r of results) {
    for (const c of Object.values(r.checks)) {
      if (c.status === "fail") hasFail = true;
      else if (c.status === "warn") hasWarn = true;
    }
  }

  if (hasFail) return "fail";
  if (hasWarn) return "warn";
  return "pass";
}

function shouldExitNonZero(results: SpecAuditResult[]): boolean {
  for (const r of results) {
    if (r.checks.contrast.status === "fail") return true;
    if (r.checks.aria.status === "fail") return true;
    if (r.checks.keyboard.status === "fail") return true;
    if (r.checks.focus.status === "fail") return true;
  }
  return false;
}

// ── Terminal formatter ────────────────────────────────────────────

const CHECK_ORDER: CheckName[] = ["contrast", "aria", "keyboard", "touch", "focus"];

function printAuditTable(payload: AuditPayload, specCount: number): void {
  console.log(`\n  wcag audit  ${specCount} spec${specCount === 1 ? "" : "s"} checked\n`);

  for (const r of payload.specs) {
    console.log(`  ${r.name}`);
    for (const key of CHECK_ORDER) {
      const c = r.checks[key];
      const icon = ICON[c.status];
      const label = `[${c.status}]`.padEnd(6);
      const name = key.padEnd(9);
      console.log(`    ${icon} ${label} ${name} ${c.detail}`);
    }
    console.log("");
  }

  const { pass, warn, fail } = payload.summary;
  const checkLabel = (n: number, word: string) => `${n} ${word}`;
  console.log(
    `  summary  ${checkLabel(pass, "pass")}  ${checkLabel(warn, "warn")}  ${checkLabel(fail, "fail")}\n`
  );
}

// ── Command registration ──────────────────────────────────────────

export function registerAuditCommand(program: Command, engine: MemoireEngine): void {
  program
    .command("audit")
    .description("Run WCAG 2.2 accessibility audit on component specs")
    .option("--wcag", "Run the 5-check WCAG accessibility audit")
    .option("--unused", "List specs with no generated code (never generated or stale)")
    .option("--component <name>", "Audit only specs matching this name (case-insensitive substring)")
    .option("--json", "Output audit results as JSON")
    .action(async (opts: { wcag?: boolean; unused?: boolean; component?: string; json?: boolean }) => {
      await engine.init();

      // ── Unused specs audit ────────────────────────────────────────
      if (opts.unused) {
        const allSpecs = await engine.registry.getAllSpecs();
        const unused = allSpecs.filter((s) => {
          if (s.type === "design" || s.type === "ia") return false; // reference-only
          return !engine.registry.getGenerationState(s.name);
        });
        const stale = allSpecs.filter((s) => {
          if (s.type === "design" || s.type === "ia") return false;
          const state = engine.registry.getGenerationState(s.name);
          if (!state) return false;
          // Spec updated after last generation
          const specUpdated = "updatedAt" in s ? new Date(s.updatedAt as string).getTime() : 0;
          const generatedAt = new Date(state.generatedAt).getTime();
          return specUpdated > generatedAt;
        });

        if (opts.json) {
          console.log(JSON.stringify({
            unused: unused.map((s) => ({ name: s.name, type: s.type })),
            stale: stale.map((s) => ({ name: s.name, type: s.type })),
            total: allSpecs.length,
            unusedCount: unused.length,
            staleCount: stale.length,
          }, null, 2));
          return;
        }

        console.log("\n  memi audit --unused\n");
        if (unused.length === 0 && stale.length === 0) {
          console.log("  All specs have been generated\n");
          return;
        }
        if (unused.length > 0) {
          console.log(`  Never generated (${unused.length}):`);
          for (const s of unused) {
            console.log(`    x  ${s.name}  ${s.type}  →  run: memi generate ${s.name}`);
          }
          console.log();
        }
        if (stale.length > 0) {
          console.log(`  Stale — spec updated since last generate (${stale.length}):`);
          for (const s of stale) {
            console.log(`    !  ${s.name}  ${s.type}  →  run: memi generate ${s.name}`);
          }
          console.log();
        }
        if (unused.length > 0) process.exitCode = 1;
        return;
      }

      if (!opts.wcag) {
        console.log("\n  Usage: memi audit --wcag [--component <name>] [--json]");
        console.log("         memi audit --unused [--json]\n");
        console.log("  Options:");
        console.log("    --wcag               Run the 5-check WCAG accessibility audit");
        console.log("    --unused             List specs with no generated code");
        console.log("    --component <name>   Filter to specs matching name (case-insensitive)");
        console.log("    --json               Output results as JSON\n");
        return;
      }

      const allSpecs = await engine.registry.getAllSpecs();

      // Filter to ComponentSpecs only
      let componentSpecs = allSpecs.filter(
        (s): s is ComponentSpec => s.type === "component"
      );

      // Apply --component filter
      if (opts.component) {
        const filter = opts.component.toLowerCase();
        componentSpecs = componentSpecs.filter((s) =>
          s.name.toLowerCase().includes(filter)
        );
      }

      const auditResults: SpecAuditResult[] = componentSpecs.map(auditSpec);

      // Count pass/warn/fail across all checks in all specs
      let passCount = 0;
      let warnCount = 0;
      let failCount = 0;
      for (const r of auditResults) {
        for (const c of Object.values(r.checks)) {
          if (c.status === "pass") passCount++;
          else if (c.status === "warn") warnCount++;
          else if (c.status === "fail") failCount++;
        }
      }

      const payload: AuditPayload = {
        status: auditResults.length === 0 ? "pass" : rollup(auditResults),
        specs: auditResults,
        summary: {
          pass: passCount,
          warn: warnCount,
          fail: failCount,
          total: componentSpecs.length,
        },
      };

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printAuditTable(payload, componentSpecs.length);
      }

      if (shouldExitNonZero(auditResults)) {
        process.exitCode = 1;
      }
    });
}
