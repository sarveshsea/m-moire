import { Command } from "commander";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerStudioCommand } from "../studio.js";
import { captureLogs } from "./test-helpers.js";

const mocks = vi.hoisted(() => ({
  config: vi.fn(), harnesses: vi.fn(), construct: vi.fn(), start: vi.fn(), stop: vi.fn(),
  startSession: vi.fn(), getSession: vi.fn(), runAutomation: vi.fn(), runDue: vi.fn(),
  browserStatus: vi.fn(), open: vi.fn(), closeAll: vi.fn(), proof: vi.fn(),
  storeInit: vi.fn(), sessions: vi.fn(), session: vi.fn(), events: vi.fn(), render: vi.fn(),
  automationList: vi.fn(), schedulerStatus: vi.fn(), install: vi.fn(), uninstall: vi.fn(),
  spawn: vi.fn(), exists: vi.fn(), kill: vi.fn(), childOn: vi.fn(),
}));
vi.mock("../../studio/config.js", () => ({ loadStudioConfig: mocks.config }));
vi.mock("../../studio/harnesses.js", () => ({ listHarnesses: mocks.harnesses }));
vi.mock("../../studio/server.js", () => ({ StudioRuntimeServer: class {
  constructor(options: unknown) { mocks.construct(options); }
  start = mocks.start; stop = mocks.stop; startSession = mocks.startSession;
  getSession = mocks.getSession; runAutomation = mocks.runAutomation; runDueAutomations = mocks.runDue;
} }));
vi.mock("../../studio/browser-adapter.js", () => ({ StudioBrowserAdapter: class {
  status = mocks.browserStatus; createSession = mocks.open; closeAll = mocks.closeAll;
} }));
vi.mock("../../studio/session-store.js", () => ({ StudioSessionStore: class {
  init = mocks.storeInit; listSessions = mocks.sessions; getSession = mocks.session; readSessionEvents = mocks.events;
} }));
vi.mock("../../studio/automations.js", () => ({
  StudioAutomationStore: class { list = mocks.automationList; },
  schedulerStatus: mocks.schedulerStatus, installScheduler: mocks.install, uninstallScheduler: mocks.uninstall,
}));
vi.mock("../../studio/tui.js", () => ({ renderStudioTuiSnapshot: mocks.render }));
vi.mock("../../studio/visual-parity.js", () => ({ createVisualParityProof: mocks.proof }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));

const root = "/virtual/studio-project";
const engine = { config: { projectRoot: root }, init: vi.fn() };
const signals = new Map<string, () => void>();
let logs: string[];
async function run(args: string[]) {
  const program = new Command().exitOverride();
  registerStudioCommand(program, engine as never);
  await program.parseAsync(["studio", ...args], { from: "user" });
}
function output() { return logs.join("\n"); }
function json() { return JSON.parse(logs.at(-1)!); }
const completed = { id: "s1", status: "completed", events: [] };
const scheduler = { label: "fixture.scheduler", installed: true, plistPath: "/virtual/scheduler.plist" };
beforeEach(() => {
  vi.resetAllMocks(); signals.clear(); logs = captureLogs();
  vi.spyOn(process, "once").mockImplementation(((event: string, callback: () => void) => { signals.set(event, callback); return process; }) as never);
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  mocks.config.mockResolvedValue({ defaultHarness: "codex", enabledTools: { browser: true }, figma: { preferredPort: 9223 } });
  mocks.harnesses.mockReturnValue([{ id: "codex", installed: true }, { id: "claude", installed: false }]);
  mocks.start.mockResolvedValue({ url: "http://127.0.0.1:8765" }); mocks.stop.mockResolvedValue(undefined);
  mocks.startSession.mockResolvedValue({ id: "s1" }); mocks.getSession.mockReturnValue(completed);
  mocks.browserStatus.mockResolvedValue({ enabled: true, installed: true, activeSessions: 0, message: "Ready" });
  mocks.open.mockResolvedValue({ id: "browser1", url: "https://example.test" });
  mocks.sessions.mockReturnValue([]); mocks.session.mockReturnValue(null); mocks.events.mockReturnValue([]);
  mocks.render.mockReturnValue("SNAPSHOT"); mocks.automationList.mockResolvedValue([]);
  mocks.runAutomation.mockResolvedValue({ status: "completed", automationId: "a1", sessionId: "s1" });
  mocks.runDue.mockResolvedValue([]);
  mocks.schedulerStatus.mockReturnValue(scheduler); mocks.install.mockResolvedValue(scheduler); mocks.uninstall.mockResolvedValue(scheduler);
  mocks.spawn.mockReturnValue({ kill: mocks.kill, on: mocks.childOn }); mocks.exists.mockReturnValue(false);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); process.exitCode = 0; });

describe("Studio runtime handlers", () => {
  it.each([false, true])("reports harness readiness, json=%s", async jsonMode => {
    await run(["status", ...(jsonMode ? ["--json"] : [])]);
    expect(engine.init).toHaveBeenCalledWith("minimal");
    if (jsonMode) expect(json()).toMatchObject({ status: "ready", harnesses: [{ installed: true }, { installed: false }] });
    else expect(output()).toContain("1/2 installed");
  });
  it.each([false, true])("serve --once closes the runtime, json=%s", async jsonMode => {
    await run(["serve", "--port", "0", "--once", ...(jsonMode ? ["--json"] : [])]);
    expect(mocks.construct).toHaveBeenCalledWith({ projectRoot: root, port: 0 });
    expect(mocks.stop).toHaveBeenCalledOnce(); expect(signals.size).toBe(0);
    if (jsonMode) expect(json().status).toBe("running"); else expect(output()).toContain("/api/status");
  });
  it.each(["-1", "65536", "invalid"])("rejects invalid port %s before starting runtime", async port => {
    await expect(run(["serve", "--port", port, "--once"])).rejects.toThrow("Invalid port");
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it.each(["SIGINT", "SIGTERM"])("stops a serving runtime on %s", async signal => {
    await run(["serve"]); signals.get(signal)!();
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("passes explicit run parameters and always stops after JSON output", async () => {
    await run(["run", "--prompt", "Build", "--harness", "claude", "--cwd", "/virtual/other", "--action", "audit", "--mode", "brokered", "--json"]);
    expect(mocks.startSession).toHaveBeenCalledWith({ harness: "claude", cwd: "/virtual/other", prompt: "Build", action: "audit", mode: "brokered" });
    expect(json()).toEqual(completed); expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it.each(["completed", "failed"])("streams terminal session events for %s runs", async status => {
    mocks.getSession.mockReturnValue({ ...completed, status, events: [{ type: "stdout", message: "out" }, { type: "stderr", message: "err" }, { type: "session_done", message: "ignored" }] });
    await run(["run", "--prompt", "Build"]);
    expect(mocks.startSession).toHaveBeenCalledWith(expect.objectContaining({ harness: "codex", action: "compose", mode: "delegate", cwd: root }));
    expect(process.stdout.write).toHaveBeenCalledWith("out"); expect(process.stdout.write).toHaveBeenCalledWith("err");
    expect(process.stdout.write).not.toHaveBeenCalledWith("ignored"); expect(output()).toContain(`Studio run ${status}`);
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("polls a running session until completion", async () => {
    vi.useFakeTimers(); mocks.getSession.mockReturnValueOnce({ ...completed, status: "running" }).mockReturnValue(completed);
    const pending = run(["run", "--prompt", "Build", "--json"]);
    await vi.advanceTimersByTimeAsync(50); await pending;
    expect(mocks.getSession).toHaveBeenCalledTimes(2); expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it("stops runtime when a session disappears", async () => {
    mocks.getSession.mockReturnValue(null);
    await expect(run(["run", "--prompt", "Build"])).rejects.toThrow("Unknown Studio session: s1");
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it.each([false, true])("labels canned visual proof without claiming real quality, passed=%s", async passed => {
    mocks.proof.mockResolvedValue({ grade: { passed, score: passed ? 100 : 50, missingCriteria: passed ? [] : ["screenshot"] }, demoDisclaimer: "Canned fixture only", previewUrl: "http://127.0.0.1/preview", outDir: "/virtual/proof" });
    await run(["visual-parity", "--out", "/virtual/proof"]);
    expect(mocks.proof).toHaveBeenCalledWith({ projectRoot: root, outDir: "/virtual/proof" });
    expect(output()).toContain("Canned fixture only"); if (!passed) expect(output()).toContain("Missing: screenshot");
    logs.length = 0; await run(["visual-parity", "--json"]); expect(json().status).toBe(passed ? "completed" : "failed");
  });
});

describe("Studio browser, logs and TUI handlers", () => {
  it.each([false, true])("renders browser adapter status installed=%s", async installed => {
    mocks.browserStatus.mockResolvedValue({ enabled: true, installed, activeSessions: 2, message: "Adapter status" });
    await run(["browser", "status"]); expect(output()).toContain(installed ? "ready" : "missing");
    logs.length = 0; await run(["browser", "status", "--json"]); expect(json()).toMatchObject({ installed, activeSessions: 2 });
  });
  it("rejects disabled browser tools before opening a session", async () => {
    mocks.config.mockResolvedValue({ enabledTools: { browser: false } });
    await expect(run(["browser", "open", "https://example.test"])).rejects.toThrow("Browser tools are disabled");
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("opens and closes a text-mode browser session", async () => {
    await run(["browser", "open", "https://example.test"]);
    expect(mocks.open).toHaveBeenCalledWith({ url: "https://example.test" });
    expect(mocks.closeAll).toHaveBeenCalledOnce(); expect(output()).toContain("browser1");
  });
  it("returns browser session metadata as JSON", async () => {
    await run(["browser", "open", "https://example.test", "--json"]);
    expect(json().session.id).toBe("browser1");
  });
  it("lists indexed sessions or an actionable empty state", async () => {
    await run(["logs"]); expect(output()).toContain("No Studio sessions indexed");
    mocks.sessions.mockReturnValue([{ id: "s1", harness: "codex", action: "audit", status: "completed" }]);
    logs.length = 0; await run(["logs"]); expect(output()).toContain("s1 (completed)");
    logs.length = 0; await run(["logs", "--json"]); expect(json().sessions).toHaveLength(1);
  });
  it.each([["10", 10], ["0", undefined], ["invalid", undefined]] as const)("parses event limit %s without accepting nonpositive values", async (limit, expected) => {
    await run(["logs", "--session", "missing", "--limit", limit, "--json"]);
    expect(mocks.events).toHaveBeenCalledWith("missing", { limit: expected });
    expect(json()).toEqual({ session: null, events: [] });
  });
  it("formats event severity and normalizes whitespace", async () => {
    mocks.events.mockReturnValue(["session_error", "stderr", "session_done", "stdout"].map(type => ({ type, message: "message\n  continued" })));
    await run(["logs", "--session", "missing"]);
    expect(output()).toContain("No indexed session"); expect(output()).toContain("message continued");
  });
  it("follows only newly appended events and exits on a signal", async () => {
    vi.useFakeTimers(); mocks.events.mockReturnValueOnce([]).mockReturnValue([{ type: "stdout", message: "new event" }]);
    const pending = run(["logs", "--session", "s1", "--follow"]);
    await vi.advanceTimersByTimeAsync(2000); signals.get("SIGTERM")!(); await pending;
    expect(logs.filter(line => line.includes("new event"))).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([false, true])("renders local TUI with availableSession=%s", async hasSession => {
    mocks.sessions.mockReturnValue(hasSession ? [{ id: "s1" }] : []);
    await run(["tui", "--once"]); expect(output()).toBe("SNAPSHOT");
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ events: [], figma: expect.objectContaining({ port: 9223 }) }));
    expect(mocks.events).toHaveBeenCalledTimes(hasSession ? 1 : 0);
  });
  it.each([true, false])("renders remote TUI when detail response ok=%s", async ok => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ json: async () => ({ config: {} }) })
      .mockResolvedValueOnce({ json: async () => ({ harnesses: [] }) })
      .mockResolvedValueOnce({ json: async () => ({ sessions: [{ id: "a/b" }] }) })
      .mockResolvedValueOnce({ ok, json: async () => ({ events: [{ type: "stdout" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    await run(["tui", "--runtime", "http://127.0.0.1:9000/"]);
    expect(fetchMock).toHaveBeenLastCalledWith("http://127.0.0.1:9000/api/logs/a%2Fb?limit=80");
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ events: ok ? [{ type: "stdout" }] : [], figma: expect.objectContaining({ port: null }) }));
  });
  it("renders remote TUI without requesting absent session details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({}) }); vi.stubGlobal("fetch", fetchMock);
    await run(["tui", "--runtime", "http://127.0.0.1:9000"]);
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ sessions: [], harnesses: [], events: [] }));
  });
});

describe("Studio automation and web handlers", () => {
  it("lists automation data and empty state", async () => {
    await run(["automations", "list"]); expect(output()).toContain("No automations configured");
    mocks.automationList.mockResolvedValue([{ name: "Review", status: "active", id: "a1", nextRunAt: null }]);
    logs.length = 0; await run(["automations", "list", "--project", "/virtual/other"]); expect(output()).toContain("next none");
    logs.length = 0; await run(["automations", "list", "--json"]); expect(json().automations[0].id).toBe("a1");
  });
  it.each([false, true])("runs a named automation with runtime cleanup, json=%s", async jsonMode => {
    await run(["automations", "run", "a1", "--project", "/virtual/other", ...(jsonMode ? ["--json"] : [])]);
    expect(mocks.construct).toHaveBeenCalledWith({ projectRoot: "/virtual/other", port: 0 });
    expect(mocks.runAutomation).toHaveBeenCalledWith("a1"); expect(mocks.stop).toHaveBeenCalledOnce();
    if (jsonMode) expect(json().run.automationId).toBe("a1"); else expect(output()).toContain("Automation run completed");
  });
  it("stops runtime after automation failure", async () => {
    mocks.runAutomation.mockRejectedValue(new Error("automation failed"));
    await expect(run(["automations", "run", "a1"])).rejects.toThrow("automation failed"); expect(mocks.stop).toHaveBeenCalledOnce();
  });
  it.each([0, 1, 2])("reports %s due runs with correct plurality and JSON", async count => {
    mocks.runDue.mockResolvedValue(Array.from({ length: count }, (_, id) => ({ automationId: `a${id}`, status: "completed" })));
    await run(["automations", "run-due", "--now", "2026-01-01T00:00:00Z"]);
    expect(output()).toContain(`Ran ${count} due automation${count === 1 ? "" : "s"}`);
    expect(mocks.runDue).toHaveBeenCalledWith("2026-01-01T00:00:00Z");
    logs.length = 0; await run(["automations", "run-due", "--json"]); expect(json().runs).toHaveLength(count); expect(mocks.stop).toHaveBeenCalledTimes(2);
  });
  it.each(["status", "install", "uninstall"])("delegates scheduler %s using defaults and overrides", async action => {
    const handler = action === "status" ? mocks.schedulerStatus : action === "install" ? mocks.install : mocks.uninstall;
    await run(["automations", "scheduler", action]); expect(handler).toHaveBeenCalledWith(root, process.execPath);
    expect(output()).toContain("fixture.scheduler"); logs.length = 0;
    await run(["automations", "scheduler", action, "--project", "/virtual/other", "--runtime", "/virtual/memi", "--json"]);
    expect(handler).toHaveBeenLastCalledWith("/virtual/other", "/virtual/memi"); expect(json().scheduler).toEqual(scheduler);
  });
  it("serves packaged UI and closes on interruption without spawning npm", async () => {
    await run(["web", "--port", "1450"]); expect(mocks.construct).toHaveBeenCalledWith({ projectRoot: root, port: 1450 });
    expect(output()).toContain("packaged static app"); expect(mocks.spawn).not.toHaveBeenCalled();
    signals.get("SIGINT")!(); await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce());
  });
  it("launches local web development with explicit argv and stops child/runtime", async () => {
    mocks.exists.mockReturnValue(true); await run(["web", "--port", "1450", "--runtime-port", "8766"]);
    expect(mocks.construct).toHaveBeenCalledWith({ projectRoot: root, port: 8766 });
    expect(mocks.spawn).toHaveBeenCalledWith("npm", ["--prefix", join(root, "apps", "studio"), "run", "dev", "--", "--host", "127.0.0.1", "--port", "1450"], expect.objectContaining({ shell: false, env: expect.objectContaining({ VITE_MEMOIRE_STUDIO_RUNTIME: "http://127.0.0.1:8765" }) }));
    signals.get("SIGTERM")!(); await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalledOnce()); expect(mocks.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
