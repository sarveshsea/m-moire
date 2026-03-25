/**
 * Doctor Command — Self-diagnostic health check for the Memoire engine.
 * Validates project setup, design system, specs, tokens, Figma bridge,
 * preview files, Node version, dependencies, and workspace integrity.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { access, readdir, constants } from "fs/promises";
import { join } from "path";

type CheckStatus = "pass" | "warn" | "fail";

interface CheckResult {
  status: CheckStatus;
  label: string;
  detail: string;
}

const ICON: Record<CheckStatus, string> = {
  pass: "+",
  warn: "!",
  fail: "x",
};

export function registerDoctorCommand(program: Command, engine: MemoireEngine): void {
  program
    .command("doctor")
    .description("Run self-diagnostic checks on the Memoire engine")
    .action(async () => {
      const results: CheckResult[] = [];

      // 1. Project detected
      try {
        await engine.init();
        const project = engine.project;
        if (project) {
          const parts: string[] = [project.framework];
          if (project.styling.tailwind) parts.push("Tailwind");
          results.push({ status: "pass", label: "Project detected", detail: parts.join(" + ") });
        } else {
          results.push({ status: "fail", label: "Project detected", detail: "no project context found" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ status: "fail", label: "Project detected", detail: msg });
      }

      // 2. Design system loaded
      try {
        await engine.registry.load();
        const ds = engine.registry.designSystem;
        const tokenCount = ds.tokens.length;
        if (tokenCount > 0) {
          const byType: Record<string, number> = {};
          for (const t of ds.tokens) {
            byType[t.type] = (byType[t.type] ?? 0) + 1;
          }
          const breakdown = Object.entries(byType)
            .map(([type, count]) => `${type}: ${count}`)
            .join(", ");
          results.push({
            status: "pass",
            label: "Design system",
            detail: `${tokenCount} tokens (${breakdown})`,
          });
        } else {
          results.push({ status: "warn", label: "Design system", detail: "no tokens loaded" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ status: "fail", label: "Design system", detail: msg });
      }

      // 3. Specs valid
      try {
        const specs = await engine.registry.getAllSpecs();
        let valid = 0;
        let warnings = 0;
        const issues: string[] = [];
        const byType: Record<string, number> = {};

        for (const spec of specs) {
          byType[spec.type] = (byType[spec.type] ?? 0) + 1;
          let hasIssue = false;

          if (!("purpose" in spec) || !spec.purpose) {
            issues.push(`${spec.name}: missing purpose`);
            hasIssue = true;
          }
          if (spec.type === "component" && "shadcnBase" in spec) {
            const comp = spec as { shadcnBase?: string[] };
            if (!comp.shadcnBase || comp.shadcnBase.length === 0) {
              issues.push(`${spec.name}: missing shadcnBase`);
              hasIssue = true;
            }
          }

          if (hasIssue) {
            warnings++;
          } else {
            valid++;
          }
        }

        const typeSummary = Object.entries(byType)
          .map(([type, count]) => `${type}: ${count}`)
          .join(", ");

        if (warnings > 0) {
          results.push({
            status: "warn",
            label: "Specs",
            detail: `${valid} valid, ${warnings} with issues (${typeSummary}). ${issues.join("; ")}`,
          });
        } else if (specs.length > 0) {
          results.push({
            status: "pass",
            label: "Specs",
            detail: `${valid} valid (${typeSummary})`,
          });
        } else {
          results.push({ status: "warn", label: "Specs", detail: "no specs found" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ status: "fail", label: "Specs", detail: msg });
      }

      // 4. Token coverage
      {
        const ds = engine.registry.designSystem;
        const requiredTypes = ["color", "spacing", "typography", "radius"] as const;
        const presentTypes = new Set(ds.tokens.map((t) => t.type));
        const missing = requiredTypes.filter((t) => !presentTypes.has(t));

        if (missing.length === 0) {
          results.push({ status: "pass", label: "Token coverage", detail: "all core types present" });
        } else {
          results.push({
            status: "fail",
            label: "Token gap",
            detail: `no ${missing.join(", ")} tokens`,
          });
        }
      }

      // 5. Figma bridge
      try {
        if (engine.figma.isConnected) {
          results.push({ status: "pass", label: "Figma bridge", detail: "connected" });
        } else {
          results.push({ status: "warn", label: "Figma bridge", detail: "not connected (ports 9223-9232)" });
        }
      } catch {
        results.push({ status: "warn", label: "Figma bridge", detail: "unable to check connection" });
      }

      // 6. Preview files
      try {
        const previewDir = join(engine.config.projectRoot, "preview");
        const files = await readdir(previewDir);
        const htmlFiles = files.filter((f) => f.endsWith(".html"));
        if (htmlFiles.length > 0) {
          results.push({ status: "pass", label: "Preview", detail: `${htmlFiles.length} pages` });
        } else {
          results.push({ status: "warn", label: "Preview", detail: "no HTML files in preview/" });
        }
      } catch {
        results.push({ status: "fail", label: "Preview", detail: "preview/ directory not found" });
      }

      // 7. Node version
      {
        const version = process.version;
        const major = parseInt(version.slice(1).split(".")[0], 10);
        if (major >= 20) {
          results.push({ status: "pass", label: "Node", detail: version });
        } else {
          results.push({ status: "fail", label: "Node", detail: `${version} (requires >= 20)` });
        }
      }

      // 8. Dependencies
      try {
        const nmPath = join(engine.config.projectRoot, "node_modules");
        await access(nmPath, constants.R_OK);
        results.push({ status: "pass", label: "Dependencies", detail: "installed" });
      } catch {
        results.push({ status: "fail", label: "Dependencies", detail: "node_modules not found" });
      }

      // 9. Workspace
      try {
        const memoireDir = join(engine.config.projectRoot, ".memoire");
        await access(memoireDir, constants.R_OK | constants.W_OK);
        results.push({ status: "pass", label: "Workspace", detail: ".memoire/ OK" });
      } catch {
        results.push({ status: "fail", label: "Workspace", detail: ".memoire/ missing or not writable" });
      }

      // Print results
      console.log("\n  Memoire Doctor\n");

      for (const r of results) {
        console.log(`  ${ICON[r.status]} ${r.label}: ${r.detail}`);
      }

      const pass = results.filter((r) => r.status === "pass").length;
      const warn = results.filter((r) => r.status === "warn").length;
      const fail = results.filter((r) => r.status === "fail").length;

      console.log(`\n  ${pass} passed, ${warn} warnings, ${fail} failed\n`);
    });
}
