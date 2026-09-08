---
name: dashboard-from-research
description: Transform research data (Excel, CSV, stickies) into structured insights and interactive dashboards
user-invocable: false
model: opus
effort: max
context:
  - skills/ATOMIC_DESIGN.md
---

# Dashboard from Research — Research Data to Interactive Dashboard

## 2.8 beta scope

This is optional reference guidance, not an automatic Memi workflow. Figma tool names and canvas examples require an installed external provider and the host's authorization; locked Memi MCP does not expose them. Deferred CLI commands remain unavailable even with capability grants. For supported local context, use `memi --profile locked agent brief . --json`; for static frontend inspection, use `memi --profile locked diagnose . --no-write --json --fail-on none`. Neither command certifies the external workflow below.

> Transform research data (Excel, CSV, FigJam stickies, markdown) into structured insights and interactive dashboards with dataviz components. Provides reference guidance for an authorized host workflow.

## Freedom Level: High

Work within the host's authorized research and implementation scope. Must back every design decision with the research data.

## When to Use
- User has research data (Excel, CSV, survey results, interview notes)
- FigJam board has stickies from workshops or brainstorming
- Need to create a dashboard that visualizes research findings
- Turning qualitative/quantitative data into actionable UI

## Workflow

### Step 1: Review Authorized Research

Use user-provided research or an authorized host connector. Identify provenance, scope, missing data, and sensitive content before interpretation. Do not assume permission to persist research or contact external services.

### Step 2: Analyze & Categorize
Classify insights into dashboard-friendly categories:
```
Quantitative → KPI cards, charts, trend lines
  - Metrics: numeric values with labels
  - Time series: data over time → line/area charts
  - Comparisons: A vs B → bar charts
  - Distributions: spread → histograms

Qualitative → Text summaries, tag clouds, quotes
  - Themes: grouped findings → category cards
  - Quotes: user verbatims → quote components
  - Sentiment: positive/negative → sentiment indicators

Relational → Flow diagrams, matrices, maps
  - User journeys: step sequences → flow components
  - Relationships: connections → network graphs
  - Hierarchies: nested structures → tree views
```

### Step 3: Describe Component Contracts

Describe KPI cards, time-series charts, comparisons, and page sections with their data shape, states, and source attribution. Memi's `spec component`, `spec dataviz`, and `spec page` commands are unavailable in this beta.

### Step 4: Implement and Verify

Use the repository's authorized coding, preview, and test workflow. The historical automatic research-to-spec-to-code pipeline is not available through Memi 2.8 beta. Inspect source context with `memi --profile locked agent brief . --json` and static frontend findings with `memi --profile locked diagnose . --no-write --json --fail-on none`; these do not verify research conclusions or rendered charts.

### Step 5: Design in Figma (Optional)
If the dashboard should also exist in Figma:
```
1. use_figma → create the dashboard layout using components
2. figma_take_screenshot → validate
3. Self-healing loop (max 3 rounds)
4. add_code_connect_map → establish design ↔ code parity
```

## Dashboard Layout Pattern
```
Frame (VERTICAL, fill, 1280×900)
├── Header (HORIZONTAL, hug height, fill width, padding=24)
│   ├── Title: "Research Dashboard"
│   ├── Subtitle: research date range
│   └── Actions: export, filter, refresh
├── Metrics Row (HORIZONTAL, fill, gap=16, padding=24)
│   └── MetricCard × 4-6 (fill, equal width)
├── Charts Section (HORIZONTAL, fill, gap=16, padding=0-24)
│   ├── Primary Chart (2/3 width)
│   └── Secondary Chart (1/3 width)
├── Insights Grid (grid 2-3 col, gap=16, padding=24)
│   └── InsightCard × N
└── Detail Section (VERTICAL, fill, padding=24)
    └── DataTable or QuotesList
```

## Data → Chart Type Decision
| Data Pattern | Chart Type | Recharts Component |
|-------------|-----------|-------------------|
| Single value + trend | KPI Card | Custom (Card + Badge) |
| Values over time | Area/Line | `<AreaChart>` / `<LineChart>` |
| Category comparison | Bar | `<BarChart>` |
| Part of whole | Pie/Donut | `<PieChart>` |
| Two dimensions | Scatter | `<ScatterChart>` |
| Distribution | Histogram | `<BarChart>` (binned) |
| Multiple metrics | Composed | `<ComposedChart>` |

## Anti-Patterns
- Creating charts without understanding the data first
- Using complex visualizations when a simple KPI card suffices
- Not including data source attribution
- Hardcoding sample data instead of connecting to research output
- Skipping the research synthesis step (going straight to UI)
- Not generating specs before code (violates spec-first)
