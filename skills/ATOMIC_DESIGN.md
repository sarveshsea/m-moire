---
name: atomic-design
description: Atomic Design methodology reference — atoms, molecules, organisms, templates, pages, tokens, accessibility
user-invocable: false
---

# Atomic Design Systems — Reference

Brad Frost's methodology: five levels that compose into coherent, pattern-driven UIs.

## The Five Levels

### 1. Atoms
Smallest functional units. Single responsibility, context-free, well-defined prop interfaces.

**shadcn atoms:** Button, Input, Label, Badge, Avatar, Separator, Switch, Checkbox, Skeleton, Progress, Slider, Toggle

**Rules:** Atoms must not import other atoms. Must be accessible (ARIA, keyboard). Must use design tokens, never hardcoded values.

### 2. Molecules
Simple groups of 2-5 atoms functioning as a unit (e.g., SearchField = Label + Input + Button).

**Rules:** Compose existing atoms, not new primitives. Presentation-only (no data fetching). May have internal state (open/closed, focused).

### 3. Organisms
Complex UI sections made of molecules and/or atoms (e.g., DataTable, Sidebar, NavigationBar).

**Rules:** Can manage data fetching. Must be responsive (own breakpoints). Should document composition in a spec.

### 4. Templates
Page-level layouts defining structure and organism placement. Use placeholder content, not real data.

**Rules:** Must be responsive across all breakpoints. Use CSS Grid or Flexbox. Match Figma page specs exactly.

### 5. Pages
Templates filled with real content and live data. The ultimate test of the design system.

**Rules:** Handle all data states (loading, empty, error, populated). Full WCAG 2.1 AA compliance. E2E tests on critical paths.

---

## Design Tokens

```
Global Tokens (primitives: --blue-500, --space-4)
  → Alias Tokens (semantic: --color-primary, --spacing-component)
    → Component Tokens (scoped: --button-bg, --card-radius)
```

Multi-theme: override alias tokens per theme (`:root`, `.dark`, `.brand-b`).

---

## Component API Principles

- **Composition over configuration** — use composable children, not monolithic props
- **String unions for variants** (`variant?: "default" | "destructive" | "outline"`) not booleans
- **`className` + `asChild`** — standard shadcn/Radix patterns

### Accessibility by Level
| Level | Requirements |
|-------|-------------|
| Atom | ARIA role, keyboard focus, contrast, label |
| Molecule | Focus management within group, error announcements |
| Organism | Landmark roles, skip links, focus trapping |
| Template | Page title, heading hierarchy, main landmark |
| Page | Full WCAG 2.1 AA |

### Responsive by Level
| Level | Approach |
|-------|---------|
| Atom | Inherits from context |
| Molecule | Container queries |
| Organism | Own breakpoints, reflow |
| Template | Grid breakpoints |
| Page | Orchestrates everything |

---

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `MetricCard`, `LoginForm` |
| Props | camelCase | `isLoading`, `onSubmit` |
| CSS classes | kebab-case | `text-muted-foreground` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Tokens | path/style | `color/primary/500` |

### File Structure
```
components/
  ui/            # atoms (shadcn primitives)
  molecules/     # molecule compositions
  organisms/     # complex sections
  templates/     # page layouts
```

---

## DataViz Hierarchy

```
ChartContainer (atom) → LineChart/BarChart (molecule) → DashboardChartSection (organism)
```

Every chart: `aria-label`, `<details>` data table fallback, keyboard navigation, color + pattern (not color alone).

---

## Figma ↔ Code Mapping

| Figma | Code |
|-------|------|
| Component | React component |
| Component Set | Variant type union |
| Component Property | React prop |
| Auto Layout | Flexbox/Grid |
| Design Token | CSS Variable → Tailwind class |
| Section | Organism |

---

## Anti-Patterns
1. **Premature abstraction** — wait for 3+ use cases before extracting
2. **Prop explosion** — 15+ props means decompose into smaller pieces
3. **CSS override chains** — 5+ overrides means create a variant
4. **Token drift** — hardcoded values that should be tokens
5. **Ignoring states** — every interactive component needs: default, hover, focus, active, disabled, loading, error
