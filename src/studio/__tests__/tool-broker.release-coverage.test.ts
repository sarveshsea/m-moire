import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudioToolBroker } from "../tool-broker.js";
import { StudioBrowserAdapter } from "../browser-adapter.js";
import { defaultStudioConfig } from "../config.js";
import type { StudioConfig } from "../types.js";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function setup(change?: (config: StudioConfig) => StudioConfig) {
  const root = await mkdtemp(join(tmpdir(), "memi-broker-release-"));
  dirs.push(root);
  const config = defaultStudioConfig(root);
  const browser = new StudioBrowserAdapter({ projectRoot: root });
  const broker = new StudioToolBroker({ projectRoot: root, getConfig: async () => change ? change(config) : config, browser });
  return { root, broker, browser };
}
interface Board { id: string; mode: string; nodes: Array<{ id: string; title: string; kind: string; body: string; laneId: string; priority?: string; confidence?: number; decisionStatus?: string; researchBacking: string[]; sourceEventIds: string[]; position: { x: number; y: number } }>; edges: Array<{ fromNodeId: string; toNodeId: string; label: string }>; frames: unknown[]; brief: { problem: string; constraints: string[] } }
async function boardCall(broker: StudioToolBroker, toolId: string, input: Record<string, unknown>) {
  const result = await broker.call({ toolId, input });
  expect(result.status, result.error).toBe("completed");
  return result.data as { board: Board; node?: Board["nodes"][number]; exports?: Array<{ outputPath: string }>; sync?: { status: string; createdNodeCount: number } };
}

describe("broker board editing and provenance", () => {
  it.each(["pm-brainstorm", "ia", "sandbox"])("creates and lays out the %s board without losing cards", async (mode) => {
    const { broker } = await setup();
    const created = await boardCall(broker, "board.create", { id: "review", mode, prompt: "Improve navigation", constraints: ["Offline", 4, ""] });
    expect(created.board.mode).toBe(mode);
    expect(created.board.brief).toMatchObject({ problem: "Improve navigation", constraints: ["Offline"] });
    expect(created.board.nodes).toHaveLength(mode === "ia" ? 4 : 6);
    const reapplied = await boardCall(broker, "board.apply_template", { boardId: "review" });
    expect(reapplied.board.nodes.map((node) => node.id)).toEqual(created.board.nodes.map((node) => node.id));
    const laidOut = await boardCall(broker, "board.layout", { id: "review" });
    expect(laidOut.board.frames).toHaveLength(mode === "ia" ? 5 : 8);
  });

  it.each([
    ["sticky", "Note", "problem"], ["persona", "Persona", "users"], ["risk", "Risk", "risks"],
    ["metric", "Metric", "metrics"], ["spec", "Spec", "opportunities"], ["evidence", "Evidence", "next-steps"],
    ["comment", "Decision", "decisions"], ["mermaid", "Flow", "journey"],
  ])("preserves evidence and defaults for %s cards", async (kind, title, laneId) => {
    const { broker } = await setup();
    const result = await boardCall(broker, "board.add_node", { boardId: "cards", nodeId: "one", kind, text: "Observed behavior", evidence: "interview-1", sourceEventIds: ["event-1", 2], author: "human", confidence: "0.8", priority: "medium", decisionStatus: "recommended" });
    expect(result.board.nodes).toHaveLength(1);
    expect(result.board.nodes[0]).toMatchObject({ id: "one", kind, title, laneId, body: "Observed behavior", researchBacking: ["interview-1"], sourceEventIds: ["event-1"], confidence: 0.8, priority: "medium", decisionStatus: "recommended" });
  });

  it.each([["mermaid", "journeys"], ["spec", "screens"], ["sticky", "evidence"]])("assigns IA lane for %s", async (kind, laneId) => {
    const { broker } = await setup();
    const result = await boardCall(broker, "board.add_node", { boardId: "ia", mode: "ia", kind });
    expect(result.board.nodes[0]).toMatchObject({ kind, laneId, body: "Captured board note." });
  });

  it("updates supplied fields while preserving omitted evidence, and rejects unknown nodes", async () => {
    const { broker } = await setup();
    await boardCall(broker, "board.add_node", { boardId: "edit", nodeId: "one", kind: "unknown", priority: "invalid", decisionStatus: "invalid", confidence: "bad" });
    const edited = await boardCall(broker, "board.update_node", { boardId: "edit", nodeId: "one", title: "Review", text: "Review evidence", source: "flowchart LR", laneId: "custom", priority: "high", decisionStatus: "decided", confidence: 1 });
    expect(edited.node).toMatchObject({ title: "Review", body: "Review evidence", kind: "sticky", laneId: "custom", priority: "high", decisionStatus: "decided", confidence: 1 });
    const unchanged = await boardCall(broker, "board.update_node", { boardId: "edit", id: "one" });
    expect(unchanged.node).toMatchObject({ title: "Review", body: "Review evidence", priority: "high", confidence: 1 });
    expect((await broker.call({ toolId: "board.update_node", input: { boardId: "edit", nodeId: "missing" } })).error).toContain("Unknown board node");
    const positioned = await boardCall(broker, "board.layout", { boardId: "edit" });
    expect(positioned.board.nodes[0].position.x).toBe(2080);
  });

  it("connects only existing nodes and escapes labels in local exports", async () => {
    const { broker } = await setup();
    await boardCall(broker, "board.add_node", { boardId: "links", nodeId: "one", title: 'A "quoted" card', kind: "mermaid", source: "flowchart LR\n A-->B" });
    await boardCall(broker, "board.add_node", { boardId: "links", nodeId: "two", title: "Second" });
    for (const [from, to] of [["missing", "two"], ["one", "missing"]]) {
      expect((await broker.call({ toolId: "board.connect", input: { boardId: "links", from, to } })).error).toContain("Unknown board node");
    }
    const connected = await boardCall(broker, "board.connect", { boardId: "links", from: "one", to: "two", label: 'supports "decision"', edgeId: "edge", author: "human", sourceEventIds: "evidence" });
    expect(connected.board.edges).toMatchObject([{ fromNodeId: "one", toNodeId: "two", label: 'supports "decision"' }]);
    const exported = await boardCall(broker, "board.export_mermaid_jam", { boardId: "links" });
    expect(exported.exports).toHaveLength(3);
    const mermaid = await readFile(exported.exports!.find((entry) => entry.outputPath.endsWith(".mmd"))!.outputPath, "utf8");
    expect(mermaid).toContain("n_one -->|supports 'decision'| n_two");
    const markdown = await readFile(exported.exports!.find((entry) => entry.outputPath.endsWith(".md"))!.outputPath, "utf8");
    expect(markdown).toContain("```mermaid");
    const sync = await boardCall(broker, "board.sync_figjam", { boardId: "links" });
    expect(sync.sync).toMatchObject({ status: "fallback", createdNodeCount: 0 });
  });

  it("exports disconnected boards locally with fallback ordering", async () => {
    const { broker } = await setup();
    await boardCall(broker, "board.create", { id: "!!!", mode: "invalid", constraints: "Offline" });
    const exported = await boardCall(broker, "board.export_mermaid_jam", { id: "!!!" });
    const mermaid = await readFile(exported.exports![1].outputPath, "utf8");
    expect(mermaid).toContain("n_node_problem_1 --> n_node_users_2");
    expect(exported.board.mode).toBe("pm-brainstorm");
  });

  it("captures IA event evidence and falls back to session provenance", async () => {
    const { broker } = await setup();
    const captured = await boardCall(broker, "board.capture_ia", { events: [{ id: "event-1", message: "Read screens" }, null] });
    expect(captured.board.nodes.at(-1)).toMatchObject({ body: "Read screens", sourceEventIds: ["event-1"] });
    const result = await broker.call({ toolId: "board.capture_ia", sessionId: "session-2", input: {} });
    expect(result.status).toBe("completed");
    expect((result.data as { board: Board }).board.nodes.at(-1)).toMatchObject({ sourceEventIds: ["session-2"], body: "Capture IA from current run." });
  });
});

describe("broker failure boundaries", () => {
  it.each(["browser.open", "figma.action", "mcp.list", "shell.run"])("rejects disabled tool %s", async (toolId) => {
    const { broker } = await setup((config) => ({ ...config, enabledTools: { ...config.enabledTools, browser: false, figma: false, mcp: false, shell: false } }));
    expect(await broker.call({ toolId })).toMatchObject({ status: "failed", error: expect.stringContaining("disabled") });
  });
  it.each(["workspace.read", "workspace.search", "knowledge.read", "simulation_status", "simulation_transcript", "simulation_costs"])("rejects missing required inputs for %s", async (toolId) => {
    const { broker } = await setup();
    expect(await broker.call({ id: "request", toolId })).toMatchObject({ id: "request", status: "failed", error: expect.stringContaining("requires") });
  });
  it.each(["simulation_status", "simulation_transcript", "simulation_costs", "simulation_compare"])("rejects unknown simulation run for %s", async (toolId) => {
    const { broker } = await setup();
    expect(await broker.call({ toolId, input: { runId: "missing" } })).toMatchObject({ status: "failed", error: expect.stringContaining("Unknown simulation run") });
  });
  it.each(["research_generate_specs", "research.generate_specs", "mcp.call", "shell.run"])("requires approval for %s", async (toolId) => {
    const { broker } = await setup((config) => ({ ...config, enabledTools: { ...config.enabledTools, shell: true, mcp: true } }));
    expect(await broker.call({ toolId, input: { command: "pwd" } })).toMatchObject({ status: "approval_required", approval: { required: true } });
  });
  it("distinguishes unknown tools and unconfigured integrations", async () => {
    const { broker } = await setup((config) => ({ ...config, enabledTools: { ...config.enabledTools, figma: true, mcp: true } }));
    expect((await broker.call({ toolId: "missing" })).status).toBe("failed");
    expect((await broker.call({ toolId: "figma.action" })).error).toContain("not configured");
    expect(await broker.call({ toolId: "mcp.call", approved: true })).toMatchObject({ status: "completed", data: { status: "not_configured" } });
    expect((await broker.call({ toolId: "board.layout" })).error).toContain("Unknown board");
    expect((await broker.call({ toolId: "knowledge.read", input: { id: "missing" } })).error).toContain("Unknown knowledge item");
  });
  it("routes browser actions through the adapter without inventing optional inputs", async () => {
    const { broker, browser } = await setup((config) => ({ ...config, enabledTools: { ...config.enabledTools, browser: true } }));
    const action = vi.spyOn(browser, "runAction").mockResolvedValue({} as never);
    for (const toolId of ["browser.snapshot", "browser.screenshot", "browser.click", "browser.type"]) {
      expect((await broker.call({ toolId, input: { sessionId: "s", selector: "button", text: "label", url: "https://example.test" } })).status).toBe("completed");
      expect(action).toHaveBeenLastCalledWith({ action: toolId.split(".")[1], sessionId: "s", selector: "button", text: "label", url: "https://example.test" });
    }
    await broker.call({ toolId: "browser.snapshot", input: { selector: 4 } });
    expect(action).toHaveBeenLastCalledWith({ action: "snapshot", sessionId: undefined, selector: undefined, text: undefined, url: undefined });
  });
  it("bounds workspace search and rejects writes through external symlinks", async () => {
    const { root, broker } = await setup();
    await mkdir(join(root, "nested"));
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "nested", "tokens.ts"), "export const label = 'findability';");
    await writeFile(join(root, "node_modules", "hidden.ts"), "findability");
    await writeFile(join(root, "ignored.bin"), "findability");
    const search = await broker.call({ toolId: "workspace.search", input: { query: "FINDABILITY" } });
    expect(search).toMatchObject({ status: "completed", data: { matches: [{ path: join(root, "nested", "tokens.ts") }] } });
    const byName = await broker.call({ toolId: "workspace.search", input: { path: root, query: "tokens" } });
    expect(byName).toMatchObject({ data: { matches: [{ match: "nested/tokens.ts" }] } });
    expect(await broker.call({ toolId: "workspace.read", input: { path: root } })).toMatchObject({ data: { type: "directory", entries: expect.arrayContaining([expect.objectContaining({ name: "nested", type: "directory" })]) } });
    const outside = await mkdtemp(join(tmpdir(), "memi-broker-outside-")); dirs.push(outside);
    await symlink(outside, join(root, "escape"));
    expect(await broker.call({ toolId: "workspace.write", approved: true, input: { path: join(root, "escape", "new", "file.md"), content: "private" } })).toMatchObject({ status: "failed", error: expect.stringContaining("not allowed") });
  });
});
