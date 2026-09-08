# Memi 2.8 release plan: useful frontend engineering in Codex

Status: product scope and acceptance contract, 2026-09-08. Implementation is underway on `codex/2.8-frontend-engine`; see [the current workflow](../FRONTEND_WORKFLOW.md) and [acceptance ledger](ACCEPTANCE_LEDGER.md). The comparison and blocker observations below are the pre-implementation baseline. This document does not announce a release or describe unfinished adapters as available. It builds on the existing [Trust Core acceptance ledger](ACCEPTANCE_LEDGER.md) and [release rules](RELEASE_TRUTH.md).

## Release promise

Give Codex a small, accurate implementation brief grounded in the project's components, tokens, and design references; then verify the actual patch against its stories, behavior, and interface checks. A developer must be able to start with code alone, add Figma or Paper when useful, and keep working when an optional tool is unavailable.

Codex owns planning, model use, code edits, and tool orchestration. Memi owns deterministic repository understanding, evidence normalization, bounded context, and repeatable checks. Figma and Paper own their design documents. Storybook describes and renders implemented component states. The repository remains authoritative for current exports, props, dependencies, and token definitions; design references describe intended changes. Conflicts must be reported with both sources.

The first certified connected path is React/TypeScript with an existing component library and Storybook. Use the project's conventions, including custom CSS and components. Memi's own shadcn/Tailwind implementation conventions must not force a migration on consumer projects. Other frameworks retain their supported existing commands but receive no new end-to-end certification without fixtures.

## What changes from 2.7

The code comparison below uses Git tag `v2.7.9` and candidate `a1b8505b5f4332d4fe0ba0e06a86f3f4ef0e8b1f`. It is a source comparison, not proof that every candidate command is usable. Published artifact provenance remains in the release records.

| Area | Already present in 2.7 | Implemented in the 2.8 branch | Required for the proposed 2.8 release |
| --- | --- | --- | --- |
| Agent context | Diagnosis, repository graph, agent brief, compact context, focused skills | New capability policy surrounding command execution | Restore useful command access; one bounded brief with exact component imports, token references, relevant stories, missing evidence, and verification steps |
| Codex | Skill/plugin installation and stdio MCP wiring | Locked execution default; explicit capabilities | Locked MCP startup and useful read tools; capability-aware discovery; clean install and real tool-call smoke |
| Figma | REST/plugin bridge, design skills, Code Connect fields in specs | Policy gates around connections | Normalize selected design context and mappings; validate referenced code; demonstrate component reuse |
| Paper | No dedicated adapter found | No dedicated adapter found | Consume bounded context supplied through the harness's Paper connector; preserve source identity and flag missing semantics |
| Storybook | Optional generated stories, including variant stories | No new Storybook integration | Discover existing stories and APIs; select relevant states; ingest actual interaction, accessibility, and rendering results |
| Execution trust | Earlier command behavior | Locked/local/connected profiles; primitive network, subprocess, and persistence guards | Complete supported-command matrix and output/receipt contract; no hidden escalation during integration use |
| Installation | Existing published CLI | Slim staged package, exact dependency pins, optional peers, offline and platform checks | Reproduce release budgets and artifact provenance for the final source |
| Cost | Deterministic source checks and historical workflow research | Smaller candidate package and no-model local diagnosis | Avoid redundant context/work; measure complete successful tasks before claiming token, latency, or dollar savings |

Evidence entry points: `src/agents/design-agent-brief.ts`, `src/app-quality/{app-graph,agent-context,engine}.ts`, `src/tokens/{extractor,dtcg}.ts`, `src/figma/`, `src/specs/types.ts`, `src/codegen/{generator,shadcn-mapper}.ts`, `src/integrations/design-systems-mcp.ts`, `src/mcp/{server,tools,resources}.ts`, `src/security/command-preflight.ts`, and `plugins/memoire/.mcp.json`. Most design/agent features above predate 2.8; they must not be marketed as new.

## Pre-implementation readiness and blockers

Rechecked on 2026-09-08: npm has only `latest: 2.7.9`; [PR #133](https://github.com/memi-design/memi/pull/133) is draft at `a1b8505b`. All 19 checks on that head pass. The Windows Node 24 packed-install smoke passed on one unchanged-head retry after an installation timeout. This is disclosed flakiness, not a changed timeout or removed test.

The preceding audit recorded 2,447 passing tests and a local review package of 620,548 bytes packed / 2,131,199 bytes unpacked / 61 files, with 50,948,192 bytes installed. These are candidate observations, not published artifact guarantees. At that baseline, source-wide coverage was 64.46% statements, 55.14% branches, 74.33% functions, and 66.05% lines; all four failed the 80% publication requirement. The green CI coverage job covered a narrower boundary and publication was blocking. These are pre-implementation observations; see the [current verification record](FRONTEND_2_8_VERIFICATION.md) for the corrected candidate and remaining gates.

Two compatibility problems must be resolved before advertising 2.8 as more usable:

1. The bundled Codex configuration invokes `memi mcp start --no-figma`, but command preflight requires network, project-write, and shell grants. The actual transport is stdio. Adding broad grants to every user's configuration is not an acceptable locked-mode implementation.
2. Astra's direct preflight probe found `agent.brief`, `tokens`, `craft.audit`, `ux.audit`, and `generate` denied as unmapped commands even in connected mode with all grants. Audit the complete Commander tree, including aliases and option-dependent effects. Classify every advertised command as supported with explicit effects, deliberately unavailable with replacement guidance, or omitted from candidate documentation.

Other open gates: default stdout receipt semantics, managed security scan, refreshed DesignWorkBench/parity receipts, public artifact signing/provenance and fresh-install verification. The managed scanner could not start without a supported managed filesystem profile; ordinary CI's `scan` check and Astra review do not replace it.

## The development loop to ship

Example request: “Implement this settings panel from Figma or Paper using our existing form components. Preserve dark mode and keyboard behavior.”

1. Detect the workspace and its declared framework, component roots, token files, story configuration, and existing validation commands. This local step must work without accounts, network, writes, or a daemon.
2. Resolve only the selected design reference through the harness's configured connector. Accept file-based exported context when live access is unavailable; label its age and missing properties. A screenshot alone cannot establish a component's props, interaction behavior, or token semantics.
3. Match design intent to real exported components and tokens. Validate explicit mappings first. Offer heuristic matches with confidence and conflicting evidence; never turn a guessed mapping into a verified one. Enforce reuse in the implementation path: the current generator only warns about a Code Connect match and continues, so its warning alone cannot satisfy the no-duplicate acceptance rule.
4. Return a brief naming the existing `Button`, `TextField`, imports, permitted variants, relevant source locations, story IDs, requested states, and scoped acceptance checks. Include unresolved questions that affect implementation. Fetch deeper evidence only when requested.
5. Codex edits the existing code and adds or updates stories using the repository's conventions. It does not need Memi to start another agent/model session.
6. Run type/build checks, relevant story interactions, accessibility checks, and browser verification for required viewports/themes. Rerun deterministic diagnosis on the patch. A passing static audit never substitutes for a rendered check.
7. Return the patch and evidence: component reuse, changed token references, tests actually executed, screenshots, unresolved checks, and resource observations. Produce a metadata receipt without persisting source excerpts by default.

## Integration boundaries

### Figma

Use the harness's official Figma connector for design context and Code Connect when available; retain the existing Memi bridge as an explicitly configured compatibility path. Select one path per operation to avoid duplicate fetching or conflicting document state. Consume file/node identity, revision or content fingerprint, screenshot reference, component properties, token references, and available code mappings. Confirm imports and props against the checkout.

Code Connect availability depends on the user's Figma plan and seat. It enriches context; it does not prove that a mapping matches the current commit. A checked-in mapping with explicit provenance is the fallback, so a paid Figma feature is not required for local diagnosis or component reuse.

### Paper

Paper officially provides a desktop MCP server with design read/write access. In this release, Codex can use that connector and hand its selected-node context to Memi's normalized input contract. Memi need not add another MCP client or ship Paper in the core package. There is no bundled Paper client. The subsequent implementation exercised a live selected-node read through Paper 0.5.6 and normalized its supplied context; see the fixture README for the screenshot limitation and separate browser evidence.

Preserve document/node identity and returned structure/styles/assets. Resolve those to project tokens and components; never assume exported HTML is production component code. Treat a tokens-to-Paper update as a separate, requested design-write operation with a reviewable diff. Automatic bidirectional synchronization and lossless round-tripping are deferred. A live Paper read-to-code acceptance run is required before claiming supported integration; fixture replay alone earns only “fixture-tested.”

### Storybook and the design system

Start with repository exports, token files, existing CSF stories, and an exported story index. Parse statically; do not execute repository configuration during locked discovery. Prefer Storybook's own MCP when the user has configured it. Its AI APIs are currently preview and its docs toolset has framework-specific manifest support, so pin tested versions and retain a static fallback.

Map component export plus props/variants to story IDs and source locations. Use existing play functions and the project's test scripts. Report missing loading, error, empty, disabled, focus, dark-theme, or responsive states when relevant to the task. A generated story is coverage intent; only execution yields a passing result. Storybook is optional for code-only audits; a configured browser/test runner can verify projects without it.

### Codex and permissions

Memi should expose a small useful read surface by default and detailed resources on demand. A locked stdio server must initialize without Figma autodiscovery, sockets, Git, cache writes, unrelated home-state/configuration/credential discovery, or execution of project code. Reading declared installed runtime files (including a package installed under the home directory) and authorized workspace inputs is permitted. Register only tools supported by the current policy, while retaining primitive checks for direct calls and forged inputs. Missing capabilities must return structured actionable errors, never restart into a broader profile.

Memi's policy governs Memi. It cannot sandbox Codex, a separately connected Figma/Paper server, or a Storybook process. Document the owner of each operation and required harness/server permissions separately. Launching a dev server needs process authority; contacting even a loopback endpoint needs the applicable connection authority. Cached or file-supplied evidence enables a network-free path.

## Shared evidence contract

Extend existing spec, app-graph, brief, and provenance types. Do not introduce a competing project database or another agent orchestrator. Define a versioned, schema-validated envelope with:

- source kind, adapter version, document/node or repo-relative identity, revision/fingerprint, capture time, and acquisition method;
- component export/import, props and variants, token aliases/modes, story IDs, and relationships between them;
- assessment status (`observed`, `inferred`, `unassessed`, `stale`, `conflict`) and evidence references;
- permitted follow-up operations, context byte budget, truncation/omission reasons, and unresolved requirements;
- verification result, source commit plus dirty-content fingerprint, scan completeness and omitted-file reasons, tool/version, command or operation, exit status, environment, artifact digest, and timestamps.

Source-bearing working context and metadata receipts are separate outputs. Locked runs may return requested source context to the calling harness but must not silently persist it. Local caches contain metadata only under `.memi/`; source-bearing cache/report persistence requires explicit authority. Do not hide raw excerpts inside errors, logs, receipt fields, or metadata indexes. Scope evidence references to the allowed workspace; secrets and arbitrary home files are never context candidates.

Accept external strings as data, not instructions. Validate payload sizes, asset references, schemas, paths, and protocols. Never execute commands, HTML, JavaScript, or config embedded in a design artifact to normalize it. Verification scripts must come from an explicitly authorized repository workflow, not a design document.

## Sequenced implementation backlog

IDs are stable acceptance IDs for future issues/PRs. Owners below are responsibility roles, not claims that someone is already assigned. Each implementation slice requires a failing regression or contract test first, implementation, and independent review. Keep changes on focused branches.

| ID / order | Owner | Deliverable and dependencies | Exit evidence |
| --- | --- | --- | --- |
| R01 / first | Core + security | Enumerate the complete command tree; classify effects and restore intended deterministic/read paths, especially brief/tokens/UX/craft. Treat generation and installation writes explicitly. | Packed CLI matrix exercises supported commands in locked/local/connected, option combinations, aliases, direct handlers, and denied effects; docs have no unclassified executable recipe. Include the CI Action and existing baseline/SARIF workflows. |
| R02 / after R01 | Harness + security | Locked stdio MCP initialization, policy-filtered tool registration, bounded read resources, no eager integrations. | Start the actual packaged plugin config; initialize, list tools, call brief/diagnosis, cancel and stop; no network/shell/writes or protocol stdout noise. Direct calls to excluded tools remain denied. |
| R03 / parallel with R01 | Analysis engine | Separate assessment coverage from quality; report file ceilings, exclusions, parse failures and skipped files; improve static class extraction for supported `cn()`/`clsx()`/`cva()` forms. | Fixtures exceeding the source-file ceiling and containing oversized/unreadable files return explicit completeness and omission metadata; partial scans never imply repository-wide coverage. Zero-findings fixture does not receive an invented poor-quality conclusion; unassessed categories remain explicit; focus/variant fixtures catch both false positives and real omissions without evaluating JS. |
| R04 / after R01 | Context + schemas | Extend the brief/graph with mappings, source freshness, conflict reporting, bounded detail retrieval and receipt/output separation. | Same inputs give stable ordering/content apart from declared time fields; stale/renamed exports rejected; mapped components cannot silently generate duplicates; missing values remain unknown; paths and payloads bounded; no default source persistence. |
| R05 / after R04 | Design integrations | Figma and Paper context normalizers plus connector-specific skills and fallback instructions. | Schema fixtures for each; live synthetic selected-design → mapped-component runs for both; missing connector, credentials, quota, stale node, malformed input, and injection-shaped content handled explicitly. |
| R06 / after R04 | Component tooling | Static component/token/story discovery plus optional Storybook MCP evidence ingestion. | Existing imports/props and story IDs resolve; aliases, themes, absent stories and unsupported framework manifests tested; no project config execution in locked mode. |
| R07 / after R02/R03/R05/R06 | Workflow QA | Complete Codex design → existing component → patch → rendered verification workflow. | Acceptance scenarios below pass from installed package; store exact tool versions and sanitized evidence; no fabricated visual/test pass when tools are unavailable. |
| R08 / alongside R01–R07 | Core test owners | Raise coverage using the current complete executable-source denominator; prioritize policy, parsing, integration, and error paths, then uncovered modules. | `npm run test:core:coverage` passes all four 80% thresholds, including branches; no denominator reduction to obtain green. New adapter code is included. |
| R09 / after R07 | Evaluation | Freeze paired tasks and quality criteria before measuring cost; implement content-based invalidation only where measurements justify caching. | Complete-task resource and quality receipts, including retries, failed arms, screenshots, repairs, and overhead; claims limited to measured populations. |
| R10 / after relevant implementation freeze | Release + independent security | Close packaging, scan, native matrix, parity and artifact gates; publish beta then qualify stable. | Exact-source checks, scan disposition, signed/provenance-linked artifacts, immutable evidence and verified channel reads; see channel rules below. |
| R11 / at each release | Docs + release | Generate public version/install/compatibility copy from release truth; update canonical skills before mirrors. | README, npm tarball README, plugin metadata, registry, release notes, site/docs, org profile, tap/container/bundle channels and examples agree with actual publication. |

R01/R02 are the first milestone because the old recipes currently fail the new policy. R03/R04 make the local product useful independently of external design tools. R05/R06 add thin interoperability. R07 proves the user-visible promise. R08 proceeds throughout; R10 remains blocking regardless of the number of green selective CI jobs.

## Acceptance scenarios for the release promise

All data is synthetic or explicitly authorized public fixture material. Pin the fixture commit and record the candidate artifact digest. Run live connected cases separately from hermetic replays; neither is presented as the other.

| Scenario | Required outcome |
| --- | --- |
| A01: clean Codex install, no design tools | Locked plugin discovery and local brief work with no accounts, daemon, global-home mutation, network, or subprocess. Installation's registry access is measured separately; offline startup uses the verified offline bundle. |
| A02: Figma settings form | Reuse mapped existing inputs/buttons; verify props against code; preserve tokens; implement required states; actual story/browser tests pass at declared viewports. |
| A03: equivalent Paper settings form | Read selected design through Paper; preserve provenance; reuse the same repository system; report unmapped details; run the same behavioral/rendering acceptance as A02. |
| A04: existing Storybook/custom design system | Reuse custom exports and CSS/token conventions without introducing shadcn or another styling system; select and execute relevant stories. |
| A05: no Storybook, missing design connector | Local diagnosis/brief remains useful; explicit missing evidence and valid existing test/browser fallback; no auto-install or invented result. |
| A06: stale or conflicting mapping | Renamed export, changed prop or token mode, and contradictory design values produce a conflict with evidence; no silent duplicate component. |
| A07: cheap repeat and changed dependency | Repeated brief remains bounded; any cached evidence invalidates on relevant source/config/token/story/adapter changes and dirty files; no stale context from another workspace. |
| A08: hostile input and revoked capability | Prompt-like design strings remain data; traversal/symlink, excessive payload, redirected/unauthorized endpoint, and denied write/shell paths fail before effects. |
| A09: migration from 2.7.9 | Preserve config and project files; old advertised recipes either work under documented profiles or return precise migration guidance; source report persistence requires explicit choice. |

For A02–A04, freeze expected imports, interactions, applicable empty/loading/error/disabled states, themes, responsive viewports, accessibility criteria and screenshot comparison rules before running. Include keyboard navigation and focus behavior. Allow at most three automatic repair rounds, preserving each attempt; unresolved failures remain failures. Humans review visual suitability where machine checks cannot establish it.

## Cost: a measurable engineering outcome

The built-in local source checks use no paid model. That is already true and is not the entire savings claim. The intended savings mechanisms are less repeated repository discovery, reuse of known components, smaller relevant context, deterministic checks before model reasoning, and selective verification. Existing `--files` filtering still scans the tree for aggregate statistics; it cannot be advertised as an incremental runtime speedup.

Proposed initial context contract: a 16 KiB default brief budget with a small set of top relevant components/stories, explicit omissions, and on-demand detail. This is a target to validate on fixtures, not today's measured token limit. Count UTF-8 bytes independently of model token estimates. Prefer ephemeral reuse first; metadata cache writes remain confined to the local profile. Cache keys must include source/config/dependency/token/story fingerprints, adapter/schema versions, and policy constraints.

Before a public “cheaper” claim, freeze matched tasks across code-only, Figma, and Paper workflows using the same checkout, model, effort, harness version, tool availability, and acceptance criteria. Include repeated runs and report variation, sample size, exclusions, failures, and confidence intervals. Measure total input/output tokens, actual charge data when exposed, tool calls, wall time, retries, connector calls, and human repair time; separate cold install from warm development.

Release usability requires no quality regression on its declared acceptance scenarios. A cost claim additionally requires an observed improvement with a predeclared statistical criterion; a small context or a faster deterministic scan is insufficient. If the harness exposes no defensible dollar cost, mark dollars unassessed. No paid agent benchmark is launched merely by accepting this plan; prepare and freeze the workload/budget before spending.

Measure interactive readiness separately from the existing `--version` benchmark. Proposed R02/R07 target: locked MCP initialize/list plus first useful local brief within 5 s end-to-end on native Linux arm64, Node 22, using a pinned synthetic fixture of 500 source files, 20 stories and 100 token definitions (under 10 MB total). Run ten cold processes, require median ≤5 s, and report p95, maximum, CPU/memory, and all failures. No design-server or model latency is included in that local target; report those separately in connected task results. Freeze the generated fixture and measurement script before collecting results; this target is not yet verified.

## Beta, stable, and public surfaces

Trust Core beta can precede the connected workflow milestone if its own existing gates pass and release notes clearly identify missing features. Do not call that beta the completed frontend workflow release. The proposed stable 2.8 promise requires R01–R08, the R09 measurement infrastructure and truthful findings, R10, R11, and A01–A09. A statistically proven savings claim is optional; truthful measurement is mandatory.

1. Keep the candidate unpublished until all applicable beta gates pass; use the [verification record](FRONTEND_2_8_VERIFICATION.md) for current status. The managed scan may only be explicitly pending for beta under the existing release policy; it is required for stable. Preserve the existing beta parity exceptions as explicit exceptions, never passing receipts.
2. Freeze each releasable candidate. Run full source coverage, typecheck, dependency/license/SBOM checks, packed install and MCP/CLI workflows; validate Node 20/22/24 on macOS, Ubuntu and Windows, networkless nonroot read-only Linux amd64/arm64, and native arm64 performance. Recheck production audit at publication time.
3. Enforce the existing budgets: packed ≤1.5 MB, unpacked ≤3 MB, ≤100 files, installed ≤60 MB, `memi --version` cold start ≤1 s and diagnosis ≤5 s on the defined native fixture. Keep optional connector dependencies out of the mandatory core and offline startup. Publish exact artifact sizes and benchmark conditions.
4. Publish the verified beta to `next` with a prerelease, provenance, checksums, SBOM and verified offline artifacts. Fresh-install the registry package and bundles, check advertised commands, and reconcile actual bytes with the release record. Keep npm `latest` on 2.7.9. Use a new prerelease number for changed bytes after publication.
5. For stable, close managed security findings, refresh DesignWorkBench receipts, obtain `failures: []` and `parityEligible: true`, rerun on the final immutable source and verify published channels. Candidate-time results cannot certify later source changes. Promote only through the reviewed release workflow.
6. Stage README, changelog, `llms.txt`, Codex installation guide, focused skill sources/mirrors, plugin/marketplace metadata, examples, compatibility tables, npm README, GitHub release, MCP Registry, Homebrew, GHCR, offline downloads, website documentation and organization profile together. Verify each public endpoint after publication. Resolve the existing stable README PR #135 and sandbox PR #4 through their real CI blockers; their status does not certify the core or siblings.

Every release gets an explicit public-surface inventory and reconciliation result. npm README changes ride with the next package version; updating GitHub does not rewrite an immutable package. CI/release automation should check consistency on every release, rather than publishing a version after every commit. Historical benchmarks and proof forks keep their original versions and attribution. Studio and Canvas keep independent version numbers and gates.

If verification after publication fails, mark the release unverified, restore mutable channels to the last verified artifact where appropriate, deprecate a defective npm version, and publish corrected bytes under a new version. Never erase failure evidence or copy previous receipts onto a new artifact.

## Explicit follow-on scope

Defer autonomous bidirectional Figma/Paper/code sync, a new canvas/editor, Studio orchestration expansion, a generic model swarm, automatic component rewrites without mappings, mandatory hosted databases, and universal framework certification. Extend the input contract to other tools after the first two design-source paths pass. These additions must not prevent the slim local CLI from working independently.

## External capability references

Checked 2026-09-08; external capabilities are not evidence that Memi implements them.

- [Figma Code Connect](https://developers.figma.com/docs/code-connect/) documents design-to-code mappings and plan/seat requirements; [MCP integration](https://developers.figma.com/docs/figma-mcp-server/code-connect-integration/) describes context enrichment.
- [Paper MCP](https://paper.design/docs/mcp) documents the desktop design read/write connector. This plan uses harness-owned access, not an assumed Memi integration.
- [Storybook MCP](https://storybook.js.org/docs/ai/mcp/overview) documents component knowledge, development/testing tools, preview status and framework limitations. [Manifests](https://storybook.js.org/docs/ai/manifests) should be rechecked when pinning the adapter schema.
- Existing local Codex contract: [Codex plugin guide](../CODEX_PLUGIN.md), `plugins/memoire/.mcp.json`, and `src/mcp/server.ts`. A real packaged Codex discovery/call test remains required; source configuration alone is not proof.
