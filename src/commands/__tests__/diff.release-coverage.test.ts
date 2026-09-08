import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine } from "../../engine/core.js";
import { registerDiffCommand } from "../diff.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
let root: string; let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-diff-release-")); await mkdir(join(root, ".memoire")); configureExecutionPolicy({ projectRoot: root }); log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
const token = (name: string, values: Record<string, unknown>) => ({ name, cssVariable: `--${name}`, type: "color", collection: "colors", values });
async function seed(current: Record<string, unknown>, previous?: Record<string, unknown>) { await writeFile(join(root, ".memoire/design-system.json"), JSON.stringify({ tokens: [], components: [], styles: [], lastSync: null, ...current })); if (previous) await writeFile(join(root, ".memoire/design-system.prev.json"), JSON.stringify({ tokens: [], components: [], styles: [], lastSync: null, ...previous })); }
async function run(json = false) { const program = new Command(); registerDiffCommand(program, new MemoireEngine({ projectRoot: root })); await program.parseAsync(["diff", ...(json ? ["--json"] : [])], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("read-only diff output", () => {
 it.each([undefined, "{", "{}", '{"tokens":42,"components":[]}'])("handles absent or invalid previous snapshot %j", async previous => { await seed({}); if (previous) await writeFile(join(root, ".memoire/design-system.prev.json"), previous); expect(await run()).toContain("No previous pull snapshot"); await run(true); expect(parsed().error).toContain("No previous pull snapshot"); });
 it.each([null, "2026-01-01"])("reports unchanged state with optional sync %j", async lastSync => { await seed({ lastSync }, { lastSync }); const output = await run(); expect(output).toContain("No changes since last pull"); expect(output.includes("Last sync:")).toBe(Boolean(lastSync)); });
 it.each([1, 2])("renders %s of each change category and returns exact JSON", async count => {
  const added = Array.from({ length: count }, (_, i) => token(`added${i}`, { default: "#123456" }));
  const removed = Array.from({ length: count }, (_, i) => token(`removed${i}`, { default: "#123456" }));
  const changedBefore = Array.from({ length: count }, (_, i) => token(`changed${i}`, {}));
  const changedAfter = Array.from({ length: count }, (_, i) => token(`changed${i}`, { default: "#abcdef" }));
  await seed({ tokens: [...added, ...changedAfter, token("same", { default: 1 })], components: [...added, { name: "same" }] }, { tokens: [...removed, ...changedBefore, token("same", { default: 1 })], components: [...removed, { name: "same" }] });
  const before = await readFile(join(root, ".memoire/design-system.prev.json"), "utf8"); const output = await run();
  for (const type of ["new token", "removed token", "changed token", "new component", "removed component"]) expect(output).toContain(`${count} ${type}${count > 1 ? "s" : ""}`);
  expect(output).toContain("Previous sync: unknown"); await run(true); expect(parsed().tokens.changed[0]).toMatchObject({ from: "", to: "#abcdef" }); expect(parsed().components.added).toHaveLength(count);
  expect(await readFile(join(root, ".memoire/design-system.prev.json"), "utf8")).toBe(before);
 });
 it("handles a removed default value and reports explicit snapshot timestamps", async () => {
  await seed({ tokens: [token("value", {})], lastSync: "current" }, { tokens: [token("value", { default: 3 })], lastSync: "previous" });
  await run(true); expect(parsed()).toMatchObject({ lastSync: "current", previousSync: "previous", tokens: { changed: [{ name: "value", field: "values", from: "3", to: "" }] } });
 });
});
