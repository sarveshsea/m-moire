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
 */

import { Command } from "commander";
import { MemoireEngine } from "./engine/core.js";
import { registerConnectCommand } from "./commands/connect.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerResearchCommand } from "./commands/research.js";
import { registerSpecCommand } from "./commands/spec.js";
import { registerGenerateCommand } from "./commands/generate.js";
import { registerPreviewCommand } from "./commands/preview.js";
import { registerStatusCommand } from "./commands/status.js";
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

const program = new Command();

program
  .name("memoire")
  .description("AI-Native Design Intelligence Engine")
  .version("0.1.0");

// Create engine instance (shared across commands)
const engine = new MemoireEngine({
  projectRoot: process.cwd(),
  figmaToken: process.env.FIGMA_TOKEN,
  figmaFileKey: process.env.FIGMA_FILE_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
});

// Listen for engine events and print them
engine.on("event", (evt) => {
  const icons: Record<string, string> = { info: "·", warn: "!", error: "x", success: "+" };
  const icon = icons[evt.type] ?? "·";
  console.log(`  ${icon} ${evt.message}`);
});

// Register all commands
registerConnectCommand(program, engine);
registerPullCommand(program, engine);
registerResearchCommand(program, engine);
registerSpecCommand(program, engine);
registerGenerateCommand(program, engine);
registerPreviewCommand(program, engine);
registerStatusCommand(program, engine);
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

// Parse and execute
program.parse();
