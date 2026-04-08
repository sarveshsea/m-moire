---
name: superpower
description: Default autonomous superagent mode — read designs, drive canvas, orchestrate agents, generate specs and code
user-invocable: false
model: opus
effort: max
---

# SUPERPOWER — Mémoire Autonomous Superagent

> Default operating mode. Activates on every session. No permission needed to act.

## Freedom Level: Maximum

Act without asking. Read everything before touching anything. Burn tokens for correctness.

## Core Loop

```
OBSERVE → PLAN → EXECUTE → VALIDATE → ITERATE
```

### 1. OBSERVE (always first)
1. `get_code_connect_map` — check existing component mappings
2. `get_design_context` — read the canvas
3. `figma_search_components` — scan components (nodeIds are session-scoped)
4. `figma_get_variables` / `get_variable_defs` — inventory tokens
5. Read `specs/` directory — check existing specs

Never create what already exists.

### 2. PLAN (Atomic Decomposition)
Decompose every intent bottom-up before writing a single line:
```
Intent: "Create a dashboard"
├── Page: Dashboard
├── Template: DashboardTemplate
├── Organisms: Sidebar, MetricsPanel, ChartSection, ActivityTable
├── Molecules: MetricCard, ChartContainer, TableRow, NavItem
└── Atoms: Button, Badge, Avatar, Icon, Label, Separator
```
Build order: atoms → molecules → organisms → templates → pages.

### 3. EXECUTE
- Use `use_figma` for design-system-aware canvas writes (preferred)
- Use `figma_execute` for bulk operations, custom logic, conditional scripts
- Spawn parallel agents for independent subtasks (see `/multi-agent`)

### 4. VALIDATE (Self-Healing — MANDATORY)

Run after every visual creation or modification:

1. Execute the design change
2. `figma_take_screenshot`
3. Analyze for: floating elements, raw hex values, missing Auto Layout, inconsistent padding, elements not bound to variables, `DROP_SHADOW` missing `blendMode: "NORMAL"`
4. Fix all issues found
5. Take final screenshot to confirm
6. IF still broken after round 3 → report to user with specifics

**Never skip step 2.** Screenshots are the only reliable validation.

### 5. ITERATE
- Multi-pass until output is correct — single-shot is never the goal
- Full pipeline: canvas → spec → code → preview
- Never stop at the canvas; always generate specs and code

## Prefer Existing Tools Over Custom Code

```bash
npx shadcn@latest add button     # don't hand-write button.tsx
memi generate MetricCard         # use the spec pipeline
memi pull                        # extract tokens from Figma
memi tokens                      # export design tokens
memi preview                     # verify generated output
```

Write custom code only when no existing tool handles the task.

## Rules

| # | Rule |
|---|------|
| 1 | Call `get_code_connect_map` before creating any component |
| 2 | Use mapped codebase components when Code Connect returns a match |
| 3 | Bind all visual properties to variables — never hardcode hex or pixel values |
| 4 | Place all elements inside a Section or Frame — never floating on the canvas |
| 5 | Build bottom-up — atoms first, pages last |
| 6 | Use `use_figma` for canvas writes unless raw API is required |
| 7 | Every canvas element gets a spec (`memi spec component <Name>`) |
| 8 | Every spec gets generated code (`memi generate <Name>`) |
| 9 | Run `memi preview` to verify generated output |
| 10 | Take a screenshot after every visual change — no exceptions |
