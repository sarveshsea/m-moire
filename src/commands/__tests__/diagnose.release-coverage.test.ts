import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDiagnoseCommand } from "../diagnose.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { diagnoseAppQuality } from "../../app-quality/engine.js";
import { buildBaseline } from "../../app-quality/baseline.js";
import { entryFromDiagnosis } from "../../app-quality/history.js";
let root: string;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-diagnose-release-")); configureExecutionPolicy({ projectRoot: root }); log = vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown, callback?: (error?: Error | null) => void) => { console.log(String(chunk).replace(/\n$/, "")); callback?.(); return true; }) as typeof process.stdout.write); });
afterEach(async () => { process.exitCode = 0; vi.unstubAllEnvs(); vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function file(path: string, content: string) { const { dirname } = await import("node:path"); await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content); }
async function debt() { await file("src/Page.tsx", 'export function Page(){return <div className="bg-[#123456] text-[#abcdef] border-[#343434] shadow-[#555555] outline-[#454545]"><button className="p-1">Go</button><input /></div>}'); }
async function run(args: string[]) { const program = new Command(); registerDiagnoseCommand(program, { config: { projectRoot: root } } as never); await program.parseAsync(["diagnose", ...args], { from: "user" }); return log.mock.calls.map(c => String(c[0])).join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("diagnose release options and evidence", () => {
  it.each(["bad", "0"])("rejects invalid severity %s in human mode", async severity => { expect(await run(["--no-write", "--fail-on", severity])).toContain("Invalid --fail-on"); expect(process.exitCode).toBe(1); });
  it.each([["--context-files", "0"], ["--context-issues", "-1"], ["--context-routing", "invalid"]])("reports invalid agent context %s", async (flag, value) => {
    await run(["--no-write", "--agent-context", flag, value]); expect(parsed().status).toBe("failed"); expect(process.exitCode).toBe(1);
  });
  it.each(["auto", "full", "index-only", "abstain"])("builds bounded %s agent context from a real source file", async mode => {
    await debt(); await run(["--no-write", "--agent-context", "--context-routing", mode, "--context-files", "1", "--context-issues", "1", "--fail-on", "none"]);
    expect(parsed().gate).toMatchObject({ failed: false, failOn: "none" }); expect(parsed().status).not.toBe("failed");
    expect(await readdir(root)).toEqual(["src"]);
  });
  it("falls back from an invalid max-files value and reports human source evidence", async () => {
    await debt(); const output = await run(["--no-write", "--max-files", "invalid", "--fail-on", "low"]);
    expect(output).toContain("HIGHEST IMPACT ISSUES"); expect(output).toContain("evidence:"); expect(output).toContain("Gate:"); expect(process.exitCode).toBe(1);
  });
  it("prints empty/unassessed source coverage and an empty trend", async () => {
    const output = await run(["--no-write", "--trend", "--fail-on-regression", "--fail-on", "none"]);
    expect(output).toContain("No comparable history"); expect(output).toContain("Regression check skipped"); expect(output).toContain("unassessed");
  });
  it("prints native partial and Metal unassessed coverage", async () => {
    await file("Sources/View.swift", 'import SwiftUI\nstruct View: SwiftUI.View { var body: some SwiftUI.View { Text("Hi").phaseAnimator([false, true]) { view, active in view.opacity(active ? 1 : 0) } } }');
    await file("Sources/Kernel.metal", '#include <metal_stdlib>\nusing namespace metal;');
    const output = await run(["--no-write", "--fail-on", "none"]); expect(output).toContain("SwiftUI files"); expect(output).toContain("Metal files");
  });
  it("shows explicit source scope without Git and expanded imports", async () => {
    await debt(); const output = await run(["--no-write", "--files", "src/Page.tsx", "--expand-imports", "--fail-on", "none"]); expect(output).toContain("Scope:");
  });
  it("shows suppression while retaining baseline findings", async () => {
    await debt(); const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: false });
    await file(".memoire/baseline.json", JSON.stringify(buildBaseline(diagnosis.issues, {})));
    const output = await run(["--no-write", "--baseline", "--fail-on", "low"]); expect(output).toContain("accepted finding(s) suppressed"); expect(process.exitCode ?? 0).toBe(0);
  });
  it("fails missing baseline in JSON and sanitizes receipt-only errors", async () => {
    await run(["--no-write", "--baseline", "--json"]); expect(parsed().error).toContain("does not exist");
    await run(["--receipt-only", "--baseline"]); expect(parsed().evidence.counts.errors).toBe(1); expect(JSON.stringify(parsed())).not.toContain(root);
  });
  it.each([[[]], [["--json"]], [["--agent-context"]], [["--receipt-only"]]])("fails a comparable score regression in output mode %j", async mode => {
    await debt(); await mkdir(join(root, ".memoire/app-quality"), { recursive: true }); const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: false });
    const previous = { ...entryFromDiagnosis(diagnosis), at: "2025-01-01T00:00:00.000Z", score: 100, sha: "fixture-base" };
    await file(".memoire/app-quality/history.jsonl", JSON.stringify(previous)+"\n");
    const output = await run(["--no-write", "--trend", "--fail-on-regression", "invalid", "--fail-on", "none", ...mode]);
    expect(process.exitCode).toBe(1);
    if (!mode.length) expect(output).toContain("Regression: score");
    else if (mode[0] === "--receipt-only") expect(parsed().evidence.counts.gateFailed).toBe(1);
    else expect(parsed().gate.regression).toMatchObject({ comparable: true, regressed: true });
  });
  it("writes reports only with explicit source and project grants", async () => {
    configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    await debt(); expect(await run(["--fail-on", "none"])).toContain("Reports written"); expect(await readdir(join(root, ".memoire/app-quality"))).toContain("diagnosis.json");
  });
  it("rejects conflicting metadata/context modes and includes only a valid build commit", async () => {
    vi.stubEnv("MEMI_BUILD_COMMIT", "a".repeat(40)); await run(["--receipt-only", "--agent-context"]); expect(parsed().artifact.commit).toBe("a".repeat(40)); expect(parsed().evidence.counts.errors).toBe(1);
    vi.stubEnv("MEMI_BUILD_COMMIT", "invalid"); await run(["--receipt-only", "--fail-on", "none"]); expect(parsed().artifact.commit).toBe("unknown");
  });
});
