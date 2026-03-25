# Mémoire Changelog

Mémoire is an AI-native design intelligence engine. Designers use it to build their own products — connecting Figma, pulling design systems, generating production code.

This changelog tracks Mémoire itself: every version, commit, and architectural decision that shapes the tool.

---

## v0.1.1 — 2026-03-25

### Commits
| Hash | Message |
|------|---------|
| `0bbd524` | Add #ai-open hash trigger to auto-open AI drawer in line items |
| `e49792e` | Force explicit #ffffff on title and desc highlights |
| `1e130e8` | Fix title color — use explicit gold #C4A35A instead of --accent |
| `cc0ab4e` | Fix title visibility — ensure full text is bright |
| `780468d` | Highlight key phrases in Home about section |
| `806cd1f` | Rewrite Home about section — focus on AICP accuracy and structured form |
| `816db8f` | Minor preview index tweaks |
| `ee56ff5` | Strip animation CSS, clean up Home tab styling |
| `d4a3d7e` | Polish preview animations and fix broken CSS rules |
| `39fd80f` | Add all Dibs preview pages for Vercel hosting |
| `1934921` | Add Dibs preview screens, AICP research, and project state |

### Key Design Decisions
- **Preview as Product Demo** — Preview server now serves full interactive product prototypes (Dibs), not just component galleries. Tabs: Home, Line Items, Bid Board, Dashboard, Research, AI.
- **PDF Reader Aesthetic for Documents** — Research documents render inside a scrollable off-white paper container (`max-height: 72vh`, `#fafaf9` background) with light-theme variable overrides to keep content legible.
- **Research Citation System** — `goToInsight()` navigates from any citation to the research insights panel with scroll and highlight animation. IDs scoped to panel to avoid duplicate-ID collisions.
- **Visual Persona Cards** — Research personas redesigned from text walls to visual cards with avatar circles, stat bars, SVG icons, pill tags, and citation links.
- **Brightness Pass on Research Text** — All `var(--fg-muted)` (#636369) occurrences in research section brightened to near-white values (#b0b0b4 to #d0d0d4) for readability.

### Dibs Product Changes
- Added full Dibs preview pages: dashboard, bid setup, bid board, line items with AI drawer
- Added AICP bidding research section: 50 insights, 3 personas, 17 themes, competitive matrix, 4 deep-dive documents, 18 sources
- Added key takeaway summaries to all 7 research sub-tabs
- Redesigned persona cards with visual layout, stats, icons, and research citations
- Built PDF-like document reader with scrollable paper container and light-theme CSS variable overrides
- Fixed `goToInsight()` duplicate-ID bug by scoping queries to `#res-insights` panel
- Stripped broken animation CSS, cleaned up Home tab styling
- Added `#ai-open` hash trigger to auto-open AI drawer
- Added validation sweep panel to `dibs.html` — animated slide-in panel with progress bar, per-check pass/fail/warn states, and summary
- Brightened all muted grey text across research section for readability
- Removed em dashes from research content
- Rewrote Home about section to focus on AICP accuracy and structured form intelligence
- Added `bid-board-iterations.html` — bid board iteration history page
- Added `dibs-features.html` — Dibs feature showcase page

---

## v0.1.0 — 2026-03-24

### Commits
| Hash | Message |
|------|---------|
| `fc71ca1` | Add /motion-video skill — product animation & UI motion superagent |
| `7b2cda3` | Add auto-spec engine, noche go, noche export, and token-aware codegen |
| `709bb57` | Clean up CLI output — human-readable logs, suppress internal noise |
| `82895d6` | Clean preview of user-project content, wire /api/specs to registry |
| `d9f4eef` | Rename BidCraft → Dibs, swap emojis for Lucide icons, update nav across preview |
| `1673d3c` | Fix CHANGELOG.md: track Noche the product, not user projects |
| `59bc247` | Add CHANGELOG.md as project decision log, update CLAUDE.md convention |
| `bdad1cc` | Replace Labor Budgeting design system with Mémoire DS, add changelog page |
| `a20c747` | Finalize ark → noche rename across entire codebase |
| `9c15762` | Add animated 3D spinning moon to README header |
| `7881845` | Audit and upgrade all Mémoire skills against Figma MCP best practices |
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
- **Skills Architecture** — 10 skill files with freedom levels (maximum, high, read-only, reference).
- **Changelog Convention** — Claude updates this file after every Mémoire commit. User projects are tracked locally in `.memoire/`, not here.
- **Auto-Spec Engine** — `memi pull` automatically creates ComponentSpecs from Figma components. Infers atomic level, shadcn base, and props.
- **Single-Command Pipeline** — `memi go` runs connect → pull → auto-spec → generate → preview in one command.
- **Export to Project** — `memi export` copies generated code into the user's actual project tree.
- **Token-Aware Codegen** — Generated components inject CSS variable references from pulled design tokens.
- **Motion Video Skill** — `/motion-video` superagent for Apple-grade product animation, portfolio videos, motion tokens, Figma→AE pipeline.

### Changes
- Created `src/engine/auto-spec.ts` — auto-spec engine (Figma components → ComponentSpecs)
- Created `src/commands/go.ts` — single-command full pipeline
- Created `src/commands/export.ts` — export generated code to user project
- Created `skills/MOTION_VIDEO_DESIGN.md` — motion/video design superagent skill (350+ lines)
- Modified `src/codegen/shadcn-mapper.ts` — token-aware code generation with CSS variables
- Modified `src/engine/core.ts` — added autoSpec() method called after pull
- Modified `src/commands/pull.ts` — shows auto-generated spec count
- Cleaned up CLI output — human-readable logs, suppress internal noise
- Rewrote `preview/design-system.html` — Mémoire's actual tokens, typography, components, atomic hierarchy
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
