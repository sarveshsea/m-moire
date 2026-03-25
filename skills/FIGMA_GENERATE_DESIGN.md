# /figma-generate-design — Create Designs Using Existing Components

> Generate new screens and pages in Figma using your existing components, variables, and design system. Produces structured, spec-compliant layouts with full self-healing validation. Requires /figma-use.

## Freedom Level: High

Full creative freedom within the design system. Must use existing components and variables, never raw values.

## Prerequisites
- `/figma-use` foundational skill loaded
- Design system pulled (`memi pull`) or variables exist in file
- `figma_search_components` called this session (nodeIds are session-scoped)

## Workflow

### Step 1: Check Code Connect & Inventory
```
get_code_connect_map          → what's already mapped code ↔ Figma?
figma_search_components       → what components exist?
figma_get_variables           → what tokens are available?
```

**If Code Connect mappings exist**: use those components. Don't recreate.

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
1. **Atoms** — instantiate existing or create with `use_figma`
2. **Molecules** — compose atoms with Auto Layout
3. **Organisms** — compose molecules with state considerations
4. **Template** — page frame with responsive constraints
5. **Page** — fill template with real content

**Prefer `use_figma`** for design-aware writes. It understands your design system and returns structured output.

### Step 4: Apply Design Tokens
```
All visual properties MUST bind to variables:
  background → colors/surface/primary
  text       → colors/text/primary
  border     → colors/border/default
  spacing    → spacing/4, spacing/8, spacing/16
  radius     → radius/default, radius/lg
```
Never hardcode. If a token doesn't exist, create it with `figma_batch_create_variables` first.

### Step 5: Self-Healing Validation (MANDATORY)
```
figma_take_screenshot → analyze → fix → re-screenshot → verify (max 3 rounds)

Check:
  ✓ Elements using "fill container" not "hug contents"
  ✓ Consistent padding and spacing
  ✓ Text/inputs filling available width
  ✓ Items centered in containers
  ✓ No floating elements outside frames
  ✓ Variables bound (no raw hex)
  ✓ Auto Layout on all containers
  ✓ DROP_SHADOW has blendMode: "NORMAL"
```

### Step 6: Generate Spec & Code
After the design is validated:
```
memi spec component LoginForm → specs/components/LoginForm.json
memi spec page AuthLogin → specs/pages/AuthLogin.json
memi generate LoginForm → generated/components/LoginForm/
add_code_connect_map → establish Figma ↔ code mapping
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

Use `MIN_WIDTH` + `MAX_WIDTH` on content containers. `FILL` on flexible elements. `FIXED` only on sidebar, icons, avatars.

## Anti-Patterns
- Elements using "hug contents" when they should "fill container"
- Inconsistent padding between similar elements
- Text/inputs not filling available width
- Components floating on blank canvas (always use Section/Frame)
- Raw hex colors instead of variable bindings
- Fixed widths on elements that should be responsive
- Skipping the self-healing screenshot loop
- Using `figma_execute` when `use_figma` would work better
- Creating components that already exist in Code Connect
