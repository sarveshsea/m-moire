#!/usr/bin/env node

/**
 * Mémoire CLI — AI-Native Design Intelligence Engine
 *
 * Commands:
 * *   memi connect           Connect to Figma Desktop Bridge
 * *   memi pull              Pull design system from Figma
 * *   memi research <sub>    Run research pipeline
 *   memi spec <type> <n>   Create or edit a spec
 *   memi generate <spec>   Generate code from spec
 *   memi preview           Start HTML preview server
 *   memi status            Show project status
 *   memi sync              Full sync: Figma → specs → code → preview
 *   memi go                Full pipeline: connect → pull → auto-spec → generate → preview
 *   memi export            Export generated code into your project
 * *   memi ia <sub>           Information architecture (extract, show, validate)
 * *   memi stickies <url>    Convert FigJam stickies to research
 * *   memi dataviz <name>    Create a dataviz spec
 * *   memi page <name>       Create a page spec
 * *   memi tokens            Export design tokens
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
import { registerDaemonCommand } from "./commands/daemon.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerHeartbeatCommand } from "./commands/heartbeat.js";

const program = new Command();

program
  .name("memi")
  .description("AI-Native Design Intelligence Engine")
  .version("0.1.0");

// Create engine instance (shared across commands)
const engine = new MemoireEngine({
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
registerDaemonCommand(program, engine);
registerDoctorCommand(program, engine);
registerHeartbeatCommand(program, engine);

// Parse and execute
program.parse();
