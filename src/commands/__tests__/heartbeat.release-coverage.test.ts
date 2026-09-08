import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoireEngine } from "../../engine/core.js";
import { registerHeartbeatCommand } from "../heartbeat.js";
import { configureExecutionPolicy, createExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { preflightCommand } from "../../security/command-preflight.js";
let root: string;
let engine: MemoireEngine;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-heartbeat-release-"));
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  engine = new MemoireEngine({ projectRoot: root });
  vi.spyOn(engine.taskQueue, "start").mockResolvedValue(undefined);
  vi.spyOn(engine.agentRegistry, "startHealthCheck").mockImplementation(() => {});
  log = vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); process.exitCode = 0; await rm(root, { recursive: true, force: true }); });
async function seed(specs: Record<string, unknown>[] = [], tokens: unknown[] = [], generations: unknown[] = []) {
  await mkdir(join(root, "specs/components"), { recursive: true }); await mkdir(join(root, ".memoire"), { recursive: true });
  for (const spec of specs) await writeFile(join(root, "specs/components", `${spec.name}.json`), JSON.stringify(spec));
  await writeFile(join(root, ".memoire/design-system.json"), JSON.stringify({ tokens, components: [], styles: [], lastSync: "fixture" }));
  await writeFile(join(root, ".memoire/generations.json"), JSON.stringify(generations));
}
const component = (name: string, extra: Record<string, unknown> = {}) => ({ name, type: "component", level: "atom", composesSpecs: [], codeConnect: { mapped: true }, updatedAt: new Date().toISOString(), ...extra });
async function run(args: string[] = []) { const program = new Command(); registerHeartbeatCommand(program, engine); await program.parseAsync(["heartbeat", ...args], { from: "user" }); return JSON.parse(await readFile(join(root, ".memoire/heartbeat.json"), "utf8")); }
describe("legacy heartbeat handler coverage (CLI remains unavailable)", () => {
  it.each(["locked", "local", "connected"] as const)("denies shipped heartbeat admission in %s", async profile => {
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: root, profile, allow: ["project-write", "source-content-persistence"] }), { commandPath: ["heartbeat"], args: [], options: {} })).rejects.toThrow("unavailable");
  });
  it("persists an empty healthy report with isolated authorized internal execution", async () => {
    const result = await run(["--json"]); expect(result.status).toBe("healthy"); expect(result.checks).toHaveLength(5); expect(result.nextCheck).toBeUndefined();
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0]))).toEqual(result);
  });
  it("reports staleness, missing mappings, drift and atomic violations", async () => {
    await seed([
      component("Atom", { updatedAt: "2020-01-01", composesSpecs: ["Child"], codeConnect: {} }),
      component("Molecule", { level: "molecule", codeConnect: undefined }),
      { name: "Page", type: "page" },
    ], [{ name: "brand", cssVariable: "--brand" }], [{ specName: "Atom", generatedAt: "2019-01-01" }]);
    const result = await run(); expect(result.status).toBe("warnings"); expect(result.checks.filter((c: {status: string}) => c.status === "warn")).toHaveLength(5);
    const output = log.mock.calls.flat().join("\n"); expect(output).toContain("atom composes other specs"); expect(output).toContain("molecule does not compose any atoms"); expect(output).toContain("Written to");
  });
  it("resolves token names and CSS variables while capping orphan details", async () => {
    const tokens = Array.from({ length: 25 }, (_, i) => ({ name: `orphan${i}`, cssVariable: `--orphan${i}` }));
    await seed([component("Named", { designTokens: { mapped: ["brand", "--accent"] } })], [...tokens, { name: "brand", cssVariable: "--brand" }, { name: "accent", cssVariable: "--accent" }]);
    const result = await run(["--json"]); const orphans = result.checks.find((c: {name: string}) => c.name === "token-orphans"); expect(orphans.items).toHaveLength(20); expect(orphans.detail).toContain("25 tokens");
    expect(result.checks.find((c: {name: string}) => c.name === "code-connect").status).toBe("pass");
  });
  it("accepts all referenced tokens and current generation", async () => {
    await seed([component("Current", { designTokens: { mapped: ["brand"] } }), { name: "Reference", type: "design" }], [{ name: "brand", cssVariable: "--brand" }], [{ specName: "Current", generatedAt: "2099-01-01" }, { specName: "Reference", generatedAt: "2099-01-01" }]);
    expect((await run()).status).toBe("healthy");
  });
  it("JSON watch emits a next-check receipt without launching a timer", async () => {
    const timer = vi.spyOn(globalThis, "setInterval"); const result = await run(["--watch", "--interval", "2", "--json"]);
    expect(Date.parse(result.nextCheck) - Date.parse(result.checkedAt)).toBe(120000); expect(timer).not.toHaveBeenCalled();
  });
  it("runs scheduled cycles and clears timer on shutdown", async () => {
    let cycle: (() => Promise<void>) | undefined; const callbacks: Record<string, () => void> = {};
    const timer = vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => Promise<void>) => { cycle = fn; return 123; }) as never);
    const clear = vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
    vi.spyOn(process, "once").mockImplementation(((event: string, fn: () => void) => { callbacks[event] = fn; return process; }) as never);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await run(["--watch", "--interval", "1"]); expect(timer).toHaveBeenCalledWith(expect.any(Function), 60000); await cycle?.(); callbacks.SIGINT();
    expect(clear).toHaveBeenCalledWith(123); expect(process.exit).toHaveBeenCalledWith(0);
    expect(log.mock.calls.flat().join("\n")).toContain("Next check:");
  });
});
