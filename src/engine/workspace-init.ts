/**
 * Workspace Init — Creates the initial .memoire/ workspace with
 * structured markdown config files (SOUL.md, AGENTS.md, TOOLS.md, HEARTBEAT.md).
 *
 * Inspired by OpenClaw's markdown-as-config approach where markdown files
 * serve as both human-readable documentation and machine-parsed configuration.
 */

import { writeFile, mkdir, readFile, access } from "fs/promises";
import { join } from "path";
import { createLogger } from "./logger.js";

const log = createLogger("workspace");

export interface WorkspaceFiles {
  soul: string;
  agents: string;
  tools: string;
  heartbeat: string;
}

// ---------------------------------------------------------------------------
// Default file contents
// ---------------------------------------------------------------------------

const DEFAULT_SOUL = `# Design Soul

## Voice
- Minimal, precise, monospace-native
- Technical but warm -- like good documentation
- No marketing speak, no filler

## Visual Language
- Dark-first (bg: #111113, fg: #ffffff)
- Monospace typography as primary
- Muted accents, high contrast text
- 4px radius, tight spacing
- No decorative elements -- every pixel earns its place

## Interaction Principles
- Immediate feedback on all actions
- Keyboard-first, mouse-friendly
- Progressive disclosure -- show less, reveal on demand
- Respect prefers-reduced-motion

## Anti-Patterns
- No gradients unless data-driven
- No rounded-full on containers
- No color without semantic meaning
- No animation longer than 400ms for UI (cinematic excepted)
`;

const DEFAULT_AGENTS = `# Agent Roles

## token-engineer
Owns design tokens. Creates, updates, validates color/spacing/typography/radius/shadow tokens.
Pushes to Figma variables. Ensures token coverage across all categories.

## component-architect
Designs component specs. Enforces Atomic Design (atoms/molecules/organisms/templates).
Maps to shadcn/ui base components. Defines props, variants, accessibility.

## layout-designer
Owns page layouts and responsive behavior. Creates PageSpecs with sections,
grid systems, and breakpoint definitions.

## motion-designer
Specifies animations and transitions. Creates motion tokens, component state
transitions, entrance/exit animations. Respects prefers-reduced-motion.

## dataviz-specialist
Designs data visualizations. Selects chart types, defines data shapes,
creates DataVizSpecs with Recharts configurations.
`;

const DEFAULT_TOOLS = `# Tool Permissions

## Safe (all agents)
- Read specs, tokens, design system
- Analyze and report
- Generate code to output/

## Gated (requires confirmation)
- Write/modify specs
- Update design tokens
- Push to Figma
- Delete files

## Blocked
- Modify .memoire/SOUL.md (human-only)
- Delete specs without backup
- Force-push to Figma without screenshot validation
`;

const DEFAULT_HEARTBEAT = `# Heartbeat Tasks

Tasks checked automatically by \`memi heartbeat --watch\`.

## Every Cycle (30min default)
- [ ] All specs have \`purpose\` field
- [ ] No atoms composing other specs
- [ ] All component specs have shadcnBase
- [ ] Token coverage: color, spacing, typography, radius exist
- [ ] No specs modified since last generation (drift check)

## Daily
- [ ] Design system backup to .memoire/backups/
- [ ] Spec count report logged

## On Figma Connect
- [ ] Pull latest tokens
- [ ] Diff local vs Figma state
- [ ] Flag unbound color fills
`;

// ---------------------------------------------------------------------------
// File definitions
// ---------------------------------------------------------------------------

interface WorkspaceFileEntry {
  key: keyof WorkspaceFiles;
  filename: string;
  content: string;
}

const WORKSPACE_FILES: WorkspaceFileEntry[] = [
  { key: "soul", filename: "SOUL.md", content: DEFAULT_SOUL },
  { key: "agents", filename: "AGENTS.md", content: DEFAULT_AGENTS },
  { key: "tools", filename: "TOOLS.md", content: DEFAULT_TOOLS },
  { key: "heartbeat", filename: "HEARTBEAT.md", content: DEFAULT_HEARTBEAT },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Check whether a file exists on disk.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the .memoire/ workspace with markdown config files.
 * Only creates files that don't already exist (never overwrites).
 */
export async function initWorkspace(memoireDir: string): Promise<WorkspaceFiles> {
  // 1. Ensure .memoire/ directory exists
  await mkdir(memoireDir, { recursive: true });

  const paths: Record<string, string> = {};
  let createdCount = 0;
  let skippedCount = 0;

  // 2-4. For each file, check existence and create if missing
  for (const entry of WORKSPACE_FILES) {
    const filePath = join(memoireDir, entry.filename);
    paths[entry.key] = filePath;

    const exists = await fileExists(filePath);

    if (exists) {
      log.info(`Skipped ${entry.filename} (already exists)`);
      skippedCount++;
    } else {
      await writeFile(filePath, entry.content, "utf-8");
      log.info(`Created ${entry.filename}`);
      createdCount++;
    }
  }

  // 6. Summary log
  log.info(
    `Workspace init complete: ${createdCount} created, ${skippedCount} skipped`
  );

  // 5. Return paths of all workspace files
  return {
    soul: paths["soul"],
    agents: paths["agents"],
    tools: paths["tools"],
    heartbeat: paths["heartbeat"],
  };
}

/**
 * Read and return the SOUL.md content.
 * Used by agents to understand the design language and personality.
 */
export async function readSoul(memoireDir: string): Promise<string> {
  try {
    return await readFile(join(memoireDir, "SOUL.md"), "utf-8");
  } catch {
    return "";
  }
}

/**
 * Read and return the AGENTS.md content.
 * Used to understand available agent roles and their responsibilities.
 */
export async function readAgentRoles(memoireDir: string): Promise<string> {
  try {
    return await readFile(join(memoireDir, "AGENTS.md"), "utf-8");
  } catch {
    return "";
  }
}
