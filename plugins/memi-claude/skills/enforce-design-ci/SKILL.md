---
name: enforce-design-ci
description: Use when a repository needs deterministic pull-request checks for new accessibility, design-token, component-structure, responsive, and UI-state regressions with file-level evidence.
---

# Enforce Design CI

Add a reviewable design-quality gate that runs without an LLM. Memi writes a policy, baseline, universal agent skill, SARIF, and human-readable report artifacts.

The verification command targets a reviewed 2.8 candidate; check `memi --version`. Candidate `init` is deliberately unavailable in every profile. Initialization below uses public 2.7.9 explicitly and writes project configuration. The Action also remains on public 2.7.9 until the candidate is released. Do not install unpublished 2.8 from npm.

## Initialize

Inspect the worktree first. When the task authorizes setup, run:

```bash
npx -y @memi-design/cli@2.7.9 init --team --kit universal --json
```

Review the generated policy and baseline before committing them. Existing debt remains visible but does not block unrelated pull requests.

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
