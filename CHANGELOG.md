# Noche Changelog

Noche is an AI-native design intelligence engine. Designers use it to build their own products — connecting Figma, pulling design systems, generating production code.

This changelog tracks Noche itself: every version, commit, and architectural decision that shapes the tool.

---

## labor-budgeting fork — 2026-03-24

### Commits
| Hash | Message |
|------|---------|
| `da757ac` | Fork: Labor Budgeting 3.1 bridge setup with full portal upgrade |

### Key Changes
- **REST Extraction** — `src/figma/rest-client.ts` pulls tokens, components, styles, and target node directly via Figma REST API. No plugin required for data extraction.
- **Port Probe Fix** — `ws-server.ts` now WebSocket-probes each port before binding, correctly skipping ports occupied by Figma Console MCP on IPv6 loopback (::1) even when IPv4 (0.0.0.0) is technically free.
- **Portal Upgrade** — Setup wizard tab (3-step: token → file key → plugin install), Compose tab (natural language → orchestrator), auto-load design system data from `.noche/` cache on DATA tab.
- **`/api/data` endpoint** — Serves cached design system + page tree JSON to the portal without requiring a live plugin connection.
- **`/api/setup` endpoint** — Saves FIGMA_TOKEN/FIGMA_FILE_KEY to `.env.local` from the browser dashboard.
- **Engine env loader** — `init()` now reads `.env.local` / `.env` into `process.env` automatically.
- **Labor Budgeting 3.1** — Pre-configured in `.env.local`: fileKey `aHoArFXJNTUUcKcvI5zNSj`, node `5305:8228`. Extracted 121 color tokens, 26 components (Button, Navigation, Form, Data Display, Overlay, Feedback, Layout), 8 text/effect styles, 16-page tree.

---

## v0.1.0 — 2026-03-24

### Commits
| Hash | Message |
|------|---------|
| `d9f4eef` | Rename BidCraft → Dibs, swap emojis for Lucide icons, update nav across preview |
| `1673d3c` | Fix CHANGELOG.md: track Noche the product, not user projects |
| `59bc247` | Add CHANGELOG.md as project decision log, update CLAUDE.md convention |
| `bdad1cc` | Replace Labor Budgeting design system with Noche DS, add changelog page |
| `a20c747` | Finalize ark → noche rename across entire codebase |
| `9c15762` | Add animated 3D spinning moon to README header |
| `7881845` | Audit and upgrade all Noche skills against Figma MCP best practices |
| `70d8f6a` | Replace remaining ark CLI references with noche |
| `9f57f82` | Rename Figma Ark → Noche across entire codebase |
| `2b0017f` | Add Figma MCP canvas integration, skills, atomic design enforcement, and README |

### Key Design Decisions
- **Atomic Design Only** — Every generated component must declare an atomic level (atom, molecule, organism, template). Enforced in specs and codegen.
- **MCP Tool Decision Tree** — `use_figma` for design-system-aware ops, `figma_execute` for raw Plugin API. Check Code Connect BEFORE creating anything.
- **Self-Healing Loop** — Mandatory CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY (max 3 rounds) for all canvas operations.
- **Code Connect First-Class** — Every ComponentSpec has a `codeConnect` field mapping Figma node IDs to codebase paths.
- **Multi-Agent Native** — Multiple Claude instances on ports 9223-9232. Color-coded box widgets in Figma (yellow=working, green=done, red=error).
- **AgenticUI Aesthetic** — Monospace terminal-paper aesthetic. Dark for system UI, warm paper for generated output. Gold accent (#9D833E).
- **Skills Architecture** — 9 skill files with freedom levels (maximum, high, read-only, reference).
- **Changelog Convention** — Claude updates this file after every Noche commit. User projects are tracked locally in `.noche/`, not here.

### Changes
- Rewrote `preview/design-system.html` — Noche's actual tokens, typography, components, atomic hierarchy
- Created `preview/changelog.html` — timeline view with design decisions per version
- Upgraded all 9 skills against Figma MCP best practices
- Created 3 new skills: `DASHBOARD_FROM_RESEARCH.md`, `FIGMA_AUDIT.md`, `FIGMA_PROTOTYPE.md`
- Added animated 3D moon SVG to README header
- Complete ark → noche rename across 40+ files
- Updated `skills/registry.json` to v2.0.0

---

## v0.0.1 — 2026-03-23

### Commits
| Hash | Message |
|------|---------|
| `199df7a` | Initial commit: Ark — AI-native Figma design intelligence engine |

### Key Design Decisions
- **Spec-First Architecture** — Every component starts as a JSON spec before code generation.
- **WebSocket Figma Bridge** — Auto-discovery on ports 9223-9232. Zero config.
- **shadcn/ui + Tailwind** — All generated code uses shadcn/ui and Tailwind CSS. Zod for validation.
- **Research Pipeline** — Excel/CSV import, Figma sticky extraction, AI synthesis, report generation.
- **Built for Claude** — CLAUDE.md + skills/ teach Claude to operate autonomously.

### Changes
- Initial codebase: engine, Figma bridge, research engine, spec system, codegen, preview server, CLI, TUI, Figma plugin, skills
