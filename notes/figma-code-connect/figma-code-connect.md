---
name: Figma Code Connect
description: >
  Map Figma design components to codebase implementations using Code Connect.
  Discovers unmapped components, scans for matching code, creates batch mappings.
  Integrates with Memoire's component registry to prevent duplicate specs.
activateOn: figma-canvas-operation
freedomLevel: high
category: connect
tags:
  - figma
  - code-connect
  - component-mapping
  - design-system
author: Figma (adapted for Memoire)
---

# Figma Code Connect

> Based on Figma's MCP Server Guide `figma-code-connect-components` skill.
> Original by Figma. Adapted for Memoire's registry and spec pipeline.
> Source: github.com/figma/mcp-server-guide

Connects Figma design components to their codebase implementations so that
`get_design_context` returns actual code snippets instead of generic output.
This is the single highest-leverage action for improving design-to-code quality.

---

## Prerequisites

- Figma components must be **published to a team library**
- Code Connect requires **Organization or Enterprise plan**
- User needs **edit access** to the Figma file
- Figma URL must include `node-id` parameter (format `1:2`, not `1-2`)

---

## Workflow

### 1. DISCOVER — Find Unmapped Components

**Parse the Figma URL first:**
- URL: `figma.com/design/:fileKey/:fileName?node-id=1-2`
- Extract fileKey = segment after `/design/`
- Extract nodeId = `1-2` from URL, convert to `1:2` for tool calls (hyphens to colons)

**Call the tool:**
```
get_code_connect_suggestions(fileKey=":fileKey", nodeId="1:2")
```

**Handle response:**
- `"No published components found"` → stop, inform user components need publishing
- `"All components already connected"` → stop, inform user everything is mapped
- Otherwise: list of unmapped components, each with:
  - Component name, node ID, properties JSON (prop names + values), thumbnail image

**Also check Memoire's local state:**
```
.memoire/specs/components/*.json
  -> Cross-reference componentId / figmaNodeId fields
  -> Flag any spec that lacks a Code Connect mapping
```

### 2. MATCH — Scan Codebase for Implementations

For each unmapped component, search the project for matching code:

**Search strategy:**
1. Exact name match: `grep -r "export.*ComponentName"`
2. Fuzzy name match: kebab-case, PascalCase, camelCase variants
3. Props alignment: compare Figma properties to TypeScript prop types
4. Structural match: component composition patterns

**Match criteria (ranked):**
- Same name + aligned props → strong match
- Similar name + partial props → probable match
- Different name + matching structure → weak match (confirm with user)

### 3. PRESENT — Show Matches for Approval

Present findings clearly:

```
Component: Button
  Figma: node-id=1:234, variants: [primary, secondary, ghost]
  Code:  src/components/ui/button.tsx
  Props: variant, size, disabled, asChild
  Match: strong (name + props aligned)

Component: SearchBar
  Figma: node-id=1:567, contains: Input + Button + Icon
  Code:  NOT FOUND — needs new spec
  Action: Run `memi spec component search-bar` to scaffold
```

### 4. MAP — Create Code Connect Mappings

**Exact tool call format:**
```
send_code_connect_mappings(
  fileKey=":fileKey",
  nodeId="1:2",
  mappings=[
    {
      nodeId: "1:234",
      componentName: "Button",
      source: "src/components/ui/button.tsx",
      label: "React"
    },
    {
      nodeId: "1:567",
      componentName: "Card",
      source: "src/components/ui/card.tsx",
      label: "React"
    }
  ]
)
```

**Valid `label` values:**
- Web: `React`, `Web Components`, `Vue`, `Svelte`, `Storybook`, `Javascript`
- iOS: `Swift UIKit`, `Objective-C UIKit`, `SwiftUI`
- Android: `Compose`, `Java`, `Kotlin`, `Android XML Layout`
- Cross-platform: `Flutter`
- Docs: `Markdown`

**Batch all accepted mappings in a single call.**

**Error codes to handle:**
- `CODE_CONNECT_ASSET_NOT_FOUND` — source path or componentName is wrong
- `CODE_CONNECT_MAPPING_ALREADY_EXISTS` — already connected, skip or remove first
- `CODE_CONNECT_INSUFFICIENT_PERMISSIONS` — user needs edit access

### 5. SYNC — Update Memoire Registry

After creating mappings:
- Update `.memoire/specs/` with `codeConnectId` field
- Run `memi pull` to refresh the local design system cache
- Verify mappings with `get_code_connect_map`

---

## Common Issues

| Issue | Solution |
|-------|---------|
| No published components found | Components must be published to a team library first |
| Code Connect unavailable | Requires Organization or Enterprise plan |
| No matching code found | Scaffold a new spec with `memi spec component <name>` |
| Already mapped | Check if existing mapping is current; remove stale ones |
| Insufficient permissions | User needs edit access to the file |

---

## Anti-Patterns

- Mapping components without checking Memoire's spec registry first
- Creating Code Connect for unpublished library components
- Mapping to wrong atomic level (mapping an organism to an atom path)
- Skipping user approval for weak/fuzzy matches
- Creating duplicate specs when a Code Connect mapping would suffice

---

## Integration with Memoire Pipeline

```
get_code_connect_map
  -> Identifies gaps
  -> [This skill] Discover + Match + Map
  -> get_design_context now returns actual code
  -> figma-implement-design note uses mapped components
  -> Codegen produces correct imports
```
