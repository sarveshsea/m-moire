# Known limitations

**Distribution guidance:** These recipes target `2.8.0-beta.2`. For an unpublished candidate, use a reviewed local build reporting that exact version. Before installing, check `npm view @memi-design/cli@2.8.0-beta.2 version`; only install after that exact version is confirmed available. Inspect `npm view @memi-design/cli dist-tags --json` for current channels. The independent stable compatibility baseline is `2.7.9`. See [current release state](https://github.com/memi-design/memi/blob/main/docs/CURRENT_RELEASE.md) for publication status. Native verification is artifact-specific; beta1 records do not validate beta2.

## Beta1 publication checkpoint

- At the beta1 publication checkpoint, npm `latest` was 2.7.9 and `next` was
  2.8.0-beta.1; see the [artifact verification](FRONTEND_2_8_VERIFICATION.md).
  This historical state does not establish current registry channels or beta2 verification.
- The managed Codex Deep Security Scan is pending because this host does not provide a managed filesystem permission profile.
- A beta may disclose that pending scan. Stable and employer-safe claims require
  a completed independent scan with no unresolved critical or high findings.
- `TRUST_CORE_BETA_PENDING_DESIGNWORKBENCH_EVIDENCE` means the
  `reviewed-candidate-audit` and `swiftui-rendered-rerun` receipts remain stale.
  This named exception applies only to 2.8.0-beta.1, including its published beta state; stable remains
  blocked until both receipts are refreshed.
- Existing 2.7.9 binaries and npm artifacts must not be described as locked by
  default merely because the 2.8 source branch adds that behavior.

## Coverage and current audit

- The historical Trust Core coverage percentage applies to four selected modules,
  not all executable source. The broader `test:core:coverage` gate measures the
  source tree and requires 80% in all four metrics before publication.
- See the [acceptance ledger](ACCEPTANCE_LEDGER.md) for the current audit,
  independent scan blocker, product findings, and remaining release evidence.

- The original frontend tarball at source `2a6d0e44` predates subsequent
  defensive runtime corrections. Its checks remain historical evidence for that
  digest and do not validate the published package. The fresh registry artifact
  and its matching checks are in the [verification record](FRONTEND_2_8_VERIFICATION.md).
- Assessed quality and scan completeness are separate. A score of 100 does not
  certify unassessed categories, dynamic class expressions, omitted files, or
  rendered behavior. File, byte, traversal-entry, and depth limits remain bounded;
  discovery must report when those limits prevent a complete eligible scan.

## Boundary limitations

- Execution policy reduces Memi's authority; it cannot secure a compromised OS,
  runtime, package manager, browser profile, model provider, or Figma account.
- Network denial inside Memi is not a host firewall. Release E2E therefore also
  tests the artifact with networking disabled outside the process.
- Metadata-only output can still reveal counts, rule identifiers, timing, and
  hashes. Employers must decide whether that metadata is acceptable.
- Content read for a locked deterministic command exists in process memory while
  the command runs. Locked prohibits persistence and egress, not the read needed
  to perform the requested local analysis.
- Optional integrations expand the boundary and require separate dependencies,
  capabilities, destinations, credentials, and employer review.
- Node does not expose one portable directory-handle-relative file-creation API
  across the supported matrix. Receipt output therefore uses exclusive open plus
  post-open containment and file identity checks. A detected parent race can
  leave an empty file, but the writer does not send receipt bytes through that
  unvalidated handle.
- A terminated connected report writer can leave an empty `history.jsonl.lock`.
  Further history writes time out after bounded retries. Confirm no writer is
  active and inspect the lock before removing it; the engine never steals an
  unverified lock automatically.
- The legacy uninstall script is destructive and is not the Trust Core
  preserve-first uninstall path.

## Product and organization limitations

- Memi Canvas and Memi Studio remain independently gated.
- A passing CLI gate does not certify Homebrew, GHCR, MCP Registry, website,
  focused-skill, sandbox, fork, Canvas, or Studio artifacts.
- Public organization inventory cannot disclose or certify private repositories.
- Employer authorization is external evidence; Memi cannot infer it from a flag,
  repository name, email domain, or license.

Report a limitation as resolved only when the release record points to the exact
artifact and independent evidence that closes it.
