# Noche

AI-native design intelligence engine. Connects to Figma, pulls your design system, generates production React code. Runs autonomously with Claude.

---

## What does it do?

You point it at a Figma file. It:
1. Connects to Figma automatically (no config)
2. Pulls your design tokens, components, and styles
3. Creates structured specs (JSON files describing every component)
4. Generates React + TypeScript + Tailwind code using shadcn/ui
5. Shows everything on a local preview server

It does all of this using **Atomic Design** (atoms, molecules, organisms, templates, pages). Every component gets classified and organized.

---

## Requirements

Before you start, you need these installed on your computer:

| Thing | How to check | How to install |
|-------|-------------|----------------|
| **Node.js 20+** | `node --version` | https://nodejs.org |
| **npm** | `npm --version` | Comes with Node.js |
| **Figma Desktop App** | Open it | https://figma.com/downloads |
| **Claude Code** | `claude --version` | `npm install -g @anthropic-ai/claude-code` |

---

## Setup (do this once)

### Step 1: Clone and install

```bash
git clone https://github.com/sarveshsea/ark.git
cd ark
npm install
```

### Step 2: Build

```bash
npm run build
```

### Step 3: Get a Figma Personal Access Token

1. Open Figma in your browser
2. Click your avatar (top-left) > **Settings**
3. Scroll to **Personal access tokens**
4. Click **Generate new token**
5. Name it whatever you want (e.g. "noche")
6. Copy the token (you'll need it in Step 4)

### Step 4: Connect to Figma

```bash
npx noche connect
```

It will ask for your Figma token. Paste it. Done.

### Step 5: Install the Figma plugin

1. Open **Figma Desktop** (not the browser version)
2. Go to **Plugins** > **Development** > **Import plugin from manifest**
3. Navigate to the `ark/plugin/manifest.json` file you cloned
4. Click **Open**

That's it. The plugin auto-connects to Noche. You'll see "AGENT CONNECTED" in the plugin panel.

---

## How to use it

### Pull your design system from Figma

```bash
npx noche pull
```

This extracts all your colors, spacing, typography, components, and styles from the connected Figma file.

### Create a component spec

```bash
npx noche spec component MetricCard
```

This creates `specs/components/MetricCard.json`. Edit it to describe what the component does, its variants, props, and which shadcn/ui components it uses.

### Create a page spec

```bash
npx noche spec page Dashboard
```

Same thing but for full pages. Define sections, layout, and responsive behavior.

### Generate code

```bash
npx noche generate MetricCard
```

Or generate everything at once:

```bash
npx noche generate --all
```

Generated code goes to `generated/` organized by atomic level:
```
generated/
  components/
    ui/           <- atoms (Button, Badge, Input)
    molecules/    <- molecules (FormField, SearchBar)
    organisms/    <- organisms (LoginForm, Sidebar)
    templates/    <- templates (DashboardTemplate)
  pages/
    Dashboard/
  dataviz/
    RevenueChart/
```

### Preview your generated code

```bash
npx noche preview
```

Opens a localhost server showing all your specs and generated components. Look for the moon icon in your browser tab.

### Full sync (pull + generate everything)

```bash
npx noche sync
```

### Export design tokens

```bash
npx noche tokens
```

Outputs CSS variables, Tailwind config, and JSON.

### Check project status

```bash
npx noche status
```

Shows what's connected, how many specs exist, and what's been generated.

---

## Using with Claude

Noche is built for Claude to drive. Open Claude Code in the project directory and it knows what to do — the CLAUDE.md and skills/ files teach it everything.

### Basic usage

```bash
cd ark
claude
```

Then tell Claude what you want:
- "Connect to Figma and pull the design system"
- "Create specs for all the auth pages"
- "Generate the full component library"
- "Design a dashboard page on the Figma canvas"

### Skills

Claude reads these files from `skills/` to know how to operate:

| File | What it does |
|------|-------------|
| `SUPERPOWER.md` | Default mode. Makes Claude operate as an autonomous design agent |
| `FIGMA_USE.md` | How to read and write to the Figma canvas |
| `FIGMA_GENERATE_DESIGN.md` | How to create new designs using existing components |
| `FIGMA_GENERATE_LIBRARY.md` | How to build a Figma component library from code |
| `MULTI_AGENT.md` | How to run multiple Claude instances in parallel |
| `ATOMIC_DESIGN.md` | Reference for Atomic Design methodology |
| `DASHBOARD_FROM_RESEARCH.md` | How to turn research data into dashboards |

### Multi-agent mode

You can run multiple Claude instances at the same time. Each one connects on its own port (9223-9232) and shows its status as a box widget in Figma.

```bash
# Terminal 1
npx noche connect --role token-engineer --name "Token Agent"

# Terminal 2
npx noche connect --role component-architect --name "Component Agent"

# Terminal 3
npx noche connect --role layout-designer --name "Layout Agent"
```

The Figma plugin auto-discovers all of them. Each agent shows a color-coded box in Figma:
- Yellow = working
- Green = done
- Red = error

---

## Figma MCP Setup

Noche works with two MCP servers. You don't need both, but they complement each other.

### Official Figma MCP Server (recommended)

Add to your Claude MCP config:
```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "@anthropic-ai/claude-figma-mcp"]
    }
  }
}
```

This gives Claude tools like `use_figma`, `get_design_context`, and `get_screenshot`.

### Figma Console MCP (direct plugin API access)

For lower-level control (executing Plugin API code directly):
```json
{
  "mcpServers": {
    "figma-console": {
      "command": "npx",
      "args": ["-y", "figma-console-mcp"]
    }
  }
}
```

This gives `figma_execute`, `figma_take_screenshot`, `figma_search_components`, etc.

---

## All commands

| Command | What it does |
|---------|-------------|
| `noche connect` | Connect to Figma |
| `noche pull` | Pull design system from Figma |
| `noche spec component <name>` | Create a component spec |
| `noche spec page <name>` | Create a page spec |
| `noche spec dataviz <name>` | Create a data visualization spec |
| `noche generate [name]` | Generate code from specs |
| `noche generate --all` | Generate code from all specs |
| `noche tokens` | Export design tokens |
| `noche preview` | Start preview server |
| `noche sync` | Full sync (pull + regenerate) |
| `noche status` | Show project status |
| `noche research from-file <path>` | Import research from Excel/CSV |
| `noche research from-stickies` | Import research from Figma stickies |
| `noche research synthesize` | AI-synthesize research insights |
| `noche research report` | Generate research report |

---

## Project structure

```
ark/
  CLAUDE.md            <- Instructions for Claude (read this if you're curious)
  skills/              <- Skill files that teach Claude how to operate
  specs/               <- JSON specs for components, pages, dataviz
  generated/           <- Generated React + TypeScript + Tailwind code
  preview/             <- Preview server HTML files
  plugin/              <- Figma plugin (auto-connects to Noche)
  src/
    engine/            <- Core orchestrator
    figma/             <- Figma bridge (WebSocket)
    research/          <- Research engine
    specs/             <- Spec types and validation
    codegen/           <- Code generators
    agents/            <- Multi-agent orchestrator
    preview/           <- Preview server
    dashboard/         <- Dashboard server
    commands/          <- CLI commands
    tui/               <- Terminal UI
```

---

## Troubleshooting

### "Plugin not connecting"
1. Make sure Noche is running (`npx noche connect`)
2. Make sure you're using **Figma Desktop**, not browser
3. Make sure the plugin is imported from `plugin/manifest.json`
4. The plugin scans ports 9223-9232 automatically. If all are taken, close other instances

### "No design system found"
1. Run `npx noche pull` first
2. Make sure your Figma file has variables/styles/components defined
3. Check your Figma token hasn't expired

### "Generate not working"
1. You need specs first: `npx noche spec component MyComponent`
2. Edit the spec JSON to define variants, props, and shadcnBase
3. Then run `npx noche generate MyComponent`

### "Preview shows nothing"
1. Generate code first: `npx noche generate --all`
2. Then start preview: `npx noche preview`

---

## Tech stack

- TypeScript, Node.js 20+, ESM modules
- shadcn/ui + Tailwind CSS (code generation)
- Zod (spec validation)
- Commander.js (CLI)
- Ink + React (terminal UI)
- WebSocket (Figma bridge)
- Recharts (data visualization)
- Vite (preview server)

---

## License

MIT
