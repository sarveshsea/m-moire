import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBenchmarkCommand } from "../benchmark.js";
let root: string;
let init: ReturnType<typeof vi.fn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-benchmark-release-")); init = vi.fn(async () => {}); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
async function cli(args: string[]) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command(); program.exitOverride();
  registerBenchmarkCommand(program, { config: { projectRoot: root }, init } as never);
  await program.parseAsync(["benchmark", ...args], { from: "user" });
  return log.mock.calls.map((call) => String(call[0]));
}
async function fixture(name: string, value: unknown) { const path = join(root, name); await writeFile(path, JSON.stringify(value)); return path; }
const workflow = { schemaVersion: 1, id: "checkout-flow", intent: "Repair and verify the complete rendered checkout flow", maximumDurationMs: 600000, steps: ["inspect", "implement", "build", "launch", "verify"], verification: [{ kind: "build", command: "npm", args: ["run", "build"], timeoutMs: 300000 }, { kind: "rendered-flow", command: "npm", args: ["run", "test:e2e"], timeoutMs: 600000 }], requiredArtifacts: ["git.patch", "verification.json", "events.jsonl"] };

describe("benchmark CLI input and evidence contracts", () => {
  it.each([["--repeats", "0", "positive"], ["--repeats", "-2", "positive"], ["--repeats", "invalid", "integer"], ["--seed", "invalid", "integer"]])("rejects invalid plan argument %s=%s", async (flag, value, error) => {
    const tasks = await fixture("tasks.json", [{ id: "audit", intent: "Audit navigation" }]);
    await expect(cli(["plan", tasks, "--suite", "suite", "--experiment", "experiment", flag, value])).rejects.toThrow(error);
    await expect(readFile(join(root, ".memoire", "efficiency", "plans", "experiment.json"))).rejects.toThrow();
  });
  it.each(["", "codex,codex", "unsupported", "codex,unsupported"])("rejects invalid provider set %s", async (providers) => {
    const task = await fixture("workflow.json", workflow);
    await expect(cli(["workflow-plan", task, "--suite", "suite", "--experiment", "experiment", "--providers", providers])).rejects.toThrow(/providers|unsupported/);
  });
  it("writes a balanced paired plan to its default location and prints human output", async () => {
    const tasks = await fixture("tasks.json", [{ id: "audit", intent: "Audit navigation" }, { id: "tokens", intent: "Inspect tokens" }]);
    const output = await cli(["plan", tasks, "--suite", "suite", "--experiment", "experiment", "--repeats", "2"]);
    const plan = JSON.parse(await readFile(join(root, ".memoire", "efficiency", "plans", "experiment.json"), "utf8"));
    expect(plan.trials).toHaveLength(8);
    expect(plan.trials.filter((trial: { condition: string }) => trial.condition === "baseline")).toHaveLength(4);
    expect(plan.trials.filter((trial: { condition: string }) => trial.condition === "memi")).toHaveLength(4);
    expect(output.join("\n")).toContain("8 trials");
    expect(init).toHaveBeenCalledWith("minimal");
  });
  it("creates one pair per selected provider and repetition", async () => {
    const task = await fixture("workflow.json", workflow);
    const output = await cli(["workflow-plan", task, "--suite", "suite", "--experiment", "experiment", "--providers", "codex, claude", "--repeats", "2"]);
    const plan = JSON.parse(await readFile(join(root, ".memoire", "efficiency", "plans", "experiment-workflow.json"), "utf8"));
    expect(plan.trials).toHaveLength(8);
    expect(new Set(plan.trials.map((trial: { provider: string }) => trial.provider))).toEqual(new Set(["codex", "claude"]));
    expect(output.join("\n")).toContain("8 trials");
  });
  it.each([["--minimum-pairs", "0", "positive"], ["--bootstrap-samples", "-1", "positive"], ["--target", "-0.1", "between"], ["--target", "1.1", "between"], ["--target", "NaN", "between"]])("rejects invalid report setting %s=%s", async (flag, value, error) => {
    await expect(cli(["report", "--suite", "suite", "--store-root", root, flag, value])).rejects.toThrow(error);
    expect(init).not.toHaveBeenCalled();
  });
  it("does not verify a savings claim when the external store has no paired evidence", async () => {
    const output = await cli(["report", "--suite", "suite", "--store-root", root, "--experiments", "one, ,two", "--bootstrap-samples", "10"]);
    expect(output.join("\n")).toContain("Efficiency claim not verified");
    const report = JSON.parse(await readFile(join(root, ".memoire", "efficiency", "reports", "suite.json"), "utf8"));
    expect(report.pairs.included).toBe(0);
    expect(report.claim).not.toBe("verified_gt_25");
    expect(init).not.toHaveBeenCalled();
  });
  it.each(["fitness", "fitness-backtest"])("projects an empty %s evidence store without fabricated observations", async (command) => {
    const json = JSON.parse((await cli([command, "--store-root", root, "--json"])).at(-1)!);
    if (command === "fitness") expect(json.projection).toMatchObject({ events: 0, skills: [] });
    else expect(json.backtest).toMatchObject({ eventsReplayed: 0, routes: [] });
    const human = await cli([command, "--store-root", root]);
    expect(human.join("\n")).toContain("MEMI SKILL FITNESS");
  });
  it("rejects fitness evidence referencing an absent baseline run", async () => {
    await expect(cli(["fitness-record", "--store-root", root, "--baseline", "missing", "--memi", "missing", "--route", join(root, "route.json"), "--task-class", "audit"])).rejects.toThrow("found 0 times");
  });
  it("reports zero retention for a fresh store in both output modes", async () => {
    const json = JSON.parse((await cli(["retention", "--json"])).at(-1)!);
    expect(json.metrics).toMatchObject({ successfulFirstAudits: 0, repeatAuditProjects: 0, ciReuseProjects: 0 });
    expect((await cli(["retention"])).join("\n")).toContain("MEMI ADOPTION");
  });
});
