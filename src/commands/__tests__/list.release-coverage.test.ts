import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine } from "../../engine/core.js";
import { registerListCommand } from "../list.js";
import { configureExecutionPolicy, createExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { preflightCommand } from "../../security/command-preflight.js";
let root: string; let engine: MemoireEngine; let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-list-release-")); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); engine = new MemoireEngine({ projectRoot: root }); vi.spyOn(engine.taskQueue, "start").mockResolvedValue(undefined); vi.spyOn(engine.agentRegistry, "startHealthCheck").mockImplementation(() => {}); log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function seed() {
 await mkdir(join(root, ".memoire")); await mkdir(join(root, "specs/components"), { recursive: true });
 const entries = [{ name: "Z", type: "spacing" }, { name: "B", type: "color" }, { name: "A", type: "color" }, { name: "Missing" }];
 await writeFile(join(root, ".memoire/design-system.json"), JSON.stringify({ tokens: entries, components: [{ name: "Z", key: "z" }, { name: "A", key: "a" }], styles: entries, lastSync: null }));
 for (const spec of [{ name: "Z", type: "component", level: "atom" }, { name: "A", type: "component", level: "atom" }, { name: "Page", type: "page" }, { name: "Chart", type: "dataviz" }, { name: "Missing" }]) await writeFile(join(root, "specs/components", `${spec.name}.json`), JSON.stringify(spec));
}
async function run(type?: string, json = false) { const program = new Command(); registerListCommand(program, engine); await program.parseAsync(["list", ...(type ? [type] : []), ...(json ? ["--json"] : [])], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("legacy list handler (not admitted CLI)", () => {
 it("remains deferred even with source write grants", async () => { await expect(preflightCommand(createExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }), { commandPath: ["list"], args: [], options: {} })).rejects.toThrow("unavailable"); });
 it.each(["specs", "tokens", "components", "styles", "unknown"])("lists empty %s without fabricated items", async type => { expect(await run(type)).toContain(`No ${type} found`); await run(type, true); expect(parsed()).toMatchObject({ ok: true, data: { type, count: 0, items: [] } }); });
 it.each(["tokens", "styles", "components"])("sorts and prints %s from persisted metadata", async type => { await seed(); await run(type, true); const names = parsed().data.items.map((item: {name: string}) => item.name); expect(names).toEqual(type === "components" ? ["A", "Z"] : ["Missing", "A", "B", "Z"]); expect(await run(type)).toContain(type === "components" ? "components (2)" : `${type} (4)`); });
 it("sorts default specs and prints singular/plural counts by kind", async () => { await seed(); await run(undefined, true); expect(parsed().data.items.map((item: {name: string}) => item.name)).toEqual(["Missing", "A", "Z", "Chart", "Page"]); const output = await run(); expect(output).toContain("2 components, 1 page, 1 dataviz spec"); });
 it("prints zero missing categories and one component", async () => { await mkdir(join(root, "specs/components"), { recursive: true }); await writeFile(join(root, "specs/components/Only.json"), JSON.stringify({ name: "Only", type: "component" })); expect(await run()).toContain("1 component, 0 pages, 0 dataviz specs"); });
});
