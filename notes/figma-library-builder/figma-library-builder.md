---
name: Figma Library Builder
description: >
  Professional-grade design system creation in Figma from code. Phased workflow
  covering discovery, token architecture, documentation, component building,
  and QA. Includes ready-to-use Plugin API scripts for common operations.
activateOn: library-creation
freedomLevel: high
category: craft
tags:
  - figma
  - library
  - design-system
  - tokens
  - components
author: Figma (adapted for Memoire)
---

# Figma Library Builder

Based on Figma's MCP Server Guide `figma-generate-library` skill.
Source: [github.com/figma/mcp-server-guide](https://github.com/figma/mcp-server-guide)

---

## The One Critical Rule

**This is never a one-shot task.**

A design system library build is a 20-100+ call workflow spanning multiple phases. Every phase depends on the previous one. You cannot skip phases, batch everything into one script, or assume success without validation. Treat this as a multi-session engineering project, not a single prompt.

---

## The 5-Phase Workflow

### Phase 0 — Discovery

Analyze the codebase for token sources (CSS variables, Tailwind config, DTCG JSON, theme objects). Inspect the Figma file for existing conventions (pages, collections, variables, styles, components). Search subscribed libraries with `search_design_system` before planning anything. Build a mapping table of code tokens to Figma variables and present it to the user for approval.

**Gate:** Never begin Phase 1 without explicit user approval of the plan.

### Phase 1 — Foundations (Token Architecture)

Create variable collections with the correct architecture (Primitives + Semantic split). Create primitive variables with raw values, then semantic variables that alias primitives. Set scopes on every variable (never use ALL_SCOPES). Set code syntax on every variable (`WEB`, `ANDROID`, `iOS`). Create text styles and effect styles for typography and shadows.

**Gate:** Validate all variables exist with correct scopes and code syntax before proceeding.

### Phase 2 — File Structure and Documentation

Create the page hierarchy: Cover, separator, Foundations, separator, component pages. Build the Foundations documentation page with color swatches (bound to variables), type specimens, spacing bars, shadow cards, and radius demos. Create component page stubs with documentation frames.

**Gate:** Screenshot and verify the Foundations page renders correctly.

### Phase 3 — Components

Build components in strict dependency order: atoms before molecules, molecules before organisms. For each component: create base variant, duplicate and modify for each variant combination, combine with `combineAsVariants`, wire component properties (TEXT, BOOLEAN, INSTANCE_SWAP), bind all fills/strokes/spacing to variables, set up auto-layout, and add Code Connect mapping.

**Gate:** After each component — screenshot, validate metadata, get user checkpoint.

### Phase 4 — QA and Code Connect

Run naming audit across all pages. Run accessibility contrast checks on semantic color pairs. Bulk-map any remaining Code Connect entries with `send_code_connect_mappings`. Clean up orphaned nodes. Final screenshot review with user.

---

## Enforcement Rules

1. **Sequential mutations only** — never run two `use_figma` writes in parallel. Each call must complete and return IDs before the next call begins.
2. **Validate after each creation** — call `get_metadata` or `get_screenshot` after every write operation. Do not assume success.
3. **User checkpoints at phase boundaries** — present a summary and wait for explicit approval before crossing into the next phase.
4. **Tag every node with `sharedPluginData`** — use namespace `'dsb'` with keys `run_id`, `phase`, and `key` on every created node. This enables safe cleanup and resume.
5. **Maintain a state ledger** — track all created entity IDs, completed steps, and pending validations in your context between calls.
6. **Check-before-create (idempotency)** — before creating any entity, check if it already exists by `sharedPluginData` key or name. Skip if found.

---

## Anti-Patterns to Avoid

- **One-shot scripts** — never try to create an entire library in a single `use_figma` call
- **Hardcoded hex values** — always bind fills to variables; never use raw colors in components
- **ALL_SCOPES on variables** — always set specific, appropriate scopes
- **Name-based cleanup** — never delete nodes by name prefix; use `sharedPluginData` tagging
- **Skipping font loading** — always call `figma.loadFontAsync()` before any text operation
- **Creating semantic tokens with raw values** — semantic variables must alias primitives, never hold hex directly
- **Ignoring existing conventions** — always inspect the file first and match its naming patterns

---

## Available Scripts

Ready-to-use Figma Plugin API scripts in `scripts/`. Each is a self-contained function for `use_figma`.

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `createVariableCollection.js` | Create a variable collection with modes and proper tagging | Phase 1 — setting up token architecture |
| `createSemanticTokens.js` | Create semantic variables that alias primitives with correct scopes | Phase 1 — building the semantic layer |
| `bindVariablesToComponent.js` | Bind token variables to component fills, strokes, padding, radius | Phase 3 — wiring tokens into components |
| `createComponentWithVariants.js` | Create a component set with a full variant matrix | Phase 3 — building component sets |
| `createDocumentationPage.js` | Generate a foundations documentation page with swatches and specimens | Phase 2 — visual token documentation |
| `inspectFileStructure.js` | Audit the current file: pages, collections, variables, styles, components | Phase 0 — discovery and planning |
| `validateCreation.js` | Validate that created nodes exist and have correct properties | All phases — post-creation verification |
| `cleanupOrphans.js` | Remove orphaned nodes from failed runs using `sharedPluginData` tagging | Error recovery — cleaning up after failures |
| `rehydrateState.js` | Reconstruct state ledger from `sharedPluginData` tags after session interruption | Resume — recovering from interrupted builds |

---

## Deep Reference

For detailed guidance on each phase, consult the reference files in `references/`:

| Reference | Covers |
|-----------|--------|
| `discovery-phase.md` | Codebase token extraction, Figma file inspection, `search_design_system` usage, plan building, conflict resolution |
| `token-creation.md` | Collection architecture, variable creation, scopes, code syntax, alias chains, text/effect styles, validation |
| `naming-conventions.md` | Variable naming, component naming, page naming, variant naming, style naming, separator conventions, code syntax mapping |
| `component-creation.md` | Dependency ordering, variant matrices, component properties, auto-layout, variable binding, Building Blocks pattern |
| `documentation-creation.md` | Cover page, foundations page, color swatches, type specimens, spacing bars, shadow cards, radius demos, inline component docs |
| `code-connect-setup.md` | `add_code_connect_map`, `get_code_connect_map`, `send_code_connect_mappings`, variable code syntax, framework labels, verification |
| `error-recovery.md` | STOP-Inspect-Fix-Retry protocol, `sharedPluginData` cleanup, idempotency patterns, state ledger, resume protocol, failure taxonomy |
