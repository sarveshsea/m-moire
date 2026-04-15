# Mémoire Changelog

Mémoire is an AI-native design intelligence engine. Designers use it to build their own products — connecting Figma, pulling design systems, generating production code.

This changelog tracks Mémoire itself: every version, commit, and architectural decision that shapes the tool.

---

## v0.12.0 — 2026-04-15 (tweakcn integration)

### The hook
[tweakcn](https://tweakcn.com) owns visual theming for shadcn/ui. Memoire owns distribution. They now plug into each other.

### New
- **`memi publish --theme <path-or-url>`** — load tokens from a tweakcn CSS export (file or share URL) before publishing. Parses Tailwind v3 `:root { --primary: ... }` **and** v4 `@theme { --color-primary: ... }` blocks, merges `:root` + `.dark` into multi-mode tokens, and hands them to the registry publisher.
- **`src/integrations/tweakcn.ts`** — `parseTweakcnCss()` + `fetchTweakcnTheme()` with the same SSRF guard as the registry resolver.
- **24 new parser tests** covering v3 shorthand HSL, v4 oklch(), dark mode, shadow/spacing/typography classification, and SSRF edge cases.

### Flow
```bash
# Design your theme at tweakcn.com, copy the CSS (or share URL), then:
memi publish --name @you/theme --theme ./tweakcn.css --push

# Any project can now install it:
npx @sarveshsea/memoire add Button --from @you/theme
```

---

## v0.11.0 — 2026-04-15 (The Registry Pivot)

### The shift
Memoire is no longer a "design system extractor." It's a **registry protocol** — the shadcn pattern, for entire design systems. Every Figma file can now be published to npm and installed anywhere as *real working code*, not just specs.

### New commands
- **`memi publish --name @you/ds [--push]`** — Figma → npm package with registry.json + tokens + specs + **bundled React/Vue/Svelte code**. `--push` runs `npm publish --access public` automatically.
- **`memi add <Component> --from <registry>`** — drops a working component file into `src/components/memoire/` immediately (uses bundled code — no local codegen required).
- **`memi update <registry>`** — re-install every component from a registry at its latest version.
- **`memi sync --auto-pr`** — on design system change, create a branch, commit, push, and open a PR via `gh`. The career-ops moment.
- **`memi init <name>`** — scaffold a registry package with your current design system.
- **`memi design-doc <url> --codegen`** — also emit Tailwind v4 `@theme` block.
- **`memi design-doc <url> --init <name>`** — extract URL + immediately build a registry package.

### New modules
- `src/registry/schema.ts` — Memoire Registry Protocol v1 (Zod schemas)
- `src/registry/publisher.ts` — design system → publishable package
- `src/registry/resolver.ts` — fetch registries from npm, github:, https://, local path (with SSRF guard)
- `src/registry/installer.ts` — install components from registries into user projects
- `src/codegen/tailwind-v4.ts` — Tailwind v4 `@theme` CSS generator

### Deprecations (removing in v0.12.0)
`memi heartbeat`, `memi prototype`, `memi dashboard`, `memi list`, `memi research`, `memi ia` now emit deprecation warnings. Silence with `MEMOIRE_SILENCE_DEPRECATIONS=1`.

### Standalone binaries — install without npm
Mémoire now ships as a single executable per OS (`memi-darwin-arm64`, `memi-darwin-x64`, `memi-linux-x64`, `memi-win-x64`) via GitHub Releases. Fixes the top user complaint from locked-down work laptops — no Node, no npm, no admin rights.

**Install channels:**
- `curl -fsSL https://memoire.cv/install.sh | sh` — auto-patches shell rc, verifies SHA256
- `irm https://memoire.cv/install.ps1 | iex` — auto-adds to Windows user PATH
- `brew install sarveshsea/memoire/memoire` — Homebrew tap, auto-updated per release
- `docker run ghcr.io/sarveshsea/memoire` — air-gapped envs
- Manual archive + `SHA256SUMS.txt` download for proxy-blocked users

**New commands:**
- `memi upgrade` — self-update the binary in place (SHA-verified, atomic swap with rollback on failure)

**Under the hood:**
- Built with `bun build --compile` per [scripts/build-binary.mjs](scripts/build-binary.mjs), emitting per-archive `.sha256` and combined `SHA256SUMS.txt`
- CI matrix in [.github/workflows/release-binaries.yml](.github/workflows/release-binaries.yml) produces 4 archives + Docker image + Homebrew formula bump per tag
- New [src/utils/asset-path.ts](src/utils/asset-path.ts) resolves sidecar assets (`skills/`, `notes/`, `plugin/`, `preview/templates/`) in both npm and binary modes
- `@napi-rs/canvas` moved to `optionalDependencies` with a character-width fallback so text measurement works even when the native module isn't available
- First-run welcome banner in [src/index.ts](src/index.ts) shown once per `$HOME`, stamped so it never nags

### Tests
20+ new tests across registry schema, publisher round-trip, and resolver SSRF guards.

---

## v0.10.1 — 2026-04-13 (Architecture + Growth)

### Highlights
- **Multi-framework codegen** — `memi generate --framework vue|svelte` alongside React
- **AI retry logic** — exponential backoff (3 retries) for transient API failures
- **Token-aware codegen** — generated components use CSS variable refs instead of hardcoded hex
- **`memi diff`** — show what changed since last design system pull
- **Parallel pipeline** — spec generation and registry loading run concurrently
- **REST pull MCP tool** — `pull_design_system_rest` (21 tools total)
- **JSDoc + a11y defaults** — generated components include purpose docs and ARIA attributes
- **39 new tests** — auto-spec, page-gen, dataviz-gen, tailwind-tokens, AI retry, Penpot SSRF
- **Glama A A A** — MCP server listed on Glama with full quality score

### Security & Stability
- Configurable `--timeout` for design-doc fetch
- Prop name validation (TS identifier check) in MCP `create_spec`
- Atom composition now an error (not warning) in spec validation
- `.npmignore` — package 60% smaller, no src/tests/Dockerfile shipped

### Distribution
- awesome-mcp-servers PR submitted (Glama badge, A A A)
- awesome-claude-code issue filed
- README rewritten for viral positioning
- design-extract skill + registry entry

---

## v0.10.0 — 2026-04-10 (Growth Sprint)

### Commits
| Hash | Message |
|------|---------|
| `666fbfb` | feat: security hardening, Storybook generation, package keywords |
| `f198be1` | feat: Style Dictionary export, shadcn registry server, Penpot bridge |
| `e863f4e` | feat: zero-friction path — npx extract, memi extract alias, DESIGN.md attribution |

### New Features

**Penpot bridge (`memi pull --penpot`)** — Full Penpot REST API integration. Pulls colors, typographies, and design tokens from any Penpot file using `PENPOT_TOKEN` + `PENPOT_FILE_ID` + `PENPOT_BASE_URL`. No plugin required, no browser needed. Returns the same `DesignSystem` interface so all downstream codegen works unchanged.

**Style Dictionary export** — `memi tokens` now emits `tokens.style-dictionary.json` in W3C DTCG format (`$type`/`$value` syntax). Plugs Mémoire into the 200K weekly Style Dictionary ecosystem — Figma → tokens → Style Dictionary → any platform.

**shadcn registry server** — The local preview server (`memi preview`) now serves a `/r/` registry endpoint compatible with shadcn v2. Any generated component is installable via `npx shadcn add http://localhost:3030/r/ComponentName.json` without publishing to npm.

**Storybook CSF3 story generation** — Every `memi generate` now produces a `.stories.tsx` alongside the component and barrel. Default + per-variant stories, autodocs enabled, `Meta<typeof Comp>` typed. Taps into the 4.6M weekly Storybook ecosystem.

**`memi design-doc` / `memi extract`** — `memi extract <url>` alias works. DESIGN.md output includes attribution footer. Hostname sanitization strips unicode/special chars safely.

**Component fingerprints** — Every generated component carries `// Generated by Memoire · memi generate <name> · https://memoire.cv` as its first line, making AI tools and grep trivially identify Mémoire-managed files.

**CLAUDE.md + .mcp.json injection on `memi init`** — Every initialized project gets a `CLAUDE.md` listing all 20 MCP tools and a `.mcp.json` with the Mémoire server config. Claude Code picks it up automatically every session.

**`llms.txt` on memoire.cv** — Machine-readable AI discovery file. Codex, Claude, and other LLM tools that crawl `llms.txt` will find Mémoire and understand when to suggest it.

### Security Fixes (11)
1. Path traversal guard in preview static serving (`resolve` alias prevents escaping `staticDir`)
2. Prototype pollution block in `registry.ts` JSON.parse reviver (`__proto__`, `constructor`, `prototype` keys filtered)
3. SSRF guard for CSS `@import` URLs in `css-extractor.ts` (validates resolved URLs against `assertPublicUrl`)
4. WebSocket origin validation in `api-server.ts` (localhost-only `verifyClient` callback)
5. CORS scoping to exact port in `/api/` routes (was wildcard)
6. CORS scoping to localhost in `/r/` registry routes
7. Component name validation in registry routes (`/^[A-Za-z][A-Za-z0-9_-]*$/`)
8. Combined rate-limit score in `ws-server.ts` (message + byte weights, not separate counters)
9. `redirect: "error"` on Penpot fetch to prevent auth token leakage via SSRF
10. Hostname sanitization in `design-doc.ts` (strips unicode, collapses hyphens, 60-char cap)
11. Path traversal in spec file writes blocked by `assertWithinDir` in `registry.ts`

---

## v0.9.1 — 2026-04-08 (Polish)

### Commits
| Hash | Message |
|------|---------|
| `542c37b` | fix: update mcp config display to show all 20 tools (was hardcoded to 14) |
| `f4c4bbe` | fix: raise process MaxListeners to silence exit listener warning |
| `0554f74` | feat: add demo GIF to README and assets |

---

## v0.9.0 — 2026-04-08 (WCAG + Onboarding Sprint)

### Commits
| Hash | Message |
|------|---------|
| `6a00c05` | feat(setup): instant token validation, memi setup command, mcp config --install |
| `39a5b62` | feat(connect,pull): REST auto-fallback + background bridge mode |
| `a0e3320` | feat(notes): add docker-environments Note + fix focusWidth TS errors |
| `85d4f57` | chore: auto-publish workflow, issue templates, CONTRIBUTING guide |
| `478ab88` | docs: improve README — badges, works-with table, MCP config snippets |
| `263dc35` | fix(engine): load .env.local automatically so FIGMA_TOKEN works without shell export |
| `5873848` | fix(plugin): scan all pages for components, not just current page |
| `4ad5413` | fix(bridge): write bridge.json lock so pull/sync reuse running memi connect bridge |
| `9bf2700` | fix(rest-client): absorb 403 on variables endpoint for Free/Starter plan files |
| `28a5d65` | chore: bump plugin widget-meta to v0.9.0 |
| `58e6bcf` | fix(wcag): update test snapshots and metadata for WCAG sprint |
| `561ec0a` | feat(wcag): Blueprint 5 — preview gallery WCAG 2.2 AA landmarks |
| `5cca31e` | feat(wcag): Blueprint 4 — pull --wcag post-pull token audit |
| `309c7b5` | feat(wcag): Blueprint 3 — memi audit --wcag command |
| `d61fe17` | feat(wcag): Blueprint 2 — Zod WCAG spec validators |
| `fe57cc8` | feat(wcag): Blueprint 1 — design-doc contrast report |

### New Features

**`memi setup` — zero-friction onboarding**
Single command that handles the full Figma + Claude Code setup. Validates token via REST immediately (shows `@handle` and email on paste — no more waiting until `memi pull` to find out the token was wrong). Validates file key. Checks plugin health and auto-reinstalls if stale. Copies manifest path to clipboard on macOS. Starts bridge in background. Writes `.mcp.json` automatically. Runs a test pull to confirm the full chain. Prints a ready summary. Collapses the typical 2-hour debugging session into a 5-minute guided flow.

**Instant token validation in `memi connect`**
`GET /v1/me` is called the moment a token is pasted. Shows `@handle (email)` immediately. `401` surfaces a clear message pointing to `figma.com/settings` instead of surfacing as a cryptic error 10 minutes later during pull.

**`memi connect --background`**
Spawns a detached bridge process and exits immediately — no terminal tab required to keep the bridge alive. Polls `bridge.json` for up to 8 seconds and confirms the port before exiting.

**`memi pull` auto REST fallback**
When no bridge is running and `FIGMA_TOKEN` + `FIGMA_FILE_KEY` are available, `memi pull` falls back to the REST API automatically — no `--rest` flag needed, no waiting for a plugin timeout. Also falls back after a plugin timeout. Prints a tip to run `memi connect --background` for real-time sync.

**`memi mcp config --install`**
Writes the MCP config directly to the target file instead of printing JSON to copy manually. `--install` writes to `.mcp.json` in the project root. `--install --global` writes to `~/.claude/settings.json`. Merges safely into existing config without overwriting other `mcpServers` entries.

**`docker-environments` Note**
New `connect` category Note covering Docker-aware Mémoire operation: Figma bridge port-forwarding topology, CI/CD headless WCAG + spec pipelines, shared MCP server as a team service, agent workers as isolated containers, and devcontainer setup. Auto-activates when `Dockerfile`, `docker-compose.yml`, or `.devcontainer/` is detected in the project root.

**Blueprint 1 — `design-doc` contrast report**
`parseCSSTokens` now returns a `contrastPairs` field with every extracted color checked against white and black. `memi design-doc` prints a failure summary in the terminal and adds a `## Contrast` section to DESIGN.md. The `--wcag` flag dumps the full table for all pairs, not just failures.

**Blueprint 2 — Zod WCAG spec validators**
`touchTarget` now validates against the WCAG 2.5.8 24×24px minimum with a descriptive error message. `focusWidth` (min 2px) and `focusContrastRatio` (min 3:1) enforce WCAG 2.4.11. A new optional `colorContrast` block documents AA/AAA intent on every component spec. The spec command formats Zod errors as aligned `[field]  message` columns.

**Blueprint 3 — `memi audit --wcag`**
New dedicated audit command. Runs 5 checks per spec (contrast, aria, keyboard, touch, focus), emits WCAG criterion codes (1.4.3, 4.1.2, 2.1.1, 2.5.8, 2.4.11) in `--json` output, and exits non-zero on failures. `--component <name>` for CI targeting.

**Blueprint 4 — `pull --wcag`**
Post-pull WCAG report on the design system. `src/figma/wcag-token-checker.ts` checks color tokens (contrast vs white, matching WebAIM semantics) and spacing tokens (24px minimum). Exit code 2 on failures. `auditDesignSystemWcag()` method on `MemoireEngine` for MCP/agent use.

**Blueprint 5 — Preview gallery landmarks**
`<header>`, `<nav aria-label>`, `<main id="main-content" tabindex="-1">`, `<footer>`, heading hierarchy (h1→h2), skip-to-content link, `aria-live="polite"` on status region, `:focus-visible` global focus style. Also fixed a bug where `${CSS}` was escaped (`\${CSS}`) in the template literal, preventing the stylesheet from being injected.

### Key Design Decisions

- **Contrast vs white, not max-against-extremes** — `auditTokensForWcag` uses contrast against white as the check surface. `maxContrastAgainstExtremes` (taking the best of white/black) always returns ≥4.58 for any color, making warn/fail unreachable. The vs-white approach matches WebAIM and reflects real-world foreground-on-white usage.

- **Warn tier uses #787878, not #767676** — WCAG precision differences between tools: our formula gives #767676 a 4.54:1 vs white (pass), while WebAIM reports 4.48. Using #787878 (4.42:1) gives unambiguous test coverage for the warn tier without fighting floating-point rounding.

- **Exit code 2 for WCAG failures** — `pull --wcag` sets exit code 2 (not 1) on WCAG violations. Exit code 1 is infrastructure error (can't connect, can't write). This lets CI pipelines distinguish "tool failed" from "design system has accessibility debt".

- **`colorContrast` is declarative, not enforced** — The spec schema field documents intent; `memi audit --wcag` enforces it. Separating declaration from enforcement means teams can adopt incrementally without breaking existing spec creation.

---

## v0.8.0 — 2026-04-06

### Commits
| Hash | Message |
|------|---------|
| `fe3ec2c` | feat(rest-client): export FigmaConfigError for external instanceof checks |
| `c0c7c70` | docs(readme): correct MCP tool count to 20 |
| `cb37979` | test(mcp): add tools registration smoke test for design_doc and tool count |
| `ad37cbb` | test(pull): add --rest --force tests covering force propagation and JSON output |
| `9007f06` | test(css-extractor): add 4 @import following integration tests |
| `42bb878` | test(cli): extend registration smoke test for design-doc and pull flags |
| `6d3c8a1` | docs(readme): bump MCP tool count, add design_doc entry |
| `0d92c15` | docs(readme): add pull --rest and design-doc to command reference |
| `53db613` | fix(rest-client): log partial recovery summary when endpoints fail |
| `b0eabc5` | fix(go): show REST mode in pipeline header |
| `629c10a` | feat(design-doc): show extracted page title and token summary in output |
| `a896485` | feat(doctor): check FIGMA_FILE_KEY and FIGMA_TOKEN for REST mode |
| `6810acc` | feat(pull): add --force flag to bypass 5-minute pull cache |
| `2966146` | feat(mcp): add design_doc tool |
| `786a063` | feat(css-extractor): cap color extraction at 50 to reduce noise |
| `c4dc4f3` | feat(css-extractor): follow CSS @import rules one level deep |
| `c5b1946` | chore: bump version to 0.8.0 |
| `30958d8` | fix(index): add pull --rest and design-doc to CLI header comment |
| `7c21664` | test: add 178 stress tests for v0.8.0 features, fix 2 bugs found |
| `5c3c23b` | feat: add REST pull + design-doc command (v0.8.0 features) |

### New Features

**`memi pull --rest` — Plugin-free Figma pull**

Pulls your design system directly from the Figma REST API. No Figma Desktop, no WebSocket plugin, no bridge. Set `FIGMA_TOKEN` and `FIGMA_FILE_KEY` in `.env.local` and run:

```bash
memi pull --rest
memi pull --rest --force   # bypass 5-minute cache
memi go --rest             # full pipeline in REST mode
```

Calls `/v1/files/:key/variables/local`, `/components`, and `/styles` in parallel. Partial failures (one endpoint down) log a warning and continue — the pull recovers whatever data it can. `FigmaConfigError` (403/404) always propagates so you get a clear error instead of silent empty data.

**`memi design-doc <url>` — Extract design system from any URL**

Fetches any public URL, parses all linked CSS (following one level of `@import`), and produces a `DESIGN.md` ready to use as AI prompt context:

```bash
memi design-doc https://linear.app
memi design-doc https://vercel.com --output VERCEL_DESIGN.md
memi design-doc https://stripe.com --spec   # also writes specs/design-stripe-com.json
```

Extracts: CSS custom properties, color palette (capped at 50 to filter noise), font families, font sizes, spacing values, border radii, box shadows. With `ANTHROPIC_API_KEY` set, Claude synthesizes a structured `DESIGN.md` with semantic token naming, Tailwind config sketch, and Do/Don't rules. Without it, generates a raw extraction table.

Also available as MCP tool `design_doc` for Claude Code / Cursor integration.

### Key Design Decisions

- **REST Pull Architecture** — `src/figma/rest-client.ts` mirrors `bridge.extractDesignSystem()` exactly, returning the same `DesignSystem` interface. Zero changes to registry, autoSpec, or codegen — they consume REST-pulled data identically to plugin-pulled data.

- **FigmaConfigError propagation** — 403/404/5xx from Figma REST are re-thrown as `FigmaConfigError` (now exported). Network failures and timeouts are absorbed (warn-logged, partial recovery). This makes config problems loud and transient problems silent.

- **CSS @import following** — `fetchPageAssets()` follows one level of `@import url()` and `@import "..."` in linked stylesheets, then stops. Prevents infinite loops on circular imports while capturing the token layer most design systems put in a separate file.

- **Color noise cap** — `MAX_COLORS = 50` prevents icon-heavy sites (hundreds of inline SVG colors) from drowning out the actual palette. Applied after deduplication.

- **Doctor REST check** — `memi doctor` now verifies `FIGMA_TOKEN` + `FIGMA_FILE_KEY` presence and reports three states: both set (pass), token only (warn), neither (warn). The check code is `rest.credentials`.

- **Test-driven bug discovery** — 178 new tests across 4 files found 2 real bugs before release: (1) `FigmaConfigError` was silently absorbed instead of propagating, making 403/404 indistinguishable from success; (2) `design-doc --output /absolute/path` double-prefixed the path with `projectRoot`. Both fixed before tagging.

---

## v0.7.0 — 2026-03-31

### Commits
| Hash | Message |
|------|---------|
| `675d6a0` | Fix tests for v0.7.0 — update version assertion and changelog snapshot |
| `aa7d9c2` | Add --preview flag to generate — show diffs without writing files |
| `db079f5` | Add bridge health check — latency measurement and MCP tool |
| `a3e6e27` | Add persistent task queue — survive daemon restarts |
| `b3d4761` | Instrument daemon startup — phase timings in status output |
| `b109617` | Add batch mode to orchestrator — queue intents with shared context |
| `05f9cb9` | Add sync_design_tokens MCP tool — auto-map Figma tokens to Tailwind config |
| `eecdde1` | Add codegen caching — skip generation when spec + design system unchanged |
| `0add89b` | Add get_ai_usage MCP tool — token usage and cost estimation per session |
| `0296c8f` | Cache design system pull results for 5 minutes to avoid duplicate API calls |
| `2b6d3a7` | Add exponential backoff + jitter to Figma WebSocket reconnection |
| `d16f4e6` | Remove Framer preview components and standalone build script |
| `1cb0ae9` | Bump to v0.7.0 — the compression release |

### Key Design Decisions

- **Template Extraction** — HTML/CSS/JS content extracted from TypeScript template literals into static asset files. Gallery page (3,762→2,044 lines) and research page (730→208 lines) now load CSS and client JS via `readFileSync` at module init. Build pipeline updated to copy assets to `dist/`.

- **Data-Driven Components** — shadcn-library.ts reduced from 1,540 to 850 lines by deleting 20 dead `My*()` functions and replacing verbose object literals with a `comp()` factory + compact variant tuples. Component catalog reduced from 723 to 114 lines by moving data to JSON.

- **Orchestrator Decomposition** — The 2,208-line monolithic orchestrator split into four focused modules: `intent-classifier.ts` (pattern matching), `plan-builder.ts` (task decomposition), `sub-agents.ts` (heuristic execution), and a thin `orchestrator.ts` coordinator (535 lines). Each module is independently testable.

- **Test Deduplication** — Shared `test-helpers.ts` module eliminates `captureLogs`/`lastLog`/`writePluginBundle` duplication across 14 test files.

- **Exponential Backoff** — Figma WebSocket reconnection uses exponential backoff (100ms → 5s) with ±25% jitter instead of flat delays.

- **Pull Caching** — `pullDesignSystem()` caches results for 5 minutes. Prevents duplicate API calls from CLI retries or agent loops.

- **Codegen Caching** — SHA-256 hash of spec + design system skips code generation when nothing changed. Massively faster iterative workflows.

- **Batch Orchestration** — `executeBatch(intents[])` reuses a single context across multiple design intents for throughput.

- **Daemon Instrumentation** — Phase timings (init, figma-connect, preview-start, ready) in daemon status output.

- **Generate Preview** — `memi generate <spec> --preview` outputs generated code without writing to disk.

- **New MCP Tools** — `sync_design_tokens` (Figma → Tailwind config), `get_ai_usage` (session cost), `check_bridge_health` (latency diagnostics).

- **Persistent Task Queue** — JSON-backed persistence for agent tasks survives daemon restarts.

---

## v0.6.0 — 2026-03-30

### Commits
| Hash | Message |
|------|---------|
| `e2bbdd5` | Add Framer preview components and standalone dashboard build script |
| `3a6ce0d` | Audit fixes: memory leaks, race conditions, error handling across 10 files |
| `24f067c` | Efficiency fixes: incremental TS build, rate limiter stale entry eviction |
| `2d87916` | Remove dead dependencies and unused TUI app file |
| `dd4bd77` | Add research preview tab — insights, personas, themes, coverage bar in dashboard |
| `b152460` | Add research traceability — bidirectional insight-to-spec links |
| `bcb437a` | Add transcript processor — heuristic interview parsing into structured research |
| `7bc6aef` | Add pull diff output — show token/component/style changes after pull |
| `3390192` | Add memi validate command — expose spec validator as CLI tool |
| `dcac4a7` | Add capability matrix — every command declares what it needs |

### Key Design Decisions

- **Capability Matrix** — Every command declares required and optional capabilities (figma, ai, specs, generated-code, research, daemon). Missing required capabilities produce recovery-oriented error messages. Missing optional capabilities trigger degraded mode with warnings. This enables offline-first workflows and clear "what to do next" guidance.

- **Spec Validation CLI** — `memi validate` exposes the existing Zod schema validator + cross-reference checker as a CLI tool. Checks atomic design hierarchy, prop explosion, Code Connect mapping, and spec-to-spec references. Exit code 1 on errors for CI integration.

- **Pull Diff** — `memi pull` now snapshots the design system before pulling and shows a structured diff after: added/modified/removed tokens, components, and styles. Designers can see exactly what changed before generating code.

- **Transcript Processor** — Heuristic-first interview parsing with 4 speaker detection patterns, TF-IDF theme extraction (150+ stop words), first-person quote detection, and per-segment sentiment analysis. Generates ResearchInsight objects automatically from negative/positive themes. AI enhances but never gates.

- **Research Traceability** — Bidirectional reverse index between insights and specs. `getSpecsForInsight()` for impact analysis, `getInsightsForSpec()` for provenance, `getOrphanedInsights()` for cleanup, `getCoverage()` for reporting. Persisted to `.memoire/research/spec-index.json`.

- **Research Preview Tab** — Dashboard now has a Research panel showing insights, personas, themes, and a coverage bar (% of specs backed by research). Lazy-loaded on toggle. API endpoint upgraded with coverage stats.

---

## v0.5.0 — 2026-03-30

### Commits
| Hash | Message |
|------|---------|
| `ba3e637` | Implement real heuristic fallbacks in 5 stubbed agents |
| `dc04f42` | Add research-to-design mapping — insights drive spec requirements |
| `59245d9` | Upgrade codegen — variant logic, smart component bodies, page prop drilling |
| `ca9ba2c` | Add real accessibility enforcement — WCAG contrast computation, spec auditing |
| `0064999` | Add AI vision for design QA — multimodal analysis of Figma screenshots |

### Key Design Decisions

- **AI Vision (analyze_design MCP tool)** — Claude's multimodal capability is now available for design QA. The AnthropicClient supports image content blocks (base64 PNG/JPEG). DesignAnalyzer provides 3 modes: general quality analysis (0-100 score), WCAG accessibility audit, and spec compliance checking. All return structured VisualIssue arrays with severity, category, location, and fix suggestions.

- **Real WCAG Enforcement** — The AccessibilityChecker computes actual WCAG 2.2 contrast ratios from hex token values (relative luminance + contrast ratio formula). It validates AA/AAA/AA-Large thresholds, checks semantic token completeness (focus ring, error, disabled), and audits component specs for ariaLabel, keyboardNav, focusStyle, and touchTarget. runFullAudit() produces a 0-100 score with WCAG level determination.

- **Smart Component Bodies** — Code generation now produces variant-aware components. buildVariantLogic() generates a variant → Tailwind class mapping (20 presets: primary, outline, ghost, compact, success, warning, etc.). New component builders for Button (variant prop + disabled + icon), Input (Label + error message), Avatar (image + fallback initials), and Dialog (trigger + header + content). Page generator now derives data props from section configurations for dynamic pages.

- **Research → Design Mapping** — 12 keyword rules map research insights to typed SpecRequirements (accessibility, ux, interaction, content, performance). Insights target specific specs by name mention, tag overlap, or rule patterns. generateA11yChecklist() builds prioritized [MUST]/[SHOULD]/[COULD] checklists. mapPersonaRequirements() extracts requirements from persona pain points.

- **Agent Intelligence Layer** — All 5 stubbed agents now have real heuristic logic. Token-engineer parses hex colors and numeric values from prompts to create/update tokens. Design-auditor runs full WCAG audit + research coverage analysis. Accessibility-checker computes pairwise contrast failures. Theme-builder generates semantic palettes from a base color (6 derived tokens + 6 semantic defaults). Responsive-specialist validates grid layouts, component variants, and touch targets.

---

## v0.4.0 — 2026-03-30

### Commits
| Hash | Message |
|------|---------|
| `7639909` | Add multi-Claude native orchestration — agent registry, task queue, agent bridge |
| `9583c4d` | Add bidirectional design-code sync — token differ, sync engine, code watcher |
| `2f25eef` | Add event-driven pipeline to daemon — reactive pull/diff/spec/generate |
| `fea3b14` | Add MCP server — expose Memoire as design infrastructure for any AI tool |
| `e679df4` | Clean up: log silent catches, remove dead params, rebuild plugin bundle |
| `dfc1243` | Add missing WCAG 2.2 accessibility fields to spec scaffolds |
| `a96976e` | Fix preview dashboard: XSS escaping, CORS lockdown, body limits, broken JSX |
| `9d857fb` | Audit fixes: ReDoS guard, token validation, timer cleanup, XSS escape |

### Key Design Decisions

- **MCP Server (Phase 1)** — Memoire exposes 14 tools and 3 resources via the Model Context Protocol, making it callable by Claude Code, Cursor, or any MCP-compatible AI. Stdout logging is suppressed in MCP mode to prevent interference with the JSON-RPC stdio transport.

- **Event-Driven Pipeline (Phase 2)** — The daemon upgrades from a keepalive loop to a reactive automation system. Figma document changes flow through: pull -> diff snapshot -> auto-spec if components changed -> auto-generate if specs changed. The pipeline listens to engine event emissions (not raw document-changed) to avoid double-pulling.

- **Bidirectional Sync (Phase 3)** — Closes the design-code loop. A token differ (SHA-256 entity hashing) tracks per-entity state on both the Figma and code sides. Conflict detection uses a configurable time window (default 1s) — when both sides change the same entity simultaneously, it's logged as a conflict for manual resolution. The sync guard prevents echo loops during push operations.

- **Multi-Claude Orchestration (Phase 4)** — Multiple Claude instances can now operate as persistent agents, each owning a role (token-engineer, component-architect, etc.). The AgentRegistry manages lifecycle with file-based persistence and 30s heartbeat eviction. The TaskQueue provides distributed task claiming with dependency resolution and timeout reclamation. The orchestrator's `tryExternalOrInternal` dispatches to external agents first and falls back to internal execution.

- **Registry as EventEmitter** — The Registry now extends EventEmitter and emits `token-changed`, `spec-changed`, and `design-system-changed` events, enabling the sync system and pipeline to react to mutations without polling.

---

## v0.2.1 — 2026-03-27

### Commits
| Hash | Message |
|------|---------|
| `3b8403e` | Update CHANGELOG — add v0.2.0 Notes ecosystem release |
| `a347a33` | Fix Notes audit issues — activation gaps, recursive copy, dead code |
| `4a115e6` | Fix Figma audit issues — race condition, parallel extraction, code safety |
| `67ba455` | Add self-healing loop, Code Connect checks, and file watcher |
| `5ca7f64` | Add doc-change polling, preview hot-reload, e2e tests, npm prep, 3 new Notes |
| `089b60e` | Remove agent portal and generic dashboard — serve preview/ directly |
| `dd3f4a5` | Fix daemon-aware command routing — commands reuse running bridge |
| `a9a54b4` | Fix MaxListenersExceededWarning across all EventEmitters |
| `3b81896` | Fix plugin manifest — enable production network access for WebSocket bridge |
| `a271b3b` | Add --format flag to tokens command for selective export |
| `7b94ff1` | Add postinstall — auto-copy Figma plugin + PATH detection |
| `683109d` | Add navigateToPage helper for dynamic-page document access |
| `12a3135` | Add dash alias for dashboard command, clarify description |
| `c6b3b03` | Harden error handling — WS error listener, spawn fallbacks, rejection handler |
| `c316c3d` | Refactor preview.ts — extract 4000-line HTML generators into templates |
| `76945f4` | Fix symlink trap — smart plugin path detection in connect and init |
| `f725e52` | Make design system extraction resilient to partial failures |
| `9653764` | Fix SIGINT cleanup in go command — kill preview child process on Ctrl+C |
| `accf7da` | Fix MaxListenersExceededWarning in e2e tests |
| `9a9cf0b` | Fix API server listener leak and infinite port retry |
| `2c28c7e` | Use process.once for signal handlers across all commands |
| `a8f14e6` | Prep npm 0.2.1 — exclude test files from dist, trim package |
| `2fb2497` | Add AgentSkills workspace skill adapter |
| `46707f4` | Register hidden CLI commands |
| `d7ebbbc` | Fix daemon restart argument forwarding |
| `44aea5e` | Add CLI registration smoke test |
| `cb81f79` | Fix export destinations by artifact kind |
| `539d5bf` | Add export path mapping regression test |
| `5999b15` | Add compose regression test |
| `1192cad` | Add SKILL.md install regression test |
| `afe99ac` | Target compose generation to resolved specs |
| `44aa6e9` | Fix self-improving note hook docs |
| `d36909e` | Add packaged note asset guard test |
| `e14ce86` | Neutralize Claude-specific copy |
| `1378b09` | Fix logger transport toggle in tests |
| `7fdb657` | Add figma web capture note |
| `415663d` | Harden preview and bridge bind errors |
| `1810f4e` | Improve Tailwind and shadcn detection |
| `bd6bae6` | Add JSON output to status and notes commands |
| `a0f5234` | Speed up TypeScript builds |
| `6ced37d` | Restore working fast build script |
| `324de7f` | Add codex ops note |
| `722496d` | Add JSON output to spec list command |
| `a223ac3` | Add JSON output to IA commands |
| `eef0a91` | Add JSON output to note mutation commands |
| `04bd773` | Add JSON output to research commands |
| `ed0bd00` | Ignore generated workspace artifacts |
| `25e42a3` | Sync changelog for research and workspace hygiene |
| `bef1171` | Add JSON output to daemon status |
| `407b7f9` | Add JSON output to connect command |
| `cb9772f` | Reduce workspace state churn in init and prototype |
| `7391502` | Add plugin V2 source architecture |
| `0ab89d0` | Sync changelog for plugin V2 foundation |
| `c953c7b` | Normalize widget and bridge protocol |
| `a79c591` | Sync changelog for widget bridge protocol |
| `8af9a80` | Enhance operator console workflows |
| `312bc4b` | Sync changelog for operator console workflows |
| `813e481` | Add widget job state and sync summaries |
| `4a40053` | Sync changelog for widget job state |
| `5d13713` | Rewrite canvas agent box lifecycle |
| `d64527d` | Add preview control-plane endpoints and agent visibility |
| `0f02bcd` | Add widget bundle metadata and health checks |
| `aedf43a` | Fix plugin bundle compatibility and symlink-safe installs |
| `430ec6e` | Downlevel plugin bundle to remove object spread |
| `3ea17d5` | Fix blank widget panel bootstrap |
| `6818e32` | Generate preview changelog from CHANGELOG.md |
| `f153ffa` | Use local system fonts in widget UI |
| `fda8782` | Strengthen widget typography hierarchy |
| `06c9112` | Strengthen widget typography hierarchy |
| `01cf9a9` | Compress widget layout and reduce panel height |
| `8632933` | Harden widget compatibility and layout state |
| `c589635` | Harden widget runtime compatibility |

### Key Design Decisions
- **Notes Become a Real Extension Surface** — Mémoire now treats Notes as installable skill packs, including workspace `SKILL.md` bundles, built-in notes, and compatibility fixes for activation and copy behavior.
- **Composable Agent Workflows** — Compose now resolves a concrete target spec before codegen, and the orchestrator no longer silently regenerates the full spec set for creation intents.
- **Machine-Friendly CLI Surfaces** — `status`, `notes list`, and `notes info` can emit clean JSON, which makes the CLI more usable for Codex, Claude, and other automation.
- **Fast Local Build Loop** — dedicated build config and build script reduce warm build latency and stop shipping unnecessary sourcemap artifacts during normal iteration.
- **Codex-Oriented Operating Guidance** — built-in notes now include Codex ops guidance, and core inventory commands expose more JSON so agent workflows can inspect specs and IA state without scraping prose.
- **Research Pipeline Becomes Scriptable** — research import, synthesis, and report commands now expose artifact paths and summaries in JSON, so automation can chain them without terminal scraping.
- **Workspace State Is Less Noisy** — generated atomic output and preview build artifacts are now treated as workspace state in git ignore rules, reducing irrelevant status noise during agent work.
- **Daemon Health Becomes Queryable** — `memi daemon status --json` now reports runtime ports, preview URL, uptime, Figma connection state, and stale-cleanup results so agents can check background state without parsing terminal prose.
- **Connect Setup Becomes Queryable** — `memi connect --json` now reports token/file-key discovery, plugin manifest resolution, bridge startup state, and next steps without dropping into prompts.
- **Onboarding Stops Rewriting Existing Workspace State** — `init` now preserves existing starter specs, project-context persistence keeps stable timestamps when nothing changed, and prototype output defaults under `.memoire/` instead of tracked source folders.
- **Runtime and Bridge Hardening** — Preview, the Figma bridge, signal handling, and listener management were tightened so bind failures and cleanup paths surface clearly.
- **Modern Project Detection and Packaging** — Tailwind v4, shadcn, plugin manifest access, postinstall behavior, and npm packaging were hardened for current app layouts.
- **Plugin Bundles Become Generated Artifacts** — The Figma widget source now lives under `src/plugin/` as typed main/UI/shared modules, while `plugin/code.js` and `plugin/ui.html` remain checked-in build outputs for npm packaging and postinstall copy.
- **Bridge Compatibility Becomes an Explicit Adapter** — The plugin UI, plugin main thread, and bridge server now share typed bridge envelopes in code while preserving the existing legacy WebSocket wire format for `command`, `response`, and passive bridge events.
- **Operator Console Optimizes for Triage** — The plugin panel now treats jobs and selected nodes as operational surfaces, with presenter-driven summaries, node quick actions, and richer selection diagnostics above raw logs.
- **Jobs Become Persistent Widget State** — The plugin main thread now owns a real job store, bootstrap can restore existing job state, reconnect downgrades active work explicitly, and sync/healer summaries persist in the operator console instead of vanishing into transient logs.
- **Canvas Agent Widgets Gain Stable Identity** — On-canvas agent boxes are now keyed by `{runId, taskId, role}`, seeded per plan, and updated through real idle/busy/done/error lifecycle transitions instead of overwriting a single role-based box.
- **Preview Gains Widget-Grade State** — The preview API now keeps a live cache of bridge, selection, job, sync, healer, and agent status so dashboards can query the same operational state the Figma widget sees.
- **Widget Bundle Health Becomes Explicit** — The build now emits widget metadata, postinstall records install state, and `connect` / `doctor` report whether the installed Control Plane bundle is built, current, and operator-ready.
- **Figma Imports Must Use a Copied, Runtime-Compatible Bundle** — The shipped widget now targets ES2019, build tests fail on leaked `??` / `?.`, postinstall dereferences the copied plugin bundle, and install health treats symlink-resolved imports as unsafe before Figma rejects them.
- **Figma Runtime Compatibility Is Enforced at an ES2017 Syntax Floor** — The shipped widget bundle now targets ES2017 so raw object spread is compiled away before import, and the build regression test now checks for parser-breaking object spread instead of relying on a broad regex.
- **Widget UI Bootstraps Only After the Mount Node Exists** — The operator console now waits for `DOMContentLoaded` before resolving `#app`, which keeps the inlined bundle from crashing when Vite hoists the script into `<head>`.
- **Preview Changelog Is Now Generated from CHANGELOG.md** — `preview/changelog.html` is no longer hand-synced via an embedded release array; the build regenerates it from `CHANGELOG.md`, and a regression test now fails if the checked-in preview page drifts from the changelog source.
- **Widget Typography Uses Local System Stacks** — The Figma panel no longer depends on remote Google Fonts, so the embedded webview renders with reliable mono and serif system fonts even when external font loads are blocked.
- **Widget Typography Now Carries Real Hierarchy** — The Control Plane now uses serif only for brand/section emphasis, sans for controls and values, and mono for operator metadata so the panel reads like a tool instead of one flat font block.
- **Widget Typography Now Has Real Hierarchy** — The Control Plane uses sans text for readable body and controls, reserves mono for operational metadata, and keeps serif accents only where they add identity, which makes the panel feel deliberate instead of uniformly thin.
- **Widget Density Now Prioritizes Operator Throughput** — The Control Plane opens shorter, collapses internal spacing, and removes artificial empty-state height so the Figma panel shows more state per viewport instead of spending its budget on whitespace.
- **Widget Runtime Avoids Unnecessary Modern APIs** — The shipped plugin now avoids `Object.fromEntries` in the main thread and explicitly switches to a single-column layout when the activity surface is absent, which reduces compatibility risk and prevents hidden-layout width loss.
- **Widget Runtime Now Targets Compatibility-Safe Primitives** — The Control Plane replaces fragile `find`/`findIndex`/`includes`/`padStart` dependencies with shared compatibility helpers, uses a manual DOM-ready listener, and falls back to `execCommand("copy")` when the clipboard API is unavailable.

### Changes
- Added the Notes ecosystem release, including audit fixes, activation cleanup, recursive-copy handling, and dead-code removal
- Added preview hot reload, doc-change polling, e2e tests, and npm packaging prep
- Added self-healing, Code Connect checks, and file watcher support
- Hardened the preview and Figma bridge stack with better error handling, signal cleanup, and bind diagnostics
- Improved command routing, plugin manifest access, and port/path detection for production use
- Added CLI ergonomics like `--format`, `dash` aliasing, hidden command registration, and JSON output
- Added regression coverage for compose targeting, export destinations, CLI registration, note installation, and packaged note assets
- Added the built-in Figma web capture note and fixed note hook documentation
- Added the built-in Codex ops note for JSON-first CLI usage, commit hygiene, and agent-safe repo workflows
- Improved project detection for Tailwind and shadcn setups and removed noisy logger transport warnings
- Sped up local TypeScript builds with a dedicated build config and restored the working fast-build script
- Added JSON output to `spec list` and IA `list`/`show`/`validate` so agents can inspect architecture state without terminal scraping
- Added JSON output to `notes install`, `notes create`, and `notes remove` so downloadable note workflows can be automated end to end
- Added JSON output to research `from-file`, `from-stickies`, `synthesize`, and `report` with artifact metadata and no human preamble noise in JSON mode
- Ignored generated atomic component folders, `.astro/`, and preview-generated workspace artifacts to reduce git noise during normal operation
- Synced changelog surfaces for the research and workspace-hygiene changes
- Added JSON output to `daemon status` with stale-cleanup reporting, uptime, and preview connection metadata
- Added JSON output to `connect` so automation can inspect setup state and bridge readiness without entering the guided prompt flow
- Made `init` idempotent for starter specs, kept `.memoire/project.json` stable across unchanged inits, and moved default prototype output under `.memoire/prototype`
- Added a dedicated `src/plugin/` TypeScript source tree for the Figma widget, with typed contracts, modular main/UI code, and a dedicated plugin build pipeline
- Rebuilt the shipped plugin bundles from source during `npm run build` and added regression coverage for generated `plugin/code.js` and `plugin/ui.html`
- Synced changelog surfaces for the plugin V2 foundation push
- Normalized the widget and bridge protocol with shared bridge contracts, a UI bridge-command adapter, additive session/run metadata, and legacy-wire compatibility for existing engine flows
- Synced changelog surfaces for the widget bridge protocol push
- Enhanced the operator console with job-overview summaries, per-node quick actions, richer selection state/layout details, and a presenter layer with regression coverage
- Synced changelog surfaces for the operator console workflows push
- Added persistent widget job state, reconnect-safe job degradation, bootstrap job restoration, and durable sync/healer summaries with dedicated regression coverage
- Synced changelog surfaces for the widget job state push
- Rewrote the canvas agent widget lifecycle with stable run/task identity, deterministic ordering, richer box content, and orchestration wiring backed by helper tests
- Added widget-aware preview endpoints for Figma status, jobs, selection, and agents, backed by a dedicated preview state cache and regression coverage
- Upgraded the preview gallery footer into a live control summary and published agent-status updates beyond the canvas so preview and the Control Plane share the same orchestration view
- Added widget build metadata, install metadata, and a new install-health resolver so the Control Plane bundle can be verified programmatically
- Upgraded `connect` and `doctor` to report widget version, bundle readiness, install freshness, and plugin health in both JSON and human-readable output, then aligned README, notes, and multi-agent guidance with the shipped Widget V2 behavior
- Downleveled the shipped Figma widget bundle to ES2019, rebuilt `plugin/code.js` and `plugin/ui.html`, and added regression tests that fail if modern syntax leaks into checked-in plugin assets
- Hardened postinstall to replace `~/.memoire/plugin` with a dereferenced copy, persist resolved install metadata, and warn when the safe copied import path cannot be created
- Expanded symlink-risk detection to catch imports resolved through linked paths, then updated connect and README guidance so users re-import from `~/.memoire/plugin/manifest.json` when Figma rejects a linked manifest
- Lowered the plugin bundle target from ES2019 to ES2017 so Vite compiles raw object spread out of both `plugin/code.js` and `plugin/ui.html`, which fixes the Figma parser failure at `...state.connection`
- Rebuilt the shipped widget artifacts and updated widget metadata after the ES2017 compatibility pass
- Tightened the plugin build regression test so it catches actual object spread in built artifacts without false-flagging safe array spread
- Fixed the blank widget panel by deferring UI bootstrap until `#app` exists, which prevents the inlined `plugin/ui.html` script from throwing before the body is parsed
- Replaced `replaceAll` in the plugin UI escape helpers with regex replacements to avoid another first-render compatibility trap in embedded runtimes
- Added build coverage that asserts the generated widget bundle includes the DOM-ready bootstrap path
- Added `scripts/build-changelog-preview.mjs` to parse `CHANGELOG.md`, normalize release data, and regenerate `preview/changelog.html` from the changelog source of truth
- Wired `npm run build` to refresh the preview changelog automatically and added `npm run build:changelog` for direct regeneration
- Added a regression test that compares the checked-in `preview/changelog.html` against generated output from `CHANGELOG.md`, so stale preview changelog data now fails locally
- Removed Google Fonts dependencies from the Figma widget UI, switched the operator console to local system mono/serif stacks, and added a build regression check so blocked web fonts do not silently ship again
- Strengthened the widget typography hierarchy by enlarging brand and section titles, increasing metric-value emphasis, and using a clearer sans treatment for tabs and operator controls
- Reworked the widget type hierarchy so operator copy and controls use a stronger sans stack, brand and section heads keep serif emphasis, and telemetry labels stay mono instead of flattening the whole panel into one weak font treatment
- Tightened the widget typography pass with a larger base text size, stronger control weights, clearer status pills, and better subtitle/chip readability inside the Figma panel
- Reduced the widget height, tightened panel and card spacing, turned the action row into a denser grid, and cut the operator tab panel minimum so the Figma plugin wastes less vertical space
- Replaced the last `Object.fromEntries` use in the plugin main thread, made the widget content grid collapse to a true single-column layout when logs are hidden, and tightened the build regression test so these compatibility/layout-state regressions fail in CI
- Added shared compatibility helpers for array/string lookup and padding, removed the remaining modern runtime helpers from shipped widget code, added a clipboard fallback path, and expanded plugin regression coverage so those APIs do not leak back into the built bundle

## v0.2.0 — 2026-03-26

### Commits
| Hash | Message |
|------|---------|
| `358c9e3` | Add 4 powerhouse Notes — deep skill packs (4,400+ lines) |
| `dbcb551` | Add Mémoire Notes — downloadable skill pack ecosystem |

### Key Design Decisions
- **Notes as First-Class Extension System** — Mémoire Notes are downloadable skill packs that extend what the engine can do. Each Note is a folder with `note.json` manifest + markdown skill files. Four categories: craft, research, connect, generate.
- **Three-Source Loading** — NoteLoader discovers notes from legacy `skills/registry.json`, built-in `notes/*/note.json` packages, and user-installed `.memoire/notes/`. User-installed override built-in by name.
- **Activation by Intent** — Notes are resolved per classified intent and injected into agent prompts. `activateOn` contexts map to IntentCategory with an 8K character limit for prompt injection.
- **Deep Skill Files** — Four powerhouse Notes ship built-in: self-improving-agent (628 lines), mobile-craft (1,466 lines), design-systems (1,411 lines), competitive-intel (894 lines). Real expertise, not templates.

### Notes System
- Added `src/notes/` module: types (Zod schemas), loader, resolver, installer, index
- Added `src/commands/notes.ts` with 5 CLI subcommands: install, list, remove, create, info
- Integrated NoteLoader into MemoireEngine (`engine.notes`)
- Agent orchestrator resolves and injects Notes per intent classification
- Status command shows Notes count
- Init command creates `.memoire/notes/` directory

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
