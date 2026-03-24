# Noche — Project Guidelines for Claude

## What is Noche?
Noche is an AI-native design intelligence engine that bridges Figma, user research, and code generation into a spec-driven system. It generates shadcn/ui components from structured specs using **Atomic Design methodology** exclusively.

Noche is the easiest hands-free way to connect to the Figma bridge — it auto-discovers and connects automatically. It has a localhost server showing all Figma pages as generated code, generates components for each design element, and supports multiple Claude instances natively via box widgets in Figma. It is built for Claude to operate autonomously and always uses the superagent skill.

## Architecture
- `src/engine/` — Core orchestrator, project detection, registry
- `src/figma/` — Figma bridge (WebSocket auto-discovery), token extraction, sticky notes
- `src/research/` — Research engine (Excel, web, stickies → insights)
- `src/specs/` — Spec types (component, page, dataviz, design, ia) and validation
- `src/codegen/` — Code generation (shadcn mapper, dataviz, pages) — outputs to atomic folders
- `src/preview/` — Localhost preview gallery (HTML + API server)
- `src/agents/` — Agent orchestrator with multi-agent support, self-healing loop, box widgets
- `src/tui/` — Terminal UI (Ink/React)
- `src/commands/` — CLI commands (commander.js)
- `skills/` — Skill definitions that guide agent behavior
- `plugin/` — Figma plugin (auto-discovers Noche on ports 9223-9232)

## Skills (Read These First)
Skills are markdown files in `skills/` that define how agents operate. **Always load relevant skills before acting.**

| Skill | File | Purpose |
|-------|------|---------|
| **SUPERPOWER** | `skills/SUPERPOWER.md` | Default operating mode — autonomous superagent |
| **/figma-use** | `skills/FIGMA_USE.md` | Foundational Figma canvas skill (all others build on this) |
| **/figma-generate-design** | `skills/FIGMA_GENERATE_DESIGN.md` | Create designs using existing components |
| **/figma-generate-library** | `skills/FIGMA_GENERATE_LIBRARY.md` | Create component library from codebase |
| **/multi-agent** | `skills/MULTI_AGENT.md` | Parallel agent orchestration with box widgets |
| **Atomic Design** | `skills/ATOMIC_DESIGN.md` | Atomic Design reference (atoms → pages) |
| **Dashboard from Research** | `skills/DASHBOARD_FROM_RESEARCH.md` | Generate dashboards from research data |

## Atomic Design (MANDATORY)
All components must specify an atomic level. This is enforced in specs and code generation:

| Level | Folder | Description |
|-------|--------|-------------|
| `atom` | `components/ui/` | Primitives — Button, Badge, Input, Label |
| `molecule` | `components/molecules/` | 2-5 atoms composed — FormField, SearchBar |
| `organism` | `components/organisms/` | Molecules + atoms with state — LoginForm, Sidebar |
| `template` | `components/templates/` | Page layout skeletons — DashboardTemplate |

Rules:
- Atoms cannot compose other specs (`composesSpecs` must be empty)
- Molecules must compose atoms (2-5 typically)
- Organisms compose molecules and/or atoms
- Templates define layout, not content
- Pages use `PageSpec`, not `ComponentSpec`

## Figma MCP Integration
Noche works with both MCP servers:

### Official Figma MCP Server
- `use_figma` — Write designs to canvas using design system
- `get_design_context` — Read design with code + screenshot + hints
- `get_screenshot` — Visual capture of any node
- `get_code_connect_map` / `add_code_connect_map` — Component ↔ code mappings
- `search_design_system` — Find components in libraries

### Figma Console MCP (Direct Plugin API)
- `figma_execute` — Run Plugin API code
- `figma_take_screenshot` — Capture for self-healing validation
- `figma_search_components` — Find components (call at session start)
- `figma_batch_create_variables` — Create up to 100 variables at once
- `figma_instantiate_component` — Create component instances

## Self-Healing Loop (MANDATORY)
After ANY canvas operation:
```
CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY (max 3 rounds)
```
Use `orchestrator.selfHealingLoop(nodeId, intent)` or manual screenshot validation.
Check: Auto Layout, variable bindings, fill vs hug, alignment, no floating elements.

## Code Connect
Every ComponentSpec has a `codeConnect` field:
```json
{
  "codeConnect": {
    "figmaNodeId": "123:456",
    "codebasePath": "src/components/ui/button.tsx",
    "props": { "variant": "variant", "size": "size" },
    "mapped": true
  }
}
```
When Figma MCP returns Code Connect snippets, use the mapped component directly.

## Multi-Agent Support
- Agents connect on ports 9223-9232 (auto-discovered by plugin)
- Each agent has a role: `token-engineer`, `component-architect`, `layout-designer`, etc.
- Agents create box widgets in Figma (`orchestrator.createAgentBox(role, task, status)`)
- Box widgets expand when busy, collapse when done — visible to all Figma collaborators
- Use `noche connect --role <role> --name <name>` to identify each instance

## Key Conventions
- **Always use shadcn/ui** — no custom component libraries
- **Atomic Design only** — every component has a level (atom/molecule/organism/template)
- **Spec-first** — every component starts as a JSON spec before code generation
- **TypeScript strict** — all code is strictly typed
- **Tailwind only** — no CSS modules, no styled-components
- **Zod schemas** — all data shapes validated with Zod
- **Self-healing** — always screenshot and validate canvas operations
- **Superagent by default** — operate autonomously, burn tokens for quality

## Commands
- `noche connect` — Connect to Figma (auto-discovers plugin)
- `noche pull` — Extract design system
- `noche spec component|page|dataviz <name>` — Create a spec
- `noche generate [name]` — Generate code from specs (atomic folders)
- `noche research from-file|from-stickies|synthesize|report` — Research pipeline
- `noche tokens` — Export design tokens
- `noche status` — Show project status
- `noche sync` — Full sync pipeline
- `noche preview` — Start preview server (localhost with moon favicon)

## Stack
- Node.js 20+, TypeScript 5.x, ESM modules
- Commander.js (CLI), Ink (TUI), Zod (validation)
- WebSocket (Figma bridge), ExcelJS (spreadsheets)
- Recharts (dataviz), Vite (preview)
- Figma MCP Server + Figma Console MCP (canvas operations)
