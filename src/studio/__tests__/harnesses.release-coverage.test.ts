import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultStudioConfig } from "../config.js";
import type { StudioConfig, StudioHarnessConfig } from "../types.js";
const mocks = vi.hoisted(() => ({ home: "", executablePath: null as string | null, spawn: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })) }));
vi.mock("node:fs", async original => {
  const actual = await original<typeof import("node:fs")>();
  return { ...actual, accessSync: (path: string, mode?: number) => {
    if (mocks.executablePath === null) return actual.accessSync(path, mode);
    if (path !== mocks.executablePath) throw new Error("Fixture command not found");
  } };
});
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawn }));
vi.mock("node:os", async original => ({ ...await original<typeof import("node:os")>(), homedir: () => mocks.home }));
import { buildHarnessCommand, classifyCliAuthResult, clearHarnessProbeCaches, harnessProbeCacheAgeMs, listHarnesses } from "../harnesses.js";
let root: string;
let config: StudioConfig;
function single(patch: Partial<StudioHarnessConfig> = {}): StudioConfig {
  return { ...config, harnesses: [{ ...config.harnesses.find(h => h.id === "ollama")!, enabled: true, command: "fixture-unique-harness", installProbe: [], ...patch }] };
}
async function executable(path: string) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, "fixture text, never executed"); await chmod(path, 0o755); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-harness-release-")); mocks.home = join(root, "home"); mocks.executablePath = null; config = defaultStudioConfig(root); clearHarnessProbeCaches(); mocks.spawn.mockClear().mockReturnValue({ status: 0, stdout: "", stderr: "" });
  for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "FIGMA_TOKEN", "NODE_OPTIONS"]) vi.stubEnv(key, "");
  vi.stubEnv("PATH", join(root, "bin"));
  vi.stubEnv("PATHEXT", ".EXE;.CMD;.BAT");
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); clearHarnessProbeCaches(); await rm(root, { recursive: true, force: true }); });

describe("harness probes and command preparation release behavior", () => {
  it.each([
    [{ status: 0 }, "signed_in", "Fixture signed in"],
    [{ status: 0, stdout: "service available" }, "ready", "service available"],
    [{ status: 1 }, "needs_login", "Run fixture login"],
    [{ status: null, stderr: "login required" }, "needs_login", "login required"],
    [{ status: 1, stderr: "\n invalid configuration\nsecond line" }, "config_error", "Fix Fixture config before Studio can run live sessions: invalid configuration"],
  ])("classifies auth probe result %#", (result, status, message) => {
    expect(classifyCliAuthResult(result as never, "Fixture")).toEqual({ authStatus: status, authMessage: message });
  });
  it("probes explicit CLI auth and legacy Codex/Claude defaults without running a real process", () => {
    for (const h of [
      { id: "ollama", authProbe: { command: "ignored", args: ["auth", "inspect"] } },
      { id: "codex", authProbe: undefined }, { id: "claude-code", authProbe: undefined },
    ]) {
      clearHarnessProbeCaches(); const result = listHarnesses(single(h as never), { resolveCommand: () => "/fixture/cli" }); expect(result[0].authStatus).toBe("signed_in");
    }
    expect(mocks.spawn.mock.calls.map(call => call[1])).toEqual([["auth", "inspect"], ["login", "status"], ["auth", "status"]]);
    expect(mocks.spawn.mock.calls.every(call => call[0] === "/fixture/cli")).toBe(true);
  });
  it.each([
    ["anthropic", "ANTHROPIC_API_KEY"], ["openai", "OPENAI_API_KEY"], ["google", "GEMINI_API_KEY"], ["google", "GOOGLE_API_KEY"],
  ])("recognizes configured %s provider key %s without a CLI login", (provider, key) => {
    vi.stubEnv(key, "fixture-key"); const result = listHarnesses(single({ provider } as never), { resolveCommand: () => "/fixture/cli" });
    expect(result[0].authStatus).toBe("ready"); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it.each(["shell", "local", "memoire", "openai-compatible", "anthropic", "openai", "google"])("classifies provider %s with no provider keys", provider => {
    const result = listHarnesses(single({ provider } as never), { resolveCommand: () => "/fixture/cli" });
    expect(result[0].authStatus).toBe(["shell", "local", "memoire"].includes(provider) ? "ready" : "not_required");
  });
  it("caches executable and auth probes, refreshes explicitly and expires on time", async () => {
    const path = join(root, "bin", `fixture-unique-harness${process.platform === "win32" ? ".CMD" : ""}`); await executable(path);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(10000);
    const auth = vi.fn(() => ({ authStatus: "ready" as const, authMessage: "fixture" }));
    expect(harnessProbeCacheAgeMs()).toBe(0); expect(listHarnesses(single(), { probeAuth: auth })[0].resolvedPath).toBe(path);
    vi.setSystemTime(11000); expect(harnessProbeCacheAgeMs()).toBe(1000); await rm(path);
    expect(listHarnesses(single(), { probeAuth: auth })[0].installed).toBe(true); expect(auth).toHaveBeenCalledTimes(1);
    expect(listHarnesses(single(), { forceRefresh: true, probeAuth: auth })[0].installed).toBe(false);
    await executable(path); vi.setSystemTime(17000); expect(listHarnesses(single(), { probeAuth: auth })[0].installed).toBe(true); expect(auth).toHaveBeenCalledTimes(2);
    clearHarnessProbeCaches(); expect(harnessProbeCacheAgeMs()).toBe(0);
  });
  it("resolves absolute commands and marks missing commands without probing auth", async () => {
    const path = join(root, "bin", `fixture${process.platform === "win32" ? ".CMD" : ""}`); await executable(path);
    expect(listHarnesses(single({ command: path }))[0].installed).toBe(true);
    expect(listHarnesses(single({ command: join(root, "missing") }))[0]).toMatchObject({ installed: false, authStatus: "missing" }); expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("resolves native Windows absolute executable paths without appending PATH entries or suffixes", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const path = "C:\\fixture\\bin\\custom-harness.cmd";
    mocks.executablePath = path;
    expect(listHarnesses(single({ command: path }))[0]).toMatchObject({ installed: true, resolvedPath: path });
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("honors Windows executable suffixes and auth invocation options", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32"); vi.stubEnv("PATHEXT", ".EXE;.CMD");
    await executable(join(root, "bin", "fixture-unique-harness.CMD"));
    const result = listHarnesses(single({ authProbe: { command: "fixture", args: ["status"] } })); expect(result[0].installed).toBe(true);
    expect(mocks.spawn.mock.calls[0][2]).toMatchObject({ shell: true, timeout: 1500 });
  });
  it("uses packaged local Memoire code when a source runner is absent", async () => {
    await mkdir(join(root, "dist")); await writeFile(join(root, "dist", "index.js"), "// fixture");
    const cfg = single({ id: "memoire", provider: "memoire", commandTemplates: { compose: ["compose", "{{prompt}}"] } });
    const command = buildHarnessCommand(cfg, { harnessId: "memoire", cwd: root, prompt: "Design" });
    expect(command.command).toBe(process.execPath); expect(command.args).toEqual([join(root, "dist", "index.js"), "compose", "Design"]);
    expect(listHarnesses(cfg)[0].resolvedPath).toBe(process.execPath);
    expect(listHarnesses({ ...cfg, workspaceRoots: [] }, { resolveCommand: () => null })[0].installed).toBe(false);
  });
  it("rejects unknown, disabled, unsupported and tool-disabled harness requests", () => {
    const req = { harnessId: "ollama" as const, cwd: root, prompt: "fixture" };
    expect(() => buildHarnessCommand({ ...config, harnesses: [] }, req)).toThrow(/Unknown harness/);
    expect(() => buildHarnessCommand(single({ enabled: false }), req)).toThrow(/disabled/);
    expect(() => buildHarnessCommand(single({ commandTemplates: {} }), req)).toThrow(/does not support/);
    expect(() => buildHarnessCommand(single({ id: "shell" }), { ...req, harnessId: "shell" })).toThrow(/Shell harness is disabled/);
  });
  it("strips managed legacy Codex flags while preserving unrelated configuration", () => {
    const cfg = single({ id: "codex", commandTemplates: { raw: ["exec", "--search", "--skip-git-repo-check", "--dangerously-bypass-approvals-and-sandbox", "--sandbox", "old", "-s", "old", "--model", "old", "-m", "old", "--ask-for-approval", "never", "-a", "never", "-c", "model_reasoning_effort=low", "--config", "approval_policy=never", "-c", "unmanaged=true", "{{prompt}}"] } });
    const args = buildHarnessCommand(cfg, { harnessId: "codex", cwd: root, prompt: "literal prompt", permissionMode: "plan" }).args;
    expect(args).not.toContain("old"); expect(args).not.toContain("never"); expect(args).toContain("unmanaged=true"); expect(args.filter(a => a === "--model")).toHaveLength(1); expect(args).toContain("read-only"); expect(args.at(-1)).toBe("literal prompt");
  });
  it.each(["plan", "full_access"] as const)("handles empty prompts and custom Codex templates in %s mode", permissionMode => {
    const cfg = single({ id: "codex", commandTemplates: { raw: [""] } }); cfg.codex = { ...cfg.codex, webSearch: true, skipGitRepoCheck: false };
    const args = buildHarnessCommand(cfg, { harnessId: "codex", cwd: root, prompt: "", permissionMode }).args;
    expect(args).not.toContain(""); expect(args).not.toContain("--skip-git-repo-check"); expect(args).not.toContain("--search");
    const defaults = buildHarnessCommand({ ...cfg, codex: undefined } as never, { harnessId: "codex", cwd: root, prompt: "", permissionMode }).args;
    expect(defaults).toContain("gpt-5.5");
  });
  it.each(["", "--trace-warnings", "--no-warnings=MaxListenersExceededWarning"])("merges Memoire NODE_OPTIONS without duplication from %s", value => {
    vi.stubEnv("NODE_OPTIONS", value); const cfg = single({ id: "memoire", provider: "memoire", commandTemplates: { compose: ["{{prompt}}"] } });
    const env = buildHarnessCommand(cfg, { harnessId: "memoire", cwd: root, prompt: "fixture" }).env;
    expect(env.NODE_OPTIONS?.split(" ").filter(v => v === "--no-warnings=MaxListenersExceededWarning")).toHaveLength(1);
    if (value) expect(env.NODE_OPTIONS).toContain(value);
  });
  it.each(["anthropic", "openai", "google", "memoire"])("includes only configured provider environment for %s", provider => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fixture-anthropic"); vi.stubEnv("OPENAI_API_KEY", "fixture-openai"); vi.stubEnv("GEMINI_API_KEY", "fixture-google"); vi.stubEnv("GOOGLE_API_KEY", "fixture-google2"); vi.stubEnv("FIGMA_TOKEN", "fixture-figma"); vi.stubEnv("UNRELATED_SECRET", "never-forward"); vi.stubEnv("CUSTOM_COMPAT_KEY", "fixture-compatible");
    const cfg = single({ provider } as never); cfg.providers.openaiCompatible.envKey = "CUSTOM_COMPAT_KEY";
    const env = buildHarnessCommand(cfg, { harnessId: "ollama", cwd: root, prompt: "fixture" }).env;
    expect(env.CUSTOM_COMPAT_KEY).toBe("fixture-compatible"); expect(env.UNRELATED_SECRET).toBeUndefined(); expect(env.MEMOIRE_STUDIO_SESSION).toBe("1");
    if (provider === "google") expect(env).toMatchObject({ GEMINI_API_KEY: "fixture-google", GOOGLE_API_KEY: "fixture-google2" });
    if (provider === "anthropic") expect(env.ANTHROPIC_API_KEY).toBe("fixture-anthropic");
    if (provider === "openai") expect(env.OPENAI_API_KEY).toBe("fixture-openai");
    if (provider === "memoire") expect(env.FIGMA_TOKEN).toBe("fixture-figma");
  });
});
