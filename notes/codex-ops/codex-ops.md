---
name: Codex Ops
description: >
  Operating workflow for Codex or Claude inside Memoire: prefer JSON command
  surfaces, keep commits scoped, review diffs before push, preserve user state,
  and capture reusable learnings in notes instead of ad hoc prompt drift.
activateOn: always
freedomLevel: high
category: connect
tags:
  - codex
  - claude
  - json
  - git
  - review
  - memory
---

# Codex Ops

Use this when Codex or Claude is operating inside the Memoire repository and
needs a stable workflow for safe autonomous changes.

## Core Rule

Prefer machine-readable command output whenever Memoire exposes it. Do not
scrape terminal prose if a JSON surface exists.

Current JSON-first commands:

- `memi status --json`
- `memi connect --json`
- `memi notes list --json`
- `memi notes info <name> --json`
- `memi compose "..." --json`
- `memi doctor --json`
- `memi generate --json`
- `memi export --json`

## Execution Pattern

1. Inspect state first with JSON-capable commands.
2. Use dry-run modes before mutating files when available.
3. Make one coherent change at a time.
4. Verify with focused tests or typecheck.
5. Commit and push each lane separately.

## Commit Hygiene

- Keep each commit scoped to one behavior or one workflow lane.
- Do not mix note content, command changes, and unrelated generated output.
- If the worktree is already dirty, treat existing changes as user state unless
  you know they were produced by your own current lane.
- Do not rewrite or revert unrelated files to make your diff cleaner.

## Review Loop

- Read the diff before every commit.
- Prefer targeted regression tests over broad reruns first.
- If a command has a `--json` mode, add or update tests against the structured
  payload rather than asserting on human-readable formatting.
- When a fix changes behavior, verify both the focused path and the combined
  command suite that overlaps it.

## Memory Capture

- If a workflow becomes stable, encode it in a built-in note or skill instead
  of repeating it in freeform prompts.
- If a command repeatedly needs structured output, add `--json` instead of
  teaching agents to parse ASCII tables or prose.
- If a repository convention matters across many commits, capture it in a note,
  not only in one changelog entry or one conversation.

## Safe Autonomy

- Prefer additive or explicitly scoped changes.
- Use `--dry-run`, `doctor`, and `status --json` before destructive or broad
  operations.
- Treat `.memoire/`, generated outputs, preview artifacts, and user specs as
  project state, not disposable scratch space.
- When a lane is already pushed to `main`, reconcile local work to `HEAD`
  instead of silently diverging.

## Recommended Sequence

For a normal implementation lane:

1. `memi status --json`
2. `memi connect --json`
3. `memi doctor --json`
4. edit the smallest viable set of files
5. run focused tests
6. run `npm run typecheck`
7. commit one lane
8. push immediately

For note work:

1. add `note.json`
2. add the markdown skill file
3. add a focused note regression test
4. run the note tests plus typecheck
5. commit and push that note as its own lane
