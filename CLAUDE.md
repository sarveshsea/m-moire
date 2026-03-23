# Ark — Project Guidelines for Claude

## What is Ark?
Ark is an AI-native design intelligence engine that bridges Figma, user research, and code generation into a spec-driven system. It generates shadcn/ui components from structured specs.

## Architecture
- `src/engine/` — Core orchestrator, project detection, registry
- `src/figma/` — Figma bridge (WebSocket), token extraction, sticky notes
- `src/research/` — Research engine (Excel, web, stickies → insights)
- `src/specs/` — Spec types (component, page, dataviz) and validation
- `src/codegen/` — Code generation (shadcn mapper, dataviz, pages)
- `src/preview/` — Vite-based HTML preview gallery
- `src/tui/` — Terminal UI (Ink/React)
- `src/commands/` — CLI commands (commander.js)

## Key Conventions
- **Always use shadcn/ui** — no custom component libraries
- **Spec-first** — every component starts as a JSON spec before code generation
- **TypeScript strict** — all code is strictly typed
- **Tailwind only** — no CSS modules, no styled-components
- **Zod schemas** — all data shapes validated with Zod

## Commands
- `ark connect` — Connect to Figma
- `ark pull` — Extract design system
- `ark spec component|page|dataviz <name>` — Create a spec
- `ark generate [name]` — Generate code from specs
- `ark research from-file|from-stickies|synthesize|report` — Research pipeline
- `ark tokens` — Export design tokens
- `ark status` — Show project status
- `ark sync` — Full sync pipeline
- `ark preview` — Start preview server

## Stack
- Node.js 20+, TypeScript 5.x, ESM modules
- Commander.js (CLI), Ink (TUI), Zod (validation)
- WebSocket (Figma bridge), ExcelJS (spreadsheets)
- Recharts (dataviz), Vite (preview)
