import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMcpCommand } from "../mcp.js";
import { captureLogs } from "./test-helpers.js";
afterEach(() => vi.restoreAllMocks());
async function config(target: string) {
  const logs = captureLogs(); const program = new Command();
  registerMcpCommand(program, { config: { projectRoot: process.cwd() } } as never);
  await program.parseAsync(["mcp", "config", "--target", target], { from: "user" });
  return logs;
}
describe("MCP configuration truth", () => {
  it("prints only parseable locked config without credentials for generic clients", async () => {
    const logs = await config("generic");
    expect(logs).toHaveLength(1);
    const payload = JSON.parse(logs[0]);
    expect(payload.mcpServers.memoire.args).toEqual(["--profile", "locked", "mcp", "start", "--no-figma"]);
    expect(payload.mcpServers.memoire).not.toHaveProperty("env");
  });
  it("lists the four default tools and qualifies the legacy catalog", async () => {
    const text = (await config("claude-code")).join("\n");
    for (const name of ["prepare_design_agent_brief", "prepare_apple_design_brief", "diagnose_app_quality", "prepare_frontend_brief"]) expect(text).toContain(name);
    expect(text).toContain("4 locked tools");
    expect(text).toContain("every capability");
    expect(text).not.toContain("FIGMA_TOKEN");
    expect(text).not.toContain("generate_code");
    expect(text).not.toContain("pull_design_system");
  });
});
