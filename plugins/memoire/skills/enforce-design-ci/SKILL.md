---
name: enforce-design-ci
description: Use when a repository needs deterministic pull-request checks for new accessibility, design-token, component-structure, responsive, and UI-state regressions with file-level evidence.
---

# Enforce Design CI

Add a reviewable design-quality gate that runs without an LLM. Memi writes a policy, baseline, universal agent skill, SARIF, and human-readable report artifacts.

This workflow requires a reviewed local **2.8.0-beta.2 candidate** build; beta2 is unpublished. Check `memi --version` before using these recipes. Published npm beta **2.8.0-beta.1** remains on `next`; npm stable remains **2.7.9**. Beta1’s release record is unchanged. Native Windows package-path handling and macOS arm64 JSON output remain under corrective validation; see docs/trust/KNOWN_LIMITATIONS.md.

## Existing project setup

Beta initialization is unavailable. Use an existing reviewed policy and baseline; this skill does not invoke legacy setup commands. Review project changes before committing them.

## Verify Locally

```bash
memi --profile connected --allow project-write --allow source-content-persistence --allow shell ci . --no-scope --report --json
```

The command may exit nonzero when findings exceed the configured gate. Treat that as a quality result, not a tool crash.

## Add GitHub Actions

Use the pinned major action in `.github/workflows/design.yml`:

```yaml
name: Design CI
on: [pull_request]
jobs:
  design:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: memi-design/memi@v2
        with:
          version: "2.7.9"
```

## Completion Criteria

- Policy and baseline are reviewed and committed.
- Local CI produces SARIF and a design-health report.
- The workflow passes on unchanged accepted debt and fails on a seeded regression.
- The final handoff names the gate threshold, suppressed baseline count, active findings, and artifact paths.

## Stable setup compatibility

For the published stable setup flow, use `npx -y @memi-design/cli@2.7.9 init --team`. This does not install or validate the beta2 candidate.
