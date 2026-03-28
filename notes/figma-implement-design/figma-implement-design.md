---
name: Figma Implement Design
description: >
  Structured workflow for translating Figma designs into production-ready code.
  Extracts design context via MCP, maps tokens to project conventions, generates
  shadcn/ui + Tailwind components with Atomic Design classification. Targets 1:1
  visual parity through screenshot validation.
activateOn: component-creation
freedomLevel: high
category: generate
tags:
  - figma
  - design-to-code
  - implementation
  - visual-parity
  - shadcn
author: Figma (adapted for Memoire)
---

# Figma Implement Design

> Based on Figma's MCP Server Guide `figma-implement-design` skill.
> Original by Figma. Adapted for Memoire's spec-first, Atomic Design pipeline.
> Source: github.com/figma/mcp-server-guide

Translates Figma designs into production-ready components through the Memoire
spec-first pipeline. Every component gets an Atomic Design level, a validated
JSON spec, and shadcn/ui + Tailwind code.

---

## Skill Boundaries

| If the user wants to... | Use this skill |
|-------------------------|---------------|
| Implement a Figma design as code | Yes — this skill |
| Create/edit nodes inside Figma | Switch to `/figma-use` |
| Build full-page screens in Figma from code | Switch to `/figma-generate-design` |
| Map components via Code Connect | Switch to `figma-code-connect` note |
| Generate DS agent rules | Switch to `figma-ds-rules` note |

---

## Workflow

### 1. EXTRACT — Get Design Context

**URL parsing:**
- `figma.com/design/:fileKey/:fileName?node-id=1-2`
  - fileKey = segment after `/design/`
  - nodeId = `1-2` from URL, convert `-` to `:` for tool calls → `1:2`
- Branch URLs: `figma.com/design/:fileKey/branch/:branchKey/:fileName` → use branchKey

**Primary call:**
```
get_design_context(fileKey=":fileKey", nodeId="1:2")
```
Returns: layout properties (Auto Layout, constraints, sizing), typography specs,
color values and design tokens, component structure/variants, spacing/padding.

**Visual reference (always capture):**
```
get_screenshot(fileKey=":fileKey", nodeId="1:2")
```
Keep this screenshot accessible throughout implementation as the source of truth.

**If response is truncated or too large:**
1. Call `get_metadata(fileKey=":fileKey", nodeId="1:2")` for the high-level node map
2. Identify specific child nodes from metadata
3. Fetch each child: `get_design_context(fileKey=":fileKey", nodeId=":childNodeId")`

Always prefer `get_design_context` over `get_metadata` — it returns Code Connect
hints, tokens, and structured layout data.

### 1b. ASSETS — Download Required Assets

Download any images, icons, or SVGs returned by the Figma MCP server.

**Asset rules (strict):**
- If the server returns a `localhost` source for an image or SVG, use it directly
- DO NOT import or add new icon packages — all assets come from the Figma payload
- DO NOT use or create placeholders if a `localhost` source is provided
- Assets are served through the Figma MCP server's built-in assets endpoint
- Store downloaded assets in the project's designated asset directory

### 2. MAP — Resolve to Project Conventions

**Before writing any code:**

1. **Check Code Connect** — call `get_code_connect_map` to see if this component
   already has a mapped codebase equivalent. If mapped, use that component directly.

2. **Check Memoire registry** — scan `.memoire/specs/` for existing specs that
   match or overlap. Extend, don't duplicate.

3. **Map tokens:**
   - Figma variables → project CSS variables / Tailwind config tokens
   - Figma text styles → Tailwind typography classes
   - Figma effect styles → Tailwind shadow/blur utilities
   - Raw hex values → find nearest design token. If no match, flag it.

4. **Classify Atomic Level:**
   - Standalone primitive (button, input, badge) → `atom` → `components/ui/`
   - Composes 2-5 atoms (search bar, card header) → `molecule` → `components/molecules/`
   - Composes molecules, manages state (nav, form section) → `organism` → `components/organisms/`
   - Page layout skeleton → `template` → `components/templates/`

### 3. SPEC — Generate JSON Spec

Create the component spec before writing code:

```
memi spec component <name>
  -> Populate from extracted Figma data
  -> Set atomicLevel, composesSpecs, props, variants
  -> Validate with Zod schema
  -> Save to .memoire/specs/components/<name>.json
```

### 4. GENERATE — Produce Code

```
memi generate <name>
  -> Read spec
  -> Map to shadcn/ui primitives
  -> Generate TSX + Tailwind
  -> Place in correct atomic folder
  -> Export from barrel file
```

**Code rules:**
- shadcn/ui exclusively for primitives — never raw HTML for standard controls
- Tailwind exclusively for styling — no CSS modules, no styled-components
- TypeScript strict — all props typed
- Reuse existing project components over creating duplicates
- Extract hardcoded values to tokens or constants

### 5. VALIDATE — Visual Parity Check

Compare the rendered component against the screenshot from step 1. Max 3 self-heal rounds.

**Validation checklist:**
- [ ] Layout matches (spacing, alignment, sizing)
- [ ] Typography matches (font, size, weight, line height)
- [ ] Colors match exactly (no raw hex if tokens exist)
- [ ] Interactive states work as designed (hover, active, disabled)
- [ ] Responsive behavior follows Figma constraints
- [ ] Assets render correctly (no broken localhost refs)
- [ ] Accessibility standards met (WCAG)

**Common issues:**
| Issue | Fix |
|-------|-----|
| Truncated Figma output | `get_metadata` first, then individual `get_design_context` per child node |
| Design mismatch | Side-by-side with screenshot, verify spacing/colors/typography from context data |
| Token value conflicts | Prefer project tokens, adjust spacing minimally for visual fidelity |
| Missing assets | Use localhost URLs from Figma MCP server directly; do not create placeholders |
| Assets not loading | Verify MCP server assets endpoint is accessible; use localhost URLs unmodified |

---

## Anti-Patterns

- Implementing from assumptions without fetching design context first
- Creating new components when existing ones match 80%+
- Hardcoding hex colors instead of mapping to design tokens
- Skipping the spec step and writing code directly
- Building everything in one pass without screenshot validation
- Imposing naming conventions that differ from the existing codebase

---

## Integration with Memoire Pipeline

This skill fits into the broader Memoire workflow:

```
Figma Design
  -> [This skill] Extract + Map + Spec + Generate
  -> memi preview — visual gallery
  -> memi watch — auto-regenerate on spec changes
  -> figma-sync note — keep Figma and code in sync
```
