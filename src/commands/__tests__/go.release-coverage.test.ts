import { EventEmitter } from "node:events";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGoCommand } from "../go.js";
import { captureLogs } from "./test-helpers.js";
const mocks = vi.hoisted(() => ({ spinner: vi.fn(), stopSpinner: vi.fn(), penpot: vi.fn(), preview: vi.fn(), gallery: vi.fn(), startPreview: vi.fn(), stopPreview: vi.fn() }));
vi.mock("ora", () => ({ default: mocks.spinner }));
vi.mock("../../figma/penpot-client.js", () => ({ pullFromPenpot: mocks.penpot }));
vi.mock("../../preview/server.js", () => ({ PreviewServer: class {
  constructor(...args: unknown[]) { mocks.preview(...args); }
  buildGallery = mocks.gallery; start = mocks.startPreview; stop = mocks.stopPreview;
} }));
const figma = Object.assign(new EventEmitter(), { isConnected: true, disconnect: vi.fn() });
const engine = {
  config: { projectRoot: "/virtual/go-project" }, figma,
  init: vi.fn(), codegen: { setOptions: vi.fn() }, connectFigma: vi.fn(), pullDesignSystem: vi.fn(), pullDesignSystemREST: vi.fn(),
  registry: { getAllSpecs: vi.fn(), updateDesignSystem: vi.fn(), designSystem: { tokens: [{}], components: [{}, {}], styles: [] } },
  generateFromSpec: vi.fn(),
};
let logs: string[]; const signals = new Map<string, () => void>();
async function cli(args: string[]) {
  const program = new Command().exitOverride(); registerGoCommand(program, engine as never);
  await program.parseAsync(["go", ...args], { from: "user" });
}
function json() { return JSON.parse(logs.at(-1)!); }
beforeEach(() => {
  vi.resetAllMocks(); figma.removeAllListeners(); figma.isConnected = true; signals.clear(); logs = captureLogs();
  mocks.spinner.mockReturnValue({ start: () => ({ stop: mocks.stopSpinner }) });
  engine.registry.getAllSpecs.mockResolvedValue([]); engine.generateFromSpec.mockResolvedValue({ blocked: false });
  engine.connectFigma.mockResolvedValue(9223);
  vi.spyOn(process, "once").mockImplementation(((event: string, callback: () => void) => { signals.set(event, callback); return process; }) as never);
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  for (const key of ["PENPOT_TOKEN", "PENPOT_FILE_ID", "PENPOT_BASE_URL"]) vi.stubEnv(key, undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); figma.removeAllListeners(); process.exitCode = 0; });

describe("go pipeline result contracts", () => {
  it("runs offline without network or preview and applies generation options", async () => {
    await cli(["--no-figma", "--no-stories", "--json"]);
    expect(json()).toMatchObject({ status: "completed", steps: { init: true, figma: { skipped: true, connected: false }, generate: { completed: true }, preview: { skipped: true } } });
    expect(engine.codegen.setOptions).toHaveBeenCalledWith({ noStories: true });
    expect(engine.connectFigma).not.toHaveBeenCalled(); expect(engine.pullDesignSystem).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("counts generated, blocked and rejected specs while excluding non-code specs", async () => {
    engine.registry.getAllSpecs.mockResolvedValue([{ name: "Page", type: "page" }, { name: "Button", type: "component" }, { name: "Chart", type: "dataviz" }, { name: "Design", type: "design" }, { name: "IA", type: "ia" }]);
    engine.generateFromSpec.mockImplementation(async (name: string) => { if (name === "Chart") throw new Error("compile failed"); return { blocked: name === "Button" }; });
    await cli(["--no-figma", "--json"]);
    expect(json()).toMatchObject({ status: "partial", steps: { generate: { generated: 1, blocked: 1, failed: 1 } } });
    expect(engine.generateFromSpec.mock.calls.map(call => call[0])).toEqual(["Page", "Button", "Chart"]);
  });
  it("prints all generation outcomes without abandoning successful work", async () => {
    engine.registry.getAllSpecs.mockResolvedValue(["Good", "Blocked", "Bad", "Unknown"].map(name => ({ name, type: "component" })));
    engine.generateFromSpec.mockImplementation(async (name: string) => { if (name === "Bad") throw new Error("compile failed"); if (name === "Unknown") throw undefined; return { blocked: name === "Blocked" }; });
    await cli(["--no-figma", "--no-preview"]);
    expect(logs.join("\n")).toContain("blocked by quality gate"); expect(logs.join("\n")).toContain("compile failed"); expect(logs.join("\n")).toContain("Good");
  });
  it.each([false, true])("skips generation on request, json=%s", async jsonMode => {
    await cli(["--no-figma", "--no-generate", "--no-preview", ...(jsonMode ? ["--json"] : [])]);
    expect(engine.registry.getAllSpecs).not.toHaveBeenCalled();
    if (jsonMode) expect(json().steps.generate.skipped).toBe(true); else expect(logs.join("\n")).toContain("Code generation");
  });
  it.each([false, true])("pulls an already-connected plugin, json=%s", async jsonMode => {
    await cli(["--no-generate", "--no-preview", ...(jsonMode ? ["--json"] : [])]);
    expect(engine.connectFigma).not.toHaveBeenCalled(); expect(engine.pullDesignSystem).toHaveBeenCalledOnce();
    if (jsonMode) expect(json().steps.pull).toEqual({ completed: true, tokens: 1, components: 2 });
    else expect(logs.join("\n")).toContain("Figma already connected");
  });
  it.each([false, true])("uses REST without opening a bridge, json=%s", async jsonMode => {
    await cli(["--rest", "--no-generate", "--no-preview", ...(jsonMode ? ["--json"] : [])]);
    expect(engine.connectFigma).not.toHaveBeenCalled(); expect(engine.pullDesignSystemREST).toHaveBeenCalledOnce();
    if (jsonMode) expect(json().steps.figma.skipped).toBe(true); else expect(logs.join("\n")).toContain("REST mode");
  });
  it.each([new Error("rest unavailable"), "rest unavailable"])("reports REST failure as partial evidence", async error => {
    engine.pullDesignSystemREST.mockRejectedValue(error); await cli(["--rest", "--no-generate", "--json"]);
    expect(json()).toMatchObject({ status: "partial", steps: { figma: { error: "rest unavailable" }, pull: { completed: false } } });
    logs.length = 0; await cli(["--rest", "--no-generate", "--no-preview"]); expect(logs.join("\n")).toContain("REST pull failed");
  });
  it("waits for plugin connection and removes its event listener", async () => {
    figma.isConnected = false;
    engine.connectFigma.mockImplementation(async () => { queueMicrotask(() => { figma.isConnected = true; figma.emit("plugin-connected"); }); return 9223; });
    await cli(["--no-generate", "--no-preview"]);
    expect(engine.pullDesignSystem).toHaveBeenCalledOnce(); expect(figma.listenerCount("plugin-connected")).toBe(0);
    expect(logs.join("\n")).toContain("Figma connected");
  });
  it("waits through the registered plugin event and clears the timeout", async () => {
    vi.useFakeTimers(); figma.isConnected = false;
    const pending = cli(["--no-generate", "--json"]); await vi.advanceTimersByTimeAsync(1);
    expect(figma.listenerCount("plugin-connected")).toBe(1);
    figma.isConnected = true; figma.emit("plugin-connected"); await pending;
    expect(json().steps.figma.connected).toBe(true); expect(vi.getTimerCount()).toBe(0);
  });
  it("records connection timeout without leaving listeners or timers", async () => {
    vi.useFakeTimers(); figma.isConnected = false;
    const pending = cli(["--no-generate", "--json"]); await vi.advanceTimersByTimeAsync(120_000); await pending;
    expect(json().status).toBe("partial"); expect(json().steps.figma.error).toContain("Timed out waiting");
    expect(figma.listenerCount("plugin-connected")).toBe(0); expect(vi.getTimerCount()).toBe(0); expect(engine.pullDesignSystem).not.toHaveBeenCalled();
  });
  it.each([new Error("bridge unavailable"), "bridge unavailable"])("preserves bridge failures as partial results", async error => {
    figma.isConnected = false; engine.connectFigma.mockRejectedValue(error);
    await cli(["--no-generate", "--json"]); expect(json().steps.figma.error).toBe("bridge unavailable");
    logs.length = 0; await cli(["--no-generate", "--no-preview"]); expect(logs.join("\n")).toContain("Figma: bridge unavailable");
  });
  it.each([false, true])("pulls Penpot metadata without real network, explicitBase=%s", async explicitBase => {
    vi.stubEnv("PENPOT_TOKEN", "fixture-token"); vi.stubEnv("PENPOT_FILE_ID", "fixture-file");
    if (explicitBase) vi.stubEnv("PENPOT_BASE_URL", "https://penpot.example.test");
    mocks.penpot.mockResolvedValue({ tokens: [{}], components: [], styles: [], fileName: "Fixture" });
    await cli(["--penpot", "--no-generate", "--no-preview", ...(explicitBase ? ["--json"] : [])]);
    expect(mocks.penpot).toHaveBeenCalledWith({ token: "fixture-token", fileId: "fixture-file", baseUrl: explicitBase ? "https://penpot.example.test" : "https://design.penpot.app" });
    expect(engine.registry.updateDesignSystem).toHaveBeenCalledWith(expect.objectContaining({ tokens: [{}], lastSync: expect.any(String) }));
    if (explicitBase) expect(json().steps.pull.completed).toBe(true); else expect(logs.join("\n")).toContain("Fixture");
  });
  it.each(["missing-token", "missing-file", "remote-failure"])("reports Penpot %s without successful pull", async failure => {
    if (failure !== "missing-token") vi.stubEnv("PENPOT_TOKEN", "fixture-token");
    if (failure !== "missing-file") vi.stubEnv("PENPOT_FILE_ID", "fixture-file");
    mocks.penpot.mockRejectedValue("penpot unavailable");
    await cli(["--penpot", "--no-generate", "--json"]);
    expect(json().status).toBe("partial"); expect(json().steps.pull.completed).toBe(false);
    if (failure !== "remote-failure") expect(mocks.penpot).not.toHaveBeenCalled();
    logs.length = 0; await cli(["--penpot", "--no-generate", "--no-preview"]); expect(logs.join("\n")).toContain("Penpot pull failed");
  });
  it.each([[false, "4200", 4200], [true, "invalid", 3333]] as const)("starts local preview and cleans up, offline=%s", async (offline, port, expected) => {
    await cli(["--no-generate", "--port", port, ...(offline ? ["--no-figma"] : [])]);
    expect(mocks.preview).toHaveBeenCalledWith(engine.config.projectRoot, expected); expect(mocks.gallery).toHaveBeenCalledWith(engine.registry);
    expect(mocks.startPreview).toHaveBeenCalledOnce(); signals.get(offline ? "SIGINT" : "SIGTERM")!();
    expect(mocks.stopPreview).toHaveBeenCalledOnce(); expect(figma.disconnect).toHaveBeenCalledTimes(offline ? 0 : 1); expect(process.exit).toHaveBeenCalledWith(0);
  });
});
