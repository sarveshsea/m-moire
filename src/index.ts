#!/usr/bin/env node

/**
 * Mémoire CLI — design-quality engine for code-native web apps
 *
 * Commands:
 *    memoire diagnose          Diagnose design debt in an existing web app
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
import { getMemoirePackageVersion } from "./utils/package-version.js";

import { existsSync, rmSync } from "fs";
import { join } from "path";

// Some command modules attach process listeners during initialization. Raise the
// limit before loading them so `memi --help` does not emit warnings.
process.setMaxListeners(50);

const { registerConnectCommand } = await import("./commands/connect.js");
const { registerPullCommand } = await import("./commands/pull.js");
const { registerResearchCommand } = await import("./commands/research.js");
const { registerSpecCommand } = await import("./commands/spec.js");
const { registerGenerateCommand } = await import("./commands/generate.js");
const { registerPreviewCommand } = await import("./commands/preview.js");
const { registerStatusCommand } = await import("./commands/status.js");
const { registerDoctorCommand } = await import("./commands/doctor.js");
const { registerDaemonCommand } = await import("./commands/daemon.js");
const { registerHeartbeatCommand } = await import("./commands/heartbeat.js");
const { registerSyncCommand } = await import("./commands/sync.js");
const { registerTokensCommand } = await import("./commands/tokens.js");
const { registerPrototypeCommand } = await import("./commands/prototype.js");
const { registerInitCommand } = await import("./commands/init.js");
const { registerDashboardCommand } = await import("./commands/dashboard.js");
const { registerIACommand } = await import("./commands/ia.js");
const { registerComposeCommand } = await import("./commands/compose.js");
const { registerGoCommand } = await import("./commands/go.js");
const { registerExportCommand } = await import("./commands/export.js");
const { registerNotesCommand } = await import("./commands/notes.js");
const { registerWatchCommand } = await import("./commands/watch.js");
const { registerListCommand } = await import("./commands/list.js");
const { registerMcpCommand } = await import("./commands/mcp.js");
const { registerAgentCommand } = await import("./commands/agent.js");
const { registerValidateCommand } = await import("./commands/validate.js");
const { registerDesignDocCommand } = await import("./commands/design-doc.js");
const { registerSetupCommand } = await import("./commands/setup.js");
const { registerAuditCommand } = await import("./commands/audit.js");
const { registerDiffCommand } = await import("./commands/diff.js");
const { registerAddCommand } = await import("./commands/add.js");
const { registerPublishCommand } = await import("./commands/publish.js");
const { registerThemeCommand } = await import("./commands/theme.js");
const { registerViewCommand } = await import("./commands/view.js");
const { registerUpgradeCommand } = await import("./commands/upgrade.js");
const { registerUpdateCommand } = await import("./commands/update.js");
const { registerDiagnoseCommand } = await import("./commands/diagnose.js");

// Catch unhandled async errors so the CLI doesn't crash silently
process.on("unhandledRejection", (reason) => {
  console.error("\n  Unexpected error:", reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

const program = new Command();

program
  .name("memoire")
  .description("Diagnose and improve real web apps, then package the design system as an installable registry")
  .version(getMemoirePackageVersion());

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

// Register all commands. Put the code-native design-quality workflow first so
// `memi --help` leads with the new product surface instead of the long tail.
registerDiagnoseCommand(program, engine);
registerInitCommand(program, engine);
registerPublishCommand(program, engine);
registerThemeCommand(program, engine);
registerAddCommand(program, engine);
registerUpdateCommand(program, engine);
registerViewCommand(program, engine);
registerDesignDocCommand(program, engine);
registerMcpCommand(program, engine);
registerSetupCommand(program, engine);
registerConnectCommand(program, engine);
registerPullCommand(program, engine);
registerSyncCommand(program, engine);
registerGenerateCommand(program, engine);
registerTokensCommand(program, engine);
registerPreviewCommand(program, engine);
registerExportCommand(program, engine);
registerValidateCommand(program, engine);
registerStatusCommand(program, engine);
registerDoctorCommand(program, engine);
registerDiffCommand(program, engine);
registerGoCommand(program, engine);
registerNotesCommand(program, engine);
registerWatchCommand(program, engine);
registerAuditCommand(program, engine);
registerComposeCommand(program, engine);
registerAgentCommand(program, engine);
registerDaemonCommand(program, engine);
registerUpgradeCommand(program, engine);
registerSpecCommand(program, engine);
registerListCommand(program, engine);
registerResearchCommand(program, engine);
registerPrototypeCommand(program, engine);
registerHeartbeatCommand(program, engine);
registerDashboardCommand(program, engine);
registerIACommand(program, engine);

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
        console.log("  ▸ Mémoire — installable design system registries");
        console.log();
        console.log("  Get started:");
        console.log("    memi publish --name @you/ds --figma <url>");
        console.log("    memi theme import ./tweakcn.css --name \"Acme Theme\"");
        console.log("    memi add Button --from @you/ds");
        console.log("    memi design-doc <url>  Extract a site into DESIGN.md");
        console.log();
        console.log("  npm:  https://www.npmjs.com/package/@sarveshsea/memoire");
        console.log("  Docs: https://github.com/sarveshsea/m-moire/tree/main/docs");
        console.log("  Issues: https://github.com/sarveshsea/m-moire/issues");
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
