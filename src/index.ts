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
 *    memoire shadcn            Export and serve shadcn-native registry files
 *    memoire fix               Plan and apply safe UI quality fixes
 *    memoire registry          Discover installable registries
 *    memoire pull --rest       Pull design system via Figma REST API (no plugin)
 *    memoire design-doc <url>  Extract design system from any URL → DESIGN.md
 *    memoire extract <url>    Alias for design-doc
 *    memoire audit             WCAG 2.2 accessibility audit
 */

import { getMemoirePackageVersion } from "./utils/package-version.js";

import { existsSync, rmSync } from "fs";
import { join } from "path";

// Some command modules attach process listeners during initialization. Raise the
// limit before loading them so `memi --help` does not emit warnings.
process.setMaxListeners(50);

const packageVersion = getMemoirePackageVersion();
const cliArgs = process.argv.slice(2);

if (isGlobalVersionRequest(cliArgs)) {
  console.log(packageVersion);
  process.exit(0);
}

if (isGlobalHelpRequest(cliArgs)) {
  printFastHelp(packageVersion);
  process.exit(0);
}

const [
  { Command },
  { MemoireEngine },
  { registerConnectCommand },
  { registerPullCommand },
  { registerResearchCommand },
  { registerSpecCommand },
  { registerGenerateCommand },
  { registerPreviewCommand },
  { registerStatusCommand },
  { registerDoctorCommand },
  { registerDaemonCommand },
  { registerHeartbeatCommand },
  { registerSyncCommand },
  { registerTokensCommand },
  { registerPrototypeCommand },
  { registerInitCommand },
  { registerDashboardCommand },
  { registerIACommand },
  { registerComposeCommand },
  { registerGoCommand },
  { registerExportCommand },
  { registerNotesCommand },
  { registerWatchCommand },
  { registerListCommand },
  { registerMcpCommand },
  { registerAgentCommand },
  { registerValidateCommand },
  { registerDesignDocCommand },
  { registerSetupCommand },
  { registerAuditCommand },
  { registerDiffCommand },
  { registerAddCommand },
  { registerPublishCommand },
  { registerThemeCommand },
  { registerShadcnCommand },
  { registerFixCommand },
  { registerViewCommand },
  { registerRegistryCommand },
  { registerUpgradeCommand },
  { registerUpdateCommand },
  { registerDiagnoseCommand },
] = await Promise.all([
  import("commander"),
  import("./engine/core.js"),
  import("./commands/connect.js"),
  import("./commands/pull.js"),
  import("./commands/research.js"),
  import("./commands/spec.js"),
  import("./commands/generate.js"),
  import("./commands/preview.js"),
  import("./commands/status.js"),
  import("./commands/doctor.js"),
  import("./commands/daemon.js"),
  import("./commands/heartbeat.js"),
  import("./commands/sync.js"),
  import("./commands/tokens.js"),
  import("./commands/prototype.js"),
  import("./commands/init.js"),
  import("./commands/dashboard.js"),
  import("./commands/ia.js"),
  import("./commands/compose.js"),
  import("./commands/go.js"),
  import("./commands/export.js"),
  import("./commands/notes.js"),
  import("./commands/watch.js"),
  import("./commands/list.js"),
  import("./commands/mcp.js"),
  import("./commands/agent.js"),
  import("./commands/validate.js"),
  import("./commands/design-doc.js"),
  import("./commands/setup.js"),
  import("./commands/audit.js"),
  import("./commands/diff.js"),
  import("./commands/add.js"),
  import("./commands/publish.js"),
  import("./commands/theme.js"),
  import("./commands/shadcn.js"),
  import("./commands/fix.js"),
  import("./commands/view.js"),
  import("./commands/registry.js"),
  import("./commands/upgrade.js"),
  import("./commands/update.js"),
  import("./commands/diagnose.js"),
]);

// Catch unhandled async errors so the CLI doesn't crash silently
process.on("unhandledRejection", (reason) => {
  console.error("\n  Unexpected error:", reason instanceof Error ? reason.message : reason);
  process.exit(1);
});

const program = new Command();

program
  .name("memoire")
  .description("Diagnose and improve real web apps, then package the design system as an installable registry")
  .version(packageVersion);

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
registerShadcnCommand(program, engine);
registerFixCommand(program, engine);
registerAddCommand(program, engine);
registerRegistryCommand(program, engine);
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

function isGlobalHelpRequest(args: string[]): boolean {
  return args.length === 1 && (args[0] === "--help" || args[0] === "-h");
}

function isGlobalVersionRequest(args: string[]): boolean {
  return args.length === 1 && (args[0] === "--version" || args[0] === "-V" || args[0] === "version");
}

function printFastHelp(version: string): void {
  const lines = [
    "Usage: memoire [options] [command]",
    "",
    "Shadcn-native Design CI for Tailwind apps.",
    "Diagnose UI debt, export shadcn registries, and install them with shadcn/v0/memi.",
    "",
    "Options:",
    "  -V, --version           output the version number",
    "  -h, --help              display help for command",
    "",
    "Hero workflow:",
    "  diagnose [target]       Diagnose design debt in code or a URL",
    "  tokens                  Extract or export design tokens",
    "  publish                 Package the design system as an installable registry",
    "  shadcn <subcommand>     Export, serve, and validate shadcn-native registry files",
    "  fix <subcommand>        Plan and apply safe UI quality fixes",
    "  add <component>         Install a component from a registry",
    "  registry <subcommand>   List, search, and inspect installable registries",
    "  theme <subcommand>      Import, preview, validate, diff, apply, and publish tweakcn themes",
    "",
    "Registry and code:",
    "  init                    Initialize a Memoire workspace or registry",
    "  update                  Update installed registry components",
    "  view                    Print or open a registry component URL",
    "  design-doc              Extract a design system from any URL",
    "  generate                Generate shadcn/Tailwind code from specs",
    "  preview                 Start the local preview and registry server",
    "  status                  Show workspace status",
    "",
    "Figma, agents, and advanced:",
    "  setup                   Full guided onboarding",
    "  connect                 Start the Figma bridge",
    "  pull                    Pull design system data from Figma or REST",
    "  sync                    Pull and regenerate code",
    "  mcp                     Configure or start the MCP server",
    "  research                Run the research pipeline",
    "  notes                   Manage Memoire Notes",
    "  doctor                  Check local install health",
    "  audit                   Run accessibility audits",
    "",
    `Version: ${version}`,
    "npm: https://www.npmjs.com/package/@sarveshsea/memoire",
  ];
  console.log(lines.join("\n"));
}
