import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { EventPipeline } from "../pipeline.js";
const ports = vi.hoisted(() => ({ watch: vi.fn() }));
vi.mock("fs", () => ({ watch: ports.watch }));
let pipelines: EventPipeline[], watchers: Array<{ callback: (event: string, filename: string | null) => void; close: ReturnType<typeof vi.fn> }>;
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); pipelines = []; watchers = []; ports.watch.mockImplementation((_dir, callback) => { const watcher = { callback, close: vi.fn() }; watchers.push(watcher); return watcher; }); });
afterEach(() => { for (const pipeline of pipelines) pipeline.stop(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function fixture(options = {}) {
  const engine = Object.assign(new EventEmitter(), { config: { projectRoot: "/synthetic" }, registry: { designSystem: { tokens: [], components: [], styles: [], lastSync: "never" } }, autoSpec: vi.fn().mockResolvedValue(2), generateFromSpec: vi.fn().mockResolvedValue({ blocked: false, findings: [] }) });
  const pipeline = new EventPipeline(engine as never, { specDebounceMs: 5, ...options }); pipelines.push(pipeline); pipeline.start(); return { engine, pipeline };
}
it("replaces listeners/watchers on restart and closes every handle on stop", () => {
  const { engine, pipeline } = fixture(); pipeline.start(); expect(engine.listenerCount("event")).toBe(1); expect(watchers).toHaveLength(10); expect(watchers.slice(0, 5).every(w => w.close.mock.calls.length === 1)).toBe(true);
  pipeline.stop(); expect(engine.listenerCount("event")).toBe(0); expect(watchers.every(w => w.close.mock.calls.length === 1)).toBe(true);
});
it("coalesces repeated spec notifications and ignores unrelated filenames", async () => {
  const { engine, pipeline } = fixture(); watchers[0].callback("change", null); watchers[0].callback("change", "readme.md"); watchers[0].callback("change", "Button.json"); watchers[0].callback("rename", "Button.json");
  await vi.runAllTimersAsync(); expect(engine.generateFromSpec).toHaveBeenCalledExactlyOnceWith("Button"); expect(pipeline.getStats()).toMatchObject({ generateCount: 1, queueDepth: 0 });
});
it("cancels pending debounced work when stopped", async () => {
  const { engine, pipeline } = fixture(); watchers[0].callback("change", "Button.json"); pipeline.stop(); await vi.runAllTimersAsync(); expect(engine.generateFromSpec).not.toHaveBeenCalled();
});
it("reports positive and negative system deltas while preserving the old snapshot", async () => {
  const { engine, pipeline } = fixture({ autoGenerate: false });
  engine.registry.designSystem = { tokens: [{}], components: [{}], styles: [], lastSync: "now" } as never;
  engine.emit("event", { source: "figma", type: "success", message: "Design system pulled" }); await vi.runAllTimersAsync();
  engine.registry.designSystem = { tokens: [], components: [], styles: [], lastSync: "later" };
  engine.emit("event", { source: "figma", type: "success", message: "Design system pulled" }); await vi.runAllTimersAsync();
  expect(engine.autoSpec).toHaveBeenCalledTimes(2); expect(pipeline.getStats()).toMatchObject({ pullCount: 2, specCount: 4 });
  const details = pipeline.getRecentEvents().map(e => e.detail).join("\n"); expect(details).toContain("+1"); expect(details).toContain("-1");
});
it("respects disabled automatic specification and ignores unrelated engine events", async () => {
  const { engine, pipeline } = fixture({ autoSpec: false, autoGenerate: false });
  engine.emit("event", { source: "other", type: "info", message: "design system" });
  engine.registry.designSystem.components = [{}] as never;
  engine.emit("event", { source: "figma", type: "success", message: "design system" });
  engine.emit("event", { source: "auto-spec", type: "success", message: "Manual spec created" }); await vi.runAllTimersAsync();
  expect(engine.autoSpec).not.toHaveBeenCalled(); expect(pipeline.getStats()).toMatchObject({ pullCount: 1, specCount: 1 }); expect(ports.watch).not.toHaveBeenCalled();
});
it.each([new Error("invalid component"), "invalid component"])("records generation failure and continues later work: %s", async error => {
  const { engine, pipeline } = fixture(); engine.generateFromSpec.mockRejectedValueOnce(error);
  watchers[0].callback("change", "Broken.json"); await vi.runAllTimersAsync(); watchers[0].callback("change", "Valid.json"); await vi.runAllTimersAsync();
  expect(pipeline.getStats()).toMatchObject({ generateCount: 1, errorCount: 1, lastError: "invalid component" }); expect(pipeline.getRecentEvents().some(e => e.type === "generate-failed")).toBe(true);
});
it("reports critical generation blockers without counting successful generation", async () => {
  const { engine, pipeline } = fixture(); engine.generateFromSpec.mockResolvedValue({ blocked: true, findings: [{ severity: "critical", message: "Reuse existing mapping" }, { severity: "low", message: "Extra" }] });
  watchers[0].callback("change", "Button.json"); await vi.runAllTimersAsync();
  expect(pipeline.getStats().generateCount).toBe(0); expect(pipeline.getRecentEvents().find(e => e.type === "generate-blocked")?.detail).toContain("Reuse existing mapping");
});
it("continues after automatic specification fails and avoids duplicate queued work", async () => {
  const { engine, pipeline } = fixture({ autoGenerate: false }); let reject!: (e: Error) => void;
  engine.autoSpec.mockImplementationOnce(() => new Promise((_r, fail) => { reject = fail; })).mockResolvedValue(0);
  for (let i = 1; i <= 3; i++) { engine.registry.designSystem.components = Array(i).fill({}) as never; engine.emit("event", { source: "figma", type: "success", message: "design system" }); }
  expect(pipeline.getStats().queueDepth).toBe(1); reject(new Error("auto-spec failed")); await vi.runAllTimersAsync();
  expect(engine.autoSpec).toHaveBeenCalledTimes(2); expect(pipeline.getStats()).toMatchObject({ errorCount: 1, specCount: 0, queueDepth: 0 });
});
it("handles missing watch directories and bounds retained event history", () => {
  ports.watch.mockImplementation(() => { throw new Error("no directory"); }); const { engine, pipeline } = fixture();
  for (let i = 0; i < 110; i++) engine.emit("event", { source: "auto-spec", type: "success", message: `Spec ${i}` });
  expect(pipeline.getRecentEvents().length).toBeLessThanOrEqual(100); expect(pipeline.getRecentEvents().at(-1)?.detail).toBe("Spec 109");
  const copy = pipeline.getStats(); copy.specCount = 0; expect(pipeline.getStats().specCount).toBe(110);
});
