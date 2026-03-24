# /figma-use — Foundational Figma Canvas Skill

> The base skill all other Figma skills build on. Gives agents a shared understanding of how Figma works — structure, principles, and canvas operations.

## When to Use
- Any time an agent needs to create, modify, or read Figma canvas elements
- Before invoking any other `/figma-*` skill
- When working with components, variables, auto layout, or design tokens in Figma

## Figma Canvas Principles

### Structure Hierarchy
```
File → Page → Frame/Section → Component/Instance → Layer
```

### Auto Layout Rules
1. **Always use Auto Layout** — never absolute positioning unless overlays
2. Direction: `HORIZONTAL` or `VERTICAL`
3. Spacing: use design token values, never magic numbers
4. Padding: consistent (use `counterAxisSpacing` for cross-axis)
5. Sizing: prefer `FILL` over fixed width, `HUG` for content-sized elements

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
- Use **variant properties** for visual states (size, variant, state)
- Use **boolean properties** for toggles (hasIcon, isDisabled)
- Use **text properties** for editable content (label, placeholder)
- Use **instance swap** for composable slots (leadingIcon, action)

## Canvas Operations

### Creating Elements
```
1. Check if component exists → figma_search_components
2. If exists → figma_instantiate_component
3. If new → create with figma_execute using Auto Layout
4. Always place inside a Section or Frame (never floating)
5. Bind all visual properties to variables
```

### Modifying Elements
```
1. Get current state → figma_get_selection or figma_get_component
2. Make changes → figma_execute or specific setter tools
3. Screenshot → figma_take_screenshot
4. Validate → check alignment, spacing, proportions
5. Iterate if needed (max 3 rounds)
```

### Self-Healing Loop (MANDATORY)
After ANY visual creation or modification:
```
CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY
```
1. Execute the design change
2. Take screenshot with `figma_take_screenshot`
3. Analyze: check alignment, spacing, proportions, visual balance
4. Fix any issues found
5. Final screenshot to confirm
6. Max 3 iterations — if still broken, report to user

### Reading Design Context
```
1. get_design_context → returns code + screenshot + hints
2. get_screenshot → visual reference
3. get_metadata → node properties and structure
4. figma_get_variables → design tokens
5. figma_get_styles → shared styles
```

## Code Connect Mapping
When a component has Code Connect configured:
- The MCP response includes mapped codebase component snippets
- Use the mapped component directly instead of generating new code
- Follow component documentation links for usage context
- Respect design annotations from the designer

## Naming Conventions
| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `MetricCard`, `LoginForm` |
| Variants | camelCase property, PascalCase value | `size=Large`, `state=Disabled` |
| Variables | kebab-case path | `colors/primary/500` |
| Pages | PascalCase | `Dashboard`, `AuthLogin` |
| Sections | Title Case | `Hero Section`, `Navigation` |

## MCP Tools Reference

### Official Figma MCP Server
| Tool | Purpose |
|------|---------|
| `use_figma` | Write designs to canvas using design system |
| `get_design_context` | Read design with code + screenshot + hints |
| `get_screenshot` | Visual capture of any node |
| `get_metadata` | Node properties and structure |
| `generate_diagram` | Create FigJam diagrams |
| `get_variable_defs` | Design token definitions |
| `search_design_system` | Find components in libraries |
| `get_code_connect_map` | Component ↔ code mappings |

### Figma Console MCP (Direct Plugin API)
| Tool | Purpose |
|------|---------|
| `figma_execute` | Run arbitrary Plugin API code |
| `figma_take_screenshot` | Capture current view |
| `figma_search_components` | Find components by name |
| `figma_instantiate_component` | Create component instance |
| `figma_get_variables` | List all variables |
| `figma_batch_create_variables` | Create up to 100 variables |
| `figma_set_fills` | Set fill colors |
| `figma_set_text` | Set text content |
| `figma_create_child` | Add child to frame |
| `figma_move_node` | Reposition elements |
| `figma_resize_node` | Resize elements |

## Integration with Noche
- All canvas operations flow through Noche's WebSocket bridge (ports 9223-9232)
- Agent metadata (role, task, status) is broadcast to all connected plugins
- Design tokens extracted from Figma map to `src/figma/tokens.ts` exports
- Generated components land in `generated/` following atomic folder structure
- Specs created from canvas context are validated against Zod schemas
