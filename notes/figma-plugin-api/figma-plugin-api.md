---
name: Figma Plugin API Reference
description: >
  Consolidated Plugin API patterns, gotchas, and recipes for Figma canvas
  operations. Covers node creation, variables, components, text/effect styles,
  fills/strokes, and error recovery.
activateOn: figma-canvas-operation
freedomLevel: reference
category: craft
tags:
  - figma
  - plugin-api
  - reference
author: Figma (adapted for Memoire)
---

# Figma Plugin API Reference

Based on Figma's MCP Server Guide. Source: github.com/figma/mcp-server-guide

## Gotchas (Critical -- memorize these)

1. **New nodes default to (0,0)** -- top-level nodes overlap existing content. Scan `page.children` for `maxX` and offset new nodes to the right. Children inside auto-layout parents are positioned automatically.

2. **`addComponentProperty` returns a string key** -- never hardcode or guess it (`"label#4:0"`). Capture the return value directly; do NOT treat it as an object.

3. **Always return ALL created/mutated node IDs** -- without returned IDs, subsequent calls cannot reference or clean up nodes.

4. **Colors are 0-1 range** -- `{ r: 1, g: 0, b: 0 }` not `{ r: 255, g: 0, b: 0 }`.

5. **Fills/strokes are immutable arrays** -- clone with `JSON.parse(JSON.stringify(...))`, modify, reassign. In-place mutation does nothing.

6. **`setBoundVariableForPaint` returns a NEW paint** -- capture the return value; the original paint is unchanged.

7. **Variable collections start with 1 mode** -- rename it, don't try to add a first mode.

8. **`combineAsVariants` requires ComponentNodes** -- passing frames throws. Each component name must use `property=value` format.

9. **Page switching: use `await figma.setCurrentPageAsync(page)`** -- the sync setter `figma.currentPage = page` throws in MCP/headless runtimes.

10. **Never use `figma.notify()`** -- throws "not implemented". Return values instead.

11. **`getPluginData`/`setPluginData` not supported** -- use `getSharedPluginData`/`setSharedPluginData` (with a namespace) or track node IDs.

12. **Scripts must always return a value** -- no return means the caller gets no useful response.

13. **`resize()` resets sizing modes to FIXED** -- call `resize()` first, then set `primaryAxisSizingMode`/`counterAxisSizingMode`. Never pass throwaway values like `1` or `0`.

14. **FILL children collapse inside HUG parents** -- parent must be FIXED or FILL for `layoutSizingHorizontal = 'FILL'` to work on children.

## Common Patterns

### Basic script structure
```js
const createdNodeIds = []
// ... create nodes, push IDs ...
return { success: true, createdNodeIds, rootNodeId: root.id }
```

### Offset from existing content
```js
let maxX = 0
for (const child of figma.currentPage.children) {
  maxX = Math.max(maxX, child.x + child.width)
}
frame.x = maxX + 100
```

### Auto-layout frame
```js
const frame = figma.createFrame()
frame.layoutMode = 'VERTICAL'
frame.paddingLeft = 16; frame.paddingRight = 16
frame.paddingTop = 12; frame.paddingBottom = 12
frame.itemSpacing = 8
frame.layoutSizingHorizontal = 'HUG'
frame.layoutSizingVertical = 'HUG'
```

### Text node
```js
await figma.loadFontAsync({ family: "Inter", style: "Regular" })
const text = figma.createText()
text.characters = "Hello"
text.fontSize = 16
text.textAutoResize = 'WIDTH_AND_HEIGHT'
```

### Bind color variable to fill
```js
const basePaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }
const boundPaint = figma.variables.setBoundVariableForPaint(basePaint, "color", colorVar)
node.fills = [boundPaint]
```

### Bind numeric variable
```js
node.setBoundVariable("paddingTop", spacingVar)
node.setBoundVariable("itemSpacing", gapVar)
node.setBoundVariable("topLeftRadius", radiusVar)
```

## Variable Patterns Essentials

- **Collections**: `createVariableCollection(name)` -- starts with 1 mode. Rename it immediately. `addMode(name)` returns new modeId.
- **Types**: COLOR (`{r,g,b,a}` -- note alpha!), FLOAT, STRING, BOOLEAN.
- **Scopes**: Default `ALL_SCOPES` pollutes every picker. Always restrict: `["FRAME_FILL","SHAPE_FILL"]`, `["TEXT_FILL"]`, `["GAP"]`, `["STROKE_COLOR"]`, `[]` (hidden).
- **Aliasing**: `semanticVar.setValueForMode(modeId, { type: 'VARIABLE_ALIAS', id: primitiveVar.id })`.
- **Code syntax**: `variable.setVariableCodeSyntax('WEB', 'var(--token-name)')`.
- **Mode limits**: Free=1, Professional=4, Org/Enterprise=40+.
- **Discover first**: Always inspect existing variables with `getLocalVariableCollectionsAsync()` before creating new ones.

## Component Patterns Essentials

- **Create**: `figma.createComponent()` -- behaves like FrameNode but supports instancing and variants.
- **Variants**: Name components with `property=value` format. `combineAsVariants([comp1, comp2], parent)` creates a ComponentSet.
- **Layout after combine**: Variants stack at (0,0) in headless mode. Manually position in a grid, then resize ComponentSet from actual child bounds.
- **Component properties**: `comp.addComponentProperty('Label', 'TEXT', 'Button')` returns a key string. Link via `child.componentPropertyReferences = { characters: key }`.
- **Property types**: TEXT, BOOLEAN, INSTANCE_SWAP. Add properties BEFORE `combineAsVariants`.
- **Explicit modes**: `comp.setExplicitVariableModeForCollection(collection, modeId)` -- required for variable-driven variants.
- **Import by key**: `figma.importComponentByKeyAsync(key)` for team library components. For current-file components, use `findOne()`/`getNodeByIdAsync()`.

## Error Recovery Principles

- **`use_figma` is atomic** -- failed scripts make zero changes. The file stays in its pre-call state. Retrying after a fix is always safe.
- **Validate with `get_metadata`** (fast, structural) after every creation step. Reserve `get_screenshot` (slow, visual) for major milestones.
- **On error**: STOP, read the error, inspect file state if unclear, fix the script, retry.
- **Workflow**: `use_figma` -> `get_metadata` -> fix -> `get_metadata` -> ... -> `get_screenshot` at milestones.

## Deep Reference

Full details with comprehensive code examples live in the `references/` directory:

| File | Content |
|------|---------|
| `references/api-reference.md` | Core API surface -- node types, properties, methods |
| `references/common-patterns.md` | 10 working code recipes for frequent operations |
| `references/component-patterns.md` | Components, variants, properties, instances, detach |
| `references/effect-style-patterns.md` | Drop shadows, inner shadows, blur effect styles |
| `references/gotchas.md` | All 14 gotchas with WRONG/CORRECT code examples |
| `references/plugin-api-patterns.md` | Plugin API execution patterns, async/await, batching |
| `references/text-style-patterns.md` | Text styles, font loading, lineHeight/letterSpacing |
| `references/validation-and-recovery.md` | Validation workflow, get_metadata vs get_screenshot |
| `references/variable-patterns.md` | Collections, modes, scopes, aliasing, code syntax |
