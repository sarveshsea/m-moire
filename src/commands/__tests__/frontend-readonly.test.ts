import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoireEngine } from "../../engine/core.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { registerGenerateCommand } from "../generate.js";
import { registerTokensCommand } from "../tokens.js";
import { registerAuditCommand } from "../audit.js";
import { registerDiffCommand } from "../diff.js";

const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); process.exitCode = 0; await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const projectRoot = await mkdtemp(join(tmpdir(), "memi-readonly-command-")); roots.push(projectRoot);
  configureExecutionPolicy({ projectRoot });
  const logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const engine = new MemoireEngine({ projectRoot });
  return { projectRoot, logs, engine };
}

describe("R01 real engine read-only commands", () => {
  it.each([
    ["tokens", registerTokensCommand, ["tokens", "--json"]],
    ["generate preview", registerGenerateCommand, ["generate", "--preview", "--json"]],
    ["audit", registerAuditCommand, ["audit", "--json"]],
    ["diff", registerDiffCommand, ["diff", "--json"]],
  ] as const)("runs %s without initializing a workspace or background runtime", async (_name, register, args) => {
    const { projectRoot, engine } = await fixture();
    const init = vi.spyOn(engine, "init");
    const tasks = vi.spyOn(engine.taskQueue, "start");
    const health = vi.spyOn(engine.agentRegistry, "startHealthCheck");
    const program = new Command(); register(program, engine);
    await program.parseAsync([...args], { from: "user" });
    expect(init).not.toHaveBeenCalled(); expect(tasks).not.toHaveBeenCalled(); expect(health).not.toHaveBeenCalled();
    expect(await readdir(projectRoot)).toEqual([]);
  });
  it("reads saved token values without replacing source files", async () => {
    const { projectRoot, engine, logs } = await fixture();
    await mkdir(join(projectRoot, ".memoire"));
    const file = join(projectRoot, ".memoire", "design-system.json");
    const content = JSON.stringify({ tokens: [{ name: "brand", cssVariable: "--brand", type: "color", values: { light: "#336699" } }], components: [], styles: [], lastSync: "fixture" });
    await writeFile(file, content);
    const program = new Command(); registerTokensCommand(program, engine);
    await program.parseAsync(["tokens", "--json"], { from: "user" });
    expect(logs.mock.calls.flat().join(" ")).toContain("--brand");
    expect(await readFile(file, "utf8")).toBe(content);
    expect(await readdir(join(projectRoot, ".memoire"))).toEqual(["design-system.json"]);
  });
});
