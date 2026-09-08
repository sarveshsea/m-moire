import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../execution-policy.js";
import { writeBaseline } from "../../app-quality/baseline.js";
import { registerCiCommand } from "../../commands/ci.js";
import { registerReportCommand } from "../../commands/report.js";
import { CodeGenerator } from "../../codegen/generator.js";
import { ComponentSpecSchema } from "../../specs/types.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); resetExecutionPolicyForTests(); process.exitCode = 0; await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function root() { const path = await mkdtemp(join(tmpdir(), "memi-write-matrix-")); roots.push(path); return path; }
function allow(projectRoot: string) { configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] }); }

describe("R01 artifact containment", () => {
  it("denies direct baseline writes in locked mode", async () => {
    const projectRoot = await root(); configureExecutionPolicy({ projectRoot });
    await expect(writeBaseline(projectRoot, { schemaVersion: 1, acceptedAt: "now", entries: [] })).rejects.toMatchObject({ capability: "source-content-persistence" });
    expect(await readdir(projectRoot)).toEqual([]);
  });
  it("does not write CI SARIF outside the declared project", async () => {
    const projectRoot = await root(); const outside = await root(); allow(projectRoot);
    const output = join(outside, "result.sarif"); await writeFile(output, "sentinel");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = new Command(); registerCiCommand(program, { config: { projectRoot } } as never);
    await program.parseAsync(["ci", "--no-scope", "--sarif", output, "--json"], { from: "user" });
    expect(await readFile(output, "utf8")).toBe("sentinel");
  });
  it("preserves an external GitHub step summary and explains the skipped append", async () => {
    const projectRoot = await root(); const outside = await root(); allow(projectRoot);
    const output = join(outside, "step.md"); await writeFile(output, "sentinel"); vi.stubEnv("GITHUB_STEP_SUMMARY", output);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const program = new Command(); registerCiCommand(program, { config: { projectRoot } } as never);
    await program.parseAsync(["ci", "--no-scope", "--json"], { from: "user" });
    expect(await readFile(output, "utf8")).toBe("sentinel");
    expect(warn.mock.calls.flat().join(" ")).toMatch(/summary.*outside|outside.*summary/i);
    expect(log.mock.calls.flat().join(" ")).toContain("summaryMarkdown");
  });
  it("does not write report artifacts outside the declared project", async () => {
    const projectRoot = await root(); const outside = await root(); allow(projectRoot);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = new Command(); registerReportCommand(program, { config: { projectRoot } } as never);
    await program.parseAsync(["report", "--no-fresh", "--out", outside, "--json"], { from: "user" });
    expect(await readdir(outside)).toEqual([]);
  });
});

describe("R01 mapped component generation", () => {
  it.each([false, true])("never emits a duplicate mapped component with force=%s", async force => {
    const projectRoot = await root(); allow(projectRoot);
    const recordGeneration = vi.fn();
    const generator = new CodeGenerator({ outputDir: projectRoot, registry: { getGenerationState: () => undefined, recordGeneration } as never });
    const spec = ComponentSpecSchema.parse({ name: "Button", type: "component", purpose: "Action", level: "atom", codeConnect: { mapped: true, codebasePath: "src/ui/Button.tsx" } });
    const context = { project: { framework: "vite", language: "typescript", styling: { tailwind: true }, paths: { components: "src/components" }, shadcn: { installed: true, components: [] } }, designSystem: { tokens: [], components: [], styles: [], lastSync: "" } } as never;
    for (const result of [await generator.generate(spec, context, { force }), await generator.preview(spec, context)]) {
      expect(result.blocked).toBe(true);
      expect(result.files).toEqual([]);
      expect(result.findings).toContainEqual(expect.objectContaining({ rule: "code-connect-reuse", severity: "critical" }));
    }
    expect(recordGeneration).not.toHaveBeenCalled();
    expect(await readdir(projectRoot)).toEqual([]);
  });
});
