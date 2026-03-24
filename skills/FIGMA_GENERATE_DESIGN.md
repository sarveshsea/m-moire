# /figma-generate-design — Create Designs Using Existing Components

> Generate new designs in Figma using your existing components, variables, and design system. Produces structured, spec-compliant layouts.

## Prerequisites
- Load `/figma-use` foundational skill first
- Design system must be pulled (`noche pull`) or variables must exist in file

## When to Use
- Creating new screens/pages from specs or descriptions
- Laying out dashboards, forms, auth flows, landing pages
- Composing existing components into new arrangements
- Prototyping from research insights

## Workflow

### Step 1: Inventory Available Assets
```
figma_search_components → list all available components
figma_get_variables → list all design tokens
figma_get_design_system_summary → overview of what exists
```

### Step 2: Plan the Layout (Atomic Design)
Map the design to atomic levels:
```
Page: AuthLogin
├── Template: AuthTemplate (centered, max-w-md)
│   ├── Organism: LoginForm
│   │   ├── Molecule: FormField (email)
│   │   │   ├── Atom: Label
│   │   │   ├── Atom: Input
│   │   │   └── Atom: HelpText
│   │   ├── Molecule: FormField (password)
│   │   ├── Molecule: SocialLogin
│   │   │   ├── Atom: Button (Google)
│   │   │   ├── Atom: Separator
│   │   │   └── Atom: Button (GitHub)
│   │   └── Atom: Button (Submit)
│   └── Organism: Footer
```

### Step 3: Build Bottom-Up
1. **Atoms** — instantiate existing components or create base elements
2. **Molecules** — compose atoms with Auto Layout
3. **Organisms** — compose molecules with state considerations
4. **Template** — create page frame with responsive constraints
5. **Page** — fill template with real content

### Step 4: Apply Design Tokens
```javascript
// Bind to variables, never hardcode
node.fills = [{ type: 'SOLID', color: figma.variables.getVariableById(colorVarId) }]
// Use semantic tokens
// background → colors/surface/primary
// text → colors/text/primary
// border → colors/border/default
// spacing → spacing/4, spacing/8, spacing/16
```

### Step 5: Self-Healing Validation
```
figma_take_screenshot → capture result
Analyze:
  ✓ Elements using "fill container" not "hug contents"
  ✓ Consistent padding and spacing
  ✓ Text/inputs filling available width
  ✓ Items centered in containers
  ✓ No floating elements outside frames
  ✓ Variables bound (no raw hex values)
  ✓ Auto Layout on all containers
Fix → Re-screenshot → Verify (max 3 rounds)
```

### Step 6: Generate Spec
After the design is validated, create a Noche spec:
```
noche spec component LoginForm → creates specs/components/LoginForm.json
noche spec page AuthLogin → creates specs/pages/AuthLogin.json
```

## Layout Patterns

### Dashboard
```
Frame (VERTICAL, fill)
├── Header (HORIZONTAL, hug height, fill width)
│   ├── Logo + Title
│   └── Actions (avatar, notifications)
├── Content (HORIZONTAL, fill)
│   ├── Sidebar (VERTICAL, fixed 240px, fill height)
│   │   └── NavItems
│   └── Main (VERTICAL, fill)
│       ├── MetricsRow (HORIZONTAL, fill, gap=16)
│       │   └── MetricCard × 4 (fill, equal)
│       ├── ChartsRow (HORIZONTAL, fill, gap=16)
│       │   └── Chart × 2 (fill, equal)
│       └── TableSection (VERTICAL, fill)
```

### Auth Flow
```
Frame (VERTICAL, centered, max-480px)
├── Logo (centered)
├── Card (VERTICAL, fill width, padding=32)
│   ├── Heading + Subtext
│   ├── Form (VERTICAL, gap=16)
│   │   └── FormField × N
│   ├── Button (fill width)
│   └── Links (HORIZONTAL, centered)
```

### Marketing / Landing
```
Frame (VERTICAL, fill, gap=0)
├── Nav (HORIZONTAL, fixed, z-index)
├── Hero (VERTICAL, centered, min-h=600)
├── Features (grid 3-col, padding=80)
├── Social Proof (HORIZONTAL, scroll)
├── CTA (VERTICAL, centered, bg=primary)
└── Footer (VERTICAL, padding=40)
```

## Responsive Strategy
| Breakpoint | Width | Columns | Behavior |
|-----------|-------|---------|----------|
| Mobile | 375px | 1 | Stack vertical, full-width inputs |
| Tablet | 768px | 2 | Side-by-side where sensible |
| Desktop | 1280px | 3-4 | Full grid, sidebar visible |

Create separate frames per breakpoint or use constraints:
- `MIN_WIDTH` + `MAX_WIDTH` on content containers
- `FILL` on flexible elements
- `FIXED` only on sidebar, icons, avatars

## Anti-Patterns
- Elements using "hug contents" when they should "fill container"
- Inconsistent padding between similar elements
- Text/inputs not filling available width
- Components floating on blank canvas (always use Section/Frame)
- Raw hex colors instead of variable bindings
- Fixed widths on elements that should be responsive
- Skipping the self-healing screenshot loop
