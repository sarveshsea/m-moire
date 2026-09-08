import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lockedArgs = ["--profile", "locked", "mcp", "start", "--no-figma"];
const jsonConfigs = [
  ["plugins/memoire/.mcp.json", "memoire"],
  ["plugins/memi-claude/.mcp.json", "memi"],
  ["agent-kits/mcp/cursor/mcp.json", "memoire"],
  ["agent-kits/mcp/claude-code/mcp.json", "memoire"],
  [".mcp.json", "memoire"],
] as const;

describe("installed and mirrored MCP defaults", () => {
  it.each(jsonConfigs)("%s starts explicitly locked without credential interpolation", async (path, name) => {
    const config = JSON.parse(await readFile(resolve(path), "utf8"));
    expect(Object.keys(config.mcpServers)).toEqual([name]);
    expect(config.mcpServers[name]).toEqual({ command: "memi", args: lockedArgs });
  });

  it("Grok Build uses the same locked credential-free startup", async () => {
    const config = await readFile(resolve("agent-kits/mcp/grok-build/config.toml"), "utf8");
    expect(config).toContain("[mcp_servers.memoire]");
    expect(config).toContain('command = "memi"');
    const args = config.match(/^args\s*=\s*(\[.*\])$/m)?.[1];
    expect(args && JSON.parse(args)).toEqual(lockedArgs);
    expect(config).not.toMatch(/^env\s*=/m);
    expect(config).not.toContain("FIGMA_TOKEN");
    expect(config).not.toContain("FIGMA_FILE_KEY");
  });
});
