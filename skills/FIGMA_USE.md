---
name: figma-use
description: Foundational Figma canvas skill — structure, Auto Layout, variables, MCP tools, self-healing loop
user-invocable: true
model: opus
effort: max
context:
  - skills/ATOMIC_DESIGN.md
---

# /figma-use — Foundational Figma Canvas Skill

> Base skill for all Figma operations. Teaches agents how Figma works — structure, Auto Layout, variables, MCP tools, and the mandatory self-healing loop. Load this before any /figma-* skill.

## Freedom Level: High

Agents have full canvas read/write access but must follow the self-healing protocol and never create floating elements.

## MCP Tool Decision Tree

This is the most important section. Choose the right tool for the job:

### Writing to Canvas
```
What are you trying to do?

CREATE a design using existing components/tokens:
  → use_figma (Official MCP)
  WHY: It understands your design system, returns Code Connect hints,
  and produces structured output. ALWAYS try this first.

RUN raw Plugin API code (batch ops, custom logic):
  → figma_execute (Console MCP)
  WHY: For operations use_figma doesn't support — complex scripts,
  bulk modifications, conditional logic.

INSTANTIATE an existing component:
  → figma_instantiate_component (Console MCP)
  WHY: Fastest way to create an instance of a known component.
  Call figma_search_components first to get the nodeId.

CREATE variables in bulk:
  → figma_batch_create_variables (Console MCP)
  WHY: 10-50x faster than individual figma_create_variable calls.

SET a single property:
  → figma_set_fills / figma_set_text / figma_resize_node
  WHY: Surgical single-property changes.
```

### Reading from Canvas
```
What do you need?

Design with code hints + screenshot:
  → get_design_context (Official MCP) ← PREFERRED
  Returns: code, screenshot, Code Connect snippets, annotations

Visual screenshot only:
  → get_screenshot (Official MCP) or figma_take_screenshot (Console)

Node properties and structure:
  → get_metadata (Official MCP)

Design tokens/variables:
  → get_variable_defs (Official) or figma_get_variables (Console)

Component search:
  → figma_search_components (Console) — call at SESSION START
  NOTE: nodeIds are session-scoped, never reuse from previous sessions

Code Connect mappings:
  → get_code_connect_map (Official MCP) — CHECK FIRST before creating
```

## Canvas Principles

### Structure Hierarchy
```
File → Page → Section → Frame → Component/Instance → Layer
```

### Auto Layout Rules
1. **Always use Auto Layout** — never absolute positioning unless overlays
2. Direction: `HORIZONTAL` or `VERTICAL`
3. Spacing: use design token values, never magic numbers
4. Padding: consistent (use `counterAxisSpacing` for cross-axis)
5. Sizing: prefer `FILL` over fixed width, `HUG` for content-sized elements
6. **GOTCHA**: `counterAxisSizingMode` only accepts `"FIXED"` or `"AUTO"`, never `"FILL"`

### Component Architecture (Atomic Design)
| Level | Figma Structure | Examples |
|-------|----------------|----------|
| Atom | Base component, no nested components | Button, Badge, Input, Label |
| Molecule | 2-5 atom instances composed | FormField (Label + Input + HelpText) |
| Organism | Molecules + atoms with state/logic | LoginForm, Sidebar, DataTable |
| Template | Page-level layout skeleton | DashboardTemplate, AuthTemplate |
| Page | Template + real content instances | Dashboard, LoginPage |

### Variables & Tokens
- **Always bind to variables** — never use raw hex colors or pixel values
- Token naming: `collection/category/name` (e.g., `colors/primary/500`)
- Support light/dark modes via variable modes
- Map to Tailwind: `var(--color-primary-500)` → `text-primary-500`

### Component Properties
- **Variant properties** for visual states (size, variant, state)
- **Boolean properties** for toggles (hasIcon, isDisabled)
- **Text properties** for editable content (label, placeholder)
- **Instance swap** for composable slots (leadingIcon, action)

## Code Connect (CHECK FIRST)

Before creating any component, check Code Connect:
```
1. get_code_connect_map → does this component have a code mapping?
2. If YES → use the mapped codebase component directly
   - Follow the returned prop interface
   - Respect component documentation links
   - Honor design annotations from the designer
3. If NO → create the component, then map it:
   - add_code_connect_map after creation
   - Map Figma properties → React props
```

## Canvas Operations

### Creating Elements
```
1. Check Code Connect → get_code_connect_map
2. Check if component exists → figma_search_components
3. If exists → figma_instantiate_component
4. If new design → use_figma (preferred) or figma_execute (raw)
5. Always place inside a Section or Frame (NEVER floating)
6. Bind all visual properties to variables
7. SCREENSHOT → validate → iterate
```

### Self-Healing Loop (MANDATORY)
After ANY visual creation or modification:
```
CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY (max 3 rounds)
```
1. Execute the design change
2. Take screenshot with `figma_take_screenshot`
3. Analyze for:
   - Elements using "hug contents" instead of "fill container"
   - Inconsistent padding
   - Text/inputs not filling available width
   - Items not centered in their containers
   - Components floating on blank canvas
   - Raw hex values (should be variables)
   - Missing Auto Layout
   - `DROP_SHADOW` effects missing `blendMode: "NORMAL"`
4. Fix issues found
5. Final screenshot to confirm
6. Max 3 iterations — if still broken, report to user

### Figma API Gotchas
- `counterAxisSizingMode` only accepts `"FIXED"` or `"AUTO"` (not `"FILL"`)
- `DROP_SHADOW` effects require `blendMode: "NORMAL"`
- `figma.currentPage` cannot be set via MCP — work on current page
- `layoutGrow` only works inside Auto Layout parents
- Always `await figma.loadFontAsync()` before setting text

## Naming Conventions
| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `MetricCard`, `LoginForm` |
| Variants | camelCase property, PascalCase value | `size=Large` |
| Variables | kebab-case path | `colors/primary/500` |
| Pages | PascalCase | `Dashboard`, `AuthLogin` |
| Sections | Title Case | `Hero Section`, `Navigation` |

## Integration with Mémoire
- Canvas operations flow through Mémoire's WebSocket bridge (ports 9223-9232)
- Agent metadata (role, task, status) is broadcast to all connected plugins
- Design tokens extracted from Figma map to `src/figma/tokens.ts`
- Generated components land in `generated/` following atomic folder structure
- Specs are validated against Zod schemas before saving
