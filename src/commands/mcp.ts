/**
 * CLI command: memi mcp — Start Mémoire as an MCP server (stdio transport).
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { startStdioMcpServer } from "../mcp/server.js";
import { ui } from "../tui/format.js";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import chalk from "chalk";

export function registerMcpCommand(program: Command, engine: MemoireEngine): void {
  const mcp = program
    .command("mcp")
    .description("MCP server commands (start, config)");

  mcp
    .command("start")
    .description("Start Mémoire as an MCP server (stdio transport)")
    .option("--no-figma", "Skip Figma bridge connection")
    .action(async (opts) => {
      await startStdioMcpServer(engine, opts.figma !== false);
    });

  mcp
    .command("config")
    .description("Print or install MCP config for Claude Code, Cursor, or generic JSON")
    .option("--target <target>", "Config target: claude-code, cursor, generic", "claude-code")
    .option("--global", "Use global memi binary (default). Use --no-global for npx.")
    .option("--install", "Write config directly to the target config file instead of printing")
    .action(async (opts: { target: string; global?: boolean; install?: boolean }) => {
      const useGlobal = opts.global !== false;
      const cmd = useGlobal ? "memi" : "npx";
      const lockedArgs = ["--profile", "locked", "mcp", "start", "--no-figma"];
      const args = useGlobal ? lockedArgs : ["@memi-design/cli", ...lockedArgs];

      const serverConfig = {
        command: cmd,
        args,
      };

      // ── --install mode: write directly to config file ─────
      if (opts.install) {
        const home = homedir();
        let targetPath: string;
        let fileDescription: string;

        switch (opts.target) {
          case "cursor":
            targetPath = join(process.cwd(), ".cursor", "mcp.json");
            fileDescription = ".cursor/mcp.json";
            break;
          case "claude-code":
          default:
            // Claude Code reads from ~/.claude/settings.json (global) or .mcp.json (project)
            // --global flag writes to the global settings, otherwise project .mcp.json
            if (opts.global) {
              targetPath = join(home, ".claude", "settings.json");
              fileDescription = "~/.claude/settings.json";
            } else {
              targetPath = join(process.cwd(), ".mcp.json");
              fileDescription = ".mcp.json";
            }
        }

        try {
          await mkdir(dirname(targetPath), { recursive: true });

          // Read existing file
          let existing: Record<string, unknown> = {};
          try {
            await access(targetPath);
            const raw = await readFile(targetPath, "utf-8");
            existing = JSON.parse(raw) as Record<string, unknown>;
          } catch { /* file doesn't exist or is malformed — start fresh */ }

          // Merge memoire entry
          const servers = ((existing.mcpServers ?? {}) as Record<string, unknown>);
          const alreadyExists = !!servers.memoire;
          servers.memoire = serverConfig;
          existing.mcpServers = servers;

          await writeFile(targetPath, JSON.stringify(existing, null, 2) + "\n");

          console.log();
          if (alreadyExists) {
            console.log(ui.ok(`Updated memoire entry in ${fileDescription}`));
          } else {
            console.log(ui.ok(`Written to ${fileDescription}`));
          }
          console.log();
          console.log(chalk.dim("  Reload Claude Code / Cursor to pick up the new MCP server."));
          console.log(chalk.dim("  The locked server needs no Figma credentials or capability grants."));
          console.log();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(ui.fail(`Could not write config: ${msg}`));
          process.exitCode = 1;
        }
        return;
      }

      // ── Print mode (original behaviour) ───────────────────
      switch (opts.target) {
        case "claude-code": {
          const config = { mcpServers: { memoire: serverConfig } };
          console.log();
          console.log(ui.section("CLAUDE CODE MCP CONFIG"));
          console.log();
          console.log("  Add to .mcp.json in your project root:");
          console.log();
          console.log(JSON.stringify(config, null, 2));
          console.log();
          console.log("  Config installation is a separate write action requiring explicit capability grants:");
          console.log("    memi mcp config --install              (project .mcp.json)");
          console.log("    memi mcp config --install --global     (~/.claude/settings.json)");
          console.log();
          break;
        }
        case "cursor": {
          const config = { mcpServers: { memoire: { command: cmd, args } } };
          console.log();
          console.log(ui.section("CURSOR MCP CONFIG"));
          console.log();
          console.log("  Add to .cursor/mcp.json in your project root:");
          console.log();
          console.log(JSON.stringify(config, null, 2));
          console.log();
          console.log("  Config installation is a separate write action requiring explicit capability grants:");
          console.log("    memi mcp config --install --target cursor");
          console.log();
          break;
        }
        default: {
          console.log(JSON.stringify({ mcpServers: { memoire: serverConfig } }, null, 2));
          return;
        }
      }

      console.log(ui.section("DEFAULT MCP SURFACE"));
      console.log("  4 locked tools — local reads without network, subprocesses, or report persistence");
      console.log();
      const tools = [
        ["prepare_design_agent_brief", "Bounded local design workflow guidance"],
        ["prepare_apple_design_brief", "Apple guidance without running Xcode"],
        ["diagnose_app_quality", "Read-only local source findings"],
        ["prepare_frontend_brief", "Existing components, props, tokens, stories and supplied design evidence"],
      ];
      for (const [name, desc] of tools) {
        console.log(`  ${name.padEnd(28)} ${ui.dim(desc)}`);
      }
      console.log();
      console.log(ui.dim("  The legacy catalog requires the connected profile and explicit grants for every capability."));
      console.log(ui.dim("  Keep the default client locked. Read responses may contain source evidence; they are not metadata-only receipts."));
      console.log();
      console.log(ui.section("RESOURCES (1)"));
      console.log();
      console.log("  memoire://project            Project root and effective execution policy");
      console.log();
    });

  // Keep backward compat — bare `memi mcp` still starts the server
  mcp.action(async () => {
    await startStdioMcpServer(engine, true);
  });
}
