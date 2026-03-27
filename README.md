<p align="center">
  <img src="assets/memoire-moon.svg" alt="Memoire" width="120" height="120" />
</p>

<h1 align="center">Memoire</h1>

<p align="center">
  AI-native design intelligence engine.<br/>
  Connects to Figma. Pulls your design system. Generates production React code.<br/>
  Runs autonomously with Codex or Claude.
</p>

<p align="center">
  <a href="https://github.com/sarveshsea/m-moire/actions"><img src="https://github.com/sarveshsea/m-moire/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@sarveshsea/memoire"><img src="https://img.shields.io/npm/v/@sarveshsea/memoire" alt="npm"></a>
  <a href="https://github.com/sarveshsea/m-moire/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

---

## What it does

Point it at a Figma file. It:
1. Connects to Figma automatically (no config)
2. Pulls design tokens, components, and styles
3. Creates structured JSON specs (every component described before code)
4. Generates React + TypeScript + Tailwind code using shadcn/ui
5. Shows everything on a local preview server

All components follow **Atomic Design** -- atoms, molecules, organisms, templates, pages.

---

## Install

```bash
npm install -g @sarveshsea/memoire
```

Or run directly:

```bash
npx @sarveshsea/memoire
```

### Requirements

- Node.js 20+
- Figma Desktop App (for plugin bridge)
- Codex or Claude Code (optional -- for autonomous agent mode)

---

## Quick start

```bash
# Initialize in your project
memoire init

# Connect to Figma
memoire connect

# Pull your design system
memoire pull

# Generate code from specs
memoire generate

# Start preview server
memoire preview
```

---

## Commands

| Command | What it does |
|---------|-------------|
| `memoire init` | Initialize workspace |
| `memoire connect` | Start the Figma bridge and report Control Plane install health |
| `memoire pull` | Extract design tokens, components, styles from Figma |
| `memoire spec <type> <name>` | Create a component/page/dataviz spec |
| `memoire generate [name]` | Generate shadcn/ui code from specs |
| `memoire preview` | Start localhost preview gallery |
| `memoire sync` | Full pipeline: pull + spec + generate |
| `memoire go` | Zero-friction single command |
| `memoire compose "<intent>"` | Agent orchestrator: classify, plan, execute |
| `memoire research <sub>` | Research pipeline (Excel, stickies, synthesis) |
| `memoire tokens` | Export design tokens as CSS variables |
| `memoire status` | Show project status |
| `memoire doctor` | Health check for project, plugin bundle, bridge, and workspace |
| `memoire dashboard` | Launch monitoring dashboard |

---

## Architecture

```
src/
├── engine/    Core orchestrator, project detection, registry
├── figma/     Figma bridge (WebSocket on ports 9223-9232)
├── research/  Research engine (Excel, stickies, web)
├── specs/     Spec types + Zod validation + 56-component catalog
├── codegen/   Code generation (shadcn mapper, dataviz, pages)
├── agents/    Agent orchestrator, AI sub-agents, self-healing
├── ai/        Anthropic SDK integration
├── preview/   Localhost preview gallery
├── tui/       Terminal UI (Ink/React)
└── commands/  CLI commands (Commander.js)
```

---

## Figma plugin

The Figma plugin auto-discovers Memoire on ports 9223-9232.

1. Open Figma Desktop
2. Go to **Plugins > Development > Import plugin from manifest**
3. Select `~/.memoire/plugin/manifest.json`

### Figma Operator Console

The Widget V2 plugin is an operator console, not only a bridge debugger.

- `Jobs` shows sync, inspect, capture, and healer work as tracked job state
- `Selection` shows live node IDs, layout facts, styles, variants, and quick actions
- `System` shows bridge status, ports, latency, and buffered change-stream state

Use these commands to verify the installed bundle and bridge health:

```bash
memi connect --json
memi doctor --json
```

`memi connect --json` reports where the Control Plane manifest is being loaded from, whether the installed bundle is current, and which widget assets are present. `memi doctor --json` reports plugin bundle health, install freshness, and bridge state.

---

## Spec-first workflow

Every component starts as a JSON spec before code generation:

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

---

## License

MIT
