import { getExecutionPolicy } from "../security/execution-policy.js";
import { assertSourceOutput } from "../security/source-output.js";
import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { CodegenResult, Finding } from "../codegen/generator.js";
import { ui } from "../tui/format.js";
import { checkCapabilities, formatCapabilityError } from "../engine/capabilities.js";

export interface GeneratePayload {
  mode: "single" | "all";
  status: "completed" | "partial" | "failed" | "empty";
  target: string | null;
  options: {
    all: boolean;
    json: boolean;
    preview: boolean;
    force: boolean;
  };
  summary: {
    totalSpecs: number;
    attempted: number;
    generated: number;
    failed: number;
    blocked: number;
  };
  results: GenerateResultPayload[];
  generatedFiles: string[];
  elapsedMs: number;
  error?: {
    message: string;
  };
}

export interface GenerateResultPayload {
  name: string;
  status: "generated" | "failed" | "blocked";
  entryFile: string | null;
  error: string | null;
  findings: Finding[];
  critique?: { score: number; summary: string };
}

export function registerGenerateCommand(program: Command, engine: MemoireEngine) {
  program
    .command("generate [specName]")
    .description("Generate code from a spec (or all specs if no name given)")
    .option("-a, --all", "Generate all specs")
    .option("--json", "Output generate results as JSON")
    .option("--critique", "Request optional AI layout critique (requires an explicit network grant)")
    .option("--preview", "Show generated code diff without writing files")
    .option("--no-stories", "Skip Storybook story generation")
    .option("--framework <framework>", "Output framework: react (default), vue, svelte")
    .option("-f, --force", "Write files despite critical quality-gate findings")
    .option("--strict-skill-compliance", "Promote atomic/motion skill-compliance findings to critical (blocking) severity")
    .action(async (specName: string | undefined, opts: { all?: boolean; json?: boolean; preview?: boolean; critique?: boolean; stories?: boolean; framework?: string; force?: boolean; strictSkillCompliance?: boolean }) => {
      const startedAt = Date.now();
      const generateAll = Boolean(opts.all || !specName);
      const force = opts.force === true;

      try {
        if (!opts.preview) await assertSourceOutput(engine.config.projectRoot);
        if (opts.critique) getExecutionPolicy().assert("network", "request an AI layout critique");
        await engine.initReadOnly();
        // Policy can promote skill-compliance findings to blocking severity;
        // the CLI flag is the per-run override on top of it.
        const { loadPolicy } = await import("../app-quality/policy.js");
        const policy = await loadPolicy(engine.config.projectRoot);
        // Apply --no-stories flag — Commander's --no-X flags set opts.X to false
        engine.codegen.setOptions({
          layoutCritique: opts.critique === true,
          noStories: opts.stories === false,
          framework: (opts.framework as "react" | "vue" | "svelte") || "react",
          strictSkillCompliance: opts.strictSkillCompliance === true || policy.skillComplianceSeverity === "critical",
        });

        // ── Preview mode — generate in memory, no disk writes ──
        if (opts.preview) {
          const specs = generateAll
            ? await engine.registry.getAllSpecs()
            : specName
              ? [await engine.registry.getSpec(specName)].filter(Boolean)
              : [];

          if (specs.length === 0) {
            if (opts.json) {
              console.log(JSON.stringify({ mode: "preview", results: [], error: specName ? `Spec "${specName}" not found` : "No specs found" }, null, 2));
            } else {
              console.log();
              console.log(ui.pending(specName ? `Spec "${specName}" not found.` : "No specs found."));
              console.log();
            }
            return;
          }

          const project = engine.project;
          if (!project) {
            throw new Error("Engine not initialized. Call init() before generating code.");
          }

          const ctx = { project, designSystem: engine.registry.designSystem };
          const previewResults: { name: string; files: { path: string; content: string }[]; findings: Finding[] }[] = [];

          for (const spec of specs) {
            if (!spec) continue;
            const result: CodegenResult = await engine.codegen.preview(spec, ctx);
            // Findings are shown here (so --preview isn't blind to what would
            // block a real generate) but critique is never run in preview —
            // preview() never calls the AI critic, so there's nothing to show.
            previewResults.push({ name: spec.name, files: result.files, findings: result.findings });
          }

          if (opts.json) {
            console.log(JSON.stringify({
              mode: "preview",
              results: previewResults.map((r) => ({
                name: r.name,
                files: r.files.map((f) => ({ path: f.path, content: f.content })),
                findings: r.findings,
              })),
            }, null, 2));
          } else {
            console.log();
            for (const r of previewResults) {
              for (const f of r.files) {
                console.log(ui.section(f.path));
                const lines = f.content.split("\n");
                const preview = lines.slice(0, 20).join("\n");
                console.log(preview);
                if (lines.length > 20) {
                  console.log(ui.dim(`  ... ${lines.length - 20} more lines`));
                }
                console.log();
              }
              for (const finding of r.findings) {
                console.log(ui.dim(`  [${finding.severity}] ${finding.message} (${finding.rule})`));
              }
            }
          }
          return;
        }

        if (generateAll) {
          const specs = await engine.registry.getAllSpecs();
          if (specs.length === 0) {
            const payload = buildGeneratePayload({
              mode: "all",
              target: null,
              options: {
                all: generateAll,
                json: Boolean(opts.json),
                preview: false,
                force,
              },
              results: [],
              generatedFiles: [],
              elapsedMs: Date.now() - startedAt,
            });

            if (opts.json) {
              console.log(JSON.stringify(payload, null, 2));
            } else {
              console.log();
            console.log(ui.pending("No specs found."));
            console.log();
            console.log("  Next steps:");
            console.log("    memi spec component <Name>    Create a component spec manually");
            console.log("    memi pull                     Pull from Figma (auto-generates specs)");
            console.log("    memi init                     Initialize with starter specs");
            console.log();
            }
            return;
          }

          if (!opts.json) {
            console.log(ui.brand("GENERATE"));
            console.log(ui.section("CODEGEN"));
          }

          const results: GenerateResultPayload[] = [];
          const generatedFiles: string[] = [];
          let anyBlocked = false;

          for (const spec of specs) {
            try {
              const result = await engine.generateFromSpec(spec.name, { force });
              if (result.blocked) {
                anyBlocked = true;
                results.push({
                  name: spec.name,
                  status: "blocked",
                  entryFile: null,
                  error: null,
                  findings: result.findings,
                });
                if (!opts.json) {
                  console.log(ui.fail(`${spec.name}  blocked by quality gate`));
                  for (const finding of result.findings.filter((f) => f.severity === "critical")) {
                    console.log(ui.dim(`    ${finding.message} (${finding.rule})`));
                  }
                }
                continue;
              }

              results.push({
                name: spec.name,
                status: "generated",
                entryFile: result.entryFile,
                error: null,
                findings: result.findings,
                critique: result.critique ? { score: result.critique.score, summary: result.critique.summary } : undefined,
              });
              generatedFiles.push(result.entryFile);
              if (!opts.json) {
                console.log(ui.ok(`+ ${result.entryFile}`));
                for (const finding of result.findings.filter((f) => f.severity === "warning")) {
                  console.log(ui.dim(`    Quality: ${finding.message} (${finding.rule})`));
                }
                if (result.critique) {
                  console.log(ui.dim(`    Critique: ${result.critique.summary} (score ${result.critique.score}/100)`));
                }
              }
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              results.push({
                name: spec.name,
                status: "failed",
                entryFile: null,
                error: msg,
                findings: [],
              });

              if (!opts.json) {
                console.log(ui.fail(spec.name + ui.dim("  " + msg)));
              }
            }
          }

          const payload = buildGeneratePayload({
            mode: "all",
            target: null,
            options: {
              all: generateAll,
              json: Boolean(opts.json),
              preview: false,
              force,
            },
            results,
            generatedFiles,
            elapsedMs: Date.now() - startedAt,
          });

          if (anyBlocked) process.exitCode = 1;

          if (opts.json) {
            console.log(JSON.stringify(payload, null, 2));
            return;
          }

          console.log();
          console.log(ui.rule());
          console.log();
          const parts = [`${payload.summary.generated} generated`];
          if (payload.summary.blocked > 0) parts.push(`${payload.summary.blocked} blocked`);
          if (payload.summary.failed > 0) parts.push(`${payload.summary.failed} failed`);
          console.log(ui.ready("DONE") + ui.dim(`  ${parts.join(", ")}`));
          if (anyBlocked) {
            console.log(ui.dim("  Run again with --force to write blocked specs anyway."));
          }
          console.log();
          return;
        }

        if (!specName) {
          throw new Error("Missing spec name for single generation");
        }

        const result = await engine.generateFromSpec(specName, { force });

        if (result.blocked) {
          const payload = buildGeneratePayload({
            mode: "single",
            target: specName,
            options: { all: false, json: Boolean(opts.json), preview: false, force },
            results: [{
              name: specName,
              status: "blocked",
              entryFile: null,
              error: null,
              findings: result.findings,
            }],
            generatedFiles: [],
            elapsedMs: Date.now() - startedAt,
          });

          if (opts.json) {
            console.log(JSON.stringify(payload, null, 2));
            process.exitCode = 1;
            return;
          }

          console.log();
          console.log(ui.fail(`${specName}  blocked by quality gate`));
          for (const finding of result.findings.filter((f) => f.severity === "critical")) {
            console.log(ui.dim(`  ${finding.message} (${finding.rule})`) + (finding.fix ? ui.dim(` — ${finding.fix}`) : ""));
          }
          console.log();
          console.log(ui.dim("  Run again with --force to write anyway, or fix the spec/design system first."));
          console.log();
          process.exit(1);
        }

        const payload = buildGeneratePayload({
          mode: "single",
          target: specName,
          options: {
            all: false,
            json: Boolean(opts.json),
            preview: false,
            force,
          },
          results: [{
            name: specName,
            status: "generated",
            entryFile: result.entryFile,
            error: null,
            findings: result.findings,
            critique: result.critique ? { score: result.critique.score, summary: result.critique.summary } : undefined,
          }],
          generatedFiles: [result.entryFile],
          elapsedMs: Date.now() - startedAt,
        });

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log();
        console.log(ui.ok(result.entryFile));
        for (const finding of result.findings.filter((f) => f.severity === "warning")) {
          console.log(ui.dim(`  Quality: ${finding.message} (${finding.rule})`));
        }
        if (result.critique) {
          console.log(ui.dim(`  Critique: ${result.critique.summary} (score ${result.critique.score}/100)`));
        }
        console.log();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (opts.json) {
          const payload = buildGeneratePayload({
            mode: generateAll ? "all" : "single",
            target: generateAll ? null : specName ?? null,
            options: {
              all: generateAll,
              json: Boolean(opts.json),
              preview: false,
              force,
            },
            results: [{
              name: specName ?? "all",
              status: "failed",
              entryFile: null,
              error: msg,
              findings: [],
            }],
            generatedFiles: [],
            elapsedMs: Date.now() - startedAt,
            error: { message: msg },
          });
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }

        console.log();
        console.log(ui.fail(msg));
        console.log();
        process.exit(1);
      }
    });
}

function buildGeneratePayload(input: {
  mode: "single" | "all";
  target: string | null;
  options: GeneratePayload["options"];
  results: GenerateResultPayload[];
  generatedFiles: string[];
  elapsedMs: number;
  error?: {
    message: string;
  };
}): GeneratePayload {
  const generated = input.results.filter((result) => result.status === "generated").length;
  const failed = input.results.filter((result) => result.status === "failed").length;
  const blocked = input.results.filter((result) => result.status === "blocked").length;
  const totalSpecs = input.mode === "single"
    ? 1
    : input.results.length;

  return {
    mode: input.mode,
    status: totalSpecs === 0
      ? "empty"
      : (failed > 0 || blocked > 0)
        ? generated > 0
          ? "partial"
          : "failed"
        : "completed",
    target: input.target,
    options: input.options,
    summary: {
      totalSpecs,
      attempted: input.results.length,
      generated,
      failed,
      blocked,
    },
    results: input.results,
    generatedFiles: input.generatedFiles,
    elapsedMs: input.elapsedMs,
    error: input.error,
  };
}
