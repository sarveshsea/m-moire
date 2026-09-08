import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, link } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lstat as researchLstat } from "fs/promises";
import { ResearchEngine } from "../../research/engine.js";
vi.mock("fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat) };
});
import { MemoireEngine } from "../../engine/core.js";
import { registerAuditCommand } from "../audit.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
let root: string;
let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-audit-release-")); configureExecutionPolicy({ projectRoot: root }); log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
const good = { role: "button", ariaLabel: "Continue", keyboardNav: true, touchTarget: "44x44", focusStyle: "ring", colorContrast: { assertedRatio: 7, minimumLevel: "AAA" } };
async function spec(name: string, accessibility: unknown = good, extra: Record<string, unknown> = {}) {
  await mkdir(join(root, "specs/components"), { recursive: true });
  await writeFile(join(root, "specs/components", `${name}.json`), JSON.stringify({ name, type: "component", accessibility, updatedAt: "2026-01-02", researchBacking: [], ...extra }));
}
async function run(args: string[]) { const engine = new MemoireEngine({ projectRoot: root }); const program = new Command(); registerAuditCommand(program, engine); await program.parseAsync(["audit", ...args], { from: "user" }); return log.mock.calls.map(call => String(call[0])).join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("audit release command branches", () => {
  it("prints help and empty WCAG/unused tables without creating state", async () => {
    expect(await run([])).toContain("Usage:"); log.mockClear();
    expect(await run(["--wcag"])).toContain("0 specs checked"); log.mockClear();
    expect(await run(["--unused"])).toContain("All specs have been generated");
    expect(await readdir(root)).toEqual([]);
  });
  it("passes verified declarations and filters names case-insensitively", async () => {
    await spec("ActionButton"); await spec("Unrelated", {});
    await run(["--wcag", "--component", "ACTION", "--json"]);
    expect(parsed()).toMatchObject({ status: "pass", summary: { pass: 5, fail: 0, total: 1 } });
    expect(parsed().specs[0].wcag_impact).toEqual([]);
    expect(await run(["--wcag", "--component", "Action"])).toContain("1 spec checked");
  });
  it.each([
    ["contrast", { ...good, colorContrast: { assertedRatio: 3 } }],
    ["aria", { ...good, role: "none" }],
    ["keyboard", { ...good, keyboardNav: false }],
    ["focus", { ...good, focusStyle: "none" }],
  ])("fails the exit gate for %s while reporting criterion evidence", async (key, accessibility) => {
    await spec("Button", accessibility); await run(["--wcag", "--json"]);
    expect(parsed().specs[0].checks[key].status).toBe("fail"); expect(parsed().specs[0].wcag_impact.length).toBeGreaterThan(0); expect(process.exitCode).toBe(1);
  });
  it.each([
    ["Card", { ...good, role: undefined, colorContrast: undefined, touchTarget: undefined }],
    ["Card", { ...good, ariaLabel: "none", colorContrast: {}, touchTarget: "default" }],
    ["Card", { ...good, ariaLabel: undefined, colorContrast: { assertedRatio: 4.5 } }],
  ])("distinguishes incomplete declarations from verified failures (%s)", async (name, accessibility) => {
    await spec(name, accessibility); await run(["--wcag", "--json"]);
    expect(parsed().summary.fail).toBe(0); expect(process.exitCode ?? 0).toBe(0);
  });
  it("reports missing declarations and excludes noncomponents", async () => {
    await spec("Card", undefined, { accessibility: null }); await spec("Reference", {}, { type: "design" });
    await run(["--wcag", "--json"]); expect(parsed().summary.total).toBe(1); expect(parsed().summary.fail).toBe(2);
    log.mockClear(); await run(["--wcag", "--component", "absent", "--json"]); expect(parsed().summary.total).toBe(0);
  });
  it("separates unused, stale and current specs in human and JSON modes", async () => {
    await spec("Unused"); await spec("Stale"); await spec("Current"); await spec("Reference", {}, { type: "design" }); await spec("Navigation", {}, { type: "ia" });
    await mkdir(join(root, ".memoire")); await writeFile(join(root, ".memoire/generations.json"), JSON.stringify([
      { specName: "Stale", generatedAt: "2026-01-01" }, { specName: "Current", generatedAt: "2026-01-03" },
    ]));
    await run(["--unused", "--json"]); expect(parsed()).toMatchObject({ unusedCount: 1, staleCount: 1, total: 5 });
    expect(parsed().unused[0].name).toBe("Unused");
    expect(await run(["--unused"])).toContain("Stale — spec updated"); expect(process.exitCode).toBe(1);
  });
  it("keeps empty skill-compliance checks read-only", async () => {
    expect(await run(["--skill-compliance"])).toContain("No skill-compliance findings");
    await run(["--skill-compliance", "--target", ".", "--json"]); expect(parsed().summary.critical).toBe(0); expect(await readdir(root)).toEqual([]);
  });
  it("keeps locked research-traceability read-only for a new project", async () => {
    await run(["--research-traceability", "--json"]);
    expect(parsed()).toMatchObject({ totalSpecs: 0, failed: false });
    expect(await readdir(root)).toEqual([]);
  });
  it.each(["symlink", "hardlink"])("rejects %s research-store content before reporting it", async kind => {
    const outside = await mkdtemp(join(tmpdir(), "memi-research-outside-"));
    try {
      await mkdir(join(root, "research")); const source = join(outside, "store.json"); await writeFile(source, '{"findings":[{"id":"OUTSIDE_SENTINEL"}]}');
      if (kind === "symlink") await symlink(source, join(root, "research/store.v2.json"));
      else await link(source, join(root, "research/store.v2.json"));
      await expect(run(["--research-traceability", "--json"])).rejects.toThrow("Cannot safely read research metadata");
      expect(log.mock.calls.flat().join(" ")).not.toContain("OUTSIDE_SENTINEL");
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it("rejects oversized and malformed current research stores", async () => {
    await mkdir(join(root, "research")); await writeFile(join(root, "research/store.v2.json"), "x".repeat(1_048_577));
    await expect(run(["--research-traceability"])).rejects.toThrow("file-byte-limit");
    await writeFile(join(root, "research/store.v2.json"), "{"); await expect(run(["--research-traceability"])).rejects.toThrow();
  });
  it("reads legacy research without persisting a migrated store", async () => {
    await mkdir(join(root, "research")); const legacy = JSON.stringify({ sources: [], insights: [] }); await writeFile(join(root, "research/insights.json"), legacy);
    expect(await run(["--research-traceability"])).toContain("nothing to verify");
    expect(await readdir(join(root, "research"))).toEqual(["insights.json"]); expect(await readFile(join(root, "research/insights.json"), "utf8")).toBe(legacy);
  });
  it("reports unbacked and stale citations and applies strict policy", async () => {
    await spec("Unbacked"); await spec("Stale", good, { researchBacking: ["missing-finding"] });
    await mkdir(join(root, "research")); await writeFile(join(root, "research/store.v2.json"), JSON.stringify({ version: 2, findings: [] }));
    let output = await run(["--research-traceability"]); expect(output).toContain("no research backing"); expect(output).toContain("stale citation(s)"); expect(process.exitCode ?? 0).toBe(0);
    await writeFile(join(root, "memoire.policy.json"), JSON.stringify({ schemaVersion: 1, preset: "strict" }));
    output = await run(["--research-traceability"]); expect(output).toContain("strict policy"); expect(process.exitCode).toBe(1);
    await run(["--research-traceability", "--json"]); expect(parsed()).toMatchObject({ failed: true, staleCitations: 1 });
  });

  it("rejects an outside research output directory before probing its files", async () => {
    const outside = await mkdtemp(join(tmpdir(), "memi-outside-config-"));
    try {
      await writeFile(join(outside, "store.v2.json"), "{}");
      vi.mocked(researchLstat).mockClear();
      const research = new ResearchEngine({ outputDir: outside });
      await expect(research.load({ readOnly: true, projectRoot: root })).rejects.toThrow("Cannot safely read research metadata");
      expect(researchLstat).not.toHaveBeenCalled();
    } finally { await rm(outside, { recursive: true, force: true }); }
  });

});
