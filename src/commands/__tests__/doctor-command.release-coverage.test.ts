import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDoctorCommand } from "../doctor.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
const { pluginHealth, projectDetection } = vi.hoisted(() => ({ pluginHealth: vi.fn(), projectDetection: vi.fn() }));
vi.mock("../../plugin/install-info.js", () => ({ resolvePluginHealth: pluginHealth }));
vi.mock("../../engine/project-context.js", () => ({ detectProject: projectDetection }));
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-doctor-release-"));
  resetExecutionPolicyForTests();
  pluginHealth.mockReset().mockResolvedValue({ localBundle: { ready: false, root }, health: "missing", installPath: root });
  projectDetection.mockReset().mockResolvedValue(null);
});
afterEach(async () => { resetExecutionPolicyForTests(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
function makeEngine() {
  return { config: { projectRoot: root, figmaToken: "", figmaFileKey: "" }, project: { framework: "vite", styling: { tailwind: false } }, init: vi.fn(), registry: { designSystem: { tokens: [] as unknown[], components: [], styles: [], lastSync: "never" }, load: vi.fn(), getAllSpecs: vi.fn(async () => [] as unknown[]) }, figma: { isConnected: false, getConnectionState: vi.fn(() => "disconnected"), getStatus: vi.fn(() => ({ running: false, port: 0, clients: [] as unknown[], reconnectAttempts: 0, lastConnectedAt: null, lastDisconnectedAt: null })), getWidgetSnapshot: vi.fn(async () => ({ jobs: [] })) } };
}
async function run(engine = makeEngine(), json = true, args: string[] = []) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerDoctorCommand(program, engine as never);
  await program.parseAsync(["doctor", ...(json ? ["--json"] : []), ...args], { from: "user" });
  const lines = log.mock.calls.map((call) => String(call[0]));
  return json ? JSON.parse(lines.at(-1)!) as { checks: Array<{ code: string; status: string; detail: string }>; summary: { total: number; pass: number; fail: number; warn: number } } : lines.join("\n");
}
async function checks(engine = makeEngine()) { const payload = await run(engine); if (typeof payload === "string") throw new Error("Expected JSON"); return new Map(payload.checks.map((check) => [check.code, check])); }


describe("doctor command policy and persisted team context", () => {
 it("initializes legacy state only for explicitly connected diagnostics", async () => { configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); const engine = makeEngine(); await run(engine); expect(engine.init).toHaveBeenCalledOnce(); expect(engine.registry.load).toHaveBeenCalledOnce(); });
 it("preserves diagnostics when connected registry loading fails", async () => { configureExecutionPolicy({ projectRoot: root, profile: "connected" }); const engine = makeEngine(); engine.registry.load.mockRejectedValue("registry unavailable"); expect((await checks(engine)).get("design.system")).toMatchObject({ status: "fail", detail: "registry unavailable" }); });
 it("reports a complete token system with repeated type counts", async () => { const engine = makeEngine(); engine.registry.designSystem.tokens = ["color", "color", "spacing", "typography", "radius"].map(type => ({ type })); const result = await checks(engine); expect(result.get("design.system")?.detail).toContain("color: 2"); expect(result.get("design.tokens")?.status).toBe("pass"); });
 it("denies plugin repair under locked policy before invoking installation", async () => { pluginHealth.mockResolvedValue({ localBundle: { ready: true, root }, health: "stale-home-copy", installPath: root }); const result = await run(makeEngine(), true, ["--repair-plugin"]); if (typeof result === "string") throw new Error("Expected JSON"); expect(result.checks.find(check => check.code === "plugin.install")).toMatchObject({ status: "fail" }); expect(result.checks.find(check => check.code === "plugin.install")?.detail).toContain("home-write"); });
 it("accepts a ready current plugin bundle without attempting repair", async () => { pluginHealth.mockResolvedValue({ localBundle: { ready: true, root, meta: { manifest: { exists: true }, code: { exists: true }, ui: { exists: true } } }, health: "current", installPath: root, builtAt: "fixture-time" }); const result = await run(makeEngine(), true, ["--repair-plugin"]); if (typeof result === "string") throw new Error("Expected JSON"); expect(result.checks.find(check => check.code === "plugin.bundle")?.status).toBe("pass"); expect(result.checks.find(check => check.code === "plugin.widget-meta")?.detail).toContain("widget unknown / package unknown"); expect(result.checks.some(check => check.code === "plugin.repair")).toBe(false); });
 it("reads a committed baseline and identifies changed policy acceptance", async () => { await mkdir(join(root, ".memoire")); await writeFile(join(root, ".memoire/baseline.json"), JSON.stringify({ schemaVersion: 1, acceptedAt: "2026-09-08", entries: [], policyHash: "old-policy" })); expect((await checks()).get("team.baseline")?.detail).toContain("Accepted under policy old-policy"); await writeFile(join(root, ".memoire/baseline.json"), JSON.stringify({ schemaVersion: 1, acceptedAt: "2026-09-08", entries: [] })); expect((await checks()).get("team.baseline")?.status).toBe("pass"); });
 it.each([[".memoire/\n", "outside the managed block"], ["# >>> memi (managed) >>>\nold\n# <<< memi (managed) <<<", "stale"], ["# >>> memi (managed) >>>\n.memoire/*\n!.memoire/baseline.json\n# <<< memi (managed) <<<", "Managed block present (.memoire/* local"]])("describes managed gitignore state for %s", async (content, expected) => { await writeFile(join(root, ".gitignore"), content); expect((await checks()).get("team.gitignore")?.detail).toContain(expected); });
 it("reports policy parse failure independently of other team checks", async () => { await writeFile(join(root, "memoire.policy.json"), "{"); const result = await checks(); expect(result.get("team.policy")?.status).toBe("fail"); expect(result.has("team.gitignore")).toBe(true); });
 it("reports malformed baseline as a team-check warning", async () => { await mkdir(join(root, ".memoire")); await writeFile(join(root, ".memoire/baseline.json"), "{"); expect((await checks()).get("team.checks")?.status).toBe("warn"); });
 it("reports shell-only Figma credentials without treating a token alone as REST-ready", async () => { vi.stubEnv("FIGMA_TOKEN", "fixture"); vi.stubEnv("FIGMA_FILE_KEY", ""); const result = await checks(); expect(result.get("env.local")?.status).toBe("warn"); expect(result.get("rest.credentials")?.detail).toContain("FIGMA_FILE_KEY missing"); });
});
