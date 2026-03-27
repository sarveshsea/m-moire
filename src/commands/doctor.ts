/**
 * Doctor Command — Self-diagnostic health check for the Memoire engine.
 * Validates project setup, design system, specs, tokens, Figma bridge,
 * preview files, Node version, dependencies, and workspace integrity.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { access, readdir, constants } from "fs/promises";
import { join } from "path";
import { resolvePluginHealth } from "../plugin/install-info.js";

type CheckStatus = "pass" | "warn" | "fail";
type CheckCategory = "project" | "design" | "plugin" | "bridge" | "runtime" | "workspace";

interface CheckResult {
  code: string;
  category: CheckCategory;
  status: CheckStatus;
  label: string;
  detail: string;
  meta?: Record<string, unknown>;
}

interface DoctorPayload {
  summary: {
    total: number;
    pass: number;
    warn: number;
    fail: number;
  };
  checks: CheckResult[];
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
    .option("--json", "Output doctor results as JSON")
    .action(async (opts: { json?: boolean }) => {
      const results: CheckResult[] = [];
      const push = (
        code: string,
        category: CheckCategory,
        status: CheckStatus,
        label: string,
        detail: string,
        meta?: Record<string, unknown>,
      ) => {
        results.push({ code, category, status, label, detail, meta });
      };

      // 1. Project detected
      try {
        await engine.init();
        const project = engine.project;
        if (project) {
          const parts: string[] = [project.framework];
          if (project.styling.tailwind) parts.push("Tailwind");
          push("project.detected", "project", "pass", "Project detected", parts.join(" + "), {
            framework: project.framework,
            tailwind: project.styling.tailwind,
          });
        } else {
          push("project.detected", "project", "fail", "Project detected", "no project context found");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push("project.detected", "project", "fail", "Project detected", msg);
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
          push("design.system", "design", "pass", "Design system", `${tokenCount} tokens (${breakdown})`, {
            tokens: tokenCount,
            breakdown: byType,
          });
        } else {
          push("design.system", "design", "warn", "Design system", "no tokens loaded");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push("design.system", "design", "fail", "Design system", msg);
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
          push("design.specs", "design", "warn", "Specs", `${valid} valid, ${warnings} with issues (${typeSummary}). ${issues.join("; ")}`, {
            valid,
            warnings,
            types: byType,
          });
        } else if (specs.length > 0) {
          push("design.specs", "design", "pass", "Specs", `${valid} valid (${typeSummary})`, {
            valid,
            types: byType,
          });
        } else {
          push("design.specs", "design", "warn", "Specs", "no specs found");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push("design.specs", "design", "fail", "Specs", msg);
      }

      // 4. Token coverage
      {
        const ds = engine.registry.designSystem;
        const requiredTypes = ["color", "spacing", "typography", "radius"] as const;
        const presentTypes = new Set(ds.tokens.map((t) => t.type));
        const missing = requiredTypes.filter((t) => !presentTypes.has(t));

        if (missing.length === 0) {
          push("design.tokens", "design", "pass", "Token coverage", "all core types present", {
            requiredTypes,
          });
        } else {
          push("design.tokens", "design", "fail", "Token gap", `no ${missing.join(", ")} tokens`, {
            missing,
          });
        }
      }

      // 5. Plugin bundle
      try {
        const plugin = await resolvePluginHealth(engine.config.projectRoot);
        const missing = [
          !plugin.localBundle.meta?.manifest.exists ? "manifest.json" : "",
          !plugin.localBundle.meta?.code.exists ? "code.js" : "",
          !plugin.localBundle.meta?.ui.exists ? "ui.html" : "",
          !plugin.localBundle.meta ? "widget-meta.json" : "",
        ].filter(Boolean);

        if (plugin.localBundle.ready && plugin.localBundle.meta) {
          push("plugin.bundle", "plugin", "pass", "Plugin bundle", "manifest, code.js, ui.html, and widget-meta.json ready", {
            root: plugin.localBundle.root,
            builtAt: plugin.localBundle.meta.builtAt,
            packageVersion: plugin.localBundle.meta.packageVersion,
            widgetVersion: plugin.localBundle.meta.widgetVersion,
          });
        } else {
          push("plugin.bundle", "plugin", "fail", "Plugin bundle", `missing ${missing.join(", ") || "plugin assets"}`, {
            root: plugin.localBundle.root,
            missing,
          });
        }

        if (plugin.health === "current") {
          push("plugin.install", "plugin", "pass", "Plugin install", `${plugin.installPath} is current`, {
            source: plugin.source,
            health: plugin.health,
          });
        } else if (plugin.health === "local-only" || plugin.health === "symlink-risk" || plugin.health === "stale-home-copy") {
          push("plugin.install", "plugin", "warn", "Plugin install", `${plugin.installPath} (${plugin.health})`, {
            source: plugin.source,
            health: plugin.health,
            manifestPath: plugin.manifestPath,
          });
        } else {
          push("plugin.install", "plugin", "fail", "Plugin install", `${plugin.installPath} (${plugin.health})`, {
            source: plugin.source,
            health: plugin.health,
            manifestPath: plugin.manifestPath,
          });
        }

        if (plugin.widgetVersion || plugin.packageVersion || plugin.builtAt) {
          push(
            "plugin.widget-meta",
            "plugin",
            "pass",
            "Widget V2 metadata",
            `widget ${plugin.widgetVersion ?? "unknown"} / package ${plugin.packageVersion ?? "unknown"}`,
            {
              widgetVersion: plugin.widgetVersion,
              packageVersion: plugin.packageVersion,
              builtAt: plugin.builtAt,
              bundleHash: plugin.bundleHash,
            },
          );
        } else {
          push("plugin.widget-meta", "plugin", "warn", "Widget V2 metadata", "metadata not available", {
            manifestPath: plugin.manifestPath,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        push("plugin.bundle", "plugin", "fail", "Plugin bundle", msg);
        push("plugin.install", "plugin", "fail", "Plugin install", msg);
      }

      // 6. Figma bridge
      try {
        const bridgeStatus = typeof engine.figma.getStatus === "function"
          ? engine.figma.getStatus()
          : { running: false, port: 0, clients: [] };

        if (engine.figma.isConnected) {
          push("bridge.figma", "bridge", "pass", "Figma bridge", `connected (${bridgeStatus.clients.length} client${bridgeStatus.clients.length === 1 ? "" : "s"})`, {
            running: bridgeStatus.running,
            port: bridgeStatus.port,
            clients: bridgeStatus.clients.length,
          });
        } else if (bridgeStatus.running) {
          push("bridge.figma", "bridge", "warn", "Figma bridge", `listening on :${bridgeStatus.port} — waiting for the Control Plane`, {
            running: bridgeStatus.running,
            port: bridgeStatus.port,
          });
        } else {
          push("bridge.figma", "bridge", "warn", "Figma bridge", "not connected (ports 9223-9232)", {
            running: bridgeStatus.running,
            port: bridgeStatus.port,
          });
        }
      } catch {
        push("bridge.figma", "bridge", "warn", "Figma bridge", "unable to check connection");
      }

      // 7. Preview files
      try {
        const previewDir = join(engine.config.projectRoot, "preview");
        const files = await readdir(previewDir);
        const htmlFiles = files.filter((f) => f.endsWith(".html"));
        if (htmlFiles.length > 0) {
          push("runtime.preview", "runtime", "pass", "Preview", `${htmlFiles.length} pages`, {
            htmlFiles,
          });
        } else {
          push("runtime.preview", "runtime", "warn", "Preview", "no HTML files in preview/");
        }
      } catch {
        push("runtime.preview", "runtime", "fail", "Preview", "preview/ directory not found");
      }

      // 8. Node version
      {
        const version = process.version;
        const major = parseInt(version.slice(1).split(".")[0], 10);
        if (major >= 20) {
          push("runtime.node", "runtime", "pass", "Node", version, { version });
        } else {
          push("runtime.node", "runtime", "fail", "Node", `${version} (requires >= 20)`, { version });
        }
      }

      // 9. Dependencies
      try {
        const nmPath = join(engine.config.projectRoot, "node_modules");
        await access(nmPath, constants.R_OK);
        push("runtime.dependencies", "runtime", "pass", "Dependencies", "installed");
      } catch {
        push("runtime.dependencies", "runtime", "fail", "Dependencies", "node_modules not found");
      }

      // 10. Workspace
      try {
        const memoireDir = join(engine.config.projectRoot, ".memoire");
        await access(memoireDir, constants.R_OK | constants.W_OK);
        push("workspace.memoire", "workspace", "pass", "Workspace", ".memoire/ OK");
      } catch {
        push("workspace.memoire", "workspace", "fail", "Workspace", ".memoire/ missing or not writable");
      }

      const payload = buildDoctorPayload(results);

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      // Print results
      console.log("\n  Memoire Doctor\n");

      const categories: CheckCategory[] = ["project", "design", "plugin", "bridge", "runtime", "workspace"];
      const labels: Record<CheckCategory, string> = {
        project: "Project",
        design: "Design",
        plugin: "Plugin",
        bridge: "Bridge",
        runtime: "Runtime",
        workspace: "Workspace",
      };

      for (const category of categories) {
        const group = results.filter((result) => result.category === category);
        if (!group.length) continue;
        console.log(`  ${labels[category]}`);
        for (const r of group) {
          console.log(`    ${ICON[r.status]} ${r.label}: ${r.detail}`);
        }
        console.log("");
      }

      console.log(`\n  ${payload.summary.pass} passed, ${payload.summary.warn} warnings, ${payload.summary.fail} failed\n`);
    });
}

function buildDoctorPayload(results: CheckResult[]): DoctorPayload {
  const pass = results.filter((r) => r.status === "pass").length;
  const warn = results.filter((r) => r.status === "warn").length;
  const fail = results.filter((r) => r.status === "fail").length;

  return {
    summary: {
      total: results.length,
      pass,
      warn,
      fail,
    },
    checks: results,
  };
}
