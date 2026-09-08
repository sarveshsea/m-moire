import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoireEngine } from "../../engine/core.js";
import { ComponentSpecSchema } from "../../specs/types.js";
import { buildMarketplaceAddHints, buildUsageSnippet, rankComponentSuggestions, registerAddCommand } from "../add.js";
import { configureExecutionPolicy, createExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { preflightCommand } from "../../security/command-preflight.js";
let root: string; let registryRoot: string; let log: ReturnType<typeof vi.spyOn>; let engine: MemoireEngine;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-add-release-")); registryRoot = join(root, "fixture-registry"); await mkdir(registryRoot); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); engine = new MemoireEngine({ projectRoot: root }); vi.spyOn(engine.taskQueue, "start").mockResolvedValue(undefined); vi.spyOn(engine.agentRegistry, "startHealthCheck").mockImplementation(() => {}); log = vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function seed(names = ["Button", "Card"], description?: string) {
 for (const name of names) { await writeFile(join(registryRoot, `${name}.json`), JSON.stringify(ComponentSpecSchema.parse({ name, type: "component", level: "atom", purpose: "Fixture", props: { children: "React.ReactNode" }, shadcnBase: ["Button"] }))); await writeFile(join(registryRoot, `${name}.tsx`), `export const ${name} = () => null;`); }
 await writeFile(join(registryRoot, "tokens.css"), ':root { --brand: #123456; }');
 await writeFile(join(registryRoot, "registry.json"), JSON.stringify({ name: "@fixture/design-system", version: "1.0.0", description, tokens: { href: "tokens.css", format: "css-vars" }, components: names.map((name, index) => ({ name, href: `${name}.json`, ...(index === 0 ? { level: "atom" } : {}), code: { href: `${name}.tsx`, framework: "react" } })), meta: { extractedAt: "2026-01-01", memoireVersion: "2.8.0-beta.1" } }));
}
async function run(args: string[]) { const program = new Command(); registerAddCommand(program, engine); await program.parseAsync(["add", ...args], { from: "user" }); return log.mock.calls.flat().join("\n"); }
const parsed = () => JSON.parse(String(log.mock.calls.at(-1)?.[0]));
describe("legacy add handler (public CLI stays deferred)", () => {
 it.each(["locked", "local", "connected"] as const)("denies public add admission for %s", async profile => { await expect(preflightCommand(createExecutionPolicy({ projectRoot: root, profile, allow: ["project-write", "source-content-persistence"] }), { commandPath: ["add"], args: ["Button"], options: { from: registryRoot } })).rejects.toThrow("unavailable"); });
 it("reports missing registry argument in JSON and human modes before engine init", async () => {
  const init = vi.spyOn(engine, "init"); await run(["Button", "--json"]); expect(parsed()).toMatchObject({ status: "failed", error: expect.stringContaining("Missing --from") });
  await run(["Button"]); expect(console.error).toHaveBeenCalled(); expect(init).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual(["fixture-registry"]);
 });
 it("lists populated registries and labels optional component metadata", async () => {
  await seed(undefined, "Local registry fixture"); const output = await run(["--from", registryRoot, "--list"]); expect(output).toContain("Local registry fixture"); expect(output).toContain("Button"); expect(output).toContain("Card");
  await run(["--from", registryRoot, "--json", "--refresh"]); expect(parsed()).toMatchObject({ status: "listed", available: ["Button", "Card"], generated: [] });
 });
 it("lists empty registries and reports unusable registry metadata", async () => {
  await seed([]); expect(await run(["--from", registryRoot])).toContain("<Name>");
  await writeFile(join(registryRoot, "registry.json"), "{}"); await run(["--from", registryRoot, "--json"]); expect(parsed().status).toBe("failed"); expect(process.exitCode).toBe(1);
  expect(await run(["--from", registryRoot])).toContain("[x]");
 });
 it("installs bundled source and optional tokens with real file verification", async () => {
  await seed(); await run(["Button", "--from", registryRoot, "--tokens", "--json"]); const payload = parsed(); expect(payload.status).toBe("installed"); expect(payload.generated).toHaveLength(1); expect(await readFile(payload.generated[0], "utf8")).toContain("export const Button"); expect(await readFile(payload.tokensPath, "utf8")).toContain("--brand"); expect(payload.tokenInstallCommand).toBeUndefined();
  const output = await run(["Card", "--from", registryRoot, "--target", join(root, "custom")]); expect(output).toContain("USAGE"); expect(output).toContain("--tokens"); expect(await readFile(join(root, "custom/Card.tsx"), "utf8")).toContain("Card");
 });
 it("renders a token-backed human installation and supports local regeneration", async () => {
  await seed(); const output = await run(["Button", "--from", registryRoot, "--tokens"]); expect(output).toContain("Tokens:");
  await run(["Card", "--from", registryRoot, "--regenerate", "--json"]); expect(parsed()).toMatchObject({ status: "installed" }); expect(parsed().generated.length).toBeGreaterThan(0);
 });
 it("suggests available components on failure and tolerates broken fallback listing", async () => {
  await seed(); await run(["Buton", "--from", registryRoot, "--json"]); expect(parsed()).toMatchObject({ status: "failed", suggestions: ["Button", "Card"] }); expect(process.exitCode).toBe(1);
  expect(await run(["Buton", "--from", registryRoot])).toContain("Available: Button, Card");
  await writeFile(join(registryRoot, "registry.json"), "{}"); await run(["Missing", "--from", registryRoot, "--json"]); expect(parsed().suggestions).toEqual([]);
 });
 it("builds bounded usage and ranked hints without requiring an installed registry", async () => {
  for (const name of ["AuthCard", "Button", "ChatComposer", "ChatMessage", "HeroSection", "ProductCard", "UnknownCard"]) expect(buildUsageSnippet(name)).toContain(`<${name}`);
  expect(await buildMarketplaceAddHints("@fixture/design-system", "Card", false)).toMatchObject({ packageUrl: expect.stringContaining("npmjs.com"), tokenInstallCommand: expect.stringContaining("--tokens") });
  expect(await buildMarketplaceAddHints(registryRoot, "Card", true)).toMatchObject({ tokenInstallCommand: undefined, packageUrl: undefined });
  expect(rankComponentSuggestions(["Z", "C", "A", "D", "E", "F"], "")).toEqual(["A", "C", "D", "E", "F"]); expect(rankComponentSuggestions(["Card", "CardHeader", "Button"], "Card")[0]).toBe("Card");
 });
});
