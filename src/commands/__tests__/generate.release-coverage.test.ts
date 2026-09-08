import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine } from "../../engine/core.js";
import { ComponentSpecSchema } from "../../specs/types.js";
import { registerGenerateCommand } from "../generate.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
let root: string; let engine: MemoireEngine; let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-generate-release-")); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); engine = new MemoireEngine({ projectRoot: root }); log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function save(name: string, extra: Record<string, unknown> = {}) { await mkdir(join(root, "specs/components"), { recursive: true }); const spec = { ...ComponentSpecSchema.parse({ name, type: "component", level: "atom", purpose: "Primary action", props: { children: "React.ReactNode" }, shadcnBase: ["Button"] }), ...extra }; await writeFile(join(root, "specs/components", `${name}.json`), JSON.stringify(spec)); }
async function run(args: string[]) { const program = new Command(); registerGenerateCommand(program, engine); await program.parseAsync(["generate", ...args], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("generate release handler contracts", () => {
 it.each([false, true])("fails batch exit status when a real spec cannot generate (mixed=%s)", async mixed => {
  await save("Broken", { type: "unsupported-fixture-type" }); if (mixed) await save("Button");
  await run(["--all", "--json"]); expect(parsed().summary.failed).toBe(1); expect(parsed().status).toBe(mixed ? "partial" : "failed"); expect(process.exitCode).toBe(1);
 });
 it.each([[[]], [["--json"]]])("handles empty generation with %j output", async mode => { const output = await run(["--all", ...mode]); if (mode.length) expect(parsed().status).toBe("empty"); else expect(output).toContain("No specs found"); });
 it.each([[[]], [["--json"]]])("reports missing and empty preview in %j output", async mode => { const output = await run(["Missing", "--preview", ...mode]); expect(output).toContain("not found"); log.mockClear(); expect(await run(["--preview", ...mode])).toContain("No specs found"); });
 it("renders preview source excerpts and findings without writes", async () => {
  await save("Button", { props: { children: "React.ReactNode", title: "string", description: "string", label: "string", caption: "string" } }); configureExecutionPolicy({ projectRoot: root }); const output = await run(["Button", "--preview", "--no-stories"]); expect(output).toContain("more lines"); expect(await readdir(root)).toEqual(["specs"]);
  await run(["--preview", "--json"]); expect(parsed().mode).toBe("preview"); expect(parsed().results[0].files.length).toBeGreaterThan(0);
 });
 it("hard-blocks mapped component writes even with force", async () => {
  await save("Mapped", { codeConnect: { mapped: true, props: {} } }); await run(["Mapped", "--force", "--json"]);
  expect(parsed().summary.blocked).toBe(1); expect(parsed().results[0].findings[0].rule).toBe("code-connect-reuse"); expect(process.exitCode).toBe(1); expect(await readdir(root)).toEqual(["specs"]);
 });
 it("summarizes mixed mapped and generated specs in human mode", async () => {
  await save("Mapped", { codeConnect: { mapped: true, props: {} } }); await save("Button");
  const output = await run(["--all"]); expect(output).toContain("1 generated, 1 blocked"); expect(output).toContain("blocked by quality gate"); expect(process.exitCode).toBe(1);
 });
 it("reports a successful real generation and options", async () => {
  await save("Button"); const output = await run(["Button", "--no-stories", "--framework", "react"]); expect(output).toContain("Button.tsx");
  await run(["--all", "--json"]); expect(parsed()).toMatchObject({ status: "completed", summary: { generated: 1, blocked: 0 } }); expect(await readFile(join(root, "generated", parsed().generatedFiles[0]), "utf8")).toContain("Button");
 });
 it("returns structured single errors and refuses optional critique without network", async () => {
  await run(["Missing", "--json"]); expect(parsed()).toMatchObject({ status: "failed", error: { message: 'Spec "Missing" not found' } });
  await run(["--preview", "--critique", "--json"]); expect(parsed().error.message).toContain("network");
 });
 it("denies direct writes under locked policy without creating directories", async () => { configureExecutionPolicy({ projectRoot: root }); await run(["--all", "--json"]); expect(parsed().error.message).toContain("source-content-persistence"); expect(await readdir(root)).toEqual([]); });
});
