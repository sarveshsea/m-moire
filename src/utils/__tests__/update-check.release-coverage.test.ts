import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compareSemver, fetchLatestVersion, maybeNotifyUpdate, readUpdateCache, refreshUpdateCache, resolveUpdateSubcommand, updateCachePath, writeUpdateCache } from "../update-check.js";
import type { MemiExecutionPolicy } from "../../security/execution-policy.js";
const { spawn, spawnSync, standalone } = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), standalone: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn, spawnSync }));
vi.mock("../runtime.js", () => ({ isStandaloneBinary: standalone }));
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
const argvDescriptor = Object.getOwnPropertyDescriptor(process, "argv")!;
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-update-release-")); await mkdir(join(root, ".memoire"));
  spawn.mockReset().mockReturnValue({ unref: vi.fn() }); spawnSync.mockReset().mockReturnValue({ status: 0 }); standalone.mockReset().mockReturnValue(false);
  vi.stubEnv("CI", ""); vi.stubEnv("MEMOIRE_NO_UPDATE_CHECK", ""); vi.stubEnv("MEMOIRE_AUTO_UPDATE", "");
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, get: () => true });
  Object.defineProperty(process, "argv", { configurable: true, get: () => ["node", "memi.js", "status"] });
});
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); Object.defineProperty(process, "argv", argvDescriptor); if (ttyDescriptor) Object.defineProperty(process.stderr, "isTTY", ttyDescriptor); else Reflect.deleteProperty(process.stderr, "isTTY"); await rm(root, { recursive: true, force: true }); });
function policy(capabilities: string[]) {
  return { homeDir: root, allows: (capability: string) => capabilities.includes(capability), assert: (capability: string) => { if (!capabilities.includes(capability)) throw new Error(`Denied ${capability}`); }, runHomeWrite: async (path: string, _reason: string, action: (path: string) => Promise<void>) => { if (!capabilities.includes("home-write")) throw new Error("Denied home-write"); await action(path); } } as unknown as MemiExecutionPolicy;
}
async function cache(lastCheckAt = new Date().toISOString(), latestVersion: string | null = "3.0.0") { await writeFile(join(root, ".memoire", "update-check.json"), JSON.stringify({ lastCheckAt, latestVersion, channel: "npm" })); }
const notify = (capabilities = ["network"]) => maybeNotifyUpdate({ currentVersion: "2.0.0", mcpMode: false, jsonOutput: false, policy: policy(capabilities) });

describe("update notification capability boundaries", () => {
  it("suppresses all side effects without network capability or for JSON/server output", async () => {
    await cache(); await notify([]);
    await maybeNotifyUpdate({ currentVersion: "2.0.0", mcpMode: true, jsonOutput: false, policy: policy(["network"]) });
    await maybeNotifyUpdate({ currentVersion: "2.0.0", mcpMode: false, jsonOutput: true, policy: policy(["network"]) });
    expect(process.stderr.write).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
  });
  it.each(["self-update", "upgrade", "mcp"])("suppresses recursive notifications for %s", async (command) => {
    vi.spyOn(process, "argv", "get").mockReturnValue(["node", "memi.js", "--profile", "connected", command]);
    await cache(); await notify(["network", "shell"]);
    expect(process.stderr.write).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
  });
  it.each(["opt-out", "ci", "pipe"])("suppresses notifications in %s contexts", async (context) => {
    if (context === "opt-out") vi.stubEnv("MEMOIRE_NO_UPDATE_CHECK", "1");
    if (context === "ci") vi.stubEnv("CI", "1");
    if (context === "pipe") vi.spyOn(process.stderr, "isTTY", "get").mockReturnValue(false);
    await cache(); await notify(); expect(process.stderr.write).not.toHaveBeenCalled();
  });
  it.each([null, "1.9.0", "2.0.0"])("does not advertise cache version %s", async (version) => {
    await cache(undefined, version); await notify(); expect(process.stderr.write).not.toHaveBeenCalled();
  });
  it.each(["2000-01-01", "invalid"])("refreshes stale cache %s only with shell permission", async (lastCheckAt) => {
    await cache(lastCheckAt); await notify(); expect(spawn).not.toHaveBeenCalled();
    await notify(["network", "shell", "home-write"]);
    expect(spawn).toHaveBeenCalledWith(process.execPath, expect.arrayContaining(["--profile", "connected", "--allow", "network", "home-write", "self-update", "--check", "--silent"]), { detached: true, stdio: "ignore" });
  });
  it("uses standalone refresh arguments and bounded fallback advice", async () => {
    standalone.mockReturnValue(true); await notify(["network", "shell"]);
    expect(spawn).toHaveBeenCalledWith(process.execPath, ["--profile", "connected", "--allow", "network", "self-update", "--check", "--silent"], expect.any(Object));
    await cache(); await notify(); expect(process.stderr.write).toHaveBeenLastCalledWith(expect.stringContaining("memi upgrade"));
  });
  it("contains background-spawn failures", async () => {
    spawn.mockImplementation(() => { throw new Error("no process slots"); }); await expect(notify(["network", "shell"])).resolves.toBeUndefined();
  });
  it.each(["dynamic-install", "shell", "home-write"])("does not auto-install without %s", async (missing) => {
    vi.stubEnv("MEMOIRE_AUTO_UPDATE", "1"); await cache(); await notify(["network", "dynamic-install", "shell", "home-write"].filter((capability) => capability !== missing));
    expect(spawnSync).not.toHaveBeenCalled(); expect(process.stderr.write).toHaveBeenCalledWith(expect.stringContaining("memi self-update"));
  });
  it.each([0, 1])("reports mocked auto-update status %s truthfully", async (status) => {
    vi.stubEnv("MEMOIRE_AUTO_UPDATE", "1"); spawnSync.mockReturnValue({ status }); await cache();
    await notify(["network", "dynamic-install", "shell", "home-write"]);
    expect(spawnSync).toHaveBeenCalledWith("npm", ["install", "-g", "@memi-design/cli@3.0.0"], { stdio: "inherit" });
    expect(process.stderr.write).toHaveBeenLastCalledWith(expect.stringContaining(status === 0 ? "takes effect on your next command" : "Auto-update failed"));
  });
});

describe("update cache and version handling", () => {
  it.each([
    [["memi", "--offline", "--allow=network", "--receipt=stdout", "status"], "status"],
    [["bun.exe", "memi.js", "--receipt", "stdout", "--profile=locked", "--verbose", "doctor"], "doctor"],
    [["deno", "memi.js", "--profile", "locked"], undefined],
    [[], undefined],
  ])("resolves the command after global arguments %j", (argv, expected) => { expect(resolveUpdateSubcommand(argv)).toBe(expected); });
  it.each([
    ["1.0.0", "2.0.0", -1], ["2.0.0", "1.0.0", 1], ["1.2.0", "1.1.0", 1], ["1.0.2", "1.0.1", 1],
    ["v1.0.0+build", "1.0.0", 0], ["1.0.0-alpha", "1.0.0", -1], ["1.0.0", "1.0.0-alpha", 1],
    ["1.0.0-alpha.2", "1.0.0-alpha.10", -1], ["1.0.0-alpha.10", "1.0.0-alpha.2", 1], ["1.0.0-alpha", "1.0.0-alpha.1", -1],
    ["1.0.0-alpha.1", "1.0.0-alpha", 1], ["1.0.0-beta", "1.0.0-alpha", 1],
  ])("compares release precedence %s versus %s", (left, right, expected) => { expect(compareSemver(left, right)).toBe(expected); });
  it("reads and atomically persists cache under an authorized temp home", async () => {
    expect(readUpdateCache(policy([]))).toBeNull();
    const value = { lastCheckAt: "2026-09-01", latestVersion: "3.0.0", channel: "npm" as const };
    await writeUpdateCache(value, policy(["home-write"])); expect(readUpdateCache(policy([]))).toEqual(value);
    await writeUpdateCache({ ...value, latestVersion: "4.0.0" }, policy([])); expect(readUpdateCache(policy([]))).toEqual(value);
    expect(JSON.parse(await readFile(updateCachePath(policy([])), "utf8"))).toEqual(value);
    expect(() => updateCachePath({ homeDir: "" } as MemiExecutionPolicy)).toThrow("HOME/USERPROFILE");
  });
  it.each([200, 503])("handles registry HTTP %s without changing policy", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: "3.0.0" }), { status })));
    expect(await fetchLatestVersion(100, policy(["network"]))).toBe(status === 200 ? "3.0.0" : null);
  });
  it("rejects undeclared networking and leaves refresh unpersisted without home-write", async () => {
    const fetch = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
    await expect(fetchLatestVersion(100, policy([]))).rejects.toThrow("Denied network"); expect(fetch).not.toHaveBeenCalled();
    expect(await refreshUpdateCache(policy(["network"]))).toMatchObject({ latestVersion: null, channel: "npm" });
    expect(readUpdateCache(policy([]))).toBeNull();
  });
});
