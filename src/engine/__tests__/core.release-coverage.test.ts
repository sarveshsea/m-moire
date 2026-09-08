import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine, type MemoireEvent } from "../core.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
const mocks = vi.hoisted(() => ({ rest: vi.fn(), autoSpec: vi.fn(), lock: vi.fn() }));
vi.mock("../../figma/rest-client.js", () => ({ extractDesignSystemREST: mocks.rest }));
vi.mock("../../figma/bridge-lock.js", () => ({ readBridgeLock: mocks.lock }));
vi.mock("../auto-spec.js", () => ({ autoSpecFromDesignSystem: mocks.autoSpec }));

let root: string;
let engine: MemoireEngine;
let events: MemoireEvent[];
const ds = () => ({ tokens: [], components: [], styles: [], lastSynced: null });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-core-release-"));
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  for (const key of ["FIGMA_TOKEN", "FIGMA_FILE_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(key, "");
  mocks.lock.mockReset().mockResolvedValue(null); mocks.rest.mockReset().mockResolvedValue(ds()); mocks.autoSpec.mockReset().mockReturnValue({ specs: [], skipped: [] });
  engine = new MemoireEngine({ projectRoot: root }); events = []; engine.on("event", e => events.push(e));
});
afterEach(async () => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); resetExecutionPolicyForTests();
  await rm(root, { recursive: true, force: true });
});

describe("core engine release behavior", () => {
  it("routes component events and suppresses empty or guarded token feedback", () => {
    const fromFigma = vi.spyOn(engine.sync, "onVariableChanged").mockImplementation(() => {});
    const fromCode = vi.spyOn(engine.sync, "onCodeTokenChanged").mockImplementation(() => {});
    const variable = { name: "accent", collection: "theme", values: { light: "red" }, updatedAt: 1 };
    engine.figma.emit("variable-changed", variable); expect(fromFigma).toHaveBeenCalledWith(variable);
    engine.registry.emit("token-changed", { current: null }); expect(fromCode).not.toHaveBeenCalled();
    engine.registry.emit("token-changed", { current: variable }); expect(fromCode).toHaveBeenCalledWith(variable);
    vi.spyOn(engine.sync, "isGuarded", "get").mockReturnValue(true);
    engine.registry.emit("token-changed", { current: variable }); expect(fromCode).toHaveBeenCalledTimes(1);
  });
  it("loads a read-only registry without creating project files", async () => {
    const load = vi.spyOn(engine.registry, "load");
    await engine.initReadOnly(); expect(load).toHaveBeenCalledWith({ readOnly: true }); expect(engine.project).not.toBeNull();
    await expect(readFile(join(root, ".memoire", "project.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(engine.soul).toBe("");
  });
  it("upgrades initialization profiles once and inherits environment credentials only when absent", async () => {
    vi.stubEnv("FIGMA_TOKEN", "fixture-token"); vi.stubEnv("FIGMA_FILE_KEY", "fixture-file"); vi.stubEnv("ANTHROPIC_API_KEY", "fixture-api");
    const load = vi.spyOn(engine.registry, "load"); const sync = vi.spyOn(engine.sync, "loadState").mockResolvedValue();
    const agents = vi.spyOn(engine.agentRegistry, "load").mockResolvedValue();
    const health = vi.spyOn(engine.agentRegistry, "startHealthCheck").mockImplementation(() => {});
    const queue = vi.spyOn(engine.taskQueue, "start").mockResolvedValue(); const notes = vi.spyOn(engine.notes, "loadAll").mockResolvedValue([]);
    await engine.init("minimal"); expect(load).not.toHaveBeenCalled();
    expect(engine.config).toMatchObject({ figmaToken: "fixture-token", figmaFileKey: "fixture-file", anthropicApiKey: "fixture-api" });
    await engine.init("registry"); expect(load).toHaveBeenCalledTimes(1); expect(sync).toHaveBeenCalledTimes(1); expect(agents).not.toHaveBeenCalled();
    await engine.init(); await engine.init(); await engine.init("minimal");
    expect(agents).toHaveBeenCalledTimes(1); expect(health).toHaveBeenCalledTimes(1); expect(queue).toHaveBeenCalledTimes(1); expect(notes).toHaveBeenCalledTimes(1);
    expect(events.filter(e => e.message.startsWith("Mémoire initialized"))).toHaveLength(3);
  });
  it("retains explicit credentials and unchanged project timestamps across separate instances", async () => {
    engine = new MemoireEngine({ projectRoot: root, figmaToken: "explicit", figmaFileKey: "explicit-file", anthropicApiKey: "explicit-api" });
    await engine.init("minimal");
    const first = await readFile(join(root, ".memoire", "project.json"), "utf8");
    vi.stubEnv("FIGMA_TOKEN", "ignored");
    await new MemoireEngine({ projectRoot: root }).init("minimal");
    expect(await readFile(join(root, ".memoire", "project.json"), "utf8")).toBe(first);
    expect(engine.config.figmaToken).toBe("explicit");
  });
  it("creates one agent bridge and routes successful and failed queue results", () => {
    const complete = vi.spyOn(engine.taskQueue, "complete").mockImplementation(() => {});
    const fail = vi.spyOn(engine.taskQueue, "fail").mockImplementation(() => {});
    const online = vi.spyOn(engine.agentRegistry, "markOnline").mockImplementation(() => {});
    const bridge = engine.agentBridge; expect(engine.agentBridge).toBe(bridge);
    const handle = vi.spyOn(bridge, "handleAgentMessage").mockImplementation(() => {});
    const message = { taskId: "fixture" }; engine.figma.wsServer.emit("agent-message", message); expect(handle).toHaveBeenCalledWith(message);
    bridge.emit("task-result", { agentId: "agent", taskId: "one", result: 42 });
    bridge.emit("task-result", { agentId: "agent", taskId: "two", error: "failed" });
    expect(complete).toHaveBeenCalledWith("one", "agent", 42); expect(fail).toHaveBeenCalledWith("two", "agent", "failed"); expect(online).toHaveBeenCalledTimes(2);
  });
  it.each(["bridge", "daemon", "fresh", "stale-bridge", "stale-daemon"])("connects using %s and falls back when stale", async mode => {
    const connect = vi.spyOn(engine.figma, "connect").mockImplementation(async port => port ?? 9333);
    if (mode.includes("bridge")) mocks.lock.mockResolvedValue({ port: 9444, pid: 1 });
    if (mode.includes("daemon")) { await mkdir(join(root, ".memoire")); await writeFile(join(root, ".memoire", "daemon.json"), JSON.stringify({ figmaPort: 9555, pid: 123 })); vi.spyOn(process, "kill").mockReturnValue(true); }
    if (mode.startsWith("stale")) connect.mockRejectedValueOnce(new Error("stale bridge"));
    const port = await engine.connectFigma();
    expect(port).toBe(mode === "bridge" ? 9444 : mode === "daemon" ? 9555 : 9333);
    expect(events.at(-1)?.type).toBe("success");
  });
  it("detects absent, live, dead, and malformed daemon status without real process signals", async () => {
    expect(await engine.hasRunningBridge()).toBe(false);
    mocks.lock.mockResolvedValue({ port: 1 }); expect(await engine.hasRunningBridge()).toBe(true); mocks.lock.mockResolvedValue(null);
    await mkdir(join(root, ".memoire")); const path = join(root, ".memoire", "daemon.json");
    await writeFile(path, JSON.stringify({ figmaPort: 1 })); expect(await engine.hasRunningBridge()).toBe(true);
    await writeFile(path, JSON.stringify({ figmaPort: 1, pid: 123 })); vi.spyOn(process, "kill").mockImplementation(() => { throw new Error("dead"); });
    expect(await engine.hasRunningBridge()).toBe(false);
    await writeFile(path, "{broken"); expect(await engine.hasRunningBridge()).toBe(false);
  });
  it("returns immediately when connected or when startup establishes the plugin", async () => {
    const connected = vi.spyOn(engine.figma, "isConnected", "get").mockReturnValue(true);
    const connect = vi.spyOn(engine, "connectFigma").mockResolvedValue(9223);
    await engine.ensureFigmaConnected(); expect(connect).not.toHaveBeenCalled();
    connected.mockReturnValueOnce(false).mockReturnValue(true);
    await engine.ensureFigmaConnected(); expect(connect).toHaveBeenCalledTimes(1);
  });
  it("waits for a plugin, closes the registration race and removes a timed-out listener", async () => {
    vi.useFakeTimers(); const connected = vi.spyOn(engine.figma, "isConnected", "get").mockReturnValue(false);
    vi.spyOn(engine, "connectFigma").mockResolvedValue(9223);
    const wait = engine.ensureFigmaConnected(100); await Promise.resolve(); engine.figma.emit("plugin-connected"); await wait;
    expect(engine.figma.listenerCount("plugin-connected")).toBe(0);
    connected.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);
    await engine.ensureFigmaConnected(100); expect(engine.figma.listenerCount("plugin-connected")).toBe(0);
    connected.mockReturnValue(false);
    const timedOut = expect(engine.ensureFigmaConnected(100)).rejects.toThrow(/No Figma plugin/);
    await vi.advanceTimersByTimeAsync(100); await timedOut; expect(engine.figma.listenerCount("plugin-connected")).toBe(0);
  });
  it("debounces document changes, ignores overlapping pulls and reports failures", async () => {
    vi.useFakeTimers(); const connected = vi.spyOn(engine.figma, "isConnected", "get").mockReturnValue(false);
    let finish!: () => void; const pull = vi.spyOn(engine, "pullDesignSystem").mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    engine.figma.emit("document-changed"); await vi.advanceTimersByTimeAsync(3000); expect(pull).not.toHaveBeenCalled();
    connected.mockReturnValue(true); engine.figma.emit("document-changed"); await vi.advanceTimersByTimeAsync(1000); engine.figma.emit("document-changed");
    await vi.advanceTimersByTimeAsync(2999); expect(pull).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); expect(pull).toHaveBeenCalledTimes(1);
    engine.figma.emit("document-changed"); await vi.advanceTimersByTimeAsync(3000); expect(pull).toHaveBeenCalledTimes(1); finish(); await Promise.resolve();
    for (const error of [new Error("pull failed"), "string failure"]) { pull.mockRejectedValueOnce(error); engine.figma.emit("document-changed"); await vi.advanceTimersByTimeAsync(3000); }
    expect(events.filter(e => e.type === "warn").map(e => e.message)).toEqual(["Auto-pull failed: pull failed", "Auto-pull failed: string failure"]);
  });
  it("deep copies design state and audits the current token list", () => {
    const snap = engine.snapshotDesignSystem(); expect(snap).toEqual(engine.registry.designSystem); expect(snap).not.toBe(engine.registry.designSystem);
    snap.tokens.push({ name: "fixture" } as never); expect(engine.registry.designSystem.tokens).toHaveLength(0);
    expect(engine.auditDesignSystemWcag()).toHaveProperty("hasFailures");
  });
  it("requires a connected plugin and shares the cache across plugin and REST pulls", async () => {
    const connected = vi.spyOn(engine.figma, "isConnected", "get").mockReturnValue(false);
    await expect(engine.pullDesignSystem()).rejects.toThrow(/Not connected/); connected.mockReturnValue(true);
    const extract = vi.spyOn(engine.figma, "extractDesignSystem").mockResolvedValue(ds() as never);
    const update = vi.spyOn(engine.registry, "updateDesignSystem").mockResolvedValue();
    const spec = vi.spyOn(engine, "autoSpec").mockResolvedValue(2);
    await engine.pullDesignSystem(); await engine.pullDesignSystem(); expect(extract).toHaveBeenCalledTimes(1);
    vi.stubEnv("FIGMA_TOKEN", "fixture"); vi.stubEnv("FIGMA_FILE_KEY", "file"); await engine.pullDesignSystemREST(); expect(mocks.rest).not.toHaveBeenCalled();
    spec.mockResolvedValue(0); await engine.pullDesignSystem(true); expect(extract).toHaveBeenCalledTimes(2);
    await engine.pullDesignSystemREST(true); expect(mocks.rest).toHaveBeenCalledWith("file", "fixture"); expect(update).toHaveBeenCalledTimes(3);
  });
  it("requires REST credentials, refreshes an expired cache and auto-creates specs", async () => {
    await expect(engine.pullDesignSystemREST()).rejects.toThrow(/FIGMA_TOKEN/); vi.stubEnv("FIGMA_TOKEN", "fixture");
    await expect(engine.pullDesignSystemREST()).rejects.toThrow(/FIGMA_FILE_KEY/); vi.stubEnv("FIGMA_FILE_KEY", "file");
    vi.spyOn(engine.registry, "updateDesignSystem").mockResolvedValue(); vi.spyOn(engine, "autoSpec").mockResolvedValue(1);
    vi.useFakeTimers(); await engine.pullDesignSystemREST(); await vi.advanceTimersByTimeAsync(300001); await engine.pullDesignSystemREST();
    expect(mocks.rest).toHaveBeenCalledTimes(2); expect(events.some(e => e.source === "auto-spec")).toBe(true);
  });
  it("creates only missing specs and reports blocked generation without forcing writes", async () => {
    expect(await engine.autoSpec()).toBe(0);
    vi.spyOn(engine.registry, "designSystem", "get").mockReturnValue({ ...ds(), components: [{ name: "Button" }] } as never);
    vi.spyOn(engine.registry, "getAllSpecs").mockResolvedValue([{ name: "Existing" }] as never);
    const save = vi.spyOn(engine.registry, "saveSpec").mockResolvedValue(); mocks.autoSpec.mockReturnValue({ specs: [{ name: "Button" }], skipped: ["Existing"] });
    expect(await engine.autoSpec()).toBe(1); expect(save).toHaveBeenCalledWith({ name: "Button" });
    vi.spyOn(engine.registry, "getSpec").mockResolvedValue(null); await expect(engine.generateFromSpec("Button")).rejects.toThrow(/not found/);
    vi.mocked(engine.registry.getSpec).mockResolvedValue({ name: "Button" } as never); await expect(engine.generateFromSpec("Button")).rejects.toThrow(/not initialized/);
    await engine.initReadOnly(); const result = { blocked: true, findings: [{ severity: "critical" }, { severity: "warning" }], files: [] };
    const generate = vi.spyOn(engine.codegen, "generate").mockResolvedValue(result as never);
    expect(await engine.generateFromSpec("Button", { force: false })).toBe(result); expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("1 critical") });
    generate.mockResolvedValue({ blocked: false, files: ["file"] } as never); await engine.generateFromSpec("Button"); expect(events.at(-1)?.type).toBe("success");
  });
  it.each([true, false])("summarizes a full sync including blocked=%s without force", async blocked => {
    vi.spyOn(engine, "pullDesignSystem").mockResolvedValue(); vi.spyOn(engine.registry, "getAllSpecs").mockResolvedValue([{ name: "Button" }] as never);
    const generate = vi.spyOn(engine, "generateFromSpec").mockResolvedValue({ blocked } as never);
    await engine.fullSync(); expect(generate).toHaveBeenCalledWith("Button");
    expect(events.at(-1)?.message).toContain(`regenerated ${blocked ? 0 : 1} of 1`);
    expect(events.at(-1)?.message.includes("blocked by the quality gate")).toBe(blocked);
  });
});
