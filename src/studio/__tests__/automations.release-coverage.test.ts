import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StudioAutomationRun } from "../types.js";
import { defaultStudioConfig } from "../config.js";

const mocks = vi.hoisted(() => ({ home: "", spawnSync: vi.fn(() => ({ status: 0 })) }));
vi.mock("node:child_process", () => ({ spawnSync: mocks.spawnSync }));
vi.mock("node:os", async importOriginal => ({ ...await importOriginal<typeof import("node:os")>(), homedir: () => mocks.home }));
import { StudioAutomationStore, DESIGN_AUTOMATION_TEMPLATES, createAutomationFromTemplate, buildAutomationPrompt, buildLaunchAgentPlist, nextRunFromRRule, installScheduler, uninstallScheduler, schedulerStatus } from "../automations.js";

let root: string;
let store: StudioAutomationStore;
const now = "2026-05-07T08:59:00.000Z";
const input = { prompt: "Inspect local design files", timezone: "UTC", rrule: "FREQ=MINUTELY;INTERVAL=5" };
const run = (id: string, startedAt = now): StudioAutomationRun => ({ id, automationId: "fixture", sessionId: "session", status: "completed", startedAt, completedAt: startedAt, error: null });
const dir = (id = "") => join(root, ".memoire", "studio", "automations", id);
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-automation-release-"));
  mocks.home = join(root, "isolated-home");
  store = new StudioAutomationStore(root);
  mocks.spawnSync.mockClear();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

describe("automation store release behavior", () => {
  it("persists default metadata with a generated id and immutable input", async () => {
    const before = { ...input };
    const automation = await store.create(input);
    expect(input).toEqual(before);
    expect(automation).toMatchObject({ name: "Studio Automation", status: "ACTIVE", kind: "cron", mutationPolicy: "review", permissionMode: "plan", action: "audit", sourceSessionId: null, createdAt: now, updatedAt: now });
    expect(automation.id).toMatch(/^automation-/);
    expect(await store.get(automation.id)).toEqual(automation);
    expect(await store.list()).toEqual([automation]);
  });
  it("normalizes a supplied unsafe name into an in-root slug", async () => {
    const a = await store.create({ ...input, id: "../../My Audit!", cwd: root, kind: "heartbeat", status: "PAUSED", harness: "claude-code", codex: { model: "fixture" }, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", lastRunAt: now, nextRunAt: now });
    expect(a).toMatchObject({ id: "my-audit", kind: "heartbeat", status: "PAUSED", codex: { model: "fixture" }, cwd: root });
    expect(JSON.parse(await readFile(join(dir(a.id), "automation.json"), "utf8"))).toEqual(a);
  });
  it.each([{ name: "   " }, { prompt: "  " }])("rejects empty name or prompt %j", async patch => {
    await expect(store.create({ ...input, ...patch })).rejects.toThrow(/required/);
  });
  it.each([
    ["read_only", "full_access", "plan"], ["review", "full_access", "plan"],
    ["review", "plan", "plan"], ["allow_writes", "full_access", "full_access"],
  ] as const)("enforces %s permission boundary from %s", async (mutationPolicy, permissionMode, expected) => {
    const a = await store.create({ ...input, mutationPolicy, permissionMode });
    expect(a.permissionMode).toBe(expected);
  });
  it("uses template/name IDs, truncates long slugs and handles punctuation-only IDs", async () => {
    expect((await store.create({ ...input, templateId: "Template One" })).id).toMatch(/^template-one-/);
    expect((await store.create({ ...input, name: "Audit Me" })).id).toMatch(/^audit-me-/);
    expect((await store.create({ ...input, id: "x".repeat(200) })).id).toHaveLength(96);
    expect((await store.create({ ...input, id: "!!!" })).id).toBe("automation");
  });
  it("ignores partial directories and corrupt records while sorting by update date", async () => {
    await store.create({ ...input, id: "old", updatedAt: "2025-01-01T00:00:00Z" });
    await store.create({ ...input, id: "new", updatedAt: now });
    await mkdir(dir("partial"), { recursive: true });
    await mkdir(dir("corrupt")); await writeFile(join(dir("corrupt"), "automation.json"), "{bad");
    await writeFile(dir("unrelated-file"), "data");
    expect((await store.list()).map(a => a.id)).toEqual(["new", "old"]);
    expect(await store.get("corrupt")).toBeNull(); expect(await store.get("missing")).toBeNull();
  });
  it("normalizes older stored records lacking optional policy, timezone and Codex config", async () => {
    const a = await store.create({ ...input, id: "legacy" });
    const { mutationPolicy, codex, ...legacy } = a;
    await writeFile(join(dir(a.id), "automation.json"), JSON.stringify({ ...legacy, timezone: "", permissionMode: "full_access" }));
    expect(await store.get(a.id)).toMatchObject({ mutationPolicy: "review", timezone: "America/Chicago", permissionMode: "plan", codex: { model: "gpt-5.5" } });
  });
  it("updates fields without changing identity and recalculates schedules only on relevant patches", async () => {
    const a = await store.create({ ...input, id: "fixture", nextRunAt: "2026-05-08T12:00:00Z" });
    expect((await store.update(a.id, { id: "overwrite", name: "Renamed" })).id).toBe(a.id);
    expect((await store.get(a.id))?.nextRunAt).toBe(a.nextRunAt);
    expect((await store.update(a.id, { rrule: "FREQ=MINUTELY;INTERVAL=2" })).nextRunAt).toBe("2026-05-07T09:00:00.000Z");
    expect((await store.update(a.id, { timezone: "Europe/London" })).timezone).toBe("Europe/London");
    expect((await store.update(a.id, { status: "ACTIVE" })).nextRunAt).toBe("2026-05-07T09:00:00.000Z");
    expect((await store.update(a.id, { nextRunAt: "2026-05-10T00:00:00Z" })).nextRunAt).toBe("2026-05-10T00:00:00Z");
    await expect(store.update("missing", {})).rejects.toMatchObject({ statusCode: 404 });
  });
  it("removes known records and reports absent records", async () => {
    const a = await store.create({ ...input, id: "delete-me" });
    expect(await store.delete(a.id)).toBe(true); expect(await store.delete(a.id)).toBe(false);
    expect(await store.get(a.id)).toBeNull();
  });
  it("claims only active due schedules once and honors an existing scheduler lock", async () => {
    await store.create({ ...input, id: "due", nextRunAt: now });
    await store.create({ ...input, id: "paused", status: "PAUSED", nextRunAt: now });
    const future = await store.create({ ...input, id: "future", nextRunAt: "2027-01-01T00:00:00Z" });
    await writeFile(join(dir(future.id), "automation.json"), JSON.stringify({ ...future, nextRunAt: null }));
    await store.create({ ...input, id: "later", nextRunAt: "2027-01-01T00:00:00Z" });
    await writeFile(dir(".run.lock"), "another scheduler");
    expect(await store.claimDue()).toEqual([]);
    await rm(dir(".run.lock"));
    expect((await store.claimDue()).map(a => a.id)).toEqual(["due"]);
    expect(await store.claimDue()).toEqual([]);
    expect((await store.get("due"))?.lastRunAt).toBe(now);
  });
  it("keeps run history newest-first and preserves an existing last run timestamp", async () => {
    const a = await store.create({ ...input, id: "fixture" });
    expect(await store.listRuns(a.id)).toEqual([]);
    await store.appendRun(a.id, run("one")); await store.appendRun(a.id, run("two", "2026-05-07T09:05:00Z"));
    expect((await store.listRuns(a.id)).map(r => r.id)).toEqual(["two", "one"]);
    expect((await store.get(a.id))?.lastRunAt).toBe(now);
    await writeFile(join(dir(a.id), "runs.jsonl"), "bad\n"); expect(await store.listRuns(a.id)).toEqual([]);
    await expect(store.appendRun("missing", run("bad"))).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.listRuns("missing")).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("automation schedule and launch configuration", () => {
  it("constructs all templates with independent Codex config and optional source context", () => {
    for (const t of DESIGN_AUTOMATION_TEMPLATES) {
      const a = createAutomationFromTemplate({ templateId: t.id, cwd: root, timezone: "UTC", sourceSessionId: "source" });
      expect(a).toMatchObject({ templateId: t.id, sourceSessionId: "source", mutationPolicy: "review", timezone: "UTC" });
      expect(a.codex).not.toBe(createAutomationFromTemplate({ templateId: t.id, cwd: root }).codex);
    }
    expect(() => createAutomationFromTemplate({ templateId: "missing", cwd: root })).toThrow(/Unknown automation template/);
  });
  it.each(["0", "-1", "invalid", "Infinity"])("falls back to one minute for invalid interval %s", interval => {
    expect(nextRunFromRRule(`FREQ=MINUTELY;INTERVAL=${interval}`, now)).toBe("2026-05-07T09:00:00.000Z");
  });
  it("handles interval defaults, daily defaults, whitespace and weekly schedules without BYDAY", () => {
    expect(nextRunFromRRule("freq=minutely; ;", now)).toBe("2026-05-07T09:00:00.000Z");
    expect(nextRunFromRRule("", now, "UTC")).toBe("2026-05-07T09:00:00.000Z");
    expect(nextRunFromRRule("FREQ=WEEKLY", now, "UTC")).toBe("2026-05-07T09:00:00.000Z");
    expect(() => nextRunFromRRule("FREQ=DAILY", "invalid")).toThrow(/Invalid after date/);
  });
  it("renders explicit write permission and omits Codex details for other harnesses", async () => {
    const a = await store.create({ ...input, harness: "claude-code", mutationPolicy: "allow_writes", permissionMode: "full_access" });
    const prompt = buildAutomationPrompt(a, defaultStudioConfig(root));
    expect(prompt).toContain("explicitly allows writes"); expect(prompt).toContain("Template: custom");
    expect(prompt).not.toContain("Codex model:"); expect(prompt).toContain(input.prompt);
  });
  it("escapes every XML-sensitive character and defaults its interval", () => {
    const plist = buildLaunchAgentPlist({ label: `label<&>"'`, runtimeBinary: "/fixture/runtime", projectRoot: root, logPath: "/fixture/log" });
    expect(plist).toContain("label&lt;&amp;&gt;&quot;&apos;"); expect(plist).toContain("<integer>300</integer>");
  });
  it.each(["darwin", "linux"])("installs and removes isolated scheduler configuration on %s", async platform => {
    vi.spyOn(process, "platform", "get").mockReturnValue(platform);
    const before = schedulerStatus(root); expect(before.installed).toBe(false); expect(before.runtimeBinary).toBe(process.execPath);
    expect(before.plistPath.startsWith(mocks.home)).toBe(true);
    const installed = await installScheduler(root, "/fixture/runtime"); expect(installed.installed).toBe(true);
    expect(await readFile(installed.plistPath, "utf8")).toContain("/fixture/runtime");
    const removed = await uninstallScheduler(root, "/fixture/runtime"); expect(removed.installed).toBe(false);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(platform === "darwin" ? 3 : 0);
    if (platform === "darwin") expect(mocks.spawnSync.mock.calls.map(c => c[0])).toEqual(["launchctl", "launchctl", "launchctl"]);
  });
});
