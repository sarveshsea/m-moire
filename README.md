<p align="center">
  <img src="assets/memoire-moon.svg" alt="Mémoire" width="200" height="200" />
</p>

<h1 align="center">Mémoire</h1>

<p align="center">
  AI-native design intelligence engine.<br/>
  Connects to Figma. Pulls your design system. Generates production React code.<br/>
  Runs autonomously with Claude.
</p>

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
git clone https://github.com/sarveshsea/memoire.git
cd memoire
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
5. Name it whatever you want (e.g. "memoire")
6. Copy the token (you'll need it in Step 4)

### Step 4: Connect to Figma

```bash
npx memi connect
```

It will ask for your Figma token. Paste it. Done.

### Step 5: Install the Figma plugin

1. Open **Figma Desktop** (not the browser version)
2. Go to **Plugins** > **Development** > **Import plugin from manifest**
3. Navigate to the `memoire/plugin/manifest.json` file you cloned
4. Click **Open**

That's it. The plugin auto-connects to Mémoire. You'll see "AGENT CONNECTED" in the plugin panel.

---

## How to use it

### Pull your design system from Figma

```bash
npx memi pull
```

This extracts all your colors, spacing, typography, components, and styles from the connected Figma file.

### Create a component spec

```bash
npx memi spec component MetricCard
```

This creates `specs/components/MetricCard.json`. Edit it to describe what the component does, its variants, props, and which shadcn/ui components it uses.

### Create a page spec

```bash
npx memi spec page Dashboard
```

Same thing but for full pages. Define sections, layout, and responsive behavior.

### Generate code

```bash
npx memi generate MetricCard
```

Or generate everything at once:

```bash
npx memi generate --all
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
npx memi preview
```

Opens a localhost server showing all your specs and generated components. Look for the moon icon in your browser tab.

### Full sync (pull + generate everything)

```bash
npx memi sync
```

### Export design tokens

```bash
npx memi tokens
```

Outputs CSS variables, Tailwind config, and JSON.

### Check project status

```bash
npx memi status
```

Shows what's connected, how many specs exist, and what's been generated.

---

## Using with Claude

Mémoire is built for Claude to drive. Open Claude Code in the project directory and it knows what to do — the CLAUDE.md and skills/ files teach it everything.

### Basic usage

```bash
cd memoire
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
| `SUPERPOWER.md` | Default mode. Autonomous design agent with MCP tool routing |
| `FIGMA_USE.md` | Foundational canvas skill — MCP decision tree, self-healing, Code Connect |
| `FIGMA_GENERATE_DESIGN.md` | Create new designs using existing components and tokens |
| `FIGMA_GENERATE_LIBRARY.md` | Build a Figma component library from code with Code Connect parity |
| `FIGMA_AUDIT.md` | Audit design system for consistency, accessibility, token adoption |
| `FIGMA_PROTOTYPE.md` | Create interactive prototypes with flows and transitions |
| `MULTI_AGENT.md` | Run multiple Claude instances in parallel with box widgets |
| `ATOMIC_DESIGN.md` | Complete Atomic Design methodology reference |
| `DASHBOARD_FROM_RESEARCH.md` | Transform research data into interactive dashboards |

### Multi-agent mode

You can run multiple Claude instances at the same time. Each one connects on its own port (9223-9232) and shows its status as a box widget in Figma.

```bash
# Terminal 1
npx memi connect --role token-engineer --name "Token Agent"

# Terminal 2
npx memi connect --role component-architect --name "Component Agent"

# Terminal 3
npx memi connect --role layout-designer --name "Layout Agent"
```

The Figma plugin auto-discovers all of them. Each agent shows a color-coded box in Figma:
- Yellow = working
- Green = done
- Red = error

---

## Figma MCP Setup

Mémoire works with two MCP servers. You don't need both, but they complement each other.

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
| `memi connect` | Connect to Figma |
| `memi pull` | Pull design system from Figma |
| `memi spec component <name>` | Create a component spec |
| `memi spec page <name>` | Create a page spec |
| `memi spec dataviz <name>` | Create a data visualization spec |
| `memi generate [name]` | Generate code from specs |
| `memi generate --all` | Generate code from all specs |
| `memi tokens` | Export design tokens |
| `memi preview` | Start preview server |
| `memi sync` | Full sync (pull + regenerate) |
| `memi status` | Show project status |
| `memi research from-file <path>` | Import research from Excel/CSV |
| `memi research from-stickies` | Import research from Figma stickies |
| `memi research synthesize` | AI-synthesize research insights |
| `memi research report` | Generate research report |
| `memi compose "<intent>"` | Agent orchestrator — natural language → plan → execute |
| `memi dashboard` | Launch the Mémoire dashboard on localhost |
| `memi ia extract <name>` | Extract information architecture from Figma |
| `memi ia show [name]` | Print IA tree to terminal |
| `memi ia validate [name]` | Cross-reference validate IA specs |

---

## Project structure

```
memoire/
  CLAUDE.md            <- Instructions for Claude (read this if you're curious)
  skills/              <- Skill files that teach Claude how to operate
  specs/               <- JSON specs for components, pages, dataviz
  generated/           <- Generated React + TypeScript + Tailwind code
  preview/             <- Preview server HTML files
  plugin/              <- Figma plugin (auto-connects to Mémoire engine)
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
1. Make sure Mémoire is running (`npx memi connect`)
2. Make sure you're using **Figma Desktop**, not browser
3. Make sure the plugin is imported from `plugin/manifest.json`
4. The plugin scans ports 9223-9232 automatically. If all are taken, close other instances

### "No design system found"
1. Run `npx memi pull` first
2. Make sure your Figma file has variables/styles/components defined
3. Check your Figma token hasn't expired

### "Generate not working"
1. You need specs first: `npx memi spec component MyComponent`
2. Edit the spec JSON to define variants, props, and shadcnBase
3. Then run `npx memi generate MyComponent`

### "Preview shows nothing"
1. Generate code first: `npx memi generate --all`
2. Then start preview: `npx memi preview`

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
