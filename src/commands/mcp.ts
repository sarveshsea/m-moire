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
      const args = useGlobal ? ["mcp", "start"] : ["@sarveshsea/memoire", "mcp", "start"];

      const serverConfig = {
        command: cmd,
        args,
        env: {
          FIGMA_TOKEN: "${FIGMA_TOKEN}",
          FIGMA_FILE_KEY: "${FIGMA_FILE_KEY}",
        },
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
          console.log(chalk.dim("  Make sure FIGMA_TOKEN and FIGMA_FILE_KEY are in your environment."));
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
          console.log("  Or install automatically:");
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
          console.log("  Or install automatically:");
          console.log("    memi mcp config --install --target cursor");
          console.log();
          break;
        }
        default: {
          console.log(JSON.stringify({ mcpServers: { memoire: serverConfig } }, null, 2));
          break;
        }
      }

      console.log(ui.section("AVAILABLE TOOLS (20)"));
      console.log();
      const tools = [
        ["pull_design_system", "Pull tokens, components, styles from Figma"],
        ["get_specs / get_spec", "List or read component/page/dataviz specs"],
        ["create_spec", "Create or update a spec (JSON)"],
        ["generate_code", "Generate code from a spec"],
        ["get_tokens / update_token", "Read or modify design tokens"],
        ["sync_design_tokens", "Map Figma tokens → Tailwind config"],
        ["capture_screenshot", "Screenshot a Figma node (PNG/SVG)"],
        ["get_selection", "Current Figma selection with properties"],
        ["get_page_tree", "Figma page structure (pages, frames)"],
        ["compose", "Natural language design intent orchestration"],
        ["run_audit", "Design system quality audit"],
        ["get_research", "Research store (insights, personas)"],
        ["figma_execute", "Run Plugin API code in Figma sandbox"],
        ["analyze_design", "AI vision analysis of Figma screenshots"],
        ["measure_text", "Server-side text measurement"],
        ["get_ai_usage", "Session token usage and cost"],
        ["check_bridge_health", "Bridge latency diagnostics"],
        ["design_doc", "Extract design system from any URL → DESIGN.md"],
      ];
      for (const [name, desc] of tools) {
        console.log(`  ${name.padEnd(28)} ${ui.dim(desc)}`);
      }
      console.log();
      console.log(ui.section("RESOURCES (3)"));
      console.log();
      console.log("  memoire://design-system     Current tokens, components, styles");
      console.log("  memoire://specs/{name}       Individual spec by name");
      console.log("  memoire://project            Project context and framework info");
      console.log();
    });

  // Keep backward compat — bare `memi mcp` still starts the server
  mcp.action(async () => {
    await startStdioMcpServer(engine, true);
  });
}
