<p align="center">
  <img src="assets/authentic-logo.svg" alt="Memoire" width="120" height="120" />
</p>

<h1 align="center">Memoire</h1>

<p align="center">
  Extract any design system. Generate production React components.<br/>
  Works on any public URL — no Figma required to get started.<br/>
  MCP server for Claude Code / Cursor, or run standalone as a CLI.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@sarveshsea/memoire"><img src="https://img.shields.io/npm/v/@sarveshsea/memoire?color=black" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@sarveshsea/memoire"><img src="https://img.shields.io/npm/dw/@sarveshsea/memoire?color=black" alt="weekly downloads"></a>
  <a href="https://github.com/sarveshsea/m-moire/actions/workflows/ci.yml"><img src="https://github.com/sarveshsea/m-moire/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/sarveshsea/m-moire/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-black.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-698%20passing-black" alt="698 tests passing">
  <img src="https://img.shields.io/badge/MCP%20tools-20-black" alt="20 MCP tools">
</p>

<p align="center">
  <a href="https://memoire.cv">memoire.cv</a> &nbsp;·&nbsp;
  <a href="#mcp-server">MCP Setup</a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="Memoire demo: spec a component, generate code, configure MCP" width="800" />
</p>

---

## Try it now — no install, no Figma

```bash
npx @sarveshsea/memoire extract https://stripe.com
```

Points at any public URL. Extracts colors, typography, spacing, and component patterns. Outputs a ready-to-use `DESIGN.md` and Tailwind config sketch. No account. No tokens. 10 seconds.

---

## What it does

1. **Extracts** any website's design system via CSS parsing + AI synthesis
2. **Pulls** design tokens, components, and styles from Figma (REST or WebSocket)
3. **Creates** structured JSON specs — every component described before code
4. **Generates** React + TypeScript + Tailwind code using shadcn/ui
5. **Syncs** changes bidirectionally between Figma and code

All components follow Atomic Design — atoms, molecules, organisms, templates, pages.

---

## Install

```bash
npm install -g @sarveshsea/memoire
```

Requires Node.js 20+. Figma is optional — `memi extract` works on any public URL without it.

### Works with

| Tool | How |
|------|-----|
| **Claude Code** | MCP server — 20 tools available in every session |
| **Cursor** | MCP server — drop config into `.cursor/mcp.json` |
| **Windsurf** | MCP server — add to MCP settings |
| **Standalone** | CLI — full pipeline without any AI tool |

## Quick start

**New user? One command sets everything up:**

```bash
memi setup             # token → file → plugin → bridge → MCP config → test pull
```

Or step by step:

```bash
memi init              # scaffold workspace
memi connect           # start Figma bridge
memi pull              # extract design system (auto-falls back to REST)
memi generate          # produce React code
memi preview           # open preview dashboard
```

Or do it all at once:

```bash
memi go                # connect + pull + spec + generate + preview
```

## Uninstall

```bash
memi uninstall                          # remove ~/.memoire and .memoire/
npm uninstall -g @sarveshsea/memoire    # remove the package
```

Your specs, generated code, and .env files are never touched.

---

## Commands

### Core workflow

| Command | What it does |
|---------|-------------|
| `memi setup` | Full onboarding: token → file → plugin → bridge → MCP config → test pull |
| `memi init` | Initialize workspace with starter specs |
| `memi connect` | Start Figma bridge, report plugin health |
| `memi connect --background` | Start bridge as a background daemon |
| `memi pull` | Extract tokens, components, styles from Figma (auto-falls back to REST) |
| `memi pull --rest` | Pull via REST API — no plugin or Figma Desktop required |
| `memi pull --penpot` | Pull from Penpot via REST (needs `PENPOT_TOKEN` + `PENPOT_FILE_ID`) |
| `memi spec <type> <name>` | Create a component, page, or dataviz spec |
| `memi generate [name]` | Generate shadcn/ui code + Storybook stories from specs |
| `memi generate --preview` | Show generated code without writing files |
| `memi preview` | Start localhost preview gallery + shadcn registry server |
| `memi go` | Full pipeline in one command |
| `memi export` | Export generated code into your project |
| `memi tokens` | Export tokens as CSS / Tailwind / JSON / Style Dictionary (W3C DTCG) |
| `memi validate` | Validate specs against schemas and cross-references |

### Sync and daemon

| Command | What it does |
|---------|-------------|
| `memi sync` | Full sync: Figma + specs + code |
| `memi sync --live` | Watch for changes and sync continuously |
| `memi sync --conflicts` | Show and resolve pending sync conflicts |
| `memi watch --code` | Watch specs + generated/ for changes |
| `memi daemon start` | Start daemon with reactive pipeline |
| `memi daemon status` | Show daemon status with startup phase timings |

### Agents and orchestration

| Command | What it does |
|---------|-------------|
| `memi compose "<intent>"` | Agent orchestrator: classify, plan, execute |
| `memi agent spawn <role>` | Spawn a persistent agent worker |
| `memi agent list` | List registered agents |
| `memi agent status` | Agent registry + task queue status |

### Research

| Command | What it does |
|---------|-------------|
| `memi research from-file <path>` | Process Excel/CSV into research |
| `memi research from-stickies` | Convert FigJam stickies to insights |
| `memi research synthesize` | Synthesize themes and personas |
| `memi research report` | Generate markdown research report |

### Diagnostics

| Command | What it does |
|---------|-------------|
| `memi status` | Project status overview |
| `memi doctor` | Health check: project, plugin, bridge, workspace |
| `memi dashboard` | Launch monitoring dashboard |
| `memi extract <url>` | Extract design system from any URL → DESIGN.md (alias: design-doc) |
| `memi uninstall` | Remove all Memoire artifacts |

All commands support `--json` for structured output.

---

## MCP Server

Memoire exposes 20 tools and 3 resources over stdio. Any MCP-compatible AI tool can use it as a design layer.

**Claude Code** — add to `.mcp.json`:

```json
{
  "mcpServers": {
    "memoire": {
      "command": "memi",
      "args": ["mcp", "start"]
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json` (same format).

Or generate and install the config automatically:

```bash
memi mcp config --install              # writes to .mcp.json in project root
memi mcp config --install --global     # writes to ~/.claude/settings.json
memi mcp config --target cursor --install   # writes to .cursor/mcp.json
```

### 20 tools

| Tool | What it does |
|------|-------------|
| `pull_design_system` | Pull tokens, components, styles from Figma |
| `get_specs` / `get_spec` | List or read specs |
| `create_spec` | Create a spec from JSON |
| `generate_code` | Generate code from a spec |
| `get_tokens` / `update_token` | Read or update design tokens |
| `sync_design_tokens` | Map Figma tokens to Tailwind config |
| `capture_screenshot` | Screenshot a Figma node |
| `get_selection` | Get current Figma selection |
| `get_page_tree` | Get Figma page structure |
| `compose` | Run agent orchestrator with natural language |
| `run_audit` | Design system audit |
| `get_research` | Get research store |
| `figma_execute` | Execute Plugin API code in Figma |
| `analyze_design` | AI vision analysis of Figma screenshots |
| `measure_text` | Server-side text measurement |
| `get_ai_usage` | Session token usage and cost |
| `check_bridge_health` | Bridge latency diagnostics |
| `design_doc` | Extract design system from any URL → DESIGN.md |

### 3 resources

| Resource | What it provides |
|----------|-----------------|
| `memoire://design-system` | Current design system |
| `memoire://specs/{name}` | Individual spec |
| `memoire://project` | Project context |

---

## Penpot bridge

Pull design tokens from **Penpot** — the open-source Figma alternative.

```bash
PENPOT_TOKEN=xxx PENPOT_FILE_ID=yyy PENPOT_BASE_URL=https://design.penpot.app memi pull --penpot
```

Or set in `.env.local`:

```env
PENPOT_TOKEN=your-access-token
PENPOT_FILE_ID=your-file-id
PENPOT_BASE_URL=https://design.penpot.app  # or your self-hosted instance
```

Extracts: colors → tokens, typographies → tokens, `tokensLib` sets. Returns the same `DesignSystem` interface so all downstream commands (`generate`, `tokens`, `status`) work unchanged.

---

## Style Dictionary export

`memi tokens` now emits `tokens.style-dictionary.json` in **W3C DTCG format** (`$type` / `$value` syntax, compatible with Style Dictionary v4).

```bash
memi tokens                          # emits CSS, Tailwind, JSON, and Style Dictionary
memi tokens --format style-dictionary   # only the SD export
```

Plug into any Style Dictionary pipeline:

```js
// style-dictionary.config.js
module.exports = {
  source: ["generated/tokens/tokens.style-dictionary.json"],
  platforms: { css: { transformGroup: "css" } },
};
```

---

## Storybook story generation

`memi generate` now produces a **Storybook CSF3 story file** alongside every component:

```
generated/
  components/
    molecules/
      Button/
        Button.tsx           # component
        Button.stories.tsx   # Storybook stories
        index.ts             # barrel
```

Stories include a `Default` story plus one story per variant, with `autodocs` enabled. If you have Storybook installed:

```bash
npx storybook dev -p 6006   # stories are auto-discovered from generated/
```

---

## shadcn registry server

The preview server serves a **shadcn-compatible component registry** at `/r/`. Install any generated component directly into another project:

```bash
# In project A — start preview server
memi preview   # starts on localhost:3030

# In project B — install component
npx shadcn add http://localhost:3030/r/Button.json
```

The registry serves the component source, its npm dependencies, and its shadcn registry dependencies. No publishing required.

---

## Multi-agent orchestration

Multiple Claude instances can operate as persistent agents, each owning a role:

```bash
# Terminal 1
memi agent spawn token-engineer

# Terminal 2
memi agent spawn design-auditor

# Terminal 3
memi agent status
```

**Roles:** token-engineer, component-architect, layout-designer, dataviz-specialist, code-generator, accessibility-checker, design-auditor, research-analyst, general

The orchestrator checks for external agents first, falls back to internal execution. Tasks persist across daemon restarts.

### Batch orchestration

```bash
memi compose "create a button, card, and input component"
```

The orchestrator classifies the intent, builds a plan of sub-tasks with dependencies, and executes them with shared context.

---

## Figma plugin

The Figma plugin auto-discovers Memoire on ports 9223-9232.

### Setup

1. Open Figma Desktop
2. **Plugins > Development > Import plugin from manifest**
3. Select `~/.memoire/plugin/manifest.json`

If Figma says the main file must not be a symlink, remove the old import and re-import from the copied path.

### Operator Console

The Widget V2 plugin is an operator console with three panels:

- **Jobs** -- sync, inspect, capture, and healer work as tracked job state
- **Selection** -- live node IDs, layout facts, styles, variants, quick actions
- **System** -- bridge status, ports, latency, buffered change-stream state

```bash
memi connect --json    # plugin install health
memi doctor --json     # bundle health + bridge state
```

---

## Spec-first workflow

Every component starts as a JSON spec before code is generated:

```json
{
  "name": "MetricCard",
  "type": "component",
  "level": "molecule",
  "purpose": "Display a KPI with trend indicator",
  "shadcnBase": ["Card", "Badge"],
  "props": {
    "title": "string",
    "value": "string",
    "trend": "string?"
  },
  "variants": ["default", "compact"],
  "accessibility": {
    "role": "article",
    "ariaLabel": "Metric display card"
  }
}
```

Specs are validated with Zod schemas. Run `memi validate` to check all specs against the schema and cross-reference rules.

---

## Architecture

```
src/
  engine/     Core orchestrator, registry, sync, pipeline, text measurer
  figma/      WebSocket bridge (ports 9223-9232), canvas healer
  agents/     Intent classifier, plan builder, sub-agents, task queue
  mcp/        MCP server (20 tools, 3 resources, stdio transport)
  codegen/    shadcn/ui mapper, dataviz, pages, prototype exporter
  research/   Research engine (Excel, stickies, transcripts, web)
  specs/      Spec types, Zod schemas, 62-component catalog
  ai/         Anthropic SDK, token tracking, cost estimation
  preview/    Preview gallery, API server, dashboard
  notes/      Downloadable skill packs (loader, resolver, installer)
  commands/   20 CLI commands (Commander.js)
  plugin/     Figma plugin source (Widget V2)
```

---

## Notes (skill packs)

Notes extend what Memoire can do. Install from local paths or GitHub:

```bash
memi notes install github:user/repo
memi notes list
memi notes info <name>
memi notes remove <name>
```

Built-in categories: craft, research, connect, generate.

---

## Stack

- TypeScript strict, ESM modules
- shadcn/ui + Tailwind for all generated code
- Zod for schema validation
- Commander.js for CLI
- WebSocket for Figma bridge
- Pino for structured logging
- Vitest for testing (698 tests)

---

## License

MIT
