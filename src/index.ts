#!/usr/bin/env node

/**
 * Noche CLI — AI-Native Design Intelligence Engine
 *
 * Commands:
 * *   noche connect           Connect to Figma Desktop Bridge
 * *   noche pull              Pull design system from Figma
 * *   noche research <sub>    Run research pipeline
 *   noche spec <type> <n>   Create or edit a spec
 *   noche generate <spec>   Generate code from spec
 *   noche preview           Start HTML preview server
 *   noche status            Show project status
 *   noche sync              Full sync: Figma → specs → code → preview
 *   noche go                Full pipeline: connect → pull → auto-spec → generate → preview
 *   noche export            Export generated code into your project
 * *   noche ia <sub>           Information architecture (extract, show, validate)
 * *   noche stickies <url>    Convert FigJam stickies to research
 * *   noche dataviz <name>    Create a dataviz spec
 * *   noche page <name>       Create a page spec
 * *   noche tokens            Export design tokens
 */

import { Command } from "commander";
import { NocheEngine } from "./engine/core.js";
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

const program = new Command();

program
  .name("noche")
  .description("AI-Native Design Intelligence Engine")
  .version("0.1.0");

// Create engine instance (shared across commands)
const engine = new NocheEngine({
  projectRoot: process.cwd(),
  figmaToken: process.env.FIGMA_TOKEN,
  figmaFileKey: process.env.FIGMA_FILE_KEY,
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

// Parse and execute
program.parse();
