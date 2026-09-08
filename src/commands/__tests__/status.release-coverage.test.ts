import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Command } from "commander";
import { collectStatus, registerStatusCommand } from "../status.js";
const ports = vi.hoisted(() => ({ ai: vi.fn(), tracker: vi.fn() }));
vi.mock("../../ai/index.js", () => ({ hasAI: ports.ai, getTracker: ports.tracker }));
let logs: string[];
beforeEach(() => { vi.clearAllMocks(); ports.ai.mockReturnValue(false); ports.tracker.mockReturnValue(null); logs = []; vi.spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" "))); });
afterEach(() => vi.restoreAllMocks());
function engine(populated = false): any {
  return {
    init: vi.fn(), project: populated ? { framework: "react", language: "typescript", styling: { tailwind: true, tailwindVersion: "4" }, shadcn: { installed: true, components: ["Button"] } } : null,
    figma: { isConnected: populated },
    registry: { designSystem: { tokens: populated ? [1] : [], components: [], styles: [], lastSync: populated ? "today" : "" }, getAllSpecs: vi.fn().mockResolvedValue(populated ? [{ type: "component", name: "Button" }, { type: "page", name: "Home" }, { type: "dataviz", name: "Chart" }] : []), getGenerationState: vi.fn().mockReturnValue(populated ? {} : null) },
    research: { load: vi.fn(), getStore: () => ({ findings: populated ? [{ confidence: "high" }, { confidence: "low" }] : [], themes: [], sources: [], quality: { overallScore: 80, sampleSize: populated ? 5 : 0 }, quantitativeMetrics: populated ? [1] : [] }) },
    notes: { loaded: populated, loadAll: vi.fn(), notes: populated ? [{ builtIn: true }, { builtIn: false }] : [] },
  };
}
async function run(e: any, json = false) { const p = new Command(); registerStatusCommand(p, e); await p.parseAsync(["status", ...(json ? ["--json"] : [])], { from: "user" }); return logs.join("\n"); }
it("collects all component categories, generation and research counts", async () => {
  const e = engine(true); ports.ai.mockReturnValue(true); ports.tracker.mockReturnValue({ callCount: 3, summary: "3 calls" });
  expect(await collectStatus(e)).toMatchObject({ specs: { components: 1, pages: 1, dataviz: 1, total: 3, generated: 3 }, research: { highConfidence: 1, sampleSize: 5, quantitativeMetrics: 1 }, ai: { calls: 3, mode: "direct-api" }, notes: { builtIn: 1, installed: 1, total: 2 } });
  expect(e.notes.loadAll).not.toHaveBeenCalled();
});
it("reports missing project facts explicitly in machine output", async () => {
  const e = engine(); await run(e, true);
  expect(JSON.parse(logs[0])).toMatchObject({ project: { framework: "not detected", language: "unknown", tailwind: false }, ai: { calls: 0, usage: null, mode: "agent-cli" } });
  expect(e.notes.loadAll).toHaveBeenCalledOnce();
});
it.each(["setup", "pull", "generate", "sync", "preview"])("prints a next step appropriate to legacy status: %s", async step => {
  const e = engine(step !== "setup");
  if (step === "pull") e.registry.getAllSpecs.mockResolvedValue([]);
  if (step === "generate") e.registry.getGenerationState.mockReturnValue(null);
  if (step === "preview") e.registry.getGenerationState.mockReturnValueOnce({}).mockReturnValue(null);
  if (step === "sync") { ports.ai.mockReturnValue(true); ports.tracker.mockReturnValue({ callCount: 1, summary: "1 call" }); }
  if (step === "preview") e.project.styling.tailwindVersion = undefined;
  expect(await run(e)).toContain(`Run: memi ${step}`);
});
