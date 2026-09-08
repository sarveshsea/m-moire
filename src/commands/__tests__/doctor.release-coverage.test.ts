import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDoctorCommand } from "../doctor.js";
import { resetExecutionPolicyForTests } from "../../security/execution-policy.js";
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
async function run(engine = makeEngine(), json = true) {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command();
  registerDoctorCommand(program, engine as never);
  await program.parseAsync(["doctor", ...(json ? ["--json"] : [])], { from: "user" });
  const lines = log.mock.calls.map((call) => String(call[0]));
  return json ? JSON.parse(lines.at(-1)!) as { checks: Array<{ code: string; status: string; detail: string }>; summary: { total: number; pass: number; fail: number; warn: number } } : lines.join("\n");
}
async function checks(engine = makeEngine()) { const payload = await run(engine); if (typeof payload === "string") throw new Error("Expected JSON"); return new Map(payload.checks.map((check) => [check.code, check])); }

describe("doctor diagnostic failure reporting", () => {
  it("reports empty design data, absent preview and dependencies as separate checks", async () => {
    const engine = makeEngine();
    const result = await checks(engine);
    expect(result.get("design.system")?.status).toBe("warn");
    expect(result.get("design.specs")?.status).toBe("warn");
    expect(result.get("design.tokens")?.status).toBe("fail");
    expect(result.get("runtime.preview")?.status).toBe("fail");
    expect(result.get("runtime.dependencies")?.status).toBe("fail");
    expect(engine.init).not.toHaveBeenCalled();
    expect(engine.registry.load).not.toHaveBeenCalled();
  });
  it("reports absent project context and registry read failures without aborting other checks", async () => {
    const engine = makeEngine(); engine.project = null as never; engine.registry.getAllSpecs.mockRejectedValue(new Error("spec store unavailable"));
    const result = await checks(engine);
    expect(result.get("project.detected")?.status).toBe("fail");
    expect(result.get("design.specs")?.detail).toBe("spec store unavailable");
    expect(result.has("runtime.node")).toBe(true);
  });
  it("normalizes thrown strings from project detection", async () => {
    const engine = makeEngine(); engine.project = null as never; projectDetection.mockRejectedValue("unreadable project");
    expect((await checks(engine)).get("project.detected")?.detail).toBe("unreadable project");
  });
  it("counts valid and incomplete spec metadata separately", async () => {
    const engine = makeEngine();
    engine.registry.getAllSpecs.mockResolvedValue([{ type: "component", name: "MissingPurpose", shadcnBase: ["Button"] }, { type: "component", name: "MissingBase", purpose: "Control", shadcnBase: undefined }, { type: "page", name: "Home", purpose: "Homepage" }]);
    const result = await checks(engine);
    expect(result.get("design.specs")?.detail).toContain("1 valid, 2 with issues");
    engine.registry.getAllSpecs.mockResolvedValue([{ type: "page", name: "Home", purpose: "Homepage" }]);
    expect((await checks(engine)).get("design.specs")?.status).toBe("pass");
  });
  it.each(["local-only", "symlink-risk", "stale-home-copy", "missing", "current"])("represents plugin install health %s", async (health) => {
    pluginHealth.mockResolvedValue({ localBundle: { ready: false, root, meta: { manifest: { exists: true }, code: { exists: false }, ui: { exists: false } } }, health, installPath: root, widgetVersion: "2", packageVersion: "2.8" });
    const result = await checks();
    expect(result.get("plugin.install")?.status).toBe(health === "current" ? "pass" : health === "missing" ? "fail" : "warn");
    expect(result.get("plugin.bundle")?.status).toBe("fail");
    expect(result.get("plugin.widget-meta")?.status).toBe("pass");
  });
  it("reports plugin-health inspection failure", async () => {
    pluginHealth.mockRejectedValue(new Error("corrupt plugin metadata"));
    const result = await checks();
    expect([...result.values()].some((check) => check.detail.includes("corrupt plugin metadata"))).toBe(true);
  });
  it.each(["reconnecting", "listening", "connected"])("reports bridge state %s with operator details", async (state) => {
    const engine = makeEngine(); engine.figma.isConnected = state === "connected";
    engine.figma.getConnectionState.mockReturnValue(state === "reconnecting" ? "reconnecting" : "disconnected");
    engine.figma.getStatus.mockReturnValue({ running: true, port: 1234, clients: [{}], reconnectAttempts: 2, lastConnectedAt: null, lastDisconnectedAt: null });
    const result = await checks(engine);
    expect(result.get("bridge.figma")?.status).toBe(state === "connected" ? "pass" : "warn");
    expect(result.get("bridge.figma")?.detail).toContain(state === "listening" ? "listening on :1234" : state);
    if (state === "connected") expect(result.get("widget.snapshot")?.status).toBe("pass");
  });
  it("reports widget snapshot failures and disconnected bridge exceptions", async () => {
    const engine = makeEngine(); engine.figma.isConnected = true; engine.figma.getWidgetSnapshot.mockRejectedValue("snapshot unavailable");
    expect((await checks(engine)).get("widget.snapshot")?.detail).toBe("snapshot unavailable");
    engine.figma.isConnected = false; engine.figma.getStatus.mockImplementation(() => { throw new Error("bridge unavailable"); });
    expect((await checks(engine)).get("bridge.figma")?.detail).toBe("unable to check connection");
  });
  it("detects optional credentials and existing local runtime directories", async () => {
    await Promise.all([mkdir(join(root, "preview")), mkdir(join(root, "node_modules")), mkdir(join(root, ".memoire"))]);
    await writeFile(join(root, ".env.local"), "# placeholder");
    vi.stubEnv("PENPOT_TOKEN", "fixture-token"); vi.stubEnv("PENPOT_FILE_ID", "fixture-file");
    const engine = makeEngine(); engine.config.figmaToken = "fixture-token"; engine.config.figmaFileKey = "fixture-file";
    const result = await checks(engine);
    for (const code of ["env.local", "rest.credentials", "penpot.credentials", "runtime.dependencies", "workspace.memoire"]) expect(result.get(code)?.status).toBe("pass");
    expect(result.get("runtime.preview")?.status).toBe("warn");
  });
  it.each([["fixture", ""], ["", "fixture"]])("warns about partial Penpot credentials %j", async (token, file) => {
    vi.stubEnv("PENPOT_TOKEN", token); vi.stubEnv("PENPOT_FILE_ID", file);
    expect((await checks()).get("penpot.credentials")?.status).toBe("warn");
  });
  it("prints grouped human-readable diagnostics with a truthful total", async () => {
    const output = await run(makeEngine(), false);
    expect(output).toContain("Memoire Doctor");
    expect(output).toContain("Team gate");
    expect(output).toMatch(/\d+ passed, \d+ warnings, \d+ failed/);
  });
});
