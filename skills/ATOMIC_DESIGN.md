# Atomic Design Systems — Complete Reference

## Brad Frost's Atomic Design Methodology

Atomic Design is a methodology for creating design systems composed of five distinct levels that work together to create coherent, pattern-driven user interfaces.

---

## The Five Levels

### 1. Atoms

The foundational building blocks. In UI, atoms are the smallest functional units that cannot be broken down further without losing meaning.

**Examples:**
- HTML tags: `<button>`, `<input>`, `<label>`, `<h1>`-`<h6>`
- Design tokens: colors, typography scales, spacing units, border radii
- Icons (individual SVG elements)
- Avatar images
- Loading spinners

**Properties of Atoms:**
- Have a single responsibility
- Are abstract and context-free
- Have well-defined prop interfaces
- Are the source of truth for design tokens
- Never contain layout logic

**shadcn Atoms:**
```
Button, Input, Label, Badge, Avatar, Separator, Switch,
Checkbox, Skeleton, Progress, Slider, Toggle
```

**Token Atoms (CSS Variables):**
```css
--radius: 0.5rem;
--primary: 240 5.9% 10%;
--muted: 240 4.8% 95.9%;
--font-size-sm: 0.875rem;
--spacing-4: 1rem;
```

**Rules:**
- Atoms MUST NOT import other atoms
- Atoms MUST have Storybook stories with all variant states
- Atoms MUST be accessible (ARIA attributes, keyboard support)
- Atoms MUST use design tokens, never hardcoded values

---

### 2. Molecules

Simple groups of atoms that function as a unit. A molecule is the smallest combination that does something useful.

**Examples:**
- Search field = Label + Input + Button
- Form field = Label + Input + Helper text
- Navigation item = Icon + Text + Badge
- Stat card = Label + Value + Trend indicator
- Media object = Avatar + Name + Timestamp

**Properties of Molecules:**
- Compose 2-5 atoms
- Have a single, clear purpose
- Are reusable across different contexts
- Handle the arrangement of their atoms
- May introduce minimal layout (flex, inline)

**shadcn Molecules:**
```
Form field (Label + Input + FormMessage)
DropdownMenuItem (Icon + Text + Shortcut)
TooltipTrigger (any element + Tooltip)
CardHeader (CardTitle + CardDescription)
```

**Rules:**
- Molecules SHOULD compose existing atoms, not create new primitives
- Molecules MUST NOT manage global state
- Molecules SHOULD be presentation-only (no data fetching)
- Molecules CAN have internal state (open/closed, focused, etc.)

---

### 3. Organisms

Complex, distinct sections of an interface made of groups of molecules and/or atoms. Organisms form standalone sections of a page.

**Examples:**
- Navigation bar = Logo + Nav items + Search molecule + User menu
- Hero section = Heading + Subheading + CTA buttons + Background image
- Data table = Table header + Table rows + Pagination + Bulk actions
- Sidebar = Navigation groups + User info + Settings link
- Comment thread = Comment molecules + Reply form + Load more

**Properties of Organisms:**
- Are standalone, recognizable UI sections
- May contain multiple molecules and atoms
- Can manage section-level state
- Have their own layout system
- May fetch data or connect to context

**shadcn Organisms:**
```
Sidebar (SidebarHeader + SidebarContent + SidebarFooter)
DataTable (Table + Pagination + Filtering + Column controls)
Command palette (CommandInput + CommandList + CommandGroup)
Sheet/Dialog with complex content
```

**Rules:**
- Organisms SHOULD be reusable but CAN be page-specific
- Organisms CAN manage their own data fetching
- Organisms SHOULD have clearly defined boundaries
- Organisms MUST be responsive (handle their own breakpoints)
- Organisms SHOULD document their composition in a spec

---

### 4. Templates

Page-level layouts that define the structure and placement of organisms. Templates show how organisms work together without real content.

**Examples:**
- Dashboard template = Sidebar + Header + Main content area (grid)
- Marketing page template = Hero + Features grid + Testimonials + CTA
- Settings template = Sidebar nav + Content area + Action bar
- Auth template = Centered card + Background
- Documentation template = Table of contents + Content + Navigation

**Properties of Templates:**
- Define page structure and layout grid
- Use placeholder/wireframe content
- Focus on content structure, not final content
- Are framework-specific (Next.js layouts, route groups)
- Handle responsive behavior at the page level

**shadcn Templates:**
```
SidebarProvider + SidebarInset layout
Tabs-based settings page
Dialog-heavy workflow pages
Dashboard grid layouts
```

**Rules:**
- Templates MUST NOT contain real content or data
- Templates MUST be responsive across all breakpoints
- Templates SHOULD use CSS Grid or Flexbox for layout
- Templates SHOULD match Figma page specs exactly
- Templates ARE the bridge between design and development

---

### 5. Pages

Templates filled with real, representative content. Pages are the final, highest-fidelity deliverable that users actually see.

**Examples:**
- Homepage with real copy, images, and CTAs
- User dashboard with live data from API
- Settings page with actual form fields and saved values
- Product page with real product info, pricing, reviews

**Properties of Pages:**
- Contain real content and live data
- Are the ultimate test of the design system
- Reveal edge cases (long text, missing data, error states)
- Are environment-specific (dev, staging, production)
- May include analytics, A/B tests, feature flags

**Rules:**
- Pages MUST handle all data states (loading, empty, error, populated)
- Pages MUST be tested with realistic data volumes
- Pages SHOULD match the Figma designs at high fidelity
- Pages ARE where accessibility is verified end-to-end
- Pages SHOULD have E2E tests covering critical paths

---

## Design Token Architecture

### Token Hierarchy

```
Global Tokens (primitives)
  ↓
Alias Tokens (semantic)
  ↓
Component Tokens (scoped)
```

### Global Tokens
Raw values with no semantic meaning:
```css
--blue-500: #3b82f6;
--gray-100: #f3f4f6;
--space-4: 16px;
--font-size-base: 16px;
--radius-md: 8px;
```

### Alias/Semantic Tokens
Map global tokens to semantic purposes:
```css
--color-primary: var(--blue-500);
--color-background: var(--gray-100);
--spacing-component: var(--space-4);
--text-body: var(--font-size-base);
--radius-default: var(--radius-md);
```

### Component Tokens
Scoped to specific components:
```css
--button-bg: var(--color-primary);
--button-radius: var(--radius-default);
--button-padding: var(--spacing-component);
--card-bg: var(--color-background);
--card-radius: var(--radius-default);
```

### Multi-Theme Support
```css
:root { --color-primary: var(--blue-500); }
.dark { --color-primary: var(--blue-400); }
.brand-b { --color-primary: var(--green-500); }
```

---

## Component API Design Principles

### 1. Composition Over Configuration
```tsx
// Bad: monolithic props
<Card variant="metric" showTrend showChart title="Revenue" />

// Good: composable children
<Card>
  <CardHeader>
    <CardTitle>Revenue</CardTitle>
  </CardHeader>
  <CardContent>
    <TrendIndicator />
    <SparklineChart />
  </CardContent>
</Card>
```

### 2. Prop Interface Standards
```tsx
interface ComponentProps {
  // Content
  children?: React.ReactNode;

  // Variants (use string unions, not booleans)
  variant?: "default" | "destructive" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";

  // State
  disabled?: boolean;
  loading?: boolean;

  // Style
  className?: string;
  asChild?: boolean; // Radix pattern for polymorphism

  // Events
  onAction?: () => void;
}
```

### 3. Accessibility Requirements by Level

| Level | WCAG Requirements |
|-------|-------------------|
| Atom | ARIA role, keyboard focus, color contrast, label |
| Molecule | Focus management within group, error announcements |
| Organism | Landmark roles, skip links, focus trapping (modals) |
| Template | Page title, heading hierarchy, main landmark |
| Page | Full WCAG 2.1 AA compliance |

### 4. Responsive Strategy by Level

| Level | Responsive Approach |
|-------|-------------------|
| Atom | Inherits from context (no breakpoints) |
| Molecule | May use container queries |
| Organism | Has own breakpoints, may reflow |
| Template | Defines grid breakpoints for the page |
| Page | Orchestrates everything |

---

## Design System Health Metrics

### Coverage
- **Token adoption**: % of hardcoded values vs. token references
- **Component reuse**: Instances of shared components vs. one-offs
- **Variant coverage**: % of component states that have defined variants

### Quality
- **Accessibility score**: WCAG violations per page
- **Consistency score**: Visual deviations from design specs
- **Performance**: Bundle size per component, render time

### Adoption
- **Team adoption rate**: % of new features using design system
- **Override rate**: How often developers override component styles
- **Contribution rate**: New components added per sprint

---

## Naming Conventions

### Components
```
PascalCase for components: MetricCard, UserAvatar, NavigationSidebar
camelCase for props: isLoading, onSubmit, defaultValue
kebab-case for CSS classes: text-muted-foreground, bg-primary
UPPER_SNAKE for constants: MAX_RETRY_COUNT, DEFAULT_PAGE_SIZE
```

### Tokens
```
Collection/Category/Property/Variant
color/primary/default
color/primary/hover
spacing/component/padding
typography/heading/h1/size
radius/button/default
shadow/card/default
```

### Files
```
components/
  ui/                    # shadcn primitives (atoms)
    button.tsx
    input.tsx
  molecules/
    search-field.tsx
    stat-display.tsx
  organisms/
    data-table.tsx
    navigation-bar.tsx
  templates/
    dashboard-layout.tsx
    settings-layout.tsx
```

---

## DataViz Component Patterns

### Chart Atom Hierarchy
```
ChartContainer (atom) — responsive wrapper with theme
  ├── ChartTooltip (atom) — hover info display
  ├── ChartLegend (atom) — series labels
  ├── ChartAxis (atom) — x/y axis labels
  └── ChartGrid (atom) — background grid lines

LineChart (molecule) = ChartContainer + Line + Axes + Tooltip
BarChart (molecule) = ChartContainer + Bars + Axes + Tooltip
MetricCard (molecule) = Card + Value + SparklineChart

DashboardChartSection (organism) = Grid of MetricCards + LineChart
```

### DataViz Accessibility
- Every chart MUST have an `aria-label` describing what it shows
- Every chart SHOULD have a `<details>` fallback with a data table
- Color MUST NOT be the only differentiator (use patterns, labels)
- Interactive charts MUST support keyboard navigation
- Tooltips MUST be announced to screen readers

### DataViz Responsive Rules
- Mobile: Simplify (hide legend, reduce data points, smaller height)
- Tablet: Show legend, medium detail
- Desktop: Full interactive experience with all features

---

## Integration with Figma

### Design-to-Code Mapping

| Figma Concept | Code Concept |
|---------------|-------------|
| Component | React component (atom/molecule/organism) |
| Component Set | Variant type union |
| Component Property | React prop |
| Auto Layout | Flexbox/Grid |
| Design Token | CSS Variable |
| Style | Tailwind utility class |
| Page | Route/Template |
| Section | Organism |
| Frame | Container div |

### Spec-to-Figma Parity Checklist
- [ ] All design tokens mapped to CSS variables
- [ ] All component variants implemented
- [ ] Responsive breakpoints match Figma frames
- [ ] Typography scale matches text styles
- [ ] Color palette covers all states (hover, active, disabled)
- [ ] Spacing is consistent with design token grid
- [ ] Icons match Figma icon set
- [ ] Animations match Figma prototyping specs

---

## Anti-Patterns to Avoid

1. **Premature Abstraction**: Don't create a generic `<Layout>` component before you have 3+ layouts
2. **Prop Explosion**: If a component has 15+ props, it should be composed from smaller pieces
3. **CSS Override Chains**: If you're overriding 5+ styles, the component doesn't fit — create a variant or new component
4. **Orphan Components**: Components not in the design system but used in production — audit and absorb or remove
5. **Token Drift**: Hardcoded values that should be tokens — run regular audits
6. **One-Way Sync**: Design system changes must flow Figma → Code AND Code → Figma when developers discover edge cases
7. **Ignoring States**: Every interactive component needs: default, hover, focus, active, disabled, loading, error states
