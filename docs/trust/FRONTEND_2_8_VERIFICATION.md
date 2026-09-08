# Frontend candidate verification — 2026-09-08

The corrected **2.8.0-beta.1** candidate passes the full local source gate and installed frontend workflow checks. It remains unpublished. [PR #137](https://github.com/memi-design/memi/pull/137) builds on the Trust Core candidate; npm `latest` remains **2.7.9**. Managed independent security scanning, refreshed release parity evidence, and public provenance remain required.

## Frozen package

Source checkpoint: `67c6a46a06ef51d534cbd49fc993d87e6e3ef8a0`.

- Tarball SHA-256: `fa7d481d4f0a1ed7a0259285e2bf937d5e5559f80777d1513f13619ef1bccbf9`.
- Compressed **655,240 bytes**; unpacked **2,239,054 bytes**; **65 files**.
- Fresh installed production tree **55,893,567 bytes**, 143 installed packages plus the consumer root; audit reports zero vulnerabilities.
- Existing package budgets and 10% compressed headroom pass. Installation used lifecycle scripts disabled and optional peers omitted.

[Artifact receipt](evidence/frontend-2.8/67c6a46a/artifact.json). This is a locally packed artifact, not an npm release or signed offline distribution. Later evidence-documentation commits do not change this artifact's source identity.

## Executed checks

| Check | Result and scope |
| --- | --- |
| Complete source suite | **4,371 tests passed across 439 files**; both TypeScript targets and production build pass. |
| Complete source coverage | **86.01% statements, 80.36% branches, 89.42% functions, 87.36% lines**. All four 80% gates pass with the existing source inclusion and exclusions unchanged. CI now enforces this same complete-source gate. [Receipt](evidence/frontend-2.8/67c6a46a/coverage-summary.json). |
| Installed CLI matrix | **51/51 passed**: three profiles, read tools, intentional write grants, metadata receipts, rejected paths/links/network requests, and deferred commands. CLI/filesystem evidence does not constitute syscall tracing. [Receipt](evidence/frontend-2.8/67c6a46a/cli-matrix.json). |
| Installed stdio | Node **22.22.3** and **24.19.0** pass initialize, exactly four tools, brief/diagnosis, denial, cancellation and clean close; no sentinel side effects. [Node 22](evidence/frontend-2.8/67c6a46a/mcp-node22.txt), [Node 24](evidence/frontend-2.8/67c6a46a/mcp-node24.txt). |
| Portable Trust Core | Passed against installed bytes on macOS arm64: version **30.1 ms**, locked diagnosis **430.7 ms**, containment and denial cases. Upgrade reinstall was not exercised by this preinstalled-binary run. [Receipt](evidence/frontend-2.8/67c6a46a/trust-portable.json). |
| Real Storybook | Typecheck, production build and **17/17 Chromium tests** passed; zero skipped or flaky cases. Keyboard, focus, disabled/selected state, themes, and 320/1024 px viewports. Chromium **147.0.7727.15**. [Browser summary](evidence/frontend-2.8/67c6a46a/browser-summary.json), [runtime](evidence/frontend-2.8/67c6a46a/browser-runtime.json). |
| Mapping reuse | Figma and Paper envelopes resolve to the same unchanged `SideNavTab`; complete 11-file fixture scan, four story references, no duplicate export. [Receipt](evidence/frontend-2.8/67c6a46a/installed-mapping.json). |
| Scoped independent review | No introduced correctness findings in the reviewed runtime and renderer changes; 332 targeted runtime tests and 41 renderer tests passed independently. This is local code review, not the managed security scan. |

The first browser replay could not locate its pinned Chromium build after another project's browser install cleaned the shared cache. The failed attempt is retained locally. Reinstalling the exact pinned build restored all 17 tests without changing product code or test configuration.

Remote checks must be tied to their source SHA. The earlier `536436ce` checkpoint passed all 20 checks. The `67c6a46a` workflow runs include the complete-source coverage gate, clean installs across Node 20/22/24 on Linux/macOS/Windows, native Linux arm64, networkless containers and frontend replay. [Current PR checks](https://github.com/memi-design/memi/pull/137/checks) retain the exact run results; historical success must not be attributed to a later runtime commit.

## Corrections demonstrated by the added tests

- Read-only research audits no longer initialize or migrate project files.
- Attachment capture validates storage authority and input sizes; raw binary reads and workspace source reads remain contained, including Windows cross-drive boundaries. Oversized indexes are rejected before writing attachment bytes.
- All four harness drivers recover from malformed event frames. Failed batch generation and JSON note validation return failing exit codes; benchmark repeat counts are validated before provider execution.
- Generated gallery HTML now embeds its actual client script. Metadata stays inert, empty confidence bars are finite, and research filters preserve commas and apostrophes. Tests execute generated pages as well as standalone clients.

## What the live design tools established

The selected Figma node and its Off-White token were read from the user-selected sandbox. Native Code Connect was unavailable under the current plan, so the association is an explicit checked-in fallback. A separate synthetic Paper file was created and its actual JSX/styles read through Paper 0.5.6's MCP server. Paper screenshot output remained black after repeated targeted capture: **Paper pixel comparison is unassessed**.

The component catalog and consumer are synthetic acceptance fixtures. Native button semantics, selected/disabled states, and light theme are authored fixture behavior. CSS and interaction checks do not establish vendor screenshot parity, complete accessibility conformance, or correctness in arbitrary customer repositories. The static brief keeps rendered verification `unassessed`; browser results are separate receipts.

![Synthetic mapped consumer with keyboard focus](evidence/frontend-2.8/67c6a46a/mapped-workspace.png)

## Local context performance and cost

Ten fresh installed MCP processes initialized, listed tools and returned a useful brief over **500 files, 20 stories and 100 tokens**. Median **576.0 ms**, p95 **675.9 ms**, zero failures; each brief was **13,600 bytes**. Stale/missing mapping checks passed; project and home fingerprints stayed unchanged. Filesystem caches were not flushed. [Receipt](evidence/frontend-2.8/67c6a46a/frontend-benchmark.json).

The entire eligible source set was **126,406 bytes**; the already-selected component/story/token/evidence subset was **5,664 bytes**. Memi returned less context than the whole repository and more than that narrow subset. No model or paid connector was invoked. This demonstrates bounded local context generation; **complete-task token and dollar savings remain unmeasured**. CPU/memory usage and another machine's performance are not established by this benchmark.

## Remaining release gates

1. Complete managed independent security scanning in a supported permission environment. The earlier rejection occurred before scanning because the parent lacked a managed filesystem permission profile. Ordinary CI scanning and local review do not replace it.
2. Refresh the required reviewed-candidate-audit and SwiftUI rendered parity/DesignWorkBench receipts. The beta consistency checker names these pending exceptions; stable eligibility requires the actual passing evidence.
3. Verify release-source native checks, public artifacts, signatures/provenance and clean-install receipts before npm or organization-wide release promotion.

105 of 158 legacy CLI action paths remain deliberately unavailable pending capability audits. The frontend workflow is useful now in the candidate; it does not make 2.8 a drop-in replacement for every 2.7 command. See [command support](COMMAND_SUPPORT.json) and [the workflow guide](../FRONTEND_WORKFLOW.md).

## Historical checkpoint

The earlier `2a6d0e449743fc8ca59d9f209d48de56c5d7198b` tarball, SHA-256 `8e39c853aaaedb097ce26550ac456f299d2ce6ffe46aa56834e877f052468ce5`, predates the defensive corrections above and is superseded for release readiness. Its [original receipts](evidence/frontend-2.8/coverage-summary.json) remain retained. No old artifact has been relabeled as containing the new fixes.
