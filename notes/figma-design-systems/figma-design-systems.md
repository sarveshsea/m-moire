---
name: Working with Figma Design Systems
description: >
  Figma's official methodology for building and using design systems.
  Covers components (properties, creation, usage), variables (collections,
  modes, aliasing, scoping), text styles, and effect styles.
activateOn: design-creation
freedomLevel: reference
category: craft
tags:
  - figma
  - design-systems
  - variables
  - components
  - tokens
author: Figma (adapted for Memoire)
---

# Working with Figma Design Systems

Based on Figma's Working with Design Systems guide. Source: github.com/figma/mcp-server-guide

## Philosophy

Design systems bridge representation (design) and implementation (production code) through shared primitives. The goal is not to eliminate gaps between design and code, but to make them definitively bridgable. Figma's model is form-agnostic — a pattern in a spec may take distinct forms across codebases. Translation layers (Code Connect, variables with code syntax, structured specs) let agents and people move between representational and production forms.

Design optimizes for experimentation: visual, easy to iterate, structured for collaboration. Code optimizes for rigidity, efficiency, and correctness. Both paths converge on the same shared outcome.

## Components

Components are Figma's reusable design entities. They overlap with code components but have distinct property models.

### Four Property Types

1. **Variant** — Permutations visualized as explicit nodes in a Component Set. Layer naming encodes combinations: `Variant=Primary,Size=Small,State=Disabled`. Variants multiply combinatorially, so define only the axes you need.

2. **Text/String** — Stored on the component parent, mapped to Text node descendants via `node.componentPropertyReferences.characters`.

3. **Boolean** — Stored on the component parent, mapped to any descendant's visibility via `node.componentPropertyReferences.visible`.

4. **Instance Swap** — Stored on the component parent, mapped to Instance node descendants via `node.componentPropertyReferences.mainComponent`. Classic use: icon slots.

### Creation Best Practices

- Understand the property model before building. Restructuring after instances exist is destructive.
- Lean toward fewer variants and more boolean/text properties to avoid combinatorial explosion.
- Establish variant structure first, then add non-variant properties.
- Always wire properties to descendants — unwired properties are invisible to users.
- Set descriptions on component sets (not individual variants) for dev mode visibility.

### Usage Patterns

- Prefer `importComponentByKeyAsync` over name-based lookup (names are not unique).
- Read `componentPropertyDefinitions` before setting properties — TEXT, BOOLEAN, and INSTANCE_SWAP keys have `#uid` suffixes (e.g. `"Label#1234"`), while VARIANT keys are plain names.
- For nested instance swaps, import the target component and pass its node ID.
- Modifications to nested instances are overrides; change the main component to alter defaults.

## Variables

Variables are Figma's equivalent of design tokens. Types: number, string, color, boolean (single values only — no composite tokens).

### Core Concepts

- **Collections** — Groups of variables (e.g. "Colors" with light/dark modes).
- **Extended Collections** — Inheritance-based overrides, ideal for branded themes.
- **Modes** — Light/dark, sizes, languages, or any dimension the team defines.
- **Aliasing** — Pointing a variable to another variable. Semantic tokens alias primitives; component tokens may alias semantics.
- **Code Syntax** — WEB, iOS, ANDROID representations (e.g. `var(--color-primary)`) surfaced in dev mode and MCP context.
- **Scoping** — `variable.scopes` restricts which property pickers show the variable. Always set specific scopes (`FRAME_FILL`, `TEXT_FILL`, `GAP`, etc.) rather than `ALL_SCOPES`.
- **Grouping** — Slash-delimited names create visual groups. Collection name may serve as prefix that does not appear in the variable name.

### Key Gotchas

- `createVariableCollection` always creates a default mode — rename it, don't create from scratch.
- Duplicate names are silently allowed — always check existence before creating.
- Aliases require `{ type: 'VARIABLE_ALIAS', id: '<variableId>' }` exact shape.
- Cross-file aliasing is not supported via plugin API — import library variables first.

## Text Styles

Named, reusable typography definitions bundling font family, size, weight, line height, letter spacing, and more. The closest equivalent to a type ramp in a token library.

### Key Properties

`name`, `fontSize`, `fontName` (`{ family, style }`), `letterSpacing` (`{ value, unit }`), `lineHeight` (`{ value, unit }` or `{ unit: 'AUTO' }`), `textCase`, `textDecoration`, `paragraphSpacing`, `paragraphIndent`.

### Critical Rules

- `lineHeight` and `letterSpacing` must be objects, not bare numbers.
- Font must be loaded (`figma.loadFontAsync`) before setting `fontName`.
- `setBoundVariable` is NOT available in headless `use_figma` mode — set raw values and bind interactively if needed.
- Use `getLocalTextStylesAsync()` (not the deprecated sync version).
- Names are not unique — match by ID or key.

## Effect Styles

Named definitions of visual effects: drop shadows, inner shadows, layer blur, background blur.

### Effect Types

- `DROP_SHADOW` / `INNER_SHADOW` — `color` (RGBA 0-1), `offset`, `radius`, `spread`, `blendMode`
- `LAYER_BLUR` / `BACKGROUND_BLUR` — `radius`, `visible`

### Rules

- `effects` array is read-only — clone, modify, reassign.
- Colors use RGBA 0-1 range, not hex or 0-255.
- Effects stack in array order (bottom-to-top rendering).
- Variable bindings available for `color`, `radius`, `spread`, `offsetX`, `offsetY`.

## Deep Reference

Full documentation for each topic lives in the `references/` directory:

| File | Topic |
|------|-------|
| `references/wwds.md` | Overview and philosophy |
| `references/wwds-components.md` | Component model and property types |
| `references/wwds-components--creating.md` | Creating components |
| `references/wwds-components--using.md` | Using components |
| `references/wwds-variables.md` | Variable model, collections, modes, scoping |
| `references/wwds-variables--creating.md` | Creating variables |
| `references/wwds-variables--using.md` | Using variables |
| `references/wwds-text-styles.md` | Text style model, bindings, gotchas |
| `references/wwds-effect-styles.md` | Effect style model, shadow types, bindings |
