# Trust Core acceptance ledger

**Distribution guidance:** These recipes target `2.8.0-beta.2`. For an unpublished candidate, use a reviewed local build reporting that exact version. Before installing, check `npm view @memi-design/cli@2.8.0-beta.2 version`; only install after that exact version is confirmed available. Inspect `npm view @memi-design/cli dist-tags --json` for current channels. The independent stable compatibility baseline is `2.7.9`. See [current release state](https://github.com/memi-design/memi/blob/main/docs/CURRENT_RELEASE.md) for publication status. Native verification is artifact-specific; beta1 records do not validate beta2.

Audit date: 2026-09-08 UTC. Recovered baseline: `f4880afcd5f5b77487d3f2b6417a88c47a8b549d`, PR #133. At the beta1 publication checkpoint, npm stable was 2.7.9 and beta 2.8.0-beta.1 was published on `next`. That historical checkpoint does not establish current channel values or beta2 verification.

## Beta1 frontend implementation checkpoint

The historical `codex/2.8-frontend-engine` work extended the Trust Core baseline. The published npm source is `71d17ecb8b44a39d81e18a831155eb010779bdfe`; see the [verification record](FRONTEND_2_8_VERIFICATION.md) for its native CI, registry receipts and remaining qualification limits.

| Workstream | Implemented evidence | Remaining qualification |
| --- | --- | --- |
| CLI compatibility | Actual Commander paths classified; useful frontend/UX/craft/token reads admitted; source writes require explicit grants; mapped generator refuses duplicate generation. | Many legacy paths deliberately unavailable; fresh packed command matrix and public migration truth required. |
| Codex stdio | Four default locked read tools; actual frontend evidence tool; credential-free configurations; cancellation and no-side-effect installed smoke. | Repeat against final immutable artifact and native CI. |
| Evidence engine | Strict host-supplied Figma/Paper envelope; current exports/props/hash/token checks; CSF references; byte budgets; stale/conflict/unassessed states. | Dynamic source forms and inferred story IDs are explicit limits. Browser results remain separate. |
| Read boundaries | Descriptor-contained reads reject links, hardlinks, changing identities and oversized content; registry, source, metadata, policy, baseline, history, report and snapshot regressions. Tree discovery has entry/depth ceilings. | Independent focused review passed; managed scan and native platform receipts still required. |
| Quality and receipts | Assessed categories separated from coverage; AST literal class extraction; scan omissions; metadata-only `--receipt-only` stdout including failure. | Source checks cannot establish rendered quality. |
| Live design workflow | Real selected Figma node and token retrieved; native Code Connect unavailable so explicit checked-in mapping used. Disposable Paper file created/read through live MCP; both map to the same synthetic existing component. | Paper screenshot tool returned black images; no Paper pixel-parity pass. The fixture/browser results do not certify arbitrary projects. |
| Cost/performance | Reproducible 500-file/20-story/100-token offline MCP benchmark; broad and narrow raw-input comparisons; no model calls. | Final artifact trials and native arm64 gate; no complete-task dollar or token savings claim. |
| Full-source coverage | Meaningful command, integration and failure-path tests added without shrinking coverage scope. | See the canonical [verification record](FRONTEND_2_8_VERIFICATION.md) for the latest measured source and coverage. All four 80% gates still apply; passing assertions alone does not satisfy them. |
| Distribution | README, candidate recipes, MCP configurations and canonical skills updated with actual capability/availability distinctions. | The beta package and its native CI are verified. Managed scanning, refreshed parity and stable promotion remain gated; npm latest stays 2.7.9. |

See the [frontend workflow](../FRONTEND_WORKFLOW.md), [fixture](../../examples/frontend-workflow/README.md), and [PR #137](https://github.com/memi-design/memi/pull/137) for implementation scope. The [verification record](FRONTEND_2_8_VERIFICATION.md) is authoritative for measured source and artifact results. The original artifact at `2a6d0e44` is historical and superseded for release by subsequent defensive runtime corrections; its receipts cannot validate later bytes.

## Preserved Trust Core baseline audit

The following rows and observations describe the earlier PR #133 baseline and are retained as history. They are not current frontend-branch measurements.

| Requirement | Implementation and evidence | Remaining gate |
| --- | --- | --- |
| Locked deterministic diagnosis | Baseline 2,416 tests passed in a fresh checkout. Astra reproduced URL/DNS, Git subprocess, and direct report-persistence policy gaps with intercepted side effects. Regression fixes deny before side effects; the packed portable harness passes URL and Git denials. | Updated suite: 2,447 tests across 333 files pass locally. Cross-platform CI for the updated commit remains pending. |
| Explicit connected grants | URL fetching and Git helpers check policy at their execution boundary; source reports require project-write and source-content-persistence. | Descriptor-based writes and quarantine cleanup have race regressions. Astra re-review found no remaining actionable issues in the reviewed patch and independently passed 29 targeted tests. No general security clearance. |
| Zero production advisories | fast-uri updated from 3.1.5 to exact 3.1.7; full and production audit report zero known advisories. Isolated production install has 138 dependencies and no optional peers. | Refresh on the exact publication candidate; registry advisory state changes. |
| 80% core coverage | The old 92.68% statement result measured four selected modules only. `test:core:coverage` now includes all `src/**/*.{ts,js}`, including unimported modules. | Measured: 64.46% statements, 55.14% branches, 74.33% functions, 66.05% lines. Publication is blocked; scoped Trust Core coverage is insufficient. |
| Native Linux arm64 latency | Native runner job and same-commit reusable publication prerequisite added. QEMU remains conformance-only. | Successful native runner receipt for the release commit. Workflow source is not a performance result. |
| npm package and offline budgets | Production shrinkwrap, explicit file allowlist, packed harness, and offline bundle workflows exist. | Local portable packed smoke and clean install pass; 61 files, about 619 KB packed and 51 MB installed. Native CI and signed public bundle digests remain required. |
| Managed independent security scan | Attempt failed before workers started: “Deep Scan cannot safely start a read-only worker: the parent must provide a managed filesystem permission profile.” | Supported managed permission environment. No scan results exist from this attempt. |
| Stable parity | Existing beta exception names stale reviewed-candidate-audit and swiftui-rendered-rerun evidence. | Refresh actual receipts; public gate must return `failures: []` and `parityEligible: true`. |
| Public surface consistency | All 13 public organization repositories inventoried. Stable CLI/Homebrew 2.7.9 and Studio 2.5.0 checksums agree; stale profile, source links, focused mirrors and nonexistent Canvas download have scoped PRs; eight are merged; sandbox documentation remains blocked by its existing dependency audit. The stable-branch README update is PR #135. | Separate reviewed changes and publication receipts; CLI verification does not certify sibling products. |

## Coverage scope

`vitest.core.config.ts` extends the complete unit/integration test suite and measures executable TypeScript and JavaScript under `src/`. It excludes test directories, declarations, fixtures, generated code, and separately built Figma plugin targets (the latter also excluded in `tsconfig.build.json`). V8 does not count type-only syntax as executable statements. Release-tool JavaScript and platform E2E remain separate contracts, not part of this source coverage percentage. `prepublishOnly` enforces all four 80% thresholds rather than substituting the four-module boundary percentage.

## Cost and usefulness findings

Local diagnosis and context selection do not need a paid model. At the preserved Trust Core baseline, Astra observed the synthetic starter scan at 5 files / 7,793 bytes and 14 ms of analysis, with a 3,782-byte context payload. This is one local source-tree observation, not a benchmark or a public artifact guarantee. The historical study did not establish end-to-end agent cost savings.

At that baseline, the starter returned zero findings but “usable but uneven” because unassessed categories lowered its score. The frontend candidate now separates assessed quality from missing evidence and extracts static literal classes in `cn`, `clsx`, and `cva` through AST analysis. Regression tests verify nullable unassessed scores, assessed-only verdicts, explicit scan omissions, and dynamic-expression unknowns. These are implemented candidate corrections, not changes to the published 2.7.9 artifact or proof of rendered quality. Comparative history also checks the scoring model and scan completeness before treating results as comparable.

## Release handling

Every engine change updates the changelog and generated preview. Every release candidate reruns source, packed-artifact, dependency, and native checks; version metadata and npm README are staged from the same source. npm packages are immutable: updating GitHub documentation cannot change the 2.7.9 npm README. Publish the next version only after its gates pass; keep `latest` at 2.7.9 during beta. Never bump a version or overwrite a release record merely to make surfaces look synchronized.

## Local verification record

Current test counts, coverage metrics, source checkpoints, and packed digests live
in the [verification record](FRONTEND_2_8_VERIFICATION.md). The earlier baseline
numbers above remain historical. Source-suite success and artifact validation
are separate; later runtime fixes require a rebuilt package and renewed checks.

The explicit `diagnose --receipt-only` contract is implemented and covered by
privacy and failure-exit tests. It emits only metadata JSON, including failure
receipts, without source, private paths, prompt strings, or default persistence.
It is mutually exclusive with `--agent-context`. Normal diagnosis remains a
useful source-bearing report; it does not become a metadata receipt merely by
selecting `--json`. The metadata-only mode preserves configured failure gates.

## Public documentation changes

Merged after applicable checks: organization profile #7; Homebrew #5; Studio #26;
Canvas #31; ripple proof #4; audit-frontend-design #2; enforce-design-ci #2;
remember-design-system #2. Focused skill content comes from stable commit
`70c9f4ad8b9823f67b5b16a06be9a42064aa6f04`, recorded in each source manifest.
The earlier sandbox docs PR #4 was blocked by 22 dependency advisories. Merged
PR #5 repaired the dependency graph, and PR #6 recaptured native proof for the
merged source; the current full and production audits report zero advisories.
Organization profile PR #8 now identifies the published beta and stable channels.
The stable CI skill still uses a mutable `@v2` action ref; preserve its provenance
until a separately reviewed canonical-source pin and export update.


Windows follow-up: numeric inode checks rejected legitimate large NTFS IDs on
Node 22/24. Exact BigInt descriptor/pathname identities now cover report writes,
lock acquisition/release, and receipts, with adjacent-ID and unknown-ID tests.
Astra independently passed 48 targeted tests. The native Windows Node 20/22/24 matrix passed for the published source;
see the current verification record. Native arm64 on prior audit commit
`0071fc75` passed at 587.3 ms startup and 683.2 ms diagnosis; see
[the native job](https://github.com/memi-design/memi/actions/runs/34188457333/job/101941435126).
