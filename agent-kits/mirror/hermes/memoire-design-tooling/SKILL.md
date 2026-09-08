---
name: memoire-design-tooling
description: Use when a Hermes session involves UI design, interface craft, Figma, design systems, shadcn/ui, Tailwind, Atomic Design, research synthesis, component specs, design audits, or code generation from design evidence.
version: 2.0.0
author: Sarvesh Chidambaram
license: MIT
metadata:
  hermes:
    tags: [memoire, design-system, figma, shadcn, tailwind, atomic-design]
    related_skills: [software-development, design, figma]
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

This skill requires the reviewed 2.8 frontend contract. Check `memi --version` and npm registry availability first. If the beta is unpublished, use a reviewed local build; after publication, use the exact verified beta version. npm stable remains 2.7.9.

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
