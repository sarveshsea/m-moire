import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BidirectionalSync } from "../sync.js";
import type { DesignSystem, DesignToken } from "../registry.js";
const token = (name: string, value: string): DesignToken => ({ name, collection: "colors", type: "color", values: { light: value }, cssVariable: `--${name}` });
const ds = (tokens: DesignToken[] = []): DesignSystem => ({ tokens, components: [], styles: [], lastSync: null });
let root: string;
let engine: any;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-sync-release-"));
  engine = { config: { projectRoot: root }, registry: { designSystem: ds(), updateToken: vi.fn(), removeToken: vi.fn() }, figma: { isConnected: true, pushTokens: vi.fn(async () => {}) } };
});
afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
async function stored(state: unknown, conflicts: unknown = []) {
  await mkdir(join(root, ".memoire"), { recursive: true });
  await writeFile(join(root, ".memoire", "sync-state.json"), JSON.stringify(state));
  await writeFile(join(root, ".memoire", "sync-conflicts.json"), JSON.stringify(conflicts));
}
describe("sync persistence and lifecycle release behavior", () => {
  it.each([null, [], { figma: [], code: [], lastSyncAt: 42 }, { figma: {}, code: {}, lastSyncAt: "2026-09-01T00:00:00Z" }])("loads optional historical state shape %j without fabricating conflicts", async value => {
    await stored(value, {}); const sync = new BidirectionalSync(engine); await sync.loadState(); expect(sync.getConflicts()).toEqual([]); await sync.saveState();
    const saved = JSON.parse(await readFile(join(root, ".memoire", "sync-state.json"), "utf8")); expect(saved.figma).toEqual({}); expect(saved.code).toEqual({});
    expect(saved.lastSyncAt).toBe(value && !Array.isArray(value) && typeof value.lastSyncAt === "string" ? value.lastSyncAt : null);
  });
  it("round-trips state and unresolved conflicts and keeps returned arrays independent", async () => {
    await stored({ figma: { accent: { hash: "old" } }, code: { accent: { hash: "new" } }, lastSyncAt: "fixture-time" }, [{ name: "accent", resolved: false }, { name: "done", resolved: true }]);
    const sync = new BidirectionalSync(engine); await sync.loadState(); const conflicts = sync.getConflicts(); conflicts.length = 0; expect(sync.getConflicts()).toHaveLength(1);
    expect(sync.resolveConflict("done", "manual")).toBe(false); expect(sync.resolveConflict("accent", "code-wins")).toBe(true); expect(sync.resolveConflict("accent", "manual")).toBe(false);
    await sync.saveState(); const persisted = JSON.parse(await readFile(join(root, ".memoire", "sync-conflicts.json"), "utf8")); expect(persisted[0]).toMatchObject({ resolved: true, resolution: "code-wins" });
  });
  it("tolerates unreadable JSON state and conflicts", async () => {
    await stored({}); await writeFile(join(root, ".memoire", "sync-state.json"), "{broken"); await writeFile(join(root, ".memoire", "sync-conflicts.json"), "{broken");
    const sync = new BidirectionalSync(engine); await sync.loadState(); expect(sync.getConflicts()).toEqual([]); await sync.saveState();
    expect(JSON.parse(await readFile(join(root, ".memoire", "sync-state.json"), "utf8"))).toMatchObject({ figma: {}, code: {} });
  });
  it("applies added, modified and removed remote tokens while guarded", async () => {
    engine.registry.designSystem = ds([token("changed", "red"), token("removed", "red")]);
    const sync = new BidirectionalSync(engine, { direction: "figma-to-code", persistState: false });
    engine.registry.updateToken.mockImplementation(() => expect(sync.isGuarded).toBe(true)); engine.registry.removeToken.mockImplementation(() => expect(sync.isGuarded).toBe(true));
    const result = await sync.sync(ds([token("changed", "blue"), token("added", "green")]));
    expect(result.applied).toBe(3); expect(engine.registry.updateToken).toHaveBeenCalledWith("changed", token("changed", "blue")); expect(engine.registry.removeToken).toHaveBeenCalledWith("removed");
    expect(sync.isGuarded).toBe(false); expect(engine.figma.pushTokens).not.toHaveBeenCalled();
  });
  it("clears both guard and running state after a registry failure", async () => {
    const sync = new BidirectionalSync(engine, { persistState: false }); engine.registry.updateToken.mockImplementationOnce(() => { throw new Error("registry failed"); });
    await expect(sync.sync(ds([token("added", "red")]))).rejects.toThrow(/registry failed/); expect(sync.isGuarded).toBe(false);
    await expect(sync.sync()).resolves.toMatchObject({ applied: 0 });
  });
  it("tracks component/style identities, prunes removed entities and saves code metadata", async () => {
    const sync = new BidirectionalSync(engine);
    sync.onCodeTokenChanged(token("accent", "blue"));
    await sync.sync({ ...ds([token("accent", "red")]), components: [{ id: "1", name: "Button", variants: [], properties: {} }] as never, styles: [{ id: "2", name: "Body", type: "TEXT", value: { fontSize: 16 } }] as never });
    const first = JSON.parse(await readFile(join(root, ".memoire", "sync-state.json"), "utf8")); expect(Object.keys(first.figma).sort()).toEqual(["Body", "Button", "accent"]); expect(first.code.accent.source).toBe("code");
    await sync.sync(ds()); const last = JSON.parse(await readFile(join(root, ".memoire", "sync-state.json"), "utf8")); expect(last.figma).toEqual({}); expect(last.lastSyncAt).toEqual(expect.any(String));
  });
  it.each([true, false])("pushes code-side changes only while connected=%s and deduplicates conflicts", async connected => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime("2026-09-01T00:00:00Z");
    engine.registry.designSystem = ds([token("accent", "blue"), token("untracked", "grey")]); engine.figma.isConnected = connected;
    const sync = new BidirectionalSync(engine, { direction: "code-to-figma", persistState: false }); sync.onCodeTokenChanged(token("accent", "blue"));
    const remote = ds([token("accent", "red"), token("untracked", "grey")]);
    const first = await sync.sync(remote); expect(first.applied).toBe(0); expect(first.pushed).toBe(connected ? 1 : 0);
    if (connected) expect(engine.figma.pushTokens).toHaveBeenCalledWith([{ name: "accent", values: { light: "blue" } }], "code");
    expect(sync.getConflicts()).toHaveLength(1); await sync.sync(remote); expect(sync.getConflicts()).toHaveLength(1);
    sync.resolveConflict("accent", "manual"); await sync.sync(remote); expect(sync.getConflicts()).toHaveLength(1);
  });
  it.each([new Error("provider failed"), "provider string failure"])("emits push errors and releases its guard for %s", async failure => {
    engine.registry.designSystem = ds([token("accent", "blue")]); engine.figma.pushTokens.mockRejectedValue(failure);
    const sync = new BidirectionalSync(engine, { direction: "code-to-figma", persistState: false }); sync.onCodeTokenChanged(token("accent", "blue")); const errors: unknown[] = []; sync.on("sync-error", e => errors.push(e));
    expect((await sync.sync(ds([token("accent", "red")]))).pushed).toBe(0); expect(sync.isGuarded).toBe(false); expect(errors).toEqual([{ direction: "code-to-figma", error: failure instanceof Error ? failure.message : failure, tokenCount: 1 }]);
  });
  it("suppresses code-side feedback while guarded", () => {
    const sync = new BidirectionalSync(engine, { persistState: false }); const changed = vi.fn(); sync.on("entity-updated", changed); sync.enableGuard(); sync.onCodeTokenChanged(token("accent", "red")); expect(changed).not.toHaveBeenCalled();
    sync.disableGuard(); sync.onCodeTokenChanged(token("accent", "red")); expect(changed).toHaveBeenCalledWith({ source: "code", name: "accent" });
  });
});
