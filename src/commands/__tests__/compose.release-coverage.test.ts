import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoireEngine } from "../../engine/core.js";
import { registerComposeCommand } from "../compose.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
const ai = vi.hoisted(() => ({ enabled: false, tracker: null as {callCount: number; summary: string | null} | null }));
vi.mock("../../ai/index.js", () => ({ hasAI: () => ai.enabled, getTracker: () => ai.tracker, getAI: () => null }));
let root: string; let engine: MemoireEngine; let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-compose-release-")); await writeFile(join(root, "package.json"), JSON.stringify({ name: "compose-fixture" })); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); engine = new MemoireEngine({ projectRoot: root }); vi.spyOn(engine.taskQueue, "start").mockImplementation(() => {}); vi.spyOn(engine.agentRegistry, "startHealthCheck").mockImplementation(() => {}); log = vi.spyOn(console, "log").mockImplementation(() => {}); ai.enabled = false; ai.tracker = null; });
afterEach(async () => { process.exitCode = 0; resetExecutionPolicyForTests(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
async function run(intent: string, args: string[] = []) { const program = new Command(); registerComposeCommand(program, engine); await program.parseAsync(["compose", intent, ...args], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const payload = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("deferred compose handler deterministic behavior", () => {
 it.each(["update the color palette to use warmer tones", "create a login page with email and password fields"])("prints a heuristic dry-run plan for %s", async intent => { const output = await run(intent, ["--dry-run", "--no-figma", "--verbose"]); expect(output).toContain("Plan ("); expect(output).toContain("Dry run"); expect(output).toContain("heuristic fallbacks"); expect(output).not.toContain("Executing..."); expect(process.exitCode ?? 0).toBe(0); expect(await readdir(root)).not.toContain("generated"); });
 it("executes a real token update and describes changed values", async () => { const output = await run("update the color palette to use warmer tones", ["--no-figma"]); expect(output).toContain("Executing..."); expect(output).toContain("CHANGES"); expect(output).toContain("completed"); expect(engine.registry.designSystem.tokens.length).toBeGreaterThan(0); expect(process.exitCode ?? 0).toBe(0); });
 it("serializes actual completed tasks and direct API usage metadata", async () => { ai.enabled = true; ai.tracker = { callCount: 2, summary: "2 fixture calls" }; await run("update the color palette to use warmer tones", ["--json", "--no-figma", "--verbose"]); expect(payload()).toMatchObject({ ai: { apiKey: true, calls: 2, usage: "2 fixture calls", mode: "direct-api" }, options: { dryRun: false, autoSync: false, verbose: true }, execution: { status: "completed" } }); expect(payload().execution.mutations.length).toBeGreaterThan(0); expect(payload().plan.tasks.every((task: {status: string; completedAt: string}) => task.status === "completed" && task.completedAt)).toBe(true); });
 it.each(["fixture usage", null])("prints tracked AI usage %s", async summary => { ai.enabled = true; ai.tracker = { callCount: 1, summary }; const output = await run("update color palette", ["--dry-run"]); expect(output).toContain("AI Usage"); expect(output).toContain(summary ?? "unknown"); expect(output).toContain("enabled"); });
 it.each([new Error("initialization unavailable"), "initialization unavailable"])("returns structured initialization failure %j", async error => { vi.spyOn(engine, "init").mockRejectedValue(error); await run("create a login page", ["--json", "--no-figma"]); expect(payload()).toMatchObject({ error: { message: "initialization unavailable" }, options: { autoSync: false } }); expect(process.exitCode).toBe(1); });
 it("propagates initialization failures in human mode", async () => { vi.spyOn(engine, "init").mockRejectedValue(new Error("initialization unavailable")); await expect(run("create a login page")).rejects.toThrow("initialization unavailable"); });
});
