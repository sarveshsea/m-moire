import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine } from "../../engine/core.js";
import { registerTokensCommand } from "../tokens.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
let root: string; let log: ReturnType<typeof vi.spyOn>;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-tokens-release-")); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); log = vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function run(args: string[]) { const program = new Command(); registerTokensCommand(program, new MemoireEngine({ projectRoot: root })); await program.parseAsync(["tokens", ...args], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
async function store(tokens: unknown[]) { await mkdir(join(root, ".memoire"), { recursive: true }); await writeFile(join(root, ".memoire/design-system.json"), JSON.stringify({ tokens, components: [], styles: [], lastSync: "fixture" })); }
describe("token command export and source coverage", () => {
 it("reports empty registry in both output modes", async () => { expect(await run([])).toContain("No design tokens found"); await run(["--json"]); expect(parsed()).toEqual({ tokens: [], count: 0 }); expect(await readdir(root)).toEqual([]); });
 it.each([["css", "css"], ["scss", "css"], ["sass", "css"], ["less", "css"], ["html", "html"], ["htm", "html"], ["tsx", "tsx"], ["jsx", "jsx"], ["ts", "ts"], ["js", "js"], ["vue", "vue"], ["svelte", "svelte"], ["mdx", "unknown"]])("records correct %s source kind", async (extension, kind) => {
  await writeFile(join(root, `source.${extension}`), '<div class="p-4">Example</div>');
  configureExecutionPolicy({ projectRoot: root }); await run(["--from", `source.${extension}`, "--json", "--no-inferred"]);
  expect(parsed()).toMatchObject({ status: "extracted", sources: [{ kind }], saved: false, reportFiles: null }); expect(await readdir(root)).toEqual([`source.${extension}`]);
 });
 it("keeps uninferred candidates visible without exporting fabricated tokens", async () => {
  await writeFile(join(root, "page.tsx"), '<div className="p-4 bg-red-500"><span style={{color: "#123456"}}>Hello</span></div>');
  const output = await run(["--from", "page.tsx", "--no-inferred"]); expect(output).toContain("No design tokens found"); expect(output).toContain("manual review"); expect(await readdir(root)).toEqual(["page.tsx"]);
 });
 it("handles a genuinely empty source and save request without a source-store write", async () => {
  await writeFile(join(root, "empty.css"), "/* No styles */"); expect(await run(["--from", "empty.css"])).toContain("No design tokens found");
  await run(["--from", "empty.css", "--save", "--json"]); expect(parsed().count).toBe(0); expect(await readdir(root)).toEqual(["empty.css"]);
 });
 it("exports every format with category counts and a shadcn mapping", async () => {
  await store(["color", "spacing", "typography", "radius", "shadow", "other"].map(type => ({ name: `fixture-${type}`, cssVariable: `--fixture-${type}`, type, collection: type, values: { default: type === "color" ? "#123456" : type === "typography" ? "Inter" : 4 } })));
  const output = await run(["--shadcn"]); expect(output).toContain("1 color token"); expect(output).toContain("1 other"); expect(output).toContain("Style Dictionary:"); expect(output).toContain("shadcn:");
  const files = await readdir(join(root, "generated/tokens")); expect(files).toContain("tokens.style-dictionary.json"); expect(files).toContain("shadcn-tokens.css");
  await run(["--json"]); expect(parsed()).toMatchObject({ count: 6, lastSync: "fixture" });
 });
 it("honors selected format names, casing and whitespace", async () => {
  await store([{ name: "brand", cssVariable: "--brand", type: "color", collection: "colors", values: { default: "#123456" } }]);
  const output = await run(["--format", " CSS , JSON , ", "--output", "selected"]); expect(output).toContain("CSS:"); expect(output).toContain("JSON:"); expect(output).not.toContain("Tailwind:"); expect(output).not.toContain("Style Dictionary:");
  expect((await readdir(join(root, "selected"))).every(file => file.endsWith(".json") || file.endsWith(".css"))).toBe(true);
 });
 it("merges extracted values while retaining existing modes and distinct tokens", async () => {
  await store([{ name: "primary", cssVariable: "--primary", type: "color", collection: "existing", values: { dark: "#eeeeee" } }, { name: "kept", cssVariable: "", type: "spacing", collection: "spacing", values: { default: 8 } }]);
  await writeFile(join(root, "source.css"), ':root { --primary: #112233; --accent: #334455; }');
  const output = await run(["--from", "source.css", "--save", "--report", "--format", "css"]); expect(output).toContain("Report JSON:"); expect(output).toContain("Saved extracted tokens");
  const saved = JSON.parse(await readFile(join(root, ".memoire/design-system.json"), "utf8")); expect(saved.tokens.map((token: {name: string}) => token.name)).toEqual(["accent", "kept", "primary"]); expect(saved.tokens[2].values).toMatchObject({ dark: "#eeeeee", default: "#112233" });
 });
 it("pluralizes multi-source extraction and rejects out-of-project exports", async () => {
  await mkdir(join(root, "src")); await writeFile(join(root, "src/a.css"), ':root { --primary: #112233; }'); await writeFile(join(root, "src/b.css"), ':root { --accent: #334455; }');
  expect(await run(["--from", "src", "--format", "json"])).toContain("2 sources");
  await expect(run(["--from", "src", "--output", "../outside"])).rejects.toMatchObject({ capability: "project-write" });
 });
});
