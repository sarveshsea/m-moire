# Dashboard from Research — Research Data to Interactive Dashboard

> Transform research data (Excel, CSV, FigJam stickies, markdown) into structured insights and interactive dashboards with dataviz components. Chains research pipeline → specs → code generation → preview.

## Freedom Level: High

Full autonomy over data interpretation, visualization choices, and dashboard layout. Must back every design decision with the research data.

## When to Use
- User has research data (Excel, CSV, survey results, interview notes)
- FigJam board has stickies from workshops or brainstorming
- Need to create a dashboard that visualizes research findings
- Turning qualitative/quantitative data into actionable UI

## Workflow

### Step 1: Ingest Research Data
```
memi research from-file <path>     → Excel/CSV parsing
memi research from-stickies        → FigJam sticky notes
memi research synthesize           → Combine all sources
```

Output: `research/insights.json` with structured findings.

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

### Step 3: Create Specs (Atomic Design)
For each visualization need, create the right spec type:

```
KPI metric → memi spec component MetricCard (molecule)
  props: { title, value, change, trend, icon }

Trend chart → memi spec dataviz TrendChart
  chartType: "area" | "line"
  dataShape: { x: "date", y: "value", series: [...] }

Comparison → memi spec dataviz ComparisonChart
  chartType: "bar"
  dataShape: { category: "string", values: [...] }

The dashboard page → memi spec page ResearchDashboard
  layout: "dashboard"
  sections: [metrics-row, charts-row, insights-section, quotes]
```

### Step 4: Generate Code
```
memi generate                      → all specs → React + Tailwind
memi preview                       → localhost preview server
```

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
