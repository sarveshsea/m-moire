---
name: Figma Design System Rules
description: >
  Generate design system rules that encode codebase conventions for AI agents.
  Produces CLAUDE.md, AGENTS.md, or .cursor/rules files that guide consistent
  component generation, token usage, and styling approaches.
activateOn: design-creation
freedomLevel: high
category: craft
tags:
  - figma
  - design-system
  - agent-rules
  - conventions
  - codegen
author: Figma (adapted for Memoire)
---

# Figma Design System Rules Generator

> Based on Figma's MCP Server Guide `figma-create-design-system-rules` skill.
> Original by Figma. Adapted for Memoire's spec-first architecture.
> Source: github.com/figma/mcp-server-guide

Encodes "the unwritten knowledge" of a codebase into structured rules that AI
agents follow when generating code from Figma designs. Once defined, these rules
dramatically reduce repetitive prompting and ensure consistent output.

---

## Why This Matters

Without DS rules, every agent session re-discovers the same patterns:
- Which layout primitives to use
- Component naming conventions
- Token mapping strategy
- Import patterns and barrel file structure

Rules encode this once so agents produce consistent, project-aligned code.

---

## Target Files

| Agent | File | Format |
|-------|------|--------|
| Claude Code | `CLAUDE.md` | Markdown with `IMPORTANT:` prefixes |
| Codex CLI | `AGENTS.md` | Markdown |
| Cursor | `.cursor/rules/figma-design-system.mdc` | MDC format |
| Memoire | `.memoire/config.json` + spec templates | JSON + Markdown |

---

## Workflow

### 0. BOOTSTRAP — Run create_design_system_rules Tool

Call the Figma MCP server tool to get the foundational template:

```
create_design_system_rules(
  clientLanguages="typescript,javascript",
  clientFrameworks="react"
)
```

**Parameters:**
- `clientLanguages`: comma-separated list (e.g. `"typescript,javascript"`, `"python"`)
- `clientFrameworks`: framework name (e.g. `"react"`, `"vue"`, `"svelte"`, `"angular"`, `"unknown"`)

This returns guidance and a template. Use it as the scaffold for the rules below.

### 1. ANALYZE — Scan the Codebase

```
Project root
  -> Identify frameworks: React, Vue, Svelte, etc.
  -> Identify styling: Tailwind, CSS Modules, styled-components
  -> Identify component library: shadcn/ui, Radix, MUI, etc.
  -> Scan component organization: atomic folders, flat, feature-based
  -> Read existing CLAUDE.md / AGENTS.md for existing rules
```

**Key patterns to detect:**
- Import conventions (barrel files vs direct imports)
- Token usage (CSS variables, Tailwind config, theme objects)
- Component composition patterns (render props, slots, children)
- Naming conventions (PascalCase files, kebab-case folders, etc.)

### 2. EXTRACT — Pull Design System from Figma

```
get_design_context + get_variable_defs
  -> Variables: colors, spacing, radii, shadows
  -> Components: published library components
  -> Styles: text styles, effect styles
  -> Code Connect: existing component mappings
```

### 3. GENERATE — Produce Rules

**Essential rules (always include):**

```markdown
## Component Discovery
IMPORTANT: Before creating any component, check:
1. `get_code_connect_map` for existing Figma mappings
2. `src/components/ui/` for shadcn/ui primitives
3. `.memoire/specs/` for existing Memoire specs

## Design Tokens
IMPORTANT: Never hardcode hex colors or pixel values.
- Colors: use CSS variables from `--color-*` namespace
- Spacing: use Tailwind spacing scale (p-4, gap-6, etc.)
- Typography: use text style classes (text-sm, font-medium)
- Shadows: use shadow utilities (shadow-sm, shadow-md)

## Styling Approach
- Tailwind exclusively — no CSS modules, no inline styles
- Use `cn()` utility for conditional classes
- Responsive: mobile-first with sm/md/lg breakpoints
```

**Recommended rules (include when detected):**

```markdown
## Atomic Design Structure
- atoms: components/ui/ — standalone primitives
- molecules: components/molecules/ — compose 2-5 atoms
- organisms: components/organisms/ — compose molecules, manage state
- templates: components/templates/ — page layout skeletons

## Import Conventions
- Import from barrel files: `@/components/ui`
- Never import internal component files directly
- Use path aliases: `@/` maps to `src/`
```

**Optional rules (project-specific):**
- Accessibility requirements (WCAG level, screen reader patterns)
- Performance constraints (bundle size, lazy loading)
- Testing conventions (what to test, mocking strategy)

### 3b. FIGMA MCP INTEGRATION RULES (always include)

Add these rules to ensure consistent Figma-to-code flow:

```markdown
## Figma MCP Integration Rules
### Required Flow (do not skip)
1. Run get_design_context first for the exact node(s)
2. If truncated, run get_metadata for node map, then re-fetch children
3. Run get_screenshot for visual reference
4. Only after both context + screenshot, download assets and start implementation
5. Translate output (React + Tailwind) into project conventions
6. Validate against Figma for 1:1 look and behavior

### Asset Handling
- IMPORTANT: If Figma MCP returns localhost source for image/SVG, use it directly
- IMPORTANT: DO NOT import new icon packages — all assets from Figma payload
- IMPORTANT: DO NOT create placeholders if localhost source is provided
```

### 4. SAVE — Write to Correct File

- Append to existing rules file, don't overwrite
- Use `IMPORTANT:` prefix for critical rules
- Group rules by category with clear headers
- Include reasoning for non-obvious rules

**Agent-specific file formats:**
| Agent | File | Notes |
|-------|------|-------|
| Claude Code | `CLAUDE.md` | Markdown, `IMPORTANT:` prefix for critical rules |
| Codex CLI | `AGENTS.md` | Markdown |
| Cursor | `.cursor/rules/figma-ds.mdc` | MDC format with frontmatter |
| Memoire | `.memoire/config.json` | JSON + spec templates |

### 5. VALIDATE — Test the Rules

```
Generate a simple component using only the rules
  -> Compare output to existing codebase patterns
  -> Identify gaps: any manual correction needed?
  -> Refine rules based on gaps
  -> Iterate until zero-correction generation
```

---

## Rule Quality Checklist

- Specific and actionable, not vague guidance
- Includes "why" for non-obvious rules
- Uses `IMPORTANT:` for critical rules only (overuse dilutes impact)
- References actual file paths and patterns from the project
- Updated periodically as the project evolves

---

## Anti-Patterns

- Writing rules for patterns that don't exist in the codebase
- Overriding existing CLAUDE.md content without reading it first
- Creating rules that conflict with the project's actual conventions
- Including ephemeral information (version numbers, dates) in rules
- Making rules too granular (file-level) or too abstract (philosophy)

---

## Integration with Memoire

Memoire already enforces Atomic Design and shadcn/ui via CLAUDE.md. This skill
generates **project-specific additions** that complement the base rules:

```
Analyze codebase + Figma DS
  -> [This skill] Generate tailored rules
  -> CLAUDE.md updated
  -> All subsequent memi generate calls follow rules
  -> figma-implement-design note uses rules for mapping
```
