# Frontend beta verification — 2026-09-08

**Published beta:** `2.8.0-beta.2` is available as an exact npm version. The [immutable beta2 npm record](https://github.com/memi-design/memi/blob/main/release-artifacts/npm/2.8.0-beta.2.release.json) binds its exact source and publication evidence. Verify `npx -y @memi-design/cli@2.8.0-beta.2 --version` before using these recipes. Stable remains `2.7.9`. Beta1 records remain historical and do not validate beta2; native and stable qualification remain artifact-specific.

## Beta2 publication and fresh registry verification

Published npm **2.8.0-beta.2** uses `next`; `latest` remains **2.7.9**. [Run 34286620155, attempt 1](https://github.com/memi-design/memi/actions/runs/34286620155/attempts/1) published source `51f8fb64570fd6c613244432b15fd6ea19450329` at 2026-09-08T22:43:49.706Z and verified 143 registry signatures and 20 attestations. The [immutable beta2 record](../../release-artifacts/npm/2.8.0-beta.2.release.json) binds the publication, tarball and SBOM.

[Fresh registry replay](evidence/frontend-2.8/51f8fb64/PUBLISHED_VERIFICATION.md) passed **51 CLI cases**, **four locked MCP tools on Node 22 and 24**, and **17 Storybook tests** with zero skips, failures or flakes. Production audit reported zero findings; installed entry bytes remained unchanged. The 657,890-byte tarball has SHA-256 `8b089fb4921a70324637ce26768bfd969d85945da4167dfcd099f1849228b1ce`.

[PR #145](https://github.com/memi-design/memi/pull/145) passed all 25 checks, including nine Node configurations, five compiled native targets and full-source coverage. Beta2 fixes Windows compiled path discovery and macOS diagnosis/brief JSON truncation, and pins Hono 4.13.7. The earlier beta2 publication attempt stopped before npm upload when dependency advisories appeared. The first local registry replay stopped before MCP startup because its harness looked for the SDK above the nested shrinkwrap; the corrected harness completed a wholly fresh replay, preserving the failed attempt. Neither event overwrote a published package or prior receipt.

These receipts validate the npm artifact. Final native archives and their attestations are verified separately after the tagged build. Managed scanning, the two named parity receipts, Paper pixel parity and stable promotion remain pending.

## Preserved beta1 publication evidence

At its publication checkpoint, npm beta **2.8.0-beta.1** used `next` and `latest` was **2.7.9**. Its source is `71d17ecb8b44a39d81e18a831155eb010779bdfe`, published by [run 34255705921, attempt 1](https://github.com/memi-design/memi/actions/runs/34255705921/attempts/1). The [immutable npm record](../../release-artifacts/npm/2.8.0-beta.1.release.json) binds the original publication, signatures, provenance, tarball and SBOM digests. Recovery verifies the existing version and does not republish it. Managed independent scanning and the two named parity receipts remain pending for stable.

## Beta1 published artifact checks

The [fresh registry verification](evidence/frontend-2.8/71d17ecb/PUBLISHED_VERIFICATION.md) records **51 CLI checks**, **17 Storybook tests**, and locked MCP checks on **Node 22.22.3 and 24.19.0**. The production audit reports zero known vulnerabilities. The installed entry hash remained unchanged throughout these checks. The registry tarball is **655,540 bytes**, SHA-256 `4ddf4f47dee0a86f7ee38e7e1769b58f6a09557f2893f0a9e2f9e08f98eee6e2`.

[PR #138](https://github.com/memi-design/memi/pull/138) passed all 20 checks on the source tree published as `71d17ecb`, including native Node 20/22/24 compatibility, full-source coverage, installed package checks and networkless Linux. [PR #139](https://github.com/memi-design/memi/pull/139) passed the same 20 checks for release-tooling corrections: preserving stable channel identity through a beta transition and verifying the README from integrity-checked package bytes. Those later tooling changes do not alter the already published npm artifact.

The first immediate registry install encountered propagation delay; recovery later verified **143 registry signatures and 20 attestations**. npm registry metadata omitted README text, so the verifier checks the actual tarball README while retaining required content, integrity and provenance checks. The npm website returned Cloudflare HTTP 403 during browser inspection; rendered website README visibility remains unverified.

## Historical local candidate

The following receipts describe the earlier local package at `3308b20e`. They are retained for their original artifact and are not evidence for the published tarball.

## Frozen package

Source checkpoint: `3308b20ee6fc0e114381217ed66eec12bcd9444b`.

- Tarball SHA-256: `d83dad22e42f486dc3957c75de38a89453355115bc032179ad422ebbb24ee721`.
- Compressed **655,394 bytes**; unpacked **2,239,407 bytes**; **65 files**.
- Fresh installed production tree **55,893,917 bytes**, 143 installed packages plus the consumer root; audit reports zero vulnerabilities. The [full dependency audit](evidence/frontend-2.8/3308b20e/dependency-audit.json), including development dependencies, also reports zero known advisories.
- Existing package budgets and 10% compressed headroom pass. Installation used lifecycle scripts disabled and optional peers omitted.

[Artifact receipt](evidence/frontend-2.8/3308b20e/artifact.json). This is a locally packed artifact, not an npm release or signed offline distribution. Later evidence-documentation commits do not change this artifact's source identity.

## Executed checks

| Check | Result and scope |
| --- | --- |
| Complete source suite | **4,375 tests passed across 439 files**; both TypeScript targets and production build pass. |
| Complete source coverage | **86.00% statements, 80.36% branches, 89.40% functions, 87.35% lines**. All four 80% gates pass with the existing source inclusion and exclusions unchanged. CI now enforces this same complete-source gate. [Receipt](evidence/frontend-2.8/3308b20e/coverage-summary.json). |
| Installed CLI matrix | **51/51 passed**: three profiles, read tools, intentional write grants, metadata receipts, rejected paths/links/network requests, and deferred commands. CLI/filesystem evidence does not constitute syscall tracing. [Receipt](evidence/frontend-2.8/3308b20e/cli-matrix.json). |
| Installed stdio | Node **22.22.3** and **24.19.0** pass initialize, exactly four tools, brief/diagnosis, denial, cancellation and clean close; no sentinel side effects. [Node 22](evidence/frontend-2.8/3308b20e/mcp-node22.txt), [Node 24](evidence/frontend-2.8/3308b20e/mcp-node24.txt). |
| Portable Trust Core | Passed against installed bytes on macOS arm64: version **29.9 ms**, locked diagnosis **435.6 ms**, containment and denial cases. A separate fresh-install run also verifies **2.7.9 → beta configuration preservation**. [Upgrade receipt](evidence/frontend-2.8/3308b20e/trust-upgrade.json). [Receipt](evidence/frontend-2.8/3308b20e/trust-portable.json). |
| Real Storybook | Typecheck, production build and **17/17 Chromium tests** passed; zero skipped or flaky cases. Keyboard, focus, disabled/selected state, themes, and 320/1024 px viewports. Chromium **147.0.7727.15**. [Browser summary](evidence/frontend-2.8/3308b20e/browser-summary.json), [runtime](evidence/frontend-2.8/3308b20e/browser-runtime.json). |
| Mapping reuse | Figma and Paper envelopes resolve to the same unchanged `SideNavTab`; complete 11-file fixture scan, four story references, no duplicate export. [Receipt](evidence/frontend-2.8/3308b20e/installed-mapping.json). |
| Scoped independent review | No introduced correctness findings in the reviewed runtime and renderer changes; 332 targeted runtime tests and 41 renderer tests passed independently. This is local code review, not the managed security scan. |

The earlier `67c6a46a` package passed local checks but native Windows CI exposed path and preflight-lifecycle defects. A later Windows run also exposed archive-handle cleanup and overly short shell-fixture waits. This artifact includes awaited staging cleanup; stronger test assertions require successful shell completion. Those corrections are included in this new artifact; [earlier receipts](evidence/frontend-2.8/67c6a46a/artifact.json) remain historical. The first browser replay could not locate its pinned Chromium build after another project's browser install cleaned the shared cache. The failed attempt is retained locally. Reinstalling the exact pinned build restored all 17 tests without changing product code or test configuration.

Remote checks must be tied to their source SHA. The earlier `536436ce` checkpoint passed all 20 checks. The native workflow runs on this branch include the complete-source coverage gate, clean installs across Node 20/22/24 on Linux/macOS/Windows, native Linux arm64, networkless containers and frontend replay. [Historical PR #137 checks](https://github.com/memi-design/memi/pull/137/checks) retain the exact run results; historical success must not be attributed to a later runtime commit.

## Corrections demonstrated by the added tests

- Read-only research audits no longer initialize or migrate project files.
- Attachment capture validates storage authority and input sizes; raw binary reads and workspace source reads remain contained, including Windows cross-drive boundaries. Oversized indexes are rejected before writing attachment bytes.
- All four harness drivers recover from malformed event frames. Failed batch generation and JSON note validation return failing exit codes; benchmark repeat counts are validated before provider execution. Native Windows executable and workspace paths resolve correctly, and failed preflight drains already-started Git checks before returning.
- Generated gallery HTML now embeds its actual client script. Metadata stays inert, empty confidence bars are finite, and research filters preserve commas and apostrophes. Tests execute generated pages as well as standalone clients.

## What the live design tools established

The selected Figma node and its Off-White token were read from the user-selected sandbox. Native Code Connect was unavailable under the current plan, so the association is an explicit checked-in fallback. A separate synthetic Paper file was created and its actual JSX/styles read through Paper 0.5.6's MCP server. Paper screenshot output remained black after repeated targeted capture: **Paper pixel comparison is unassessed**.

The component catalog and consumer are synthetic acceptance fixtures. Native button semantics, selected/disabled states, and light theme are authored fixture behavior. CSS and interaction checks do not establish vendor screenshot parity, complete accessibility conformance, or correctness in arbitrary customer repositories. The static brief keeps rendered verification `unassessed`; browser results are separate receipts.

![Synthetic mapped consumer with keyboard focus](evidence/frontend-2.8/3308b20e/mapped-workspace.png)

## Local context performance and cost

Ten fresh installed MCP processes initialized, listed tools and returned a useful brief over **500 files, 20 stories and 100 tokens**. Median **547.1 ms**, p95 **598.1 ms**, zero failures; each brief was **13,600 bytes**. Stale/missing mapping checks passed; project and home fingerprints stayed unchanged. Filesystem caches were not flushed and other validation work was running; these observations are not a controlled comparison between candidates. [Receipt](evidence/frontend-2.8/3308b20e/frontend-benchmark.json).

The entire eligible source set was **126,406 bytes**; the already-selected component/story/token/evidence subset was **5,664 bytes**. Memi returned less context than the whole repository and more than that narrow subset. No model or paid connector was invoked. This demonstrates bounded local context generation; **complete-task token and dollar savings remain unmeasured**. CPU/memory usage and another machine's performance are not established by this benchmark.

## Public-surface follow-ups

[Website changelog PR #47](https://github.com/memi-design/memoire-web/pull/47) refreshes public-main history and labels it as a checked-in snapshot. [Sandbox PR #5](https://github.com/memi-design/design-sandbox/pull/5) reduces production and full dependency audits from 22 advisories to zero, retains the full proof gate, and adds actual native GPU receipts tied to its dependency commit. Both are now merged. The website changelog is live with verified desktop/mobile rendering. Sandbox follow-up [PR #6](https://github.com/memi-design/design-sandbox/pull/6) recaptured proof for its merged dependency source and passed main CI. These sibling releases remain separate from the npm beta.

## Remaining release gates

1. Complete managed independent security scanning in a supported permission environment. The earlier rejection occurred before scanning because the parent lacked a managed filesystem permission profile. Ordinary CI scanning and local review do not replace it.
2. Refresh the required reviewed-candidate-audit and SwiftUI rendered parity receipts. The beta consistency checker names these pending exceptions. Full DesignWorkbench certification additionally requires 300 verified task receipts, verification of the five remaining runner profiles, external practitioner calibration, and private/holdout results. The local frontend fixture cannot substitute for that evidence.
3. Keep published npm and tagged offline artifacts bound to their own source and digests. Stable channel promotion still requires independent public-surface parity; beta publication does not clear that gate.

105 of 158 legacy CLI action paths remain deliberately unavailable pending capability audits. The frontend workflow is available in the beta; it does not make 2.8 a drop-in replacement for every 2.7 command. See [command support](COMMAND_SUPPORT.json) and [the workflow guide](../FRONTEND_WORKFLOW.md).

## Historical checkpoint

The earlier `2a6d0e449743fc8ca59d9f209d48de56c5d7198b` tarball, SHA-256 `8e39c853aaaedb097ce26550ac456f299d2ce6ffe46aa56834e877f052468ce5`, predates the defensive corrections above and is superseded for release readiness. Its [original receipts](evidence/frontend-2.8/coverage-summary.json) remain retained. No old artifact has been relabeled as containing the new fixes.
