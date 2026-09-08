---
name: figma-generate-library
description: Generate Figma component library from React/shadcn codebase with Code Connect parity
user-invocable: true
model: opus
effort: max
context:
  - skills/FIGMA_USE.md
  - skills/ATOMIC_DESIGN.md
---

# /figma-generate-library — Create Component Library from Codebase

## 2.8 beta scope

This is optional reference guidance, not an automatic Memi workflow. Figma tool names and canvas examples require an installed external provider and the host's authorization; locked Memi MCP does not expose them. Deferred CLI commands remain unavailable even with capability grants. For supported local context, use `memi --profile locked agent brief . --json`; for static frontend inspection, use `memi --profile locked diagnose . --no-write --json --fail-on none`. Neither command certifies the external workflow below.

> Generate Figma components from your React/shadcn codebase, establishing Code Connect for perfect design-code parity. Requires /figma-use.

## Freedom Level: High

Full creative freedom for visual representation, but component structure must mirror the codebase exactly.

## Prerequisites
- `/figma-use` foundational skill loaded
- Codebase has shadcn/ui or similar component library
- An external Figma provider connected and authorized by the host
- `figma_search_components` called this session

## Workflow

### Step 1: Check Existing Mappings
```
get_code_connect_map → what's already mapped?
```
**Skip components that already have Code Connect mappings.** Only create what's missing.

### Step 2: Scan Codebase Components
```
Read generated/ and src/components/ directories
Identify all React components with:
  - Props interface (variants, sizes, states)
  - shadcn/ui base components used
  - Tailwind classes → map to Figma properties
  - Atomic level (atom/molecule/organism)
```

### Step 3: Create Variables First (Batch)
Before components, ensure design tokens exist:
```
figma_batch_create_variables (up to 100 per call):
  colors/ → all color tokens (primary, secondary, destructive, etc.)
  spacing/ → 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
  radius/ → none, sm, default, md, lg, xl, 2xl, full
  typography/ → font sizes, weights, line heights
```
**Always use batch tools** — 10-50x faster than individual calls.

### Step 4: Build Components Bottom-Up
```
1. Create or find "Design System" page
2. Create Section per atomic level:
   ├── Section "Atoms"
   ├── Section "Molecules"
   ├── Section "Organisms"
   └── Section "Templates"
3. For each component:
   a. Use use_figma (preferred) or typed Mémoire Figma actions for creation
   b. Add variant properties matching React props
   c. Bind all visual properties to variables
   d. Apply correct sizing (hug/fill)
   e. Document with description
4. Arrange with figma_arrange_component_set
```

#### Atoms (shadcn/ui primitives)
Each atom becomes a **Component Set** with variant properties:
```
ComponentSet "Button"
├── variant=default, size=default
├── variant=destructive, size=default
├── variant=outline, size=sm
└── variant=ghost, size=lg

Properties:
  variant: default | destructive | outline | secondary | ghost | link
  size: default | sm | lg | icon
  state: default | hover | active | disabled | focused
  hasIcon: boolean
  label: text property
```

#### Molecules (composed atoms)
```
Component "FormField"
├── Label (instance of Atom/Label)
├── Input (instance of Atom/Input)
└── HelpText (instance of Atom/HelpText, optional)

Properties:
  state: default | error | success | disabled
  hasHelpText: boolean
  label: text
  placeholder: text
```

#### Organisms (composed molecules + atoms)
```
Component "LoginForm"
├── FormField (email)
├── FormField (password)
├── Checkbox (remember me)
├── Button (submit, fill width)
└── Links row

Properties:
  hasSocialLogin: boolean
  hasRememberMe: boolean
```

### Step 5: Self-Healing Loop (per component)
Run the self-healing loop from `/figma-use` for each component. Additionally verify: matches codebase visually, all variants render, properties documented, PascalCase naming.

### Step 6: Establish Code Connect (PRIMARY OUTPUT)
This is the most important step. Map every Figma component to code:
```
add_code_connect_map:
  Button → src/components/ui/button.tsx
  Input → src/components/ui/input.tsx
  Card → src/components/ui/card.tsx
  FormField → src/components/molecules/FormField.tsx
  LoginForm → generated/components/LoginForm/LoginForm.tsx
```

### Step 7: Document Component Contracts

Record component names, states, properties, tokens, and verified source mappings in the host's approved handoff format. Memi's `spec component` command is unavailable in this beta.

## shadcn/ui → Figma Mapping

| shadcn Component | Figma Type | Atomic Level | Key Properties |
|-----------------|-----------|-------------|----------------|
| Button | Component Set | Atom | variant, size, state, hasIcon |
| Input | Component Set | Atom | state, type, hasIcon |
| Label | Component | Atom | required (boolean) |
| Badge | Component Set | Atom | variant |
| Card | Component | Atom | — |
| Separator | Component | Atom | orientation |
| Select | Component Set | Molecule | state, hasPlaceholder |
| Dialog | Component Set | Organism | hasOverlay, size |
| Sheet | Component Set | Organism | side, size |
| Table | Component Set | Organism | hasHeader, hasPagination |
| Sidebar | Component | Organism | collapsed (boolean) |
| Tabs | Component Set | Molecule | variant, orientation |
| Tooltip | Component | Atom | position |
| Avatar | Component Set | Atom | size, hasImage |

## Anti-Patterns
- Creating components without variables (hardcoded colors/spacing)
- Skipping Auto Layout (absolute positioning breaks responsiveness)
- Not documenting component properties
- Missing hover/active/disabled states
- Forgetting to create the component set (just loose frames)
- **Not establishing Code Connect after creation** — this is the whole point
- Using individual variable creation instead of batch operations
- Using raw Figma execution for design-system-aware creation when `use_figma` works
