import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerCiCommand } from "../ci.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
const ports = vi.hoisted(() => ({ diagnose: vi.fn(), policy: vi.fn(), baseline: vi.fn(), filter: vi.fn(), scope: vi.fn(), history: vi.fn(), regression: vi.fn(), entry: vi.fn(), report: vi.fn() }));
vi.mock("../../app-quality/engine.js", () => ({ diagnoseAppQuality: ports.diagnose }));
vi.mock("../../app-quality/policy.js", () => ({ loadPolicy: ports.policy }));
vi.mock("../../app-quality/baseline.js", () => ({ readBaseline: ports.baseline, filterWithBaseline: ports.filter }));
vi.mock("../../app-quality/git-scope.js", () => ({ resolveGitScope: ports.scope }));
vi.mock("../../app-quality/history.js", () => ({ readHistory: ports.history, checkRegression: ports.regression, entryFromDiagnosis: ports.entry }));
vi.mock("../../reporters/report-html.js", () => ({ composeReport: ports.report }));
let root: string, logs: string[], previous: typeof process.exitCode;
const issue = (n = 0) => ({ id: `issue-${n}`, ruleId: "test", dimension: "accessibility", severity: "high", title: `Issue ${n}`, summary: "Accessible name missing", recommendation: "Add label", affectedFiles: ["Button.tsx"] });
beforeEach(async () => {
  vi.clearAllMocks(); root = await mkdtemp(join(tmpdir(), "memi-ci-branches-")); logs = []; previous = process.exitCode; process.exitCode = undefined;
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" "))); vi.spyOn(console, "warn").mockImplementation((...args) => logs.push(args.join(" ")));
  ports.policy.mockResolvedValue({ gates: { failOn: "high" } }); ports.baseline.mockResolvedValue(null); ports.scope.mockResolvedValue({ files: ["Button.tsx"], base: "origin/main" });
  ports.diagnose.mockResolvedValue({ summary: { score: 90, verdict: "healthy" }, issues: [], assessedDimensions: ["accessibility"], unassessedDimensions: [], policy: { hash: "fixture" } });
  ports.regression.mockReturnValue({ comparable: false, regressed: false }); ports.history.mockResolvedValue([]);
});
afterEach(async () => { process.exitCode = previous; resetExecutionPolicyForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
async function run(...args: string[]) { const p = new Command(); registerCiCommand(p, { config: { projectRoot: root } } as never); await p.parseAsync(["ci", ...args], { from: "user" }); }
const result = () => JSON.parse(logs.at(-1)!);
it("writes actual SARIF for a passing scoped gate", async () => {
  vi.stubEnv("GITHUB_BASE_REF", "feature"); await run("--json");
  expect(result()).toMatchObject({ status: "passed", scope: { changedFiles: 1 }, gates: { coverage: { failed: false } } });
  expect(JSON.parse(await readFile(result().sarifPath, "utf8")).runs).toHaveLength(1);
  expect(ports.scope).toHaveBeenCalledWith({ projectRoot: root, base: "origin/feature" });
});
it("gates only file-anchored findings within the requested PR scope", async () => {
  ports.diagnose.mockResolvedValue({ summary: { score: 90, verdict: "healthy" }, issues: [issue(), { ...issue(1), affectedFiles: ["Other.tsx"] }, { ...issue(2), affectedFiles: undefined }], assessedDimensions: ["accessibility"], unassessedDimensions: [] });
  await run("--json", "--base", "main");
  expect(result().gates.severity).toEqual({ failed: true, gatingIssues: 1 }); expect(process.exitCode).toBe(1);
});
it("reports accepted baseline suppression and evaluates the remaining findings", async () => {
  ports.baseline.mockResolvedValue({}); ports.filter.mockReturnValue({ active: [], suppressed: [issue()] });
  await run(); expect(logs.join("\n")).toContain("accepted finding(s) suppressed"); expect(logs.join("\n")).toContain("Gate passed");
});
it.each(["critical", "high", "medium", "low", "none"])("accepts the severity contract %s", async severity => {
  await run("--no-scope", "--fail-on", severity, "--json", "--max-files", "invalid");
  expect(result().failOn).toBe(severity); expect(ports.scope).not.toHaveBeenCalled(); expect(ports.diagnose.mock.calls[0][0].maxFiles).toBe(500);
});
it.each([false, true])("rejects unsupported severity before diagnosis json=%s", async json => {
  await run("--fail-on", "urgent", ...(json ? ["--json"] : []));
  expect(logs.join("\n")).toContain("Invalid --fail-on"); expect(ports.diagnose).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
});
it("shows score, coverage, regression and overflow failures in human output", async () => {
  ports.policy.mockResolvedValue({ gates: { failOn: "high", minScore: 95, regressionBudget: 2 } });
  ports.diagnose.mockResolvedValue({ summary: { score: 70, verdict: "weak" }, issues: Array.from({ length: 12 }, (_, n) => issue(n)), assessedDimensions: [], unassessedDimensions: [] });
  ports.regression.mockReturnValue({ comparable: true, regressed: true, delta: -5, previous: { score: 75, sha: "abc", at: "2026-09-01" } });
  await run("--no-scope"); const text = logs.join("\n");
  for (const fragment of ["below the policy minimum", "No design dimensions", "Regression:", "2 more", "Gate failed"]) expect(text).toContain(fragment);
});
it.each([null, 90])("writes reports and only creates a badge for an assessed score: %s", async score => {
  ports.report.mockResolvedValue({ html: "<main>Health</main>", markdown: "# Health", score });
  await run("--no-scope", "--report", "--json");
  expect(await readFile(result().report.htmlPath, "utf8")).toBe("<main>Health</main>");
  if (score === null) expect(result().report.badgePath).toBeUndefined(); else expect(await readFile(result().report.badgePath, "utf8")).toContain("<svg");
});
it("appends an allowed step summary and returns fallback markdown when its path is outside", async () => {
  vi.stubEnv("GITHUB_STEP_SUMMARY", join(root, "summary.md")); await run("--json");
  expect(await readFile(join(root, "summary.md"), "utf8")).toContain("90");
  vi.stubEnv("GITHUB_STEP_SUMMARY", join(root, "..", "outside-summary.md")); await run("--json");
  expect(logs.join("\n")).toContain("Skipped GitHub step summary"); expect(result().summaryMarkdown).toContain("90");
});
it.each([new Error("input unavailable"), "input unavailable"])("reports analysis failure without writing an artifact: %s", async failure => {
  ports.diagnose.mockRejectedValue(failure); await run("--json"); expect(result()).toEqual({ status: "error", error: "input unavailable" }); expect(process.exitCode).toBe(1);
});
