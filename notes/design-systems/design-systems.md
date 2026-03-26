---
skill: Design Systems
category: craft
activateOn: component-creation
freedomLevel: high
description: >
  Deep knowledge base for design system architecture, token taxonomy,
  component API design, versioning strategy, governance, multi-brand theming,
  cross-platform consistency, and adoption measurement. Equips an AI agent
  to build, extend, and maintain production-grade design systems.
version: 1.0.0
---

# Design Systems — Architecture & Governance

## Quick Reference — Decision Matrix

| Task | Start Here | Key Principle |
|------|-----------|---------------|
| New primitive (button, input, badge) | Token audit -> Props design -> Figma component -> Code component | Atom level. Zero composition dependencies. |
| New composed component (card, dialog) | Inventory existing atoms -> Slot architecture -> Compound pattern | Molecule/organism. Compose, never duplicate. |
| Adding a variant to existing component | Check token coverage -> Add variant token -> Extend props union | Non-breaking. Default preserves current behavior. |
| Renaming a token | RFC required -> Deprecation alias -> Codemod -> 2-version grace | Breaking change. Never rename silently. |
| New brand/theme | Fork base token set -> Override only divergent values -> Test contrast | Composition over duplication. |
| Dark mode support | Add mode to existing tokens -> Test all semantic mappings | Mode, not theme. Same semantic names. |
| Cross-platform token sync | tokens.json source -> Style Dictionary transforms -> Platform outputs | Single source, multiple targets. |
| Component deprecation | Announce -> Provide migration path -> Warn 2 majors -> Remove | Never remove without replacement. |
| Performance audit | Bundle analysis -> Tree-shaking check -> Runtime profiling | Each component < 10KB gzipped. |
| Accessibility audit | axe-core automated -> Manual keyboard -> Screen reader testing | WCAG AA minimum, AAA for text contrast. |

---

## 1. Token Architecture

Tokens are the atomic values of a design system. Every visual decision — color,
spacing, type size, shadow, motion — is expressed as a token. Raw values appear
exactly once in the system; everything else is a reference.

### 1.1 Token Taxonomy — Three Tiers

The three-tier model prevents the two failure modes of token systems: too flat
(hundreds of unrelated values) and too deep (six levels of indirection nobody
can trace).

#### Tier 1: Global Tokens (Raw Values)

Global tokens are the palette. They hold literal values and are never consumed
directly by components. Think of them as the periodic table — elements, not
molecules.

```json
{
  "colors": {
    "blue": {
      "50":  { "value": "#EFF6FF", "type": "COLOR" },
      "100": { "value": "#DBEAFE", "type": "COLOR" },
      "200": { "value": "#BFDBFE", "type": "COLOR" },
      "300": { "value": "#93C5FD", "type": "COLOR" },
      "400": { "value": "#60A5FA", "type": "COLOR" },
      "500": { "value": "#3B82F6", "type": "COLOR" },
      "600": { "value": "#2563EB", "type": "COLOR" },
      "700": { "value": "#1D4ED8", "type": "COLOR" },
      "800": { "value": "#1E40AF", "type": "COLOR" },
      "900": { "value": "#1E3A8A", "type": "COLOR" },
      "950": { "value": "#172554", "type": "COLOR" }
    },
    "neutral": {
      "0":   { "value": "#FFFFFF", "type": "COLOR" },
      "50":  { "value": "#FAFAFA", "type": "COLOR" },
      "100": { "value": "#F5F5F5", "type": "COLOR" },
      "200": { "value": "#E5E5E5", "type": "COLOR" },
      "300": { "value": "#D4D4D4", "type": "COLOR" },
      "400": { "value": "#A3A3A3", "type": "COLOR" },
      "500": { "value": "#737373", "type": "COLOR" },
      "600": { "value": "#525252", "type": "COLOR" },
      "700": { "value": "#404040", "type": "COLOR" },
      "800": { "value": "#262626", "type": "COLOR" },
      "900": { "value": "#171717", "type": "COLOR" },
      "950": { "value": "#0A0A0A", "type": "COLOR" }
    },
    "red":    { "500": { "value": "#EF4444", "type": "COLOR" } },
    "green":  { "500": { "value": "#22C55E", "type": "COLOR" } },
    "amber":  { "500": { "value": "#F59E0B", "type": "COLOR" } }
  },
  "spacing": {
    "0":   { "value": "0px",   "type": "SPACING" },
    "0.5": { "value": "2px",   "type": "SPACING" },
    "1":   { "value": "4px",   "type": "SPACING" },
    "1.5": { "value": "6px",   "type": "SPACING" },
    "2":   { "value": "8px",   "type": "SPACING" },
    "3":   { "value": "12px",  "type": "SPACING" },
    "4":   { "value": "16px",  "type": "SPACING" },
    "5":   { "value": "20px",  "type": "SPACING" },
    "6":   { "value": "24px",  "type": "SPACING" },
    "8":   { "value": "32px",  "type": "SPACING" },
    "10":  { "value": "40px",  "type": "SPACING" },
    "12":  { "value": "48px",  "type": "SPACING" },
    "16":  { "value": "64px",  "type": "SPACING" },
    "20":  { "value": "80px",  "type": "SPACING" },
    "24":  { "value": "96px",  "type": "SPACING" }
  },
  "radius": {
    "none": { "value": "0px",    "type": "RADIUS" },
    "sm":   { "value": "2px",    "type": "RADIUS" },
    "md":   { "value": "6px",    "type": "RADIUS" },
    "lg":   { "value": "8px",    "type": "RADIUS" },
    "xl":   { "value": "12px",   "type": "RADIUS" },
    "2xl":  { "value": "16px",   "type": "RADIUS" },
    "full": { "value": "9999px", "type": "RADIUS" }
  },
  "fontFamily": {
    "sans":  { "value": "Inter, ui-sans-serif, system-ui, sans-serif", "type": "TYPOGRAPHY" },
    "mono":  { "value": "JetBrains Mono, ui-monospace, monospace",     "type": "TYPOGRAPHY" }
  },
  "fontSize": {
    "xs":   { "value": "12px", "lineHeight": "16px", "type": "TYPOGRAPHY" },
    "sm":   { "value": "14px", "lineHeight": "20px", "type": "TYPOGRAPHY" },
    "base": { "value": "16px", "lineHeight": "24px", "type": "TYPOGRAPHY" },
    "lg":   { "value": "18px", "lineHeight": "28px", "type": "TYPOGRAPHY" },
    "xl":   { "value": "20px", "lineHeight": "28px", "type": "TYPOGRAPHY" },
    "2xl":  { "value": "24px", "lineHeight": "32px", "type": "TYPOGRAPHY" },
    "3xl":  { "value": "30px", "lineHeight": "36px", "type": "TYPOGRAPHY" },
    "4xl":  { "value": "36px", "lineHeight": "40px", "type": "TYPOGRAPHY" }
  },
  "fontWeight": {
    "normal":   { "value": "400", "type": "TYPOGRAPHY" },
    "medium":   { "value": "500", "type": "TYPOGRAPHY" },
    "semibold": { "value": "600", "type": "TYPOGRAPHY" },
    "bold":     { "value": "700", "type": "TYPOGRAPHY" }
  }
}
```

#### Tier 2: Alias Tokens (Semantic Mapping)

Alias tokens assign meaning. They answer "what is this for?" rather than
"what does it look like?" This is where light/dark mode divergence happens.

```json
{
  "color": {
    "bg": {
      "primary":   { "value": "{colors.neutral.0}",   "dark": "{colors.neutral.950}" },
      "secondary": { "value": "{colors.neutral.50}",  "dark": "{colors.neutral.900}" },
      "tertiary":  { "value": "{colors.neutral.100}", "dark": "{colors.neutral.800}" },
      "inverse":   { "value": "{colors.neutral.900}", "dark": "{colors.neutral.50}"  }
    },
    "text": {
      "primary":   { "value": "{colors.neutral.900}", "dark": "{colors.neutral.50}"  },
      "secondary": { "value": "{colors.neutral.600}", "dark": "{colors.neutral.400}" },
      "tertiary":  { "value": "{colors.neutral.400}", "dark": "{colors.neutral.500}" },
      "inverse":   { "value": "{colors.neutral.0}",   "dark": "{colors.neutral.950}" },
      "brand":     { "value": "{colors.blue.600}",    "dark": "{colors.blue.400}"    }
    },
    "border": {
      "default":   { "value": "{colors.neutral.200}", "dark": "{colors.neutral.700}" },
      "strong":    { "value": "{colors.neutral.300}", "dark": "{colors.neutral.600}" },
      "focus":     { "value": "{colors.blue.500}",    "dark": "{colors.blue.400}"    }
    },
    "status": {
      "error":   { "value": "{colors.red.500}" },
      "success": { "value": "{colors.green.500}" },
      "warning": { "value": "{colors.amber.500}" },
      "info":    { "value": "{colors.blue.500}" }
    },
    "interactive": {
      "default":  { "value": "{colors.blue.600}",    "dark": "{colors.blue.400}" },
      "hover":    { "value": "{colors.blue.700}",    "dark": "{colors.blue.300}" },
      "active":   { "value": "{colors.blue.800}",    "dark": "{colors.blue.200}" },
      "disabled": { "value": "{colors.neutral.300}", "dark": "{colors.neutral.600}" }
    }
  },
  "spacing": {
    "component": {
      "gap": {
        "sm": { "value": "{spacing.1}" },
        "md": { "value": "{spacing.2}" },
        "lg": { "value": "{spacing.3}" }
      },
      "padding": {
        "sm": { "value": "{spacing.2}" },
        "md": { "value": "{spacing.3}" },
        "lg": { "value": "{spacing.4}" }
      }
    },
    "layout": {
      "gap": {
        "sm": { "value": "{spacing.4}" },
        "md": { "value": "{spacing.6}" },
        "lg": { "value": "{spacing.8}" }
      },
      "padding": {
        "sm": { "value": "{spacing.4}" },
        "md": { "value": "{spacing.6}" },
        "lg": { "value": "{spacing.8}" }
      }
    }
  }
}
```

#### Tier 3: Component Tokens (Scoped)

Component tokens bind to a specific component. They are the only tokens a
component file should reference. This scoping means you can re-theme a single
component without side effects.

```json
{
  "button": {
    "bg": {
      "default":     { "value": "{color.interactive.default}" },
      "hover":       { "value": "{color.interactive.hover}" },
      "active":      { "value": "{color.interactive.active}" },
      "disabled":    { "value": "{color.interactive.disabled}" }
    },
    "text": {
      "default":     { "value": "{color.text.inverse}" },
      "disabled":    { "value": "{color.text.tertiary}" }
    },
    "border": {
      "default":     { "value": "transparent" },
      "outline":     { "value": "{color.border.default}" },
      "focus":       { "value": "{color.border.focus}" }
    },
    "radius":        { "value": "{radius.md}" },
    "padding": {
      "sm":          { "value": "{spacing.1.5} {spacing.3}" },
      "md":          { "value": "{spacing.2} {spacing.4}" },
      "lg":          { "value": "{spacing.2.5} {spacing.5}" }
    },
    "fontSize": {
      "sm":          { "value": "{fontSize.sm}" },
      "md":          { "value": "{fontSize.sm}" },
      "lg":          { "value": "{fontSize.base}" }
    },
    "gap":           { "value": "{spacing.component.gap.sm}" }
  },
  "input": {
    "bg":            { "value": "{color.bg.primary}" },
    "text":          { "value": "{color.text.primary}" },
    "placeholder":   { "value": "{color.text.tertiary}" },
    "border": {
      "default":     { "value": "{color.border.default}" },
      "hover":       { "value": "{color.border.strong}" },
      "focus":       { "value": "{color.border.focus}" },
      "error":       { "value": "{color.status.error}" }
    },
    "radius":        { "value": "{radius.md}" },
    "padding":       { "value": "{spacing.2} {spacing.3}" },
    "fontSize":      { "value": "{fontSize.sm}" }
  },
  "card": {
    "bg":            { "value": "{color.bg.primary}" },
    "border":        { "value": "{color.border.default}" },
    "radius":        { "value": "{radius.lg}" },
    "padding":       { "value": "{spacing.6}" },
    "shadow":        { "value": "{shadow.sm}" }
  }
}
```

### 1.2 Token Naming Convention

Pattern: `{category}/{property}/{variant}/{state}`

Rules:
- Use `/` as separator (maps to nested JSON and Figma variable groups)
- Categories: color, spacing, radius, shadow, typography, motion, zIndex, opacity
- Properties describe the role: bg, text, border, gap, padding
- Variants narrow scope: primary, secondary, sm, md, lg
- States are optional: hover, active, focus, disabled, error

Good names:
```
color/bg/primary
color/text/secondary
color/border/focus
spacing/component/padding/lg
spacing/layout/gap/md
radius/card
shadow/lg
motion/duration/fast
motion/easing/standard
zIndex/modal
zIndex/tooltip
opacity/disabled
```

Bad names (and why):
```
blue-500          -- raw value, no semantic meaning
primaryColor      -- camelCase breaks token tooling
bg                -- too vague, no category prefix
card-border-color -- hyphens create ambiguity with multi-word names
```

### 1.3 Token Types and Figma Variable Mapping

| Token Type | CSS Output | Figma Variable Type | Notes |
|-----------|-----------|-------------------|-------|
| COLOR | `hsl(var(--token))` or `#hex` | Color | Use HSL for shadcn/ui compatibility |
| SPACING | `rem` or `px` | Number | 4px base grid (rem = px/16) |
| TYPOGRAPHY | Multiple properties | String + Number | Font family is string, size/weight are numbers |
| RADIUS | `rem` or `px` | Number | Match spacing scale where possible |
| SHADOW | `box-shadow` shorthand | Effect (Figma-native) | Elevation levels: sm, md, lg, xl |
| OPACITY | `0` to `1` | Number | Used for disabled states, overlays |
| MOTION | `ms` + `cubic-bezier` | String | Duration and easing as separate tokens |
| Z_INDEX | Unitless integer | Number | Defined layers: base(0), dropdown(10), sticky(20), overlay(30), modal(40), toast(50) |

### 1.4 Shadow Elevation System

Shadows encode depth. Each level adds visual weight. Define them as composite
tokens so the entire shadow stack is one decision.

```json
{
  "shadow": {
    "sm":  { "value": "0 1px 2px 0 rgb(0 0 0 / 0.05)" },
    "md":  { "value": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)" },
    "lg":  { "value": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)" },
    "xl":  { "value": "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)" },
    "2xl": { "value": "0 25px 50px -12px rgb(0 0 0 / 0.25)" },
    "inner": { "value": "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)" }
  }
}
```

### 1.5 Motion Token System

Motion tokens prevent ad-hoc animation values. Every transition in the system
should reference these.

```json
{
  "motion": {
    "duration": {
      "instant":  { "value": "0ms",   "description": "No perceptible delay" },
      "fast":     { "value": "100ms", "description": "Micro-interactions: toggles, checkboxes" },
      "normal":   { "value": "200ms", "description": "Standard transitions: hover, focus" },
      "slow":     { "value": "300ms", "description": "Reveals, slides, expanding content" },
      "slower":   { "value": "500ms", "description": "Page transitions, complex animations" }
    },
    "easing": {
      "standard":    { "value": "cubic-bezier(0.4, 0.0, 0.2, 1)", "description": "General purpose" },
      "decelerate":  { "value": "cubic-bezier(0.0, 0.0, 0.2, 1)", "description": "Entering elements" },
      "accelerate":  { "value": "cubic-bezier(0.4, 0.0, 1, 1)",   "description": "Exiting elements" },
      "spring":      { "value": "cubic-bezier(0.175, 0.885, 0.32, 1.275)", "description": "Playful bounce" }
    }
  }
}
```

### 1.6 Token Sync Strategy

Source of truth flow:

```
Figma Variables (design)
       |
       v
  tokens.json (version-controlled, single source file)
       |
       v
  Style Dictionary (build tool)
       |
       +---> CSS custom properties   (web)
       +---> SCSS variables           (legacy web)
       +---> TypeScript constants     (JS runtime)
       +---> Swift asset catalog      (iOS)
       +---> Kotlin sealed class      (Android)
       +---> JSON (any consumer)
```

Style Dictionary config for multi-platform output:

```js
// style-dictionary.config.js
export default {
  source: ["tokens/**/*.json"],
  platforms: {
    css: {
      transformGroup: "css",
      buildPath: "dist/css/",
      files: [{
        destination: "tokens.css",
        format: "css/variables",
        options: { outputReferences: true }
      }]
    },
    js: {
      transformGroup: "js",
      buildPath: "dist/js/",
      files: [{
        destination: "tokens.js",
        format: "javascript/es6"
      }]
    },
    tailwind: {
      transformGroup: "js",
      buildPath: "dist/tailwind/",
      files: [{
        destination: "tokens.cjs",
        format: "javascript/commonjs"
      }]
    }
  }
};
```

Token versioning rules:
- Patch: value adjustment that preserves visual intent (blue/500 shifts 2 degrees)
- Minor: new token added (no existing tokens change)
- Major: token renamed, removed, or restructured

---

## 2. Component API Design

### 2.1 Props Architecture Principles

Every component API decision affects adoption, flexibility, and maintainability.
These principles apply regardless of framework.

**Minimize required props.** A component with zero required props can be dropped
into a page and immediately render something useful. Every required prop is a
barrier to adoption.

```tsx
// Good: works with zero props
<Button>Click me</Button>

// Bad: three required props to render anything
<Button variant="primary" size="md" onClick={handler}>Click me</Button>
```

**Use discriminated unions for variant props.** Size, color, and variant should
be string literal unions, not open strings. This gives autocomplete and
compile-time safety.

```tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  asChild?: boolean
}
```

**Compound variants** handle cases where the combination of two props produces a
unique style that neither prop alone defines:

```ts
// Using class-variance-authority (cva)
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        size: "sm",
        class: "border-2",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

**Slot pattern** for components with multiple render areas:

```tsx
interface DialogProps {
  children: React.ReactNode
}

// Compound component pattern — each part is a named slot
<Dialog>
  <DialogTrigger asChild>
    <Button variant="outline">Edit Profile</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Edit profile</DialogTitle>
      <DialogDescription>
        Make changes to your profile here. Click save when done.
      </DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      {/* form fields */}
    </div>
    <DialogFooter>
      <Button type="submit">Save changes</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Polymorphic rendering** via `asChild`:

```tsx
// Renders as a <button>
<Button>Click me</Button>

// Renders as an <a> tag, inheriting Button styles
<Button asChild>
  <a href="/somewhere">Navigate</a>
</Button>

// Renders as a Next.js Link
<Button asChild>
  <Link href="/somewhere">Navigate</Link>
</Button>
```

**Always forward refs.** Components that don't forward refs break focus
management, animations, and third-party library integration.

```tsx
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
```

### 2.2 Composition Patterns

**Compound components** are the default pattern for anything with multiple
related parts. The root component provides context; children consume it.

```tsx
// Implementation pattern
const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext() {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error("Tabs compound components must be used within <Tabs>")
  return context
}

function Tabs({ value, onValueChange, children }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div role="tablist">{children}</div>
    </TabsContext.Provider>
  )
}

function TabsTrigger({ value, children }: TabsTriggerProps) {
  const { value: selected, onValueChange } = useTabsContext()
  return (
    <button
      role="tab"
      aria-selected={value === selected}
      onClick={() => onValueChange(value)}
    >
      {children}
    </button>
  )
}

function TabsContent({ value, children }: TabsContentProps) {
  const { value: selected } = useTabsContext()
  if (value !== selected) return null
  return <div role="tabpanel">{children}</div>
}
```

**When to use each pattern:**

| Pattern | Use When | Example |
|---------|----------|---------|
| Compound components | Multi-part UI with shared state | Dialog, Tabs, Accordion, Menu |
| Single component + props | Simple, self-contained UI | Button, Badge, Avatar |
| Hooks | Reusable behavior without UI | useToast, useMediaQuery, useCopyToClipboard |
| Context provider | App-wide or subtree configuration | ThemeProvider, ToastProvider |

### 2.3 Component File Structure

Every component follows a consistent file layout. This makes codegen predictable
and lets agents know exactly where to find each piece.

```
components/ui/button/
  button.tsx          # Component implementation
  button.stories.tsx  # Storybook stories
  button.test.tsx     # Unit/interaction tests
  button.tokens.ts    # Component-scoped token references
  index.ts            # Public export
```

For composed components at molecule level and above:

```
components/molecules/search-bar/
  search-bar.tsx
  search-bar.stories.tsx
  search-bar.test.tsx
  use-search-bar.ts     # Component-specific hook
  search-bar.types.ts   # TypeScript interfaces
  index.ts
```

---

## 3. Versioning & Breaking Changes

### 3.1 What Constitutes a Breaking Change

The following changes require a major version bump:

- Removing a prop from a component's public API
- Changing a prop's type (e.g., `string` to `string[]`)
- Changing default prop values in a way that alters visual output
- Renaming or removing a token
- Restructuring the token hierarchy
- Removing a component entirely
- Changing a component's DOM structure in ways that break CSS selectors
- Renaming CSS custom properties
- Changing the semantic meaning of a token (e.g., `color/primary` shifts from blue to green)

### 3.2 What is NOT a Breaking Change

These changes are minor or patch:

- Adding a new optional prop with a sensible default
- Adding a new variant to an existing variant union
- Adding a new token at any tier
- Adding a new component
- Visual refinements that preserve layout and spacing
- Performance improvements with identical output
- Fixing a bug (even if someone depended on the buggy behavior)
- Adding aria attributes for accessibility improvement
- Internal refactoring with no API surface change

### 3.3 Release Pipeline

```
canary (every commit to main)
  |
  v
beta (weekly, from stable commits)
  |
  v
stable (monthly or on-demand)
```

**Canary releases** are automatic. Every merge to main publishes
`@scope/design-system@0.0.0-canary.{sha}`. Consumers opt in.

**Beta releases** are curated. The maintainer selects a canary that passed CI
and promotes it: `@scope/design-system@1.2.0-beta.1`.

**Stable releases** are the only version recommended for production. They
include a changelog, migration guide (if major), and updated documentation.

### 3.4 Migration Strategy

For major version bumps, provide codemods:

```ts
// codemod: rename-button-color-to-variant.ts
// Transforms <Button color="primary"> to <Button variant="default">

import { API, FileInfo } from "jscodeshift"

export default function transform(file: FileInfo, api: API) {
  const j = api.jscodeshift
  const root = j(file.source)

  const colorToVariant: Record<string, string> = {
    primary: "default",
    danger: "destructive",
    secondary: "secondary",
    tertiary: "ghost",
  }

  root
    .findJSXElements("Button")
    .find(j.JSXAttribute, { name: { name: "color" } })
    .forEach((path) => {
      const value = (path.value.value as any)?.value
      if (value && colorToVariant[value]) {
        path.value.name = j.jsxIdentifier("variant")
        path.value.value = j.stringLiteral(colorToVariant[value])
      }
    })

  return root.toSource()
}
```

Deprecation timeline:
1. v2.0: Add new API alongside old. Old API logs console warning.
2. v3.0: Old API still works but warning is louder (runtime + lint rule).
3. v4.0: Old API removed. Codemod provided for v2/v3 -> v4 migration.

---

## 4. Multi-Brand Theming

### 4.1 Theme Architecture

A theme is a complete token set. It is not just a color palette — it includes
spacing adjustments, radius preferences, shadow intensity, and typography
choices. Brands differ in more ways than hue.

```
base-theme/
  color.json       <- neutral palette, semantic colors
  spacing.json     <- 4px grid
  radius.json      <- rounded-md default
  shadow.json      <- subtle shadows
  typography.json  <- Inter, standard scale

brand-a/
  color.json       <- overrides: warm palette, coral primary
  radius.json      <- overrides: radius.lg default (more rounded)
  # spacing, shadow, typography: inherited from base

brand-b/
  color.json       <- overrides: cool palette, navy primary
  shadow.json      <- overrides: stronger shadows
  typography.json  <- overrides: different font stack
  # spacing, radius: inherited from base
```

### 4.2 CSS Implementation

Use CSS custom properties with data attributes for runtime switching:

```css
/* Base theme — always loaded */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}

/* Dark mode */
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 215 20.2% 65.1%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 212.7 26.8% 83.9%;
}

/* Brand A override */
[data-theme="brand-a"] {
  --primary: 346 77% 49%;
  --primary-foreground: 0 0% 100%;
  --radius: 0.75rem;
}

/* Brand B override */
[data-theme="brand-b"] {
  --primary: 221 83% 28%;
  --primary-foreground: 210 40% 98%;
  --shadow-intensity: 1.5;
  --font-sans: "Outfit", ui-sans-serif, system-ui, sans-serif;
}
```

### 4.3 Theme Switching at Runtime

```tsx
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<string>("default")
  const [mode, setMode] = React.useState<"light" | "dark">("light")

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    document.documentElement.classList.toggle("dark", mode === "dark")
  }, [theme, mode])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

**Key distinction:** Dark mode is a *mode*, not a *theme*. A theme (brand) and
a mode (light/dark) are orthogonal axes. Brand A in dark mode is different from
Brand B in dark mode — both axes apply simultaneously.

---

## 5. Governance & Adoption

### 5.1 Contribution Model — RFC Process

Every non-trivial addition follows this flow:

```
1. PROPOSE  — Open RFC issue with:
               - Problem statement (what user need does this serve?)
               - API design (props, variants, slots)
               - Figma mockup or reference
               - Accessibility requirements
               - Alternatives considered

2. REVIEW   — Design review (visual quality, system coherence)
               Engineering review (API design, performance, bundle size)
               Accessibility review (WCAG compliance)

3. BUILD    — Implement following component template:
               - Component code with full TypeScript types
               - Storybook stories (all variants, states, responsive)
               - Unit tests (interaction, accessibility)
               - Figma component (matching code API 1:1)
               - Code Connect mapping

4. DOCUMENT — API reference (auto-generated from types)
               Usage guidelines (when to use, when not to)
               Do/don't examples
               Migration notes (if replacing something)

5. RELEASE  — Canary -> Beta -> Stable pipeline
               Changelog entry
               Announcement in team channel
```

### 5.2 Adoption Metrics

Track these to measure system health:

**Component Coverage** — What percentage of the product UI is built with system
components vs custom one-offs?

```
Coverage = (System component instances) / (Total component instances) * 100

Target: > 85% for mature products
Warning: < 60% indicates adoption problems
```

**Token Adoption** — What percentage of color/spacing/type values in the
codebase come from tokens vs raw values?

```
Token adoption = (Styles using tokens) / (Total style declarations) * 100

Detection: lint rules that flag raw hex values, px values for spacing,
           font-size declarations outside the type scale

Target: > 95%
```

**Figma-Code Parity** — What percentage of code components have corresponding
Figma components with Code Connect mappings?

```
Parity = (Components with Code Connect) / (Total code components) * 100

Target: 100% for atoms, > 80% for molecules
```

**Version Freshness** — What percentage of consuming apps are on the latest
stable version?

```
Freshness = (Apps on latest major) / (Total consuming apps) * 100

Target: > 70% within 30 days of release
```

**Defect Rate** — Bugs filed per component per quarter. Tracks reliability.

```
Target: < 0.5 bugs per component per quarter for stable components
```

### 5.3 Quality Gates

Every component must pass these before release:

**Accessibility:**
- axe-core automated scan: 0 violations
- Keyboard navigation: all interactive elements reachable via Tab
- Screen reader: announced correctly in VoiceOver + NVDA
- Focus visible: clear focus indicator on all interactive elements
- Color contrast: 4.5:1 for normal text (AA), 7:1 preferred (AAA)
- Color contrast: 3:1 for large text and UI elements (AA)
- Reduced motion: respects `prefers-reduced-motion`

**Performance:**
- Bundle size: < 10KB gzipped per component (atoms < 3KB)
- No layout shifts: CLS = 0 for component mount
- Tree-shakeable: unused components excluded from build
- No runtime CSS generation: all styles resolved at build time

**Testing:**
- Interaction coverage: every user action has a test
- Variant coverage: every variant rendered in tests
- Accessibility: `jest-axe` or `vitest-axe` assertions
- Responsive: tested at 320px, 768px, 1024px, 1440px
- Edge cases: empty content, overflowing text, missing optional props

**Documentation:**
- Props table with types, defaults, and descriptions
- Live examples for every variant
- Do/don't usage guidelines
- Keyboard interaction table
- Related components section

---

## 6. Cross-Platform Consistency

### 6.1 Web (CSS Custom Properties + Tailwind)

Tailwind config consumes tokens directly:

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
}
export default config
```

### 6.2 iOS (Swift)

```swift
// DesignTokens.swift — generated by Style Dictionary
import SwiftUI

public enum DesignTokens {
    public enum Color {
        public static let bgPrimary = SwiftUI.Color("bg-primary", bundle: .module)
        public static let bgSecondary = SwiftUI.Color("bg-secondary", bundle: .module)
        public static let textPrimary = SwiftUI.Color("text-primary", bundle: .module)
        public static let textSecondary = SwiftUI.Color("text-secondary", bundle: .module)
        public static let borderDefault = SwiftUI.Color("border-default", bundle: .module)
        public static let interactiveDefault = SwiftUI.Color("interactive-default", bundle: .module)
        public static let statusError = SwiftUI.Color("status-error", bundle: .module)
        public static let statusSuccess = SwiftUI.Color("status-success", bundle: .module)
    }

    public enum Spacing {
        public static let xs: CGFloat = 4
        public static let sm: CGFloat = 8
        public static let md: CGFloat = 12
        public static let lg: CGFloat = 16
        public static let xl: CGFloat = 24
        public static let xxl: CGFloat = 32
    }

    public enum Radius {
        public static let sm: CGFloat = 2
        public static let md: CGFloat = 6
        public static let lg: CGFloat = 8
        public static let xl: CGFloat = 12
        public static let full: CGFloat = 9999
    }

    public enum Typography {
        public static let bodyFont = Font.system(.body)
        public static let headingFont = Font.system(.title).weight(.semibold)
        public static let captionFont = Font.system(.caption)
    }
}
```

### 6.3 Android (Kotlin / Compose)

```kotlin
// DesignTokens.kt — generated by Style Dictionary
package com.app.designsystem.tokens

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object DesignTokens {
    object Colors {
        val bgPrimary = Color(0xFFFFFFFF)
        val bgSecondary = Color(0xFFFAFAFA)
        val textPrimary = Color(0xFF171717)
        val textSecondary = Color(0xFF525252)
        val borderDefault = Color(0xFFE5E5E5)
        val interactiveDefault = Color(0xFF2563EB)
        val statusError = Color(0xFFEF4444)
        val statusSuccess = Color(0xFF22C55E)
    }

    object Spacing {
        val xs = 4.dp
        val sm = 8.dp
        val md = 12.dp
        val lg = 16.dp
        val xl = 24.dp
        val xxl = 32.dp
    }

    object Radius {
        val sm = 2.dp
        val md = 6.dp
        val lg = 8.dp
        val xl = 12.dp
    }

    object Typography {
        val bodySize = 16.sp
        val bodyLineHeight = 24.sp
        val headingSize = 24.sp
        val captionSize = 12.sp
    }
}
```

### 6.4 React Native

```tsx
// tokens.ts — shared values, platform-specific components
export const tokens = {
  color: {
    bgPrimary: "#FFFFFF",
    bgSecondary: "#FAFAFA",
    textPrimary: "#171717",
    textSecondary: "#525252",
    borderDefault: "#E5E5E5",
    interactiveDefault: "#2563EB",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 2,
    md: 6,
    lg: 8,
    xl: 12,
    full: 9999,
  },
} as const

// Usage in React Native component
import { tokens } from "./tokens"
import { StyleSheet, View, Text, Pressable } from "react-native"

const styles = StyleSheet.create({
  button: {
    backgroundColor: tokens.color.interactiveDefault,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacing.xs,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
})
```

### 6.5 Figma Variables — Mode Configuration

In Figma, set up variable collections with modes for each context:

```
Collection: "Color"
  Modes: Light, Dark
  Variables:
    bg/primary       -> Light: #FFFFFF, Dark: #0A0A0A
    bg/secondary     -> Light: #FAFAFA, Dark: #171717
    text/primary     -> Light: #171717, Dark: #FAFAFA
    text/secondary   -> Light: #525252, Dark: #A3A3A3
    border/default   -> Light: #E5E5E5, Dark: #404040
    interactive/default -> Light: #2563EB, Dark: #60A5FA

Collection: "Spacing"
  Modes: Default (single mode)
  Variables:
    xs -> 4
    sm -> 8
    md -> 12
    lg -> 16
    xl -> 24

Collection: "Radius"
  Modes: Default, Brand-A, Brand-B
  Variables:
    sm   -> Default: 2, Brand-A: 4, Brand-B: 2
    md   -> Default: 6, Brand-A: 8, Brand-B: 4
    lg   -> Default: 8, Brand-A: 12, Brand-B: 6
```

When extracting from Figma via the Variables API, each mode maps to a theme
file in the token build pipeline.

---

## 7. Anti-Patterns — What to Avoid

### 7.1 The "Utility Component" Trap

Do not create components that are too generic to be opinionated:

```tsx
// BAD: This is just a styled div, not a real component
function Box({ padding, margin, bg, children }) {
  return <div style={{ padding, margin, background: bg }}>{children}</div>
}

// GOOD: Use Tailwind utilities directly, or create a semantic component
<div className="p-4 bg-muted rounded-lg">{children}</div>

// GOOD: Semantic component with clear purpose
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
      {children}
    </div>
  )
}
```

### 7.2 Raw Values in Components

Every raw value is technical debt. Lint for it, block PRs that introduce it.

```tsx
// BAD: raw hex, raw px, raw font-size
<div style={{ color: "#3B82F6", padding: "12px", fontSize: "14px" }}>

// GOOD: tokens via Tailwind
<div className="text-primary p-3 text-sm">
```

ESLint rule to enforce:

```js
// .eslintrc — custom rule or use stylelint
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "JSXAttribute[name.name='style'] ObjectExpression Property[key.name='color'][value.type='Literal']",
        "message": "Use Tailwind classes or CSS custom properties instead of raw color values."
      }
    ]
  }
}
```

### 7.3 Skipping the RFC Process

"It's just a small change" is how systems accumulate inconsistency. Every
public API addition — even a new variant on an existing component — should
have at least a lightweight RFC:

- What problem does this solve?
- Why can't existing variants handle it?
- What is the proposed API?
- Does Figma need an update?

### 7.4 Forking Instead of Extending

When a team needs a component that behaves slightly differently, the temptation
is to copy it and modify. This creates divergence that compounds over time.

Instead:
1. Can the existing component accept a new variant?
2. Can it be composed with other components to achieve the goal?
3. Can a wrapper component add the needed behavior?
4. Only if none of the above: propose a new component via RFC.

### 7.5 Using !important to Override System Styles

If you need `!important`, the component API is insufficient. Fix the API.
Add a variant, accept a `className` prop, or use the `cn()` utility for
merge-safe class composition.

```tsx
// The cn() utility (shadcn/ui standard)
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Allows clean overrides without !important
<Button className="bg-green-600 hover:bg-green-700">Custom</Button>
// cn() merges this correctly, removing conflicting bg classes
```

---

## 8. Figma-Specific Workflows

### 8.1 Component Structure in Figma

Mirror the atomic design hierarchy in Figma page structure:

```
File: Design System
  Page: Atoms
    Frame: Button
    Frame: Input
    Frame: Badge
    Frame: Avatar
    Frame: Separator
  Page: Molecules
    Frame: SearchBar (composes Input + Button)
    Frame: UserCard (composes Avatar + Badge + text)
  Page: Organisms
    Frame: DataTable (composes multiple molecules)
    Frame: NavigationBar (composes molecules + atoms)
  Page: Tokens
    Frame: Color Palette (all swatches with variable references)
    Frame: Typography Scale
    Frame: Spacing Scale
    Frame: Shadow Elevation
```

### 8.2 Auto-Layout Rules

- Every component must use auto-layout (no absolute positioning)
- Use "Hug contents" by default, "Fill container" for responsive stretching
- Spacing values must use spacing variables, never raw numbers
- Padding must use spacing variables
- Min/max width constraints for responsive behavior

### 8.3 Variant Property Naming

Match code prop names exactly:

| Code Prop | Figma Property | Values |
|-----------|---------------|--------|
| `variant` | `variant` | default, destructive, outline, secondary, ghost, link |
| `size` | `size` | sm, default, lg, icon |
| `disabled` | `state` | enabled, disabled |
| `loading` | `loading` | false, true |

### 8.4 Code Connect Mapping

After creating both code and Figma components, register the mapping:

```ts
// button.figma.tsx — Code Connect file
import figma from "@figma/code-connect"
import { Button } from "@/components/ui/button"

figma.connect(Button, "https://figma.com/design/FILE_KEY?node-id=NODE_ID", {
  props: {
    variant: figma.enum("variant", {
      default: "default",
      destructive: "destructive",
      outline: "outline",
      secondary: "secondary",
      ghost: "ghost",
      link: "link",
    }),
    size: figma.enum("size", {
      sm: "sm",
      default: "default",
      lg: "lg",
      icon: "icon",
    }),
    children: figma.string("label"),
    disabled: figma.enum("state", { disabled: true }),
  },
  example: ({ variant, size, children, disabled }) => (
    <Button variant={variant} size={size} disabled={disabled}>
      {children}
    </Button>
  ),
})
```

---

## 9. Agent Instructions

When this skill is active, the agent should:

1. **Always check existing tokens before defining new values.** Run a token
   audit before adding any color, spacing, or typography value. If a matching
   token exists, use it. If a close match exists, evaluate whether a new token
   is justified or if the design should align to the existing value.

2. **Classify every component by atomic level.** Before generating code, state
   the level (atom/molecule/organism/template/page) and list composition
   dependencies. This determines the output directory and import structure.

3. **Design the props API before writing implementation.** Write the TypeScript
   interface first. Review it for: minimal required props, discriminated union
   variants, ref forwarding, className acceptance, and polymorphic support.

4. **Generate component tokens alongside code.** Every new component gets a
   component token set that references alias tokens. No raw values in component
   files.

5. **Create Code Connect mappings for every component.** After code generation,
   produce the `.figma.tsx` mapping file so Figma inspectors see real code.

6. **Check for breaking changes in every modification.** Before changing an
   existing component, evaluate the change against the breaking change
   checklist in section 3.1. If breaking, flag it and suggest a non-breaking
   alternative if possible.

7. **Enforce quality gates.** Every generated component must include:
   accessibility attributes (role, aria-label, keyboard handlers), responsive
   behavior (no fixed widths unless intentional), and dark mode support (using
   semantic tokens that have dark mode mappings).

8. **Prefer composition over new components.** Before creating a new molecule or
   organism, check if existing atoms can be composed to achieve the same result.
   The fewer components in the system, the lower the maintenance burden.
