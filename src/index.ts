#!/usr/bin/env node

/**
 * Ark CLI — AI-Native Design Intelligence Engine
 *
 * Commands:
 *   ark connect           Connect to Figma Desktop Bridge
 *   ark pull              Pull design system from Figma
 *   ark research <sub>    Run research pipeline
 *   ark spec <type> <n>   Create or edit a spec
 *   ark generate <spec>   Generate code from spec
 *   ark preview           Start HTML preview server
 *   ark status            Show project status
 *   ark sync              Full sync: Figma → specs → code → preview
 *   ark ia <sub>           Information architecture (extract, show, validate)
 *   ark stickies <url>    Convert FigJam stickies to research
 *   ark dataviz <name>    Create a dataviz spec
 *   ark page <name>       Create a page spec
 *   ark tokens            Export design tokens
 */

import { Command } from "commander";
import { ArkEngine } from "./engine/core.js";
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

const program = new Command();

program
  .name("ark")
  .description("AI-Native Design Intelligence Engine")
  .version("0.1.0");

// Create engine instance (shared across commands)
const engine = new ArkEngine({
  projectRoot: process.cwd(),
  figmaToken: process.env.FIGMA_TOKEN,
  figmaFileKey: process.env.FIGMA_FILE_KEY,
});

// Listen for engine events and print them
engine.on("event", (evt) => {
  const icons: Record<string, string> = { info: "ℹ", warn: "⚠", error: "✖", success: "✔" };
  const icon = icons[evt.type] ?? "·";
  const time = evt.timestamp.toLocaleTimeString();
  console.log(`  ${icon} [${time}] ${evt.source}: ${evt.message}`);
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

// Parse and execute
program.parse();
