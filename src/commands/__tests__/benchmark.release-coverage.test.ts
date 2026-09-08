import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerBenchmarkCommand } from "../benchmark.js";
import * as codexRunner from "../../efficiency/codex-runner.js";
import * as workflowRunner from "../../efficiency/workflow-runner.js";
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


it("rejects invalid workflow repetition before any provider execution", async () => {
  const task = await fixture("workflow.json", workflow);
  vi.spyOn(codexRunner, "benchmarkRepositoryRevision").mockResolvedValue("a".repeat(40));
  const execute = vi.spyOn(workflowRunner, "runWorkflowTrial").mockResolvedValue({
    runId: "local-test-run", sourceRevision: "a".repeat(40), evidenceDirectory: join(root, "evidence"),
    durationMs: 1, accepted: true, verification: [{ passed: true, durationMs: 1 }],
    adapter: { exitCode: 0, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, estimatedCostUsd: null }, tools: { calls: 0, errors: 0, retries: 0 } },
  } as never);
  await expect(cli(["workflow-run", task, "--condition", "baseline", "--provider", "codex", "--repository", root,
    "--evidence-root", join(root, "evidence"), "--store-root", root, "--suite", "suite", "--experiment", "experiment",
    "--repeat", "0", "--execute"])).rejects.toThrow("repeat must be positive");
  expect(execute).not.toHaveBeenCalled();
});

function workflowResult(accepted: boolean, measuredCost: boolean) {
  return {
    runId: 'local-test-run', sourceRevision: 'a'.repeat(40), evidenceDirectory: join(root, 'evidence'),
    durationMs: 20, accepted, verification: [{ passed: accepted, durationMs: 5 }],
    adapter: { exitCode: accepted ? 0 : 1, usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, reasoningTokens: 2, estimatedCostUsd: measuredCost ? 0.1 : null }, tools: { calls: 1, errors: accepted ? 0 : 1, retries: 0 } },
  };
}
function workflowArgs(task: string) {
  return ['workflow-run', task, '--condition', 'baseline', '--provider', 'codex', '--repository', root,
    '--evidence-root', join(root, 'evidence'), '--store-root', root, '--suite', 'suite', '--experiment', 'experiment', '--repeat', '2', '--execute'];
}

it.each([
  ['codex', true, true, true], ['claude', true, false, false],
  ['codex', false, false, false], ['claude', false, true, true],
] as const)('records %s workflow accepted=%s with honest cost and quality metadata', async (provider, accepted, measuredCost, json) => {
  const task = await fixture('workflow.json', workflow);
  vi.spyOn(codexRunner, 'benchmarkRepositoryRevision').mockResolvedValue('a'.repeat(40));
  const execute = vi.spyOn(workflowRunner, 'runWorkflowTrial').mockResolvedValue(workflowResult(accepted, measuredCost) as never);
  const args = workflowArgs(task);
  const output = await cli([...args, '--provider', provider, ...(json ? ['--json'] : [])]);
  const record = JSON.parse(await readFile(join(root, 'evidence/run.json'), 'utf8'));
  expect(record).toMatchObject({ repeat: 2, condition: 'baseline', harness: { id: provider, modelId: provider === 'codex' ? 'gpt-5.6-sol' : 'claude-sonnet-4-6' }, outcome: { accepted, testsPassed: accepted, qualityCeiling: 80, qualityEvidence: 'automated_acceptance' }, timing: { toolTimeMs: 5 } });
  expect(record.usage.estimatedCostUsd).toBe(measuredCost ? 0.1 : null);
  expect(record.evidenceRefs.some((ref: string) => ref.includes('unassessed'))).toBe(!measuredCost);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ routedContext: '', condition: 'baseline' }));
  if (json) expect(JSON.parse(output.at(-1)!)).toMatchObject({ status: accepted ? 'accepted' : 'failed-quality-gate', route: null });
  else expect(output.join('\n')).toContain(accepted ? 'Accepted' : 'Quality gate failed');
});

it.each([
  [['--freeze', 'missing.json'], 'must be provided together'],
  [['--trial', 'trial-1'], 'must be provided together'],
  [['--evidence-draft', 'missing.json'], 'must be provided together'],
  [['--artifact-root', 'artifacts'], 'must be provided together'],
  [['--evidence-draft', 'missing.json', '--artifact-root', 'artifacts'], 'require a freeze'],
  [['--recovery-probe'], 'requires the memi condition'],
  [['--task-class', '  '], 'task-class'],
] as const)('rejects incoherent workflow options %j before calling a provider', async (flags, reason) => {
  const task = await fixture('workflow.json', workflow);
  const execute = vi.spyOn(workflowRunner, 'runWorkflowTrial');
  const revision = vi.spyOn(codexRunner, 'benchmarkRepositoryRevision');
  await expect(cli([...workflowArgs(task), ...flags])).rejects.toThrow(reason);
  expect(execute).not.toHaveBeenCalled();
  expect(revision).not.toHaveBeenCalled();
});

it('requires explicit consent before reading a Codex task or invoking its runner', async () => {
  const execute = vi.spyOn(codexRunner, 'runCodexCaseStudy');
  await expect(cli(['codex-run', 'missing-task.json', '--condition', 'baseline', '--repository', root,
    '--suite', 'suite', '--experiment', 'experiment', '--repeat', '1', '--evidence-dir', root, '--store-root', root])).rejects.toThrow('requires --execute');
  expect(execute).not.toHaveBeenCalled();
});

it.each([[true, true], [true, false], [false, true], [false, false]])('records Codex trial accepted=%s json=%s with explicit runner settings', async (accepted, json) => {
  const task = await fixture('codex-task.json', { id: 'audit', intent: 'Audit fixture', rubric: { minimumValidCitations: 1, requiredTerms: ['fixture'] } });
  const record = {
    schemaVersion: 1, runId: 'codex-local-test', experimentId: 'experiment', suiteId: 'suite', taskId: 'audit', repeat: 3, condition: 'baseline',
    repository: { pathHash: 'sha256:fixture', revision: 'a'.repeat(40), dirty: false },
    harness: { id: 'codex-custom', modelId: 'local-test-model', reasoningEffort: 'low' },
    timing: { startedAt: '2026-09-08T00:00:00Z', completedAt: '2026-09-08T00:00:01Z', wallTimeMs: 1000, toolTimeMs: 5 },
    usage: workflowResult(accepted, false).adapter.usage, tools: workflowResult(accepted, false).adapter.tools,
    outcome: { accepted, testsPassed: accepted, qualityScore: accepted ? 100 : 20, defects: accepted ? 0 : 1, humanInterventions: 0 }, evidenceRefs: ['local-fixture'],
  };
  const execute = vi.spyOn(codexRunner, 'runCodexCaseStudy').mockResolvedValue({ record, grade: { accepted }, evidenceDirectory: join(root, 'raw-evidence') } as never);
  const output = await cli(['codex-run', task, '--condition', 'baseline', '--repository', root, '--suite', 'suite', '--experiment', 'experiment', '--repeat', '3',
    '--evidence-dir', join(root, 'raw-evidence'), '--store-root', root, '--codex', '/test/codex', '--model', 'local-test-model', '--reasoning', 'low', '--harness', 'codex-custom', '--memi-cli', join(root, 'cli.js'), '--timeout-ms', '2000', '--execute', ...(json ? ['--json'] : [])]);
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ repositoryRoot: root, repeat: 3, timeoutMs: 2000, codexPath: '/test/codex', modelId: 'local-test-model', reasoningEffort: 'low', harnessId: 'codex-custom', memiCliPath: join(root, 'cli.js') }));
  if (json) expect(JSON.parse(output.at(-1)!)).toMatchObject({ status: accepted ? 'accepted' : 'failed-quality-gate', run: record });
  else expect(output.join('\n')).toContain(accepted ? 'Accepted codex-local-test' : 'Quality gate failed');
});
