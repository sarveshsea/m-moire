import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Registry } from "../../engine/registry.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { SubAgentRunner } from "../sub-agents.js";
import type { AgentContext, SubTask } from "../plan-builder.js";
import type { MemoireEngine } from "../../engine/core.js";
let root: string; let registry: Registry; let runner: SubAgentRunner; let context: AgentContext;
const task = (agentType: SubTask["agentType"], name: string, prompt: string, targetSpecs?: string[]): SubTask => ({ id: "fixture", agentType, name, prompt, targetSpecs, dependencies: [], status: "pending" });
beforeEach(async () => {
 root = await mkdtemp(join(tmpdir(), "memi-subagents-release-")); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
 registry = new Registry(join(root, ".memoire")); await registry.load();
 runner = new SubAgentRunner({ registry, research: { load: async () => {}, getStore: () => ({ findings: [] }) }, figma: { isConnected: false } } as unknown as MemoireEngine);
 context = { designSystem: registry.designSystem, specs: [], figmaConnected: false, projectFramework: "" };
});
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
describe("sub-agent fallback contracts", () => {
 it.each([
  ["component-architect", "unstructured requirement", "GeneratedComponent"],
  ["layout-designer", "unstructured requirement", "GeneratedPage"],
  ["dataviz-specialist", "unstructured requirement", "GeneratedChart"],
  ["component-architect", "create a quick action button", "QuickActionButton"],
  ["layout-designer", "build a profile page", "ProfilePage"],
  ["dataviz-specialist", "build a sales graph", "SalesGraph"],
 ] as const)("persists a usable %s spec from %s", async (agentType, prompt, expected) => {
  const result = await runner.executeSubTask(task(agentType, "Design", prompt), context) as { targetSpecs: string[] };
  expect(result.targetSpecs).toEqual([expected]); expect((await registry.getSpec(expected))?.name).toBe(expected);
  const kind = agentType === "component-architect" ? "components" : agentType === "layout-designer" ? "pages" : "dataviz";
  expect(JSON.parse(await readFile(join(root, "specs", kind, `${expected}.json`), "utf8")).name).toBe(expected);
 });
 it.each(["layout-designer", "dataviz-specialist", "component-architect"] as const)("reuses and replaces context identity for %s", async agentType => {
  const existing = agentType === "layout-designer" ? runner.scaffoldPageSpec("AccountPage", "dashboard", context) : agentType === "dataviz-specialist" ? runner.scaffoldDataVizSpec("AccountPage", "area") : runner.scaffoldComponentSpec("AccountPage", "button");
  await registry.saveSpec(existing); context.specs = [existing];
  const result = await runner.executeSubTask(task(agentType, "Design", "Improve AccountPage"), context) as { mutations: { type: string }[] };
  expect(result.mutations[0].type).toBe("spec-updated"); expect(context.specs).toHaveLength(1); expect(context.specs[0].name).toBe("AccountPage");
 });
 it.each(["component-architect", "layout-designer", "dataviz-specialist"] as const)("does not fabricate specs for non-design %s tasks", async agentType => {
  expect(await runner.executeSubTask(task(agentType, "Inspect", "Review"), context)).toEqual({ status: "completed", targetSpecs: [] }); expect(context.specs).toEqual([]);
  expect(await runner.executeSubTask(task(agentType, "Inspect", "Review", ["Known"]), context)).toMatchObject({ targetSpecs: ["Known"] });
 });
 it.each([["input", "Input"], ["modal", "Dialog"], ["table", "Table"], ["navigation", "Sidebar"], ["badge", "Badge"], ["generic", "Card"]])("selects the %s component contract", (intent, base) => {
  const spec = runner.scaffoldComponentSpec("Fixture", intent); expect(spec.shadcnBase[0]).toBe(base); if (base === "Dialog") expect(spec.accessibility.role).toBe("dialog");
 });
 it("constructs dashboard sections from existing components and preserves plain page fallback", () => {
  context.specs = [runner.scaffoldComponentSpec("Header", "header"), runner.scaffoldComponentSpec("Body", "card")];
  const dashboard = runner.scaffoldPageSpec("OverviewPage", "dashboard", context); expect(dashboard.sections.map(section => section.layout)).toEqual(["full-width", "grid-2"]); expect(dashboard.shadcnLayout).toContain("SidebarProvider");
  expect(runner.scaffoldPageSpec("PlainPage", "plain content", context)).toMatchObject({ layout: "full-width", sections: [], shadcnLayout: [] });
 });
 it.each([["area", "area"], ["bar", "bar"], ["trend", "line"], ["donut", "donut"]])("chooses %s chart semantics", (intent, chartType) => { expect(runner.scaffoldDataVizSpec("Chart", intent).chartType).toBe(chartType); });
 it("creates numeric fallback tokens, preserves existing semantic values, and handles no-op prompts", async () => {
  await runner.executeSubTask(task("token-engineer", "Create", "shadow 4px"), context); expect(registry.designSystem.tokens.find(token => token.name === "shadow-4")?.type).toBe("shadow");
  await runner.executeSubTask(task("token-engineer", "Create", "accent #123456"), context); expect(registry.designSystem.tokens.find(token => token.name === "accent")?.values.Light).toBe("#123456");
  expect(await runner.executeSubTask(task("token-engineer", "Inspect", "no numeric value"), context)).toMatchObject({ mutations: [] });
  registry.updateToken("background", { name: "background", type: "color", collection: "colors", values: { Light: "#112233" }, cssVariable: "--background" });
  await runner.executeSubTask(task("theme-builder", "Build", "light #ffcc22"), context); expect(registry.designSystem.tokens.find(token => token.name === "background")?.values.Light).toBe("#112233");
 });
 it.each(["token-engineer", "design-auditor", "accessibility-checker", "theme-builder", "responsive-specialist"] as const)("builds bounded AI context for %s without live service calls", async agentType => {
  registry.updateToken("empty", { name: "empty", type: "color", collection: "colors", values: {}, cssVariable: "--empty" }); context.designSystem = registry.designSystem;
  const ai = { completeJSON: vi.fn().mockResolvedValue({ analysis: "fixture analysis" }) };
  const result = await runner.executeSubTask(task(agentType, "Review", "Check context"), context, ai as never);
  expect(result).toMatchObject({ status: "completed", mutations: [], aiPowered: true, analysis: "fixture analysis" });
  expect(ai.completeJSON.mock.calls[0][0].system).toContain("Framework: unknown"); expect(ai.completeJSON.mock.calls[0][0].system).toContain("Figma: offline"); expect(ai.completeJSON.mock.calls[0][0].system).toContain("(empty)");
 });
 it("records advisory AI mutations, skips incomplete entries, and performs explicit deletion", async () => {
  registry.updateToken("existing", { name: "existing", type: "spacing", collection: "spacing", values: { default: 8 }, cssVariable: "--existing" });
  const mutations = [
   { type: "", target: "empty", detail: "incomplete" }, { type: "token-created", target: "", detail: "incomplete" },
   ...["token-created", "token-updated", "spec-created", "spec-updated", "code-generated", "figma-pushed", "unknown"].map(type => ({ type, target: "existing", detail: "advisory" })),
   { type: "token-created", target: "missing", detail: "advisory" }, { type: "token-deleted", target: "existing", detail: "remove" },
  ];
  const ai = { completeJSON: vi.fn().mockResolvedValue({ status: "completed", mutations }) };
  await runner.executeSubTask(task("token-engineer", "Review", "Tokens"), context, ai as never);
  expect(registry.designSystem.tokens.find(token => token.name === "existing")).toBeUndefined(); expect(registry.designSystem.tokens.find(token => token.name === "missing")).toBeUndefined();
 });
 it("falls back on non-Error provider failures", async () => {
  const ai = { completeJSON: vi.fn().mockRejectedValue("offline") };
  expect(await runner.executeSubTask(task("token-engineer", "Create", "radius 3px"), context, ai as never)).toMatchObject({ status: "completed", mutations: [{ target: "radius-3" }] });
 });
 it("checks incomplete responsive contracts and narrow touch targets", async () => {
  const component = runner.scaffoldComponentSpec("ButtonPanel", "sidebar"); const page = runner.scaffoldPageSpec("Overview", "dashboard", context);
  context.specs = [{ ...component, composesSpecs: ["a", "b", "c"], accessibility: { ...component.accessibility, touchTarget: undefined } } as never,
   { ...page, responsive: { mobile: "grid-4" }, sections: [{ name: "cards", component: "ButtonPanel", layout: "grid-3", repeat: 1, props: {} }] } as never,
   { ...page, name: "Empty", responsive: undefined } as never];
  const result = await runner.executeSubTask(task("responsive-specialist", "Review", "Responsive"), context) as { issues: string[]; recommendations: string[] };
  expect(result.issues.some(issue => issue.includes("missing tablet"))).toBe(true); expect(result.issues.some(issue => issue.includes("4-col grid"))).toBe(true); expect(result.issues.some(issue => issue.includes("touchTarget"))).toBe(true); expect(result.recommendations.length).toBeGreaterThanOrEqual(3);
 });
});
