# /figma-generate-library — Create Component Library from Codebase

> Generate Figma components from your codebase's existing React/shadcn components, maintaining perfect design-code parity.

## Prerequisites
- Load `/figma-use` foundational skill first
- Codebase must have shadcn/ui or similar component library
- `noche connect` must be active

## When to Use
- Initial design system setup in Figma from existing code
- Syncing new code components back to Figma
- Creating a Figma component library that mirrors your codebase
- Establishing Code Connect mappings

## Workflow

### Step 1: Scan Codebase Components
```
Read generated/ and src/components/ directories
Identify all React components with their:
  - Props interface (variants, sizes, states)
  - shadcn/ui base components used
  - Tailwind classes → map to Figma properties
  - Atomic level (atom/molecule/organism)
```

### Step 2: Map to Figma Structure

#### Atoms (shadcn/ui primitives)
Each atom becomes a **Component Set** with variant properties:
```javascript
// Button component set
ComponentSet "Button"
├── variant=default, size=default → "Button"
├── variant=destructive, size=default → "Button"
├── variant=outline, size=sm → "Button"
├── variant=ghost, size=lg → "Button"
└── ... all combinations

// Properties:
// - variant: default | destructive | outline | secondary | ghost | link
// - size: default | sm | lg | icon
// - state: default | hover | active | disabled | focused
// - hasIcon: boolean
// - label: text property
```

#### Molecules (composed atoms)
```javascript
// FormField molecule
Component "FormField"
├── Label (instance of Atom/Label)
├── Input (instance of Atom/Input)
└── HelpText (instance of Atom/HelpText, optional)

// Properties:
// - state: default | error | success | disabled
// - hasHelpText: boolean
// - label: text
// - placeholder: text
```

#### Organisms (composed molecules + atoms)
```javascript
// LoginForm organism
Component "LoginForm"
├── FormField (email)
├── FormField (password)
├── Checkbox (remember me)
├── Button (submit, fill width)
└── Links row

// Properties:
// - hasSocialLogin: boolean
// - hasRememberMe: boolean
```

### Step 3: Create Variables First
Before components, ensure design tokens exist:
```
figma_batch_create_variables for:
  colors/ → all color tokens (primary, secondary, destructive, etc.)
  spacing/ → 0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
  radius/ → none, sm, default, md, lg, xl, 2xl, full
  typography/ → font sizes, weights, line heights
```

### Step 4: Build Components Bottom-Up
```
1. Create "Design System" page (or find existing)
2. Create Section per atomic level:
   ├── Section "Atoms"
   ├── Section "Molecules"
   ├── Section "Organisms"
   └── Section "Templates"
3. For each component:
   a. Create frame with Auto Layout
   b. Add variant properties matching React props
   c. Bind all visual properties to variables
   d. Apply correct sizing (hug/fill)
   e. Document with description
4. Arrange with figma_arrange_component_set
```

### Step 5: Self-Healing Loop
For each component created:
```
figma_take_screenshot → analyze
Check:
  ✓ Matches codebase component visually
  ✓ All variants render correctly
  ✓ Auto Layout applied (no absolute positioning)
  ✓ Variables bound (no raw values)
  ✓ Properties documented
  ✓ Naming follows PascalCase convention
Fix → Re-screenshot → Verify
```

### Step 6: Establish Code Connect
Map each Figma component to its codebase counterpart:
```
add_code_connect_map:
  Button → src/components/ui/button.tsx
  Input → src/components/ui/input.tsx
  Card → src/components/ui/card.tsx
  FormField → src/components/molecules/FormField.tsx
  LoginForm → generated/components/LoginForm/LoginForm.tsx
```

### Step 7: Generate Noche Specs
For each component created, generate a matching spec:
```
noche spec component Button
noche spec component FormField
noche spec component LoginForm
```

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

## Variant Generation Strategy
For component sets with many variants:
1. Create the **default variant** first with full structure
2. Duplicate for each variant combination
3. Override only the changed properties
4. Use `figma_arrange_component_set` to organize the grid
5. Total variants = product of all property values

## Anti-Patterns
- Creating components without variables (hardcoded colors/spacing)
- Skipping Auto Layout (absolute positioning breaks responsiveness)
- Not documenting component properties
- Missing hover/active/disabled states
- Forgetting to create the component set (just loose frames)
- Not establishing Code Connect after creation
