import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureExecutionPolicy, createExecutionPolicy, resetExecutionPolicyForTests } from "../execution-policy.js";
import { fetchPublicResource, resolvePublicNetworkAddresses } from "../safe-fetch.js";
import { preflightCommand } from "../command-preflight.js";
import { resolveGitScope } from "../../app-quality/git-scope.js";
import { appendHistory } from "../../app-quality/history.js";
import { diagnoseAppQuality } from "../../app-quality/engine.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
const roots: string[] = [];
afterEach(async () => {
  resetExecutionPolicyForTests();
  vi.clearAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function root() { const path = await mkdtemp(join(tmpdir(), "memi-boundary-")); roots.push(path); return path; }

describe("diagnose execution boundaries", () => {
  it("denies public fetch before URL processing when locked", async () => {
    await expect(fetchPublicResource("not a URL", { maxBytes: 10 })).rejects.toMatchObject({ capability: "network" });
  });
  it("denies DNS before invoking the resolver when locked", async () => {
    const resolver = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
    await expect(resolvePublicNetworkAddresses("example.com", resolver)).rejects.toMatchObject({ capability: "network" });
    expect(resolver).not.toHaveBeenCalled();
  });
  it("denies git scope before spawning git when locked", async () => {
    await expect(resolveGitScope({ projectRoot: "/missing", base: "main" })).rejects.toMatchObject({ capability: "shell" });
    expect(execFile).not.toHaveBeenCalled();
  });
  it.each(["locked", "local"] as const)("denies URL and changed preflight in %s", async profile => {
    const policy = createExecutionPolicy({ projectRoot: "/workspace", profile });
    await expect(preflightCommand(policy, { commandPath: ["diagnose"], args: ["https://example.com"], options: {} })).rejects.toMatchObject({ capability: "network" });
    await expect(preflightCommand(policy, { commandPath: ["diagnose"], args: [], options: { changed: true } })).rejects.toMatchObject({ capability: "shell" });
  });
  it.each(["locked", "local"] as const)("denies direct default persistence in %s", async profile => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile });
    await expect(diagnoseAppQuality({ projectRoot })).rejects.toMatchObject({ code: "MEMI_CAPABILITY_DENIED" });
    await expect(access(join(projectRoot, ".memoire"))).rejects.toThrow();
  });
  it("requires source persistence opt-in", async () => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write"] });
    await expect(diagnoseAppQuality({ projectRoot })).rejects.toMatchObject({ capability: "source-content-persistence" });
    await expect(access(join(projectRoot, ".memoire"))).rejects.toThrow();
  });
  it("rejects a report directory symlink escaping the project", async () => {
    const projectRoot = await root();
    const outside = await root();
    await symlink(outside, join(projectRoot, ".memoire"));
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    await expect(diagnoseAppQuality({ projectRoot })).rejects.toMatchObject({ capability: "project-write" });
    await expect(access(join(outside, "app-quality"))).rejects.toThrow();
  });
});


describe("connected diagnosis persistence", () => {
  it("retains concurrent history appends", async () => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    const diagnosis = await diagnoseAppQuality({ projectRoot, write: false });
    await Promise.all(Array.from({ length: 4 }, (_, index) => appendHistory(projectRoot, { ...diagnosis, generatedAt: `run-${index}` })));
    const entries = (await readFile(join(projectRoot, ".memoire", "app-quality", "history.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line).at);
    expect(entries.sort()).toEqual(["run-0", "run-1", "run-2", "run-3"]);
  });
  it("denies direct history persistence before any subprocess or directory creation", async () => {
    const projectRoot = await root();
    const diagnosis = await diagnoseAppQuality({ projectRoot, write: false });
    await expect(appendHistory(projectRoot, diagnosis)).rejects.toMatchObject({ capability: "source-content-persistence" });
    expect(execFile).not.toHaveBeenCalled();
    await expect(access(join(projectRoot, ".memoire"))).rejects.toThrow();
  });
  it("persists reports and history without launching optional git when shell is not granted", async () => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    await diagnoseAppQuality({ projectRoot });
    expect(execFile).not.toHaveBeenCalled();
    await expect(readFile(join(projectRoot, ".memoire", "app-quality", "diagnosis.json"), "utf8")).resolves.toContain('"version": 1');
    const history = JSON.parse(await readFile(join(projectRoot, ".memoire", "app-quality", "history.jsonl"), "utf8"));
    expect(history).not.toHaveProperty("sha");
  });
  it.each(["diagnosis.json", "diagnosis.md", "history.jsonl"])("rejects an existing %s file symlink before any report writes", async name => {
    const projectRoot = await root();
    const outside = await root();
    const outDir = join(projectRoot, ".memoire", "app-quality");
    await mkdir(outDir, { recursive: true });
    const target = join(outside, "sentinel");
    await writeFile(target, "untouched");
    await symlink(target, join(outDir, name));
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    await expect(diagnoseAppQuality({ projectRoot })).rejects.toMatchObject({ capability: "project-write" });
    await expect(readFile(target, "utf8")).resolves.toBe("untouched");
  });
  it("requires all explicitly requested preflight capabilities", async () => {
    const allow = ["network", "shell", "project-write", "source-content-persistence"] as const;
    const invocation = { commandPath: ["diagnose"], args: ["https://example.com"], options: { changed: true } };
    for (const missing of allow) {
      const policy = createExecutionPolicy({ projectRoot: "/workspace", profile: "connected", allow: allow.filter(capability => capability !== missing) });
      await expect(preflightCommand(policy, invocation)).rejects.toMatchObject({ capability: missing });
    }
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace", profile: "connected", allow }), invocation)).resolves.toEqual({ optionOverrides: {} });
  });
});
