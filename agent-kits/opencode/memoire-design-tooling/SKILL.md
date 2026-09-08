---
name: memoire-design-tooling
description: Use when an OpenCode task involves UI design, interface craft, Figma, design systems, shadcn/ui, Tailwind, Atomic Design, research synthesis, component specs, design audits, or design-to-code generation.
---

# Memi Design Tooling

Memi gives coding agents repository-specific interface evidence before they edit UI. Start with the smallest workflow that answers the task; Figma, global installation, and a daemon are optional.

## Choose A Workflow

- Before reviewing or changing frontend UI: use `audit-frontend-design`.
- Before building from an existing product system: use `remember-design-system`.
- When adding deterministic pull-request gates: use `enforce-design-ci`.
- For native SwiftUI, SwiftData, App Intents, or Apple-platform verification: use `build-swiftui-interface`.
- For Figma, research, scaffolding, registry publishing, or multi-agent work: continue below.

Install one focused skill directly:

```bash
npx skills add memi-design/memi --skill audit-frontend-design
```

This candidate skill requires a reviewed local 2.8 build. npm stable remains 2.7.9; do not install unpublished 2.8 from npm. Check `memi --version` first.

## Compact Preflight

```bash
memi agent brief . --frontend --intent "<interface task>" --max-bytes 16384 --json
```

Read cited source files when the bounded brief lacks necessary evidence. Optional `--design-evidence design/selected-node.json` accepts normalized Figma/Paper data supplied by the harness; missing mappings and verification stay explicit.

## Local Checks And MCP

```bash
memi diagnose . --json --no-write --fail-on none
memi diagnose . --receipt-only --fail-on none
memi --profile locked mcp start --no-figma
```

Locked MCP exposes four read tools: prepare_frontend_brief, prepare_design_agent_brief, prepare_apple_design_brief, and diagnose_app_quality. The frontend tool supplies actual repository evidence. Many legacy CLI and write tools remain unavailable; capability grants do not unlock deferred command paths. Keep connector calls, project edits, and browser execution in the harness's reviewed workflow.

Reuse local components and tokens according to the consumer project's conventions. Source-bearing JSON is working context; receipt-only is a separate metadata output. See docs/FRONTEND_WORKFLOW.md for the candidate evidence schema and actual verification flow.

## Evidence Contract

1. Read local instructions and existing product-system files first.
2. Collect the minimum evidence that can change the implementation.
3. Cite `file:line` findings and existing components or tokens.
4. Make scoped edits.
5. Re-run the same deterministic checks.
6. Report commands, artifacts, files changed, and remaining assumptions.

Do not claim visual correctness from source checks alone. When rendered behavior matters, verify the actual route at desktop and mobile viewports.
