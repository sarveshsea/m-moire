import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { registerDaemonCommand } from "../daemon.js";

const boundary = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), construct: vi.fn(), spawn: vi.fn(), exists: vi.fn(), refreshKnowledge: vi.fn(), refreshMemory: vi.fn(), fallbackKnowledge: vi.fn(), fallbackMemory: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: boundary.spawn }));
vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>(), existsSync: boundary.exists }));
vi.mock("../../studio/server.js", () => ({ StudioRuntimeServer: class { constructor(options: unknown) { boundary.construct(options); } start = boundary.start; stop = boundary.stop; } }));
vi.mock("../../studio/knowledge-store.js", () => ({ refreshKnowledgeStore: boundary.refreshKnowledge, listKnowledgeStore: boundary.fallbackKnowledge }));
vi.mock("../../studio/project-memory.js", () => ({ refreshProjectMemory: boundary.refreshMemory, indexProjectMemory: boundary.fallbackMemory }));
vi.mock("../../studio/config.js", () => ({ loadStudioConfig: async () => ({}) }));
vi.mock("../../studio/harnesses.js", () => ({ listHarnesses: () => [{ installed: true, enabled: false }, { installed: false, enabled: true }] }));
vi.mock("../../agents/agent-kits.js", () => ({ planAgentInstall: async () => [{ target: "fixture" }] }));
let root: string;
let logs: ReturnType<typeof vi.spyOn>;
const signals = new Map<string, () => Promise<void>>();
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-daemon-command-"));
  await mkdir(join(root, ".memoire"));
  vi.clearAllMocks();
  boundary.exists.mockReturnValue(false);
  boundary.start.mockResolvedValue({ port: 4567, url: "http://127.0.0.1:4567" });
  boundary.stop.mockResolvedValue(undefined);
  boundary.refreshKnowledge.mockResolvedValue({ items: [{}], counts: { skill: 1 } });
  boundary.refreshMemory.mockResolvedValue({ items: [], counts: {} });
  boundary.fallbackKnowledge.mockResolvedValue({ items: [], counts: {} });
  boundary.fallbackMemory.mockResolvedValue({ items: [{}], counts: { note: 1 } });
  logs = vi.spyOn(console, "log").mockImplementation(() => {});
  signals.clear();
  vi.spyOn(process, "once").mockImplementation(((signal: string, callback: () => Promise<void>) => { signals.set(signal, callback); return process; }) as typeof process.once);
  vi.spyOn(process, "kill").mockImplementation(() => { throw new Error("ESRCH"); });
});
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
async function run(args: string[], engine = { config: { projectRoot: root } }) {
  const program = new Command(); registerDaemonCommand(program, engine as never);
  await program.parseAsync(["daemon", ...args], { from: "user" });
}
function output() { return logs.mock.calls.map((call) => String(call[0] ?? "")).join("\n"); }
function payload() { return JSON.parse(String(logs.mock.calls.at(-1)?.[0])); }
async function status(extra = {}) {
  await writeFile(join(root, ".memoire", "daemon.pid"), "12345");
  await writeFile(join(root, ".memoire", "daemon.json"), JSON.stringify({ pid: 12345, port: 4567, figmaPort: 0, dashboardPort: 4567, projectRoot: root, startedAt: new Date(Date.now() - 3661000).toISOString(), ...extra }));
}

describe("deferred daemon handler lifecycle (process and host discovery isolated)", () => {
  it.each(["stop", "status"])("reports missing state to humans for %s", async (action) => { await run([action]); expect(output()).toMatch(/No daemon PID|no status file/); expect(process.kill).not.toHaveBeenCalled(); });
  it("treats malformed status as missing without signalling a process", async () => { await writeFile(join(root, ".memoire", "daemon.json"), "{"); await run(["stop", "--json"]); expect(payload()).toMatchObject({ reason: "missing-status-file", cleanup: { performed: false } }); expect(process.kill).not.toHaveBeenCalled(); });
  it.each([true, false])("reuses an already running daemon, JSON=%s", async (json) => { await status(); vi.mocked(process.kill).mockReturnValue(true); await run(["start", ...(json ? ["--json"] : [])]); if (json) expect(payload()).toMatchObject({ status: "already-running", daemon: { uptimeHuman: "1h 1m 1s" } }); else expect(output()).toContain("Daemon already running"); expect(boundary.start).not.toHaveBeenCalled(); expect(boundary.spawn).not.toHaveBeenCalled(); });
  it.each(["stop", "status"])("cleans stale state with human %s output", async (action) => { await status(); await run([action]); expect(output()).toContain(action === "stop" ? "daemon stopped" : "Cleaned stale daemon files"); await expect(readFile(join(root, ".memoire", "daemon.pid"))).rejects.toMatchObject({ code: "ENOENT" }); expect(process.kill).toHaveBeenCalledTimes(1); });
  it("does not conceal a live-process termination error", async () => { await status(); vi.mocked(process.kill).mockImplementation((_pid, signal) => { if (signal === 0) return true; throw new Error("EPERM"); }); await expect(run(["stop"])).rejects.toThrow("EPERM"); expect(await readFile(join(root, ".memoire", "daemon.pid"), "utf8")).toBe("12345"); });
  it("prints running state using the legacy runtime URL fallback", async () => { await status(); vi.mocked(process.kill).mockReturnValue(true); await run(["status"]); expect(output()).toContain("http://localhost:4567"); });
  it.each(["-1", "65536", "invalid"])("rejects invalid port %s before runtime startup", async (port) => { await expect(run(["start", "--once", "--port", port])).rejects.toThrow("Invalid port"); expect(boundary.start).not.toHaveBeenCalled(); });
  it("starts and stops once, reporting warm inventory and removing both state files", async () => { await run(["start", "--once", "--json"]); expect(boundary.construct).toHaveBeenCalledWith({ projectRoot: root, port: 0, host: "127.0.0.1" }); expect(payload()).toMatchObject({ status: "running", daemon: { uptimeHuman: "0s", warm: { knowledge: { total: 1 }, harnesses: { total: 2, installed: 1, enabled: 1 }, agentKits: { plans: 1 } } } }); expect(boundary.stop).toHaveBeenCalledOnce(); await expect(readFile(join(root, ".memoire", "daemon.json"))).rejects.toMatchObject({ code: "ENOENT" }); });
  it("uses cached inventory when refresh fails and prints warm totals", async () => { boundary.refreshKnowledge.mockRejectedValue(new Error("offline")); boundary.refreshMemory.mockRejectedValue(new Error("offline")); await run(["start", "--once", "--port", "65535", "--host", "localhost"]); expect(boundary.construct).toHaveBeenCalledWith({ projectRoot: root, port: 65535, host: "localhost" }); expect(boundary.fallbackKnowledge).toHaveBeenCalledWith(root); expect(boundary.fallbackMemory).toHaveBeenCalledWith(root); expect(output()).toContain("Knowledge"); expect(output()).toContain("Agent kits"); });
  it("keeps foreground state until a shutdown signal invokes cleanup", async () => { const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue(0 as never); const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never); await run(["start", "--foreground", "--json"]); expect(interval).toHaveBeenCalledWith(expect.any(Function), 60000); expect(JSON.parse(await readFile(join(root, ".memoire", "daemon.json"), "utf8")).pid).toBe(process.pid); await signals.get("SIGTERM")!(); expect(boundary.stop).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledWith(0); });
  it("propagates startup failure without creating a PID receipt", async () => { boundary.start.mockRejectedValue(new Error("port occupied")); await expect(run(["start", "--once"])).rejects.toThrow("port occupied"); await expect(readFile(join(root, ".memoire", "daemon.pid"))).rejects.toMatchObject({ code: "ENOENT" }); });
  it("rejects background startup when no built entry exists", async () => { await expect(run(["start"])).rejects.toThrow("requires the built CLI"); expect(boundary.spawn).not.toHaveBeenCalled(); });
  it("reports pending background startup without waiting in real time", async () => { boundary.exists.mockReturnValue(true); const unref = vi.fn(); boundary.spawn.mockReturnValue({ unref }); vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(6000); await run(["start", "--json"]); expect(payload()).toMatchObject({ status: "starting", daemon: null }); expect(unref).toHaveBeenCalledOnce(); expect(boundary.spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(["--foreground", "--project", root]), expect.objectContaining({ detached: true, stdio: "ignore" })); });
});
