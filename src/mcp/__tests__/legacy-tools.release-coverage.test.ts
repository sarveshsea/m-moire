import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerTools } from "../tools.js";
import { configureExecutionPolicy, MEMI_CAPABILITIES, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { ComponentSpecSchema } from "../../specs/types.js";

const effects = vi.hoisted(() => ({
  ai: undefined as any, tracker: undefined as any,
  fetch: vi.fn(), complete: vi.fn(), execute: vi.fn(),
  analyze: vi.fn(), accessibility: vi.fn(), compliance: vi.fn(),
  researchPackage: vi.fn(), saveResearch: vi.fn(), mermaid: vi.fn(),
  runs: new Map<string, any>(), scenarios: new Map<string, any>(),
  scenario: vi.fn(), prepare: vi.fn(), start: vi.fn(), report: vi.fn(), interview: vi.fn(),
}));
vi.mock("../../ai/index.js", () => ({ getAI: () => effects.ai, getTracker: () => effects.tracker }));
vi.mock("../../agents/orchestrator.js", () => ({ AgentOrchestrator: class { execute = effects.execute; } }));
vi.mock("../../agents/design-analyzer.js", () => ({ DesignAnalyzer: class { analyzeDesign = effects.analyze; auditAccessibility = effects.accessibility; checkSpecCompliance = effects.compliance; } }));
vi.mock("../../research/css-extractor.js", async original => ({ ...await original<object>(), fetchPageAssets: effects.fetch }));
vi.mock("../../research/design-package.js", () => ({ buildResearchDesignPackage: effects.researchPackage, saveResearchDesignSpecs: effects.saveResearch, writeMermaidJamArtifacts: effects.mermaid }));
vi.mock("../../integrations/mermaid-jam.js", () => ({ resolveMermaidJamIntegration: async () => ({ available: false }) }));
vi.mock("../../simulation/index.js", () => {
  class Adapter {
    prepare = effects.prepare; start = effects.start; exportReport = effects.report; interview = effects.interview;
    async *stream() { yield { id: "e1" }; yield { id: "e2" }; yield { id: "e3" }; }
  }
  return {
    FileSimulationStore: class {
      async listRuns() { return [...effects.runs.values()]; }
      async loadRun(id: string) { return effects.runs.get(id); }
      async loadScenario(id: string) { return effects.scenarios.get(id); }
    },
    LocalSimulationAdapter: Adapter, ModelSwarmSimulationAdapter: Adapter,
    SimulationModelRouter: class { listProfiles() { return [{ id: "offline-profile" }]; } },
    buildProductSimulationScenarioFromResearch: effects.scenario,
    compareSimulationRuns: (runs: unknown[]) => ({ compared: runs.length }),
    simulationCosts: (run: { id: string }) => ({ runId: run.id, cost: "unknown" }),
    exportProductSpecFromRun: (report: unknown) => ({ report, type: "product-spec" }),
  };
});

let root: string;
let engine: any;
let handlers: Map<string, { schema: z.AnyZodObject; callback: (input: any) => Promise<any> }>;
async function invoke(name: string, input: Record<string, unknown> = {}) {
  const handler = handlers.get(name); if (!handler) throw new Error(`Tool missing: ${name}`);
  return handler.callback(handler.schema.parse(input));
}
function payload(result: any): any { expect(result.isError, JSON.stringify(result)).not.toBe(true); return JSON.parse(result.content[0].text); }
function failed(result: any, message?: string) { expect(result.isError).toBe(true); if (message) expect(JSON.stringify(result.content)).toContain(message); }

beforeEach(async () => {
  vi.clearAllMocks(); effects.ai = undefined; effects.tracker = undefined; effects.runs.clear(); effects.scenarios.clear();
  root = await mkdtemp(join(tmpdir(), "memi-legacy-handlers-"));
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: [...MEMI_CAPABILITIES] });
  await writeFile(join(root, "page.tsx"), 'export default () => <main className="p-4 text-sm">Hello</main>;');
  effects.fetch.mockResolvedValue({ html: "<main />", title: "Example", cssBlocks: [":root { --primary: #ffffff; } body { color: #000000; padding: 4px; }"] });
  effects.complete.mockResolvedValue({ content: "# Source-backed design document" });
  effects.execute.mockResolvedValue({ success: true, plan: { steps: [] } });
  effects.analyze.mockResolvedValue({ mode: "general", summary: "reviewed" });
  effects.accessibility.mockResolvedValue({ mode: "accessibility", issues: [] });
  effects.compliance.mockResolvedValue({ mode: "spec-compliance", compliant: true });
  effects.researchPackage.mockImplementation((store, options) => ({ findings: store.findings?.length ?? 0, options }));
  effects.saveResearch.mockResolvedValue({ written: 1 }); effects.mermaid.mockResolvedValue({ paths: ["artifact.mmd"] });
  effects.scenario.mockImplementation((_store, options) => ({ id: "scenario", agents: [{ id: "agent" }], graph: [], metadata: { budget: options.budget }, ...options }));
  effects.prepare.mockImplementation(async scenario => ({ scenario }));
  effects.start.mockResolvedValue({ id: "run", status: "complete" });
  effects.report.mockResolvedValue({ id: "report", recommendations: [] });
  effects.interview.mockResolvedValue({ answer: "simulated answer" });
  const component = ComponentSpecSchema.parse({ name: "Button", type: "component", purpose: "Action" });
  engine = {
    config: { projectRoot: root },
    registry: {
      designSystem: { tokens: [{ name: "Colors/Primary", type: "color", values: { Light: "#ffffff" }, cssVariable: "--primary" }], components: [], styles: [], lastSync: "test-sync" },
      getAllSpecs: vi.fn().mockResolvedValue([component, { name: "Flow", type: "ia" }]),
      getSpec: vi.fn(async name => name === "Button" ? component : undefined), saveSpec: vi.fn(),
      getGenerationState: vi.fn(), updateToken: vi.fn(), addToken: vi.fn(),
    },
    research: { load: vi.fn(), getStore: vi.fn(() => ({ version: 2, sources: [], findings: [{ id: "finding" }], observations: [], summary: "research" })) },
    figma: { isConnected: true, pushTokens: vi.fn(), captureScreenshot: vi.fn().mockResolvedValue({ base64: "cG5n", mimeType: "image/png", format: "PNG" }), getSelection: vi.fn().mockResolvedValue([{ id: "node" }]), getPageTree: vi.fn().mockResolvedValue([{ id: "page" }]), wsServer: { checkHealth: vi.fn().mockResolvedValue({ connected: true }) } },
    pullDesignSystem: vi.fn(), pullDesignSystemREST: vi.fn(),
    generateFromSpec: vi.fn().mockResolvedValue({ entryFile: "Button.tsx", findings: [] }),
  };
  handlers = new Map();
  const server = { tool(name: string, _description: string, schema: z.ZodRawShape, callback: (input: any) => Promise<any>) { handlers.set(name, { schema: z.object(schema), callback }); } };
  registerTools(server as never, engine);
});
afterEach(async () => { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });

describe("legacy MCP handler contracts", () => {
  it("rechecks all grants at invocation and never runs a denied effect", async () => {
    configureExecutionPolicy({ projectRoot: root });
    failed(await invoke("pull_design_system"), "MEMI_CAPABILITY_DENIED");
    expect(engine.pullDesignSystem).not.toHaveBeenCalled();
  });
  it("restores registration after excluding a default read tool", () => {
    const server = { tool: vi.fn() }; const original = server.tool;
    registerTools(server as never, engine, new Set(["get_specs"]));
    expect(server.tool).toBe(original);
    expect(server.tool.mock.calls.some(call => call[0] === "get_specs")).toBe(false);
  });
  it("returns registry summaries and missing-spec errors", async () => {
    expect(payload(await invoke("pull_design_system"))).toMatchObject({ tokens: 1, components: 0, lastSync: "test-sync" });
    expect(payload(await invoke("pull_design_system_rest"))).toMatchObject({ tokens: 1 });
    expect(payload(await invoke("get_specs"))).toEqual([{ name: "Button", type: "component", purpose: "Action" }, { name: "Flow", type: "ia" }]);
    expect(payload(await invoke("get_spec", { name: "Button" })).purpose).toBe("Action");
    failed(await invoke("get_spec", { name: "Missing" }), "not found");
  });
  it.each(["pull_design_system", "capture_screenshot", "get_selection", "get_page_tree", "analyze_design"])("%s rejects unavailable Figma before adapter calls", async name => {
    engine.figma.isConnected = false; failed(await invoke(name), "Figma not connected");
    expect(engine.figma.captureScreenshot).not.toHaveBeenCalled();
  });
  it.each([
    { name: "Action", type: "component", purpose: "Action", props: { label: "string" } },
    { name: "Settings", type: "page", purpose: "Configure" },
    { name: "Revenue", type: "dataviz", purpose: "Trend", chartType: "line", dataShape: { x: "date", y: "number" } },
  ])("validates and saves a $type spec", async spec => {
    expect((await invoke("create_spec", { spec: JSON.stringify(spec) })).content[0].text).toContain("saved");
    expect(engine.registry.saveSpec).toHaveBeenCalledWith(expect.objectContaining({ name: spec.name, type: spec.type }));
  });
  it.each(["{", "null", '{"type":"unknown"}', '{"type":"component"}', '{"type":"component","name":"Broken","purpose":"test","props":{"bad-key":"string"}}'])("rejects malformed or unsafe spec %s", async spec => {
    failed(await invoke("create_spec", { spec })); expect(engine.registry.saveSpec).not.toHaveBeenCalled();
  });
  it("returns gate blockers, fallback output and recorded generation evidence", async () => {
    engine.generateFromSpec.mockResolvedValueOnce({ blocked: true, findings: [{ id: "gate" }] });
    failed(await invoke("generate_code", { specName: "Button" }), "blocked");
    expect(payload(await invoke("generate_code", { specName: "Button" }))).toMatchObject({ entryFile: "Button.tsx", files: [], critique: null });
    engine.registry.getGenerationState.mockReturnValue({ files: ["Button.tsx"], findings: [{ id: "verified" }], critique: "reviewed", generatedAt: "timestamp" });
    expect(payload(await invoke("generate_code", { specName: "Button", force: true }))).toMatchObject({ files: ["Button.tsx"], critique: "reviewed" });
    expect(engine.generateFromSpec).toHaveBeenLastCalledWith("Button", { force: true });
  });
  it("filters token names/types and exports DTCG", async () => {
    expect(payload(await invoke("get_tokens", { type: "spacing" }))).toEqual([]);
    expect(payload(await invoke("get_tokens", { name: "PRIMARY" }))).toHaveLength(1);
    expect(payload(await invoke("get_tokens", { name: "absent" }))).toEqual([]);
    expect(JSON.stringify(payload(await invoke("get_tokens", { format: "dtcg" })))).toContain("$value");
  });
  it("reports local token updates and every requested Figma push outcome", async () => {
    failed(await invoke("update_token", { name: "missing", values: {} }), "not found");
    expect(payload(await invoke("update_token", { name: "colors.primary", values: { Dark: "#000000" } }))).toMatchObject({ updated: true, pushedToFigma: false });
    expect(engine.registry.updateToken.mock.calls[0][1].values).toEqual({ Light: "#ffffff", Dark: "#000000" });
    engine.figma.isConnected = false;
    expect(payload(await invoke("update_token", { name: "Colors/Primary", values: {}, pushToFigma: true })).reason).toContain("skipped");
    engine.figma.isConnected = true; engine.figma.pushTokens.mockRejectedValueOnce(new Error("offline"));
    expect(payload(await invoke("update_token", { name: "Colors/Primary", values: {}, pushToFigma: true })).reason).toContain("offline");
    expect(payload(await invoke("update_token", { name: "Colors/Primary", values: {}, pushToFigma: true })).pushedToFigma).toBe(true);
  });
  it("returns capture/selection/page-tree/bridge results without invoking real hosts", async () => {
    expect((await invoke("capture_screenshot", { format: "SVG", scale: 1 })).content[0].type).toBe("image");
    expect(payload(await invoke("get_selection"))).toEqual([{ id: "node" }]);
    expect(payload(await invoke("get_page_tree"))).toEqual([{ id: "page" }]);
    expect(payload(await invoke("check_bridge_health"))).toEqual({ connected: true });
    expect(payload(await invoke("compose", { intent: "Inspect", dryRun: true })).success).toBe(true);
    expect(effects.execute).toHaveBeenCalledWith("Inspect", { dryRun: true });
  });
  it("preserves deterministic audit results and adapter errors", async () => {
    expect(payload(await invoke("run_audit", { focus: "contrast" })).success).toBe(true);
    expect(payload(await invoke("run_audit", { focus: "skill-compliance" })).summary).toContain("files");
    engine.registry.getAllSpecs.mockResolvedValue([]);
    expect(payload(await invoke("run_audit"))).toMatchObject({ success: true, score: expect.any(Number) });
    expect(payload(await invoke("run_audit", { focus: "naming" })).summary).toContain("focus: naming");
    engine.registry.getAllSpecs.mockRejectedValue(new Error("registry unavailable"));
    failed(await invoke("run_audit"), "registry unavailable");
  });
  it("summarizes research without returning full findings until requested", async () => {
    const overview = payload(await invoke("get_research")); expect(overview.counts.findings).toBe(1); expect(overview).not.toHaveProperty("findings");
    expect(payload(await invoke("get_research", { sections: ["findings"] }))).toEqual({ version: 2, findings: [{ id: "finding" }] });
  });
  it.each(["{", "[]", "null", "42", '{"observations":{}}', '{"findings":{}}'])("rejects malformed research envelope %s", async research => {
    failed(await invoke("research_design_package", { research })); expect(effects.researchPackage).not.toHaveBeenCalled();
  });
  it("requires approval before research writes and distinguishes supplied research", async () => {
    failed(await invoke("research_generate_specs"), "Approval required"); expect(effects.saveResearch).not.toHaveBeenCalled();
    expect(payload(await invoke("research_design_package", { research: '{"findings":[]}' })).package.findings).toBe(0);
    expect(payload(await invoke("research_generate_specs", { approved: true })).specWrite.written).toBe(1);
    expect(payload(await invoke("mermaid_jam_export"))).toHaveProperty("exports.paths");
  });
  it("keeps source and screenshot audits distinct and checks artifact readability", async () => {
    const screenshot = join(root, "shot.png"); await writeFile(screenshot, "fixture");
    for (const name of ["audit_ux_tenets_traps", "audit_interface_craft"]) {
      expect(payload(await invoke(name, { screenshotPath: screenshot }))).toHaveProperty("unassessedDimensions");
      expect(payload(await invoke(name, { target: ".", screenshotPath: screenshot }))).toHaveProperty("evidenceProvenance");
      expect(payload(await invoke(name))).toHaveProperty("score");
      failed(await invoke(name, { screenshotPath: root }), "not a file");
      failed(await invoke(name, { screenshotPath: join(root, "missing") }), "not readable");
    }
    expect(payload(await invoke("diagnose_app_quality", { files: ["page.tsx"] }))).toHaveProperty("scope");
    expect(payload(await invoke("check_skill_compliance"))).toHaveProperty("summary.filesChecked");
    expect(payload(await invoke("plan_ui_fixes"))).toHaveProperty("patches");
    expect(payload(await invoke("generate_health_report", { redact: true })).missing).toContain("diagnosis (run `memi diagnose` first)");
  });
  it("reports AI absence and mode-specific vision results", async () => {
    failed(await invoke("analyze_design"), "AI"); effects.ai = { complete: effects.complete };
    expect(payload(await invoke("analyze_design"))).toMatchObject({ mode: "general" });
    expect(payload(await invoke("analyze_design", { mode: "accessibility" })).mode).toBe("accessibility");
    failed(await invoke("analyze_design", { mode: "spec-compliance" }), "specName required");
    failed(await invoke("analyze_design", { mode: "spec-compliance", specName: "missing" }), "not found");
    expect(payload(await invoke("analyze_design", { mode: "spec-compliance", specName: "Button" })).compliant).toBe(true);
  });
  it("extracts raw CSS without a model and marks failed fetch/synthesis explicitly", async () => {
    expect(payload(await invoke("design_doc", { url: "https://example.com", raw: true })).tokens.cssVarCount).toBe(1);
    expect(effects.complete).not.toHaveBeenCalled();
    failed(await invoke("design_doc", { url: "https://example.com" }), "configured AI");
    effects.ai = { complete: effects.complete };
    expect((await invoke("design_doc", { url: "https://example.com" })).content[0].text).toContain("Source-backed");
    effects.fetch.mockResolvedValueOnce({ html: "", cssBlocks: [] }); failed(await invoke("design_doc", { url: "https://example.com" }), "Could not fetch");
    effects.fetch.mockRejectedValueOnce(new Error("fetch failed")); failed(await invoke("design_doc", { url: "https://example.com" }), "fetch failed");
  });
  it("distinguishes no model usage from unknown provider prices", async () => {
    expect(payload(await invoke("get_ai_usage"))).toMatchObject({ calls: 0, costComplete: true });
    effects.tracker = { callCount: 1, totalInput: 10, totalOutput: 3, totalCost: 0.123, isCostComplete: false, unpricedCallCount: 1, summary: "unknown price" };
    expect(payload(await invoke("get_ai_usage"))).toMatchObject({ estimatedCost: "unknown", costComplete: false });
    effects.tracker.isCostComplete = true;
    expect(payload(await invoke("get_ai_usage"))).toMatchObject({ estimatedCost: "$0.1230", knownEstimatedCost: "$0.1230" });
  });
  it("plans bounded local and model-swarm scenarios without provider calls", async () => {
    expect(payload(await invoke("simulation_models"))).toHaveProperty("profiles");
    expect(payload(await invoke("simulation_generate_agents"))).toHaveProperty("agents");
    expect(effects.scenario).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ adapter: "model-swarm", agentCount: 24 }));
    await invoke("simulation_generate_agents", { adapter: "local", count: 3, research: '{"findings":[]}' });
    expect(effects.scenario).toHaveBeenLastCalledWith({ findings: [] }, { adapter: "local", agentCount: 3 });
    await invoke("simulation_generate_agents", { adapter: "local" });
    const local = payload(await invoke("simulation_plan"));
    expect(local.scenario).toMatchObject({ adapter: "local", modelProfiles: [] });
    const swarm = payload(await invoke("simulation_plan", { adapter: "model-swarm", research: '{"findings":[]}', maxAgents: 4, rounds: 2 }));
    expect(swarm.scenario).toMatchObject({ agentCount: 24, metadata: { budget: { maxAgents: 4, maxRounds: 2 } }, modelProfiles: [{ id: "offline-profile" }] });
    await expect(invoke("simulation_plan", { rounds: 0 })).rejects.toThrow();
    expect(effects.complete).not.toHaveBeenCalled();
  });
  it("runs scenarios and matrices with explicit budgets and surfaced adapter failures", async () => {
    effects.scenarios.set("saved", { adapter: "model-swarm" });
    expect(payload(await invoke("simulation_run", { scenarioId: "saved", allowLiveModels: false })).run.status).toBe("complete");
    await invoke("simulation_run", { scenarioId: "unknown" });
    await invoke("simulation_run", { scenarioId: "saved", adapter: "local", maxAgents: 3, rounds: 1, allowLiveModels: true });
    const matrix = payload(await invoke("simulation_run_matrix", { hypotheses: ["A", "B"], maxAgents: 2, rounds: 1, research: '{"findings":[]}' }));
    expect(matrix.runs.map((item: any) => item.hypothesis)).toEqual(["A", "B"]);
    expect(matrix.comparison.compared).toBe(2);
    await invoke("simulation_run_matrix", { hypotheses: ["default"] });
    effects.start.mockRejectedValueOnce(new Error("budget exhausted"));
    failed(await invoke("simulation_run", { scenarioId: "saved" }), "budget exhausted");
    await expect(invoke("simulation_run_matrix", { hypotheses: [] })).rejects.toThrow();
  });
  it("returns bounded event pages and preserves absent run errors", async () => {
    expect(payload(await invoke("simulation_stream", { runId: "run", offset: 1, limit: 1 }))).toEqual({ events: [{ id: "e2" }], offset: 1, limit: 1, total: 3, hasMore: true });
    expect(payload(await invoke("simulation_stream", { runId: "run", offset: 9 }))).toMatchObject({ events: [], total: 3, hasMore: false });
    expect(payload(await invoke("simulation_stream", { runId: "run" })).events).toHaveLength(3);
    for (const name of ["simulation_status", "simulation_transcript", "simulation_costs"]) failed(await invoke(name, { runId: "missing" }), "Unknown simulation run");
    failed(await invoke("simulation_compare", { runIds: ["missing"] }), "Unknown simulation run");
    const run = { id: "run", scenarioId: "scenario", adapter: "model-swarm", status: "complete", eventCount: 3, transcripts: [{ content: "simulated" }] };
    effects.runs.set("run", run);
    expect(payload(await invoke("simulation_status", { runId: "run" })).run).toEqual(run);
    expect(payload(await invoke("simulation_transcript", { runId: "run" })).transcripts).toEqual(run.transcripts);
    expect(payload(await invoke("simulation_costs", { runId: "run" })).costs.cost).toBe("unknown");
    expect(payload(await invoke("simulation_compare", { runIds: ["run"] })).comparison.compared).toBe(1);
    expect(payload(await invoke("simulation_list_runs")).runs[0]).not.toHaveProperty("transcripts");
    expect(payload(await invoke("simulation_interview", { runId: "run", agentId: "agent", prompt: "Why?" })).interview.answer).toBe("simulated answer");
    expect(effects.interview).toHaveBeenCalledWith("run", { agentId: "agent", prompt: "Why?" });
    expect(payload(await invoke("simulation_report", { runId: "run" })).report.id).toBe("report");
    expect(payload(await invoke("simulation_export_spec", { runId: "run" })).spec.type).toBe("product-spec");
    await invoke("research_design_package", { runId: "run" });
    expect(effects.researchPackage).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ simulationReport: expect.objectContaining({ id: "report" }) }));
    await invoke("research_design_package", { runId: "missing" });
    await invoke("mermaid_jam_export", { source: "simulation", runId: "run" });
  });
  it("maps each Tailwind token group and validates DTCG imports before mutation", async () => {
    engine.registry.designSystem.tokens = [
      { name: "Color/Primary", type: "color", values: { Light: "#fff" }, cssVariable: "--primary" },
      ...["spacing", "typography", "radius", "shadow", "other"].map(type => ({ name: `${type}/Small Size`, type, values: { Light: "4px" } })),
    ];
    expect(payload(await invoke("sync_design_tokens"))).toEqual({ colors: { primary: "var(--primary)" }, spacing: { "small-size": "4px" }, fontSize: { "small-size": "4px" }, borderRadius: { "small-size": "4px" }, boxShadow: { "small-size": "4px" } });
    engine.registry.designSystem.tokens = []; expect(payload(await invoke("sync_design_tokens"))).toEqual({});
    const path = join(root, "tokens.json");
    failed(await invoke("sync_design_tokens", { dtcgFile: path }), "Could not read");
    await writeFile(path, "{}"); failed(await invoke("sync_design_tokens", { dtcgFile: path }), "not a DTCG");
    expect(engine.registry.addToken).not.toHaveBeenCalled();
    await writeFile(path, '{"space":{"$type":"dimension","$value":"4px"}}');
    expect(payload(await invoke("sync_design_tokens", { dtcgFile: path })).imported).toBe(1);
    expect(engine.registry.addToken).toHaveBeenCalledTimes(1);
  });

});
