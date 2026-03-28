# Mémoire — Guidelines for Codex

<!-- CRITICAL: These top rules are highest priority. Repeat at bottom for recency anchoring. -->

## Prime Directives
1. **Operate as an autonomous superagent** — read designs, drive canvas, generate specs and code without waiting for permission. Burn tokens for quality. _(Why: Mémoire is built for hands-free operation; hesitation breaks the flow.)_
2. **Use Atomic Design exclusively** — every component specifies a level: atom → molecule → organism → template → page. _(Why: enforced in specs, codegen, and Figma structure.)_
3. **Self-heal after every canvas operation** — CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY (max 3 rounds). _(Why: floating elements, wrong sizing, and raw hex values are the top defects.)_
4. **Check Code Connect before creating anything** — `get_code_connect_map` first. Use mapped components when they exist. _(Why: duplicate components are the #1 design system debt source.)_
5. **Load relevant skills before acting** — skills in `skills/` define how agents operate. Read the skill file that matches your task.

## What is Mémoire
AI-native design intelligence engine. Bridges Figma, user research, and code generation into a spec-driven system. Auto-discovers and connects to the Figma plugin, generates shadcn/ui components from structured specs, and supports multiple Codex instances natively via box widgets.

## Architecture
| Directory | Purpose |
|-----------|---------|
| `src/engine/` | Core orchestrator, project detection, registry |
| `src/figma/` | Figma bridge (WebSocket auto-discovery on ports 9223-9232), tokens, stickies |
| `src/research/` | Research engine (Excel, web, stickies → insights) |
| `src/specs/` | Spec types (component, page, dataviz, design, ia) + Zod validation |
| `src/codegen/` | Code generation (shadcn mapper, dataviz, pages) → atomic folders |
| `src/notes/` | Mémoire Notes — downloadable skill packs (loader, resolver, installer) |
| `src/preview/` | Localhost preview gallery (HTML + API server) |
| `src/agents/` | Agent orchestrator, multi-agent support, self-healing, box widgets |
| `src/tui/` | Terminal UI (Ink/React) |
| `src/commands/` | CLI commands (Commander.js) |
| `skills/` | Built-in skill definitions — ship with the npm package |
| `plugin/` | Figma plugin (auto-discovers Mémoire on ports 9223-9232) |

## Atomic Design Levels
| Level | Output Folder | Composition Rule |
|-------|--------------|-----------------|
| `atom` | `components/ui/` | Standalone primitives — `composesSpecs` must be empty |
| `molecule` | `components/molecules/` | Composes 2-5 atoms |
| `organism` | `components/organisms/` | Composes molecules and/or atoms, manages state |
| `template` | `components/templates/` | Page layout skeleton — defines structure, not content |
| `page` | Uses `PageSpec` | Template filled with real content and data |

## Stack & Conventions
- **shadcn/ui exclusively** for components _(Why: consistent API, Code Connect parity with Figma)_
- **Tailwind exclusively** for styling — no CSS modules, no styled-components
- **TypeScript strict** — all code strictly typed
- **Zod schemas** — all data shapes validated
- **Spec-first** — every component starts as a JSON spec before code generation
- Node.js 20+, TypeScript 5.x, ESM modules, Commander.js, Ink, WebSocket, ExcelJS, Recharts, Vite

## Mémoire Notes (Downloadable Skill Packs)
Notes extend what Mémoire can do. Each Note is a folder with `note.json` manifest + markdown skill files.

| Category | Purpose | Examples |
|----------|---------|---------|
| **craft** | Design craft | Mobile design, systems thinking, accessibility, animation |
| **research** | User research | Competitive analysis, data synthesis, survey design |
| **connect** | Integrations | Notion, Linear, Slack, custom API connectors |
| **generate** | Specialized codegen | React Native, Vue, SwiftUI, Flutter |

Notes are loaded at engine init and injected into agent prompts when their `activateOn` context matches the classified intent. Built-in skills (in `skills/`) are auto-adapted as Notes.

Storage: `.memoire/notes/{note-name}/note.json`

## CLI Commands
| Command | Purpose |
|---------|---------|
| `memi connect` | Connect to Figma (auto-discovers plugin) |
| `memi pull` | Extract design system from Figma |
| `memi spec component\|page\|dataviz <name>` | Create a spec |
| `memi generate [name]` | Generate code from specs → atomic folders |
| `memi research from-file\|from-stickies\|synthesize\|report` | Research pipeline |
| `memi tokens` | Export design tokens |
| `memi compose "<intent>"` | Agent orchestrator: classify → plan → execute → report |
| `memi preview` | Start localhost preview server |
| `memi dashboard` | Launch Mémoire dashboard |
| `memi ia extract\|create\|show\|validate\|list` | Information architecture tools |
| `memi watch` | Watch specs for changes, auto-regenerate code |
| `memi status` / `memi sync` | Project status / full sync pipeline |
| `memi notes install <source>` | Install a Note (local path or `github:user/repo`) |
| `memi notes list` | Show all installed Notes with status |
| `memi notes remove <name>` | Uninstall a Note |
| `memi notes create <name>` | Scaffold a new Note |
| `memi notes info <name>` | Show Note details |

## Skills
| Skill | File | When to Load |
|-------|------|-------------|
| SUPERPOWER | `skills/SUPERPOWER.md` | Every session (default autonomous mode) |
| /figma-use | `skills/FIGMA_USE.md` | Any Figma canvas operation (base for all /figma-* skills) |
| /figma-generate-design | `skills/FIGMA_GENERATE_DESIGN.md` | Creating new screens/pages from components |
| /figma-generate-library | `skills/FIGMA_GENERATE_LIBRARY.md` | Building component library from codebase |
| /figma-audit | `skills/FIGMA_AUDIT.md` | Design system quality checks |
| /figma-prototype | `skills/FIGMA_PROTOTYPE.md` | Interactive prototypes with flows |
| /multi-agent | `skills/MULTI_AGENT.md` | Parallel agent orchestration |
| Atomic Design | `skills/ATOMIC_DESIGN.md` | Component classification reference |
| Component Catalog | `skills/COMPONENT_CATALOG.md` | 56-component universal registry, spec scaffolding |
| Dashboard from Research | `skills/DASHBOARD_FROM_RESEARCH.md` | Research data → dashboards |
| /motion-video | `skills/MOTION_VIDEO_DESIGN.md` | Animation, motion, video production |
| Design System Reference | `skills/DESIGN_SYSTEM_REFERENCE.md` | Cross-industry component gallery, 110+ systems indexed |

## Changelog Protocol
After every Mémoire engine commit: add the hash and message to `CHANGELOG.md`, log architectural decisions, and keep `preview/changelog.html` in sync. This tracks Mémoire the product — user project state lives in `.memoire/` locally.

## Prime Directives (Repeated — recency anchor)
1. Operate autonomously — superagent mode by default
2. Atomic Design on every component — atom/molecule/organism/template/page
3. Self-heal after every canvas write — screenshot and validate
4. Check Code Connect first — use existing mappings
5. Load the right skill before acting
