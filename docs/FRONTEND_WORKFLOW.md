# Frontend engineering with the 2.8 candidate

This workflow requires a reviewed local build or installed candidate tarball. npm stable remains 2.7.9; do not try to install unpublished 2.8 from npm. From the Memi checkout, run `npm ci`, `npm run build`, and `npm run stage:package` for development. Use the packed-install smoke before treating that build as distribution evidence.

## Start from the actual repository

With the candidate `memi` executable available, run inside the consumer repository:

```bash
memi --version
memi agent brief . --frontend --intent "Reuse our navigation components for this sidebar" --max-bytes 16384 --json
memi diagnose . --json --no-write --fail-on none
memi diagnose . --receipt-only --fail-on none
```

The frontend brief reads bounded project inputs without executing repository code. It finds actual React/TypeScript exports and local props, CSS custom properties and scalar DTCG tokens, and CSF story references. Paths are relative to the selected project. It reports incomplete discovery, unresolved props, token modes, aliases, or story associations rather than inventing them. Story IDs inferred from static CSF are not proof that Storybook registered or rendered them. TypeScript path aliases, barrel resolution, inherited external props, and arbitrary dynamic expressions can remain unresolved.

`diagnose --json` is source-bearing working context returned to the harness. `--receipt-only` is a separate metadata-only JSON output, including failures, and does not write reports. A score covers assessed categories only. Scan coverage, unsupported expressions, and omitted files must accompany any quality claim.

## Connect Figma or Paper through the harness

Use Codex's configured Figma or Paper connector to read one selected node. Convert its returned data to a small JSON envelope in the consumer project, for example `design/selected-node.json`:

```json
{
  "source": "figma",
  "documentId": "selected-file-id",
  "nodeId": "5:452",
  "mappings": [{
    "path": "src/SideNavTab.tsx",
    "exportName": "SideNavTab",
    "props": {"label": "File", "selected": false},
    "tokens": ["--off-white"]
  }],
  "properties": {"width": 182, "height": 25}
}
```

For Paper, use `"source": "paper"` and its actual document/node IDs. Optional `sourceHash` is the mapped code file's SHA-256; a mismatch marks the mapping stale. Optional `capturedAt` must be a real ISO timestamp and `revision` must come from the source. Omit unavailable values. Do not put commands, verification overrides, assets, credentials, or full vendor responses in this envelope. Inputs accept bounded primitive properties; the schema rejects unknown authority fields and unsafe paths.

```bash
memi agent brief . --frontend --intent "Implement the selected navigation using our existing components" --design-evidence design/selected-node.json --json
```

Evidence is labeled `host-supplied`: Memi validates its structure and checks the code association, but does not authenticate a vendor document. Native Figma Code Connect is optional. A checked-in mapping can provide the association when Code Connect is unavailable; identify that fallback honestly. A valid mapping establishes reuse evidence, not visual parity. Missing required props, missing exports/tokens, and conflicting values must be resolved before implementation.

An envelope mapping produces `mustReuse` guidance in the brief; this read-only operation does not update registry specs. Separately, the generator blocks a registry component spec marked `codeConnect.mapped`, even with `--force`. The harness should import the matched existing component and compose it in a consumer. Memi does not intercept arbitrary edits made by Codex, so verify the resulting diff for duplicate definitions.

## Codex MCP

```bash
memi --profile locked mcp start --no-figma
```

Default tools: `prepare_frontend_brief`, `prepare_design_agent_brief`, `prepare_apple_design_brief`, and `diagnose_app_quality`. Use `prepare_frontend_brief` with `intent`, optional `designEvidence`, and `maxBytes`. The server owns the project root; tool arguments cannot select an unrelated root. Requests support cancellation. The project resource describes the active root and execution policy.

Legacy tools are advertised only when every required capability is explicitly granted. Unsupported CLI paths return structured denial and guidance. Do not broadly grant capabilities merely to obtain a brief. Memi's policy governs Memi; it does not sandbox Codex, Paper, Figma, or the project's browser/test runner.

## Verify the implementation

1. Read the mapped component and relevant stories; reuse its API and semantic tokens.
2. Make the scoped code change and add missing states using the project's conventions.
3. Run the project's typecheck and actual Storybook/browser checks for keyboard interaction, disabled/selected behavior, themes, and required viewports.
4. Rerun deterministic diagnosis and inspect the diff for new duplicate components.
5. Report executed commands, source fingerprints, screenshots, and unresolved checks. The brief's `verification` stays `unassessed`; external test receipts provide separate evidence.

The private [frontend fixture](../examples/frontend-workflow) uses real React and Storybook with a synthetic pre-existing component catalog, explicit mappings, and browser tests. Its results apply to that fixture and the pinned tool versions. It is not evidence that an arbitrary user repository passed.

CI report generation intentionally writes source-bearing reports and may invoke Git:

```bash
memi --profile connected --allow project-write --allow source-content-persistence --allow shell ci . --report --json
```

Keep those grants scoped to the reviewed task. Local deterministic brief generation and diagnosis make no model calls. Installation, connector plans, agent tokens, CPU time, and CI still have costs; a smaller payload does not establish cheaper successful development.
