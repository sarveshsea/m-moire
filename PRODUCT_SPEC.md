# Ark — AI-Native Design Intelligence Engine

## Vision

Ark is a spec-driven design intelligence engine that bridges Figma, research, and code generation into a single adaptive system. It connects to Figma via MCP, performs deep user research, converts qualitative data (sticky notes, spreadsheets, interviews) into structured insights, and generates production-ready components using shadcn/ui — all while maintaining a live HTML preview environment for visual consistency.

Ark learns your project, grows with you, and treats your design system as a living API.

---

## Core Principles

1. **Spec-First** — Every component, page, and data visualization starts from a structured spec before any code is generated.
2. **Research-Grounded** — Design decisions are backed by user research, not assumptions. Research flows directly into specs.
3. **Always Renderable** — Every feature builds into a live HTML environment so you can see what you're building at all times.
4. **Project-Aware** — Ark understands the project it's in, adapts to its conventions, and grows its knowledge over time.
5. **shadcn-Native** — All UI output uses shadcn/ui components. No custom component libraries. No reinventing wheels.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    ARK ENGINE                        │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Figma   │  │ Research │  │  Spec Engine     │  │
│  │  Bridge  │  │  Engine  │  │  (Component/Page │  │
│  │  (MCP)   │  │          │  │   /DataViz)      │  │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │                  │            │
│  ┌────▼──────────────▼──────────────────▼─────────┐ │
│  │              Core Intelligence                  │ │
│  │  - Project Context Engine                      │ │
│  │  - Design System Registry                      │ │
│  │  - Component Spec Store                        │ │
│  │  - Research Knowledge Base                     │ │
│  └────────────────────┬───────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼───────────────────────────┐ │
│  │            Output Layer                         │ │
│  │  - shadcn Code Generator                       │ │
│  │  - HTML Preview Environment                    │ │
│  │  - Terminal UI (TUI Dashboard)                 │ │
│  │  - Claude Command Interface                    │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Module Breakdown

### 1. Figma Bridge (MCP Transport)

Wraps figma-console-mcp's core transport (WebSocket + REST) with enhanced capabilities.

**Capabilities:**
- Connect to Figma Desktop via WebSocket bridge (ports 9223-9232)
- Extract design tokens, components, styles, variables
- Convert FigJam sticky notes → structured research data
- Pull screenshots and component images for reference
- Read FigJam boards as research artifacts
- Sync design system changes bidirectionally
- Monitor selection and document changes in real-time

**Enhanced over upstream:**
- Sticky-to-research pipeline: reads FigJam stickies, clusters by affinity, outputs structured JSON
- Image extraction: pulls component renders and stores as local assets for the HTML preview
- Design token auto-mapping to shadcn CSS variables

### 2. Research Engine

Transforms raw qualitative/quantitative data into structured, actionable research.

**Input Sources:**
- FigJam sticky notes (via Figma Bridge)
- Excel/CSV files (user research tables, survey data)
- Online research (web search + deep page fetching)
- Images (screenshots, whiteboard photos, journey maps)
- Manual input (interview notes, observation logs)

**Processing Pipeline:**
```
Raw Input → Parse → Classify → Cluster → Synthesize → Output
```

**Output Formats:**
- `research/insights.json` — Structured findings with confidence scores
- `research/personas.json` — User personas derived from data
- `research/themes.json` — Thematic analysis with supporting evidence
- `research/journey-maps.json` — User journey data
- `research/*.md` — Human-readable research reports

**Commands:**
- `ark research from-stickies <figma-url>` — Convert FigJam stickies to research
- `ark research from-file <path>` — Parse Excel/CSV research data
- `ark research web <topic>` — Deep online research with source attribution
- `ark research synthesize` — Combine all research into unified insights
- `ark research report` — Generate formatted research report

### 3. Spec Engine

Every UI element in Ark starts as a spec. Specs are structured documents that define what a component is, why it exists, and how it behaves — before any code is written.

**Spec Types:**

#### Component Spec
```json
{
  "name": "DataCard",
  "type": "component",
  "purpose": "Display a single metric with trend indicator",
  "research_backing": ["insights.json#finding-3"],
  "design_tokens": {
    "source": "figma",
    "mapped": true
  },
  "variants": ["default", "compact", "expanded"],
  "props": {
    "title": "string",
    "value": "number | string",
    "trend": "up | down | flat",
    "sparkline": "number[]?"
  },
  "shadcn_base": ["Card", "Badge"],
  "accessibility": {
    "role": "article",
    "aria_label": "required"
  },
  "dataviz": null
}
```

#### Page Spec
```json
{
  "name": "Dashboard",
  "type": "page",
  "layout": "sidebar-main",
  "sections": [
    {
      "name": "metrics-row",
      "component": "DataCard",
      "repeat": 4,
      "layout": "grid-4"
    },
    {
      "name": "main-chart",
      "component": "TimeSeriesChart",
      "layout": "full-width"
    }
  ],
  "shadcn_layout": ["SidebarProvider", "SidebarInset"],
  "responsive": {
    "mobile": "stack",
    "tablet": "grid-2",
    "desktop": "grid-4"
  }
}
```

#### DataViz Spec
```json
{
  "name": "TimeSeriesChart",
  "type": "dataviz",
  "chart_type": "line",
  "library": "recharts",
  "purpose": "Show metric trend over configurable time window",
  "data_shape": {
    "x": "date",
    "y": "number",
    "series": "string[]?"
  },
  "interactions": ["hover-tooltip", "zoom", "brush"],
  "accessibility": {
    "alt_text": "required",
    "keyboard_nav": true,
    "data_table_fallback": true
  },
  "responsive": {
    "mobile": { "height": 200, "simplify": true },
    "desktop": { "height": 400 }
  },
  "shadcn_wrapper": "Card"
}
```

### 4. Code Generator (shadcn-Native)

All generated code uses shadcn/ui. No exceptions.

**Capabilities:**
- Generate React + TypeScript + Tailwind components from specs
- Use shadcn primitives as building blocks (Card, Button, Badge, Table, etc.)
- Map Figma design tokens to Tailwind/CSS variables
- Generate page layouts using shadcn sidebar, navigation, and layout patterns
- Produce recharts-based data visualizations wrapped in shadcn Cards
- Output Storybook-compatible component stories

**Code Standards:**
- TypeScript strict mode
- Props interfaces for every component
- Tailwind classes only (no inline styles, no CSS modules)
- shadcn `cn()` utility for conditional classes
- Server Components by default, `"use client"` only when needed

### 5. HTML Preview Environment

A persistent, live-reloading HTML environment that renders everything Ark generates.

**Architecture:**
- Vite dev server running in background
- Auto-imports all generated components
- Gallery view: all components side-by-side with all variants
- Page view: full page layouts as they would appear in production
- DataViz view: all charts with sample data
- Responsive preview: mobile / tablet / desktop toggles

**File Structure:**
```
ark/
├── preview/
│   ├── index.html          # Gallery entry point
│   ├── pages/              # Page-level previews
│   ├── components/         # Component previews with all variants
│   └── dataviz/            # DataViz previews with sample data
```

### 6. Terminal UI (TUI Dashboard)

Enhanced terminal interface for monitoring and control.

**Panels:**
- **Status Bar** — Figma connection status, active file, project name
- **Activity Feed** — Real-time log of actions taken
- **Research Summary** — Current research insights at a glance
- **Component Registry** — List of all specs and their generation status
- **Preview Link** — Clickable URL to HTML preview

**Implemented with:** ink (React for CLIs) + blessed for advanced layouts

### 7. Project Context Engine

Ark understands the project it's in and adapts.

**On First Run:**
- Scans `package.json`, `tsconfig.json`, `tailwind.config.*`
- Detects framework (Next.js, Remix, Vite, etc.)
- Identifies existing shadcn components
- Maps existing design tokens
- Creates `.ark/project.json` context file

**Ongoing:**
- Tracks which specs have been generated vs. modified by hand
- Respects manual edits (never overwrites user changes)
- Suggests new components based on patterns it sees
- Updates token mappings when Figma design system changes

**Context File (.ark/project.json):**
```json
{
  "framework": "nextjs",
  "shadcn_components": ["button", "card", "sidebar", "table"],
  "design_tokens": {
    "source": "figma",
    "last_sync": "2026-03-23T10:00:00Z"
  },
  "specs": {
    "components": 12,
    "pages": 3,
    "dataviz": 5
  },
  "research": {
    "sources": 4,
    "insights": 23
  }
}
```

### 8. Claude Command Interface

Ark exposes commands that work as Claude Code slash commands.

**Commands:**
| Command | Description |
|---------|-------------|
| `ark connect` | Connect to Figma via Desktop Bridge |
| `ark pull` | Pull latest design system from Figma |
| `ark research <subcommand>` | Run research pipeline |
| `ark spec <type> <name>` | Create or edit a spec |
| `ark generate <spec>` | Generate code from spec |
| `ark preview` | Start HTML preview server |
| `ark status` | Show project status in TUI |
| `ark sync` | Full sync: Figma → specs → code → preview |
| `ark stickies <figma-url>` | Convert FigJam stickies to research |
| `ark dataviz <name>` | Create a new dataviz spec |
| `ark page <name>` | Create a new page spec |
| `ark tokens` | Export design tokens as CSS/Tailwind |

---

## Data Flow Examples

### Flow 1: FigJam Stickies → Research → Component Spec → Code

```
1. User runs: ark stickies https://figma.com/board/xyz
2. Ark reads FigJam board via MCP
3. Stickies are parsed, clustered by affinity
4. Research engine synthesizes themes and insights
5. Insights stored in research/insights.json
6. User runs: ark spec component InsightCard
7. Spec references research findings
8. User runs: ark generate InsightCard
9. shadcn Card + Badge component generated
10. HTML preview auto-updates with new component
```

### Flow 2: Excel User Research → Personas → Page Layout

```
1. User runs: ark research from-file survey-results.xlsx
2. Excel parsed into structured data table
3. Research engine extracts patterns, generates personas
4. User runs: ark spec page UserDashboard
5. Spec includes persona-driven section priorities
6. User runs: ark generate UserDashboard
7. Full page layout generated with shadcn Sidebar + content area
8. Preview shows responsive layout at all breakpoints
```

### Flow 3: Figma Design System → Token Sync → DataViz

```
1. User runs: ark connect (establishes Figma bridge)
2. User runs: ark pull (extracts design system)
3. Tokens mapped to Tailwind CSS variables
4. User runs: ark dataviz RevenueChart
5. Spec defines chart type, data shape, interactions
6. User runs: ark generate RevenueChart
7. Recharts component generated, wrapped in shadcn Card
8. Uses design tokens for colors, typography
9. Preview shows chart with sample data
```

---

## File Structure

```
ark/
├── PRODUCT_SPEC.md              # This file
├── package.json
├── tsconfig.json
├── .ark/                         # Project context (auto-generated)
│   ├── project.json              # Project detection results
│   └── figma-session.json        # Active Figma connection state
│
├── src/
│   ├── index.ts                  # CLI entry point
│   ├── engine/
│   │   ├── core.ts               # Central orchestrator
│   │   ├── project-context.ts    # Project detection & adaptation
│   │   └── registry.ts           # Component/spec registry
│   │
│   ├── figma/
│   │   ├── bridge.ts             # MCP transport (WebSocket + REST)
│   │   ├── tokens.ts             # Design token extraction & mapping
│   │   ├── stickies.ts           # FigJam sticky note parser
│   │   ├── components.ts         # Component extraction
│   │   └── images.ts             # Image/screenshot handling
│   │
│   ├── research/
│   │   ├── engine.ts             # Research processing pipeline
│   │   ├── excel-parser.ts       # Excel/CSV ingestion
│   │   ├── web-researcher.ts     # Online research with sourcing
│   │   ├── image-analyzer.ts     # Image analysis (OCR, whiteboard)
│   │   ├── synthesizer.ts        # Cross-source synthesis
│   │   └── report-generator.ts   # Formatted report output
│   │
│   ├── specs/
│   │   ├── component-spec.ts     # Component spec schema & builder
│   │   ├── page-spec.ts          # Page spec schema & builder
│   │   ├── dataviz-spec.ts       # DataViz spec schema & builder
│   │   └── validator.ts          # Spec validation
│   │
│   ├── codegen/
│   │   ├── generator.ts          # Main code generation orchestrator
│   │   ├── shadcn-mapper.ts      # Maps specs to shadcn components
│   │   ├── tailwind-tokens.ts    # Figma tokens → Tailwind config
│   │   ├── dataviz-generator.ts  # Chart/graph code generation
│   │   └── page-generator.ts     # Page layout code generation
│   │
│   ├── preview/
│   │   ├── server.ts             # Vite-based preview server
│   │   ├── gallery.ts            # Component gallery builder
│   │   └── hot-reload.ts         # Watch & rebuild pipeline
│   │
│   ├── tui/
│   │   ├── app.tsx               # Main TUI application (ink)
│   │   ├── panels/
│   │   │   ├── status.tsx        # Connection & project status
│   │   │   ├── activity.tsx      # Activity feed
│   │   │   ├── research.tsx      # Research summary
│   │   │   └── registry.tsx      # Component registry
│   │   └── theme.ts              # TUI color theme
│   │
│   └── commands/
│       ├── connect.ts            # ark connect
│       ├── pull.ts               # ark pull
│       ├── research.ts           # ark research <sub>
│       ├── spec.ts               # ark spec <type> <name>
│       ├── generate.ts           # ark generate <spec>
│       ├── preview.ts            # ark preview
│       ├── status.ts             # ark status
│       ├── sync.ts               # ark sync
│       └── tokens.ts             # ark tokens
│
├── specs/                        # User-created specs
│   ├── components/
│   ├── pages/
│   └── dataviz/
│
├── research/                     # Research output
│   ├── insights.json
│   ├── personas.json
│   ├── themes.json
│   └── reports/
│
├── preview/                      # HTML preview environment
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── gallery/
│   │   ├── pages/
│   │   └── dataviz/
│   └── public/
│       └── assets/               # Extracted Figma images
│
└── generated/                    # Generated component code
    ├── components/
    ├── pages/
    └── dataviz/
```

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / TypeScript 5.x |
| CLI Framework | Commander.js |
| TUI | Ink (React for terminals) |
| Figma Transport | WebSocket (figma-console-mcp bridge) |
| MCP SDK | @modelcontextprotocol/sdk |
| Schema Validation | Zod |
| Excel Parsing | ExcelJS |
| Web Research | fetch + Readability |
| UI Components | shadcn/ui |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| Preview Server | Vite |
| Code Generation | Template literals + AST (ts-morph) |
| Logging | pino |
| Testing | Vitest |

---

## Non-Goals (v1)

- Real-time collaborative editing in Figma (read + structured write only)
- Full Figma plugin UI (we use the existing Desktop Bridge)
- Hosting or deployment of generated code
- Support for non-React frameworks (v1 is React-only)
- AI image generation (we analyze images, we don't create them)
- Replacing Figma as a design tool

---

## Success Metrics

- **Connect to Figma** in < 30 seconds
- **Sticky-to-research** pipeline completes in < 60 seconds for 200 stickies
- **Spec-to-code** generation in < 5 seconds per component
- **Preview server** starts in < 3 seconds
- **Zero manual CSS** — all styling via Tailwind + shadcn tokens
- **Project detection** accuracy > 95% for Next.js, Vite, Remix projects
