import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preflightCommand } from "../command-preflight.js";
import { configureExecutionPolicy, createExecutionPolicy, resetExecutionPolicyForTests } from "../execution-policy.js";
import { registerTokensCommand } from "../../commands/tokens.js";
import { registerUxCommand } from "../../commands/ux.js";
import { registerCraftCommand } from "../../commands/craft.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); resetExecutionPolicyForTests(); process.exitCode = 0;
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
const invoke = (path: string, options: Record<string, unknown> = {}, args: unknown[] = []) => ({ commandPath: path.split("."), options, args });

describe("R01 deterministic command admission", () => {
  it.each([
    ["agent.brief", {}], ["tokens", { from: ".", json: true }], ["tokens", { json: true }],
    ["ux.audit", { write: false }], ["craft.audit", { write: false }],
    ["generate", { preview: true }], ["mcp.start", { figma: false }], ["mcp", { figma: false }],
  ])("admits locked %s with read-only options", async (path, options) => {
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace" }), invoke(path, options))).resolves.toEqual({ optionOverrides: {} });
  });
  it.each(["ux.audit", "craft.audit"])("defaults locked/local %s to non-persistence", async path => {
    for (const profile of ["locked", "local"] as const) {
      await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace", profile }), invoke(path))).resolves.toEqual({ optionOverrides: { write: false } });
    }
  });
  it.each(["ux.audit", "craft.audit"])("requires network for %s URL even with no-write", async path => {
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace" }), invoke(path, { write: false }, ["https://example.com"]))).rejects.toMatchObject({ capability: "network" });
  });
  it("honors explicit diagnose files precedence over changed", async () => {
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace" }), invoke("diagnose", { files: ["src/page.tsx"], changed: true, write: false }))).resolves.toEqual({ optionOverrides: { write: false } });
  });
  it.each([
    ["tokens", { from: ".", json: true, save: true }],
    ["tokens", { from: ".", json: true, report: true }],
    ["tokens", { from: "." }], ["tokens", {}],
    ["generate", {}], ["ux.audit", {}], ["craft.audit", {}],
  ])("requires both write and source-persistence grants for connected %s %j", async (path, options) => {
    for (const missing of ["project-write", "source-content-persistence"] as const) {
      const allow = (["project-write", "source-content-persistence"] as const).filter(capability => capability !== missing);
      await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace", profile: "connected", allow }), invoke(path, options))).rejects.toMatchObject({ capability: missing });
    }
  });
  it("denies tokens URL extraction before network access", async () => {
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: "/workspace" }), invoke("tokens", { from: "https://example.com", json: true }))).rejects.toMatchObject({ capability: "network" });
  });
});

describe("R01 direct handlers retain policy boundaries", () => {
  it.each([["ux", registerUxCommand], ["craft", registerCraftCommand]] as const)("blocks direct %s report persistence when locked", async (command, register) => {
    const root = await mkdtemp(join(tmpdir(), "memi-command-policy-")); roots.push(root);
    configureExecutionPolicy({ projectRoot: root });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const program = new Command(); register(program, { config: { projectRoot: root } } as never);
    await program.parseAsync([command, "audit", "--json"], { from: "user" });
    expect(process.exitCode).toBe(1);
    expect(log.mock.calls.map(call => call.join(" ")).join("\n")).toContain("source-content-persistence");
    await expect(access(join(root, ".memoire"))).rejects.toThrow();
  });
  it("blocks direct token report output before creating directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-token-policy-")); roots.push(root);
    await writeFile(join(root, "tokens.css"), ":root { --color-brand: #334455; }");
    configureExecutionPolicy({ projectRoot: root });
    const program = new Command(); registerTokensCommand(program, { config: { projectRoot: root } } as never);
    await expect(program.parseAsync(["tokens", "--from", "tokens.css", "--report", "--json"], { from: "user" })).rejects.toMatchObject({ capability: "source-content-persistence" });
    await expect(access(join(root, "generated"))).rejects.toThrow();
  });
});
