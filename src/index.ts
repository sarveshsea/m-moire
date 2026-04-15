#!/usr/bin/env node

/**
 * Mémoire CLI — AI-Native Design Intelligence Engine
 *
 * Commands:
 *    memoire connect           Connect to Figma Desktop Bridge
 *    memoire pull              Pull design system from Figma
 *    memoire research <sub>    Run research pipeline
 *    memoire spec <type> <n>   Create or edit a spec
 *    memoire generate <spec>   Generate code from spec
 *    memoire preview           Start HTML preview server
 *    memoire status            Show project status
 *    memoire sync              Full sync: Figma → specs → code → preview
 *    memoire go                Full pipeline: connect → pull → auto-spec → generate → preview
 *    memoire export            Export generated code into your project
 *    memoire ia <sub>           Information architecture (extract, show, validate)
 *    memoire stickies <url>    Convert FigJam stickies to research
 *    memoire dataviz <name>    Create a dataviz spec
 *    memoire page <name>       Create a page spec
 *    memoire tokens            Export design tokens
 *    memoire pull --rest       Pull design system via Figma REST API (no plugin)
 *    memoire design-doc <url>  Extract design system from any URL → DESIGN.md
 *    memoire extract <url>    Alias for design-doc
 *    memoire audit             WCAG 2.2 accessibility audit
 */

import { Command } from "commander";
import { MemoireEngine } from "./engine/core.js";

// Commands each register process exit listeners — raise the limit to prevent MaxListenersExceededWarning
import { registerConnectCommand } from "./commands/connect.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerResearchCommand } from "./commands/research.js";
import { registerSpecCommand } from "./commands/spec.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerPreviewCommand } from "./commands/preview.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerDaemonCommand } from "./commands/daemon.js";
import { registerHeartbeatCommand } from "./commands/heartbeat.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerTokensCommand } from "./commands/tokens.js";
import { registerPrototypeCommand } from "./commands/prototype.js";
import { registerInitCommand } from "./commands/init.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerIACommand } from "./commands/ia.js";
import { registerComposeCommand } from "./commands/compose.js";
import { registerGoCommand } from "./commands/go.js";
import { registerExportCommand } from "./commands/export.js";
import { registerNotesCommand } from "./commands/notes.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerListCommand } from "./commands/list.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerValidateCommand } from "./commands/validate.js";
import { registerDesignDocCommand } from "./commands/design-doc.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerAuditCommand } from "./commands/audit.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerAddCommand } from "./commands/add.js";
import { registerPublishCommand } from "./commands/publish.js";
import { registerViewCommand } from "./commands/view.js";
import { registerUpgradeCommand } from "./commands/upgrade.js";
import { registerUpdateCommand } from "./commands/update.js";
import { existsSync, rmSync } from "fs";
import { join } from "path";

process.setMaxListeners(50); // 28+ commands each attach process exit handlers

// Catch unhandled async errors so the CLI doesn't crash silently
process.on("unhandledRejection", (reason) => {
  console.error("\n  Unexpected error:", reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

const program = new Command();

program
  .name("memoire")
  .description("AI-Native Design Intelligence Engine")
  .version(
    (await import("../package.json", { with: { type: "json" } })).default.version
  );

// Create engine instance (shared across commands)
const engine = new MemoireEngine({
  projectRoot: process.cwd(),
  figmaToken: process.env.FIGMA_TOKEN,
  figmaFileKey: process.env.FIGMA_FILE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

const jsonOutputRequested = process.argv.includes("--json");
const mcpMode = process.argv.includes("mcp");

// Listen for engine events and print them (suppressed in MCP mode — stdio is reserved for JSON-RPC)
if (!mcpMode) {
  engine.on("event", (evt) => {
    if (jsonOutputRequested) return;
    const icons: Record<string, string> = { info: "·", warn: "!", error: "x", success: "+" };
    const icon = icons[evt.type] ?? "·";
    console.log(`  ${icon} ${evt.message}`);
  });
}

// Register all commands
registerConnectCommand(program, engine);
registerPullCommand(program, engine);
registerResearchCommand(program, engine);
registerSpecCommand(program, engine);
registerGenerateCommand(program, engine);
registerPreviewCommand(program, engine);
registerStatusCommand(program, engine);
registerDoctorCommand(program, engine);
registerDaemonCommand(program, engine);
registerHeartbeatCommand(program, engine);
registerSyncCommand(program, engine);
registerTokensCommand(program, engine);
registerPrototypeCommand(program, engine);
registerInitCommand(program, engine);
registerDashboardCommand(program, engine);
registerIACommand(program, engine);
registerComposeCommand(program, engine);
registerGoCommand(program, engine);
registerExportCommand(program, engine);
registerNotesCommand(program, engine);
registerWatchCommand(program, engine);
registerListCommand(program, engine);
registerMcpCommand(program, engine);
registerAgentCommand(program, engine);
registerValidateCommand(program, engine);
registerDesignDocCommand(program, engine);
registerSetupCommand(program, engine);
registerAuditCommand(program, engine);
registerDiffCommand(program, engine);
registerAddCommand(program, engine);
registerPublishCommand(program, engine);
registerViewCommand(program, engine);
registerUpgradeCommand(program, engine);
registerUpdateCommand(program, engine);

// Uninstall command — removes all Mémoire artifacts
program
  .command("uninstall")
  .description("Remove all Mémoire artifacts from this machine")
  .action(() => {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    const globalDir = join(home, ".memoire");
    const localDir = join(process.cwd(), ".memoire");

    if (home && existsSync(globalDir)) {
      rmSync(globalDir, { recursive: true, force: true });
      console.log(`  - Removed ${globalDir}`);
    }
    if (existsSync(localDir)) {
      rmSync(localDir, { recursive: true, force: true });
      console.log(`  - Removed ${localDir}`);
    }

    console.log();
    console.log("  To fully uninstall:");
    console.log("    npm uninstall -g @sarveshsea/memoire");
    console.log();
  });

// First-run welcome — standalone-binary users who run `memi` with no args.
// Shown once per $HOME, gated by a stamp file so it never nags.
if (process.argv.length === 2) {
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    if (home) {
      const { writeFileSync, mkdirSync } = await import("node:fs");
      const stamp = join(home, ".memoire", ".first-run-done");
      if (!existsSync(stamp)) {
        console.log();
        console.log("  ▸ Mémoire — AI-native design intelligence");
        console.log();
        console.log("  Get started:");
        console.log("    memi connect           Pair with the Figma plugin");
        console.log("    memi design-doc <url>  Extract any site's design system");
        console.log("    memi --help            All commands");
        console.log();
        console.log("  Docs: https://memoire.cv   Issues: https://github.com/sarveshsea/m-moire/issues");
        console.log();
        mkdirSync(join(home, ".memoire"), { recursive: true });
        writeFileSync(stamp, new Date().toISOString());
      }
    }
  } catch {
    // Never block the CLI on welcome-banner issues
  }
}

// Parse and execute
program.parse();
