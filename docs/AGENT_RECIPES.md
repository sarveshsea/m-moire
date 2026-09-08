# Memi agent recipes

**Stable npm: 2.7.9. Unpublished development candidate: 2.8.** Keep release availability separate from source-checkout capabilities. The candidate commands in this guide assume a locally built candidate `memi` binary on PATH. They are not an instruction to install an unpublished npm version.

## Stable read-only audit

```bash
npx -y @memi-design/cli@2.7.9 diagnose . --json --no-write --fail-on none
```

This inspects source and returns a report. Source findings are evidence for a patch plan; they do not establish that an interface renders or behaves correctly.

## Candidate: before a frontend patch

```bash
memi agent brief . --frontend --json --intent "Improve this interface using existing components"
memi diagnose . --json --no-write --fail-on none
```

The frontend brief reads actual repository components, prop declarations, token files, and supported static stories. It lists omissions and unresolved mappings within its bounded scan. Prefer an existing mapped export when the evidence identifies one. Unsupported or dynamic syntax remains unassessed; do not replace a missing fact with a plausible component name.

The normal diagnosis JSON includes source evidence. Its `quality.score` covers assessed categories only and is `null` when quality is unassessed. Category coverage, scan omissions, and unknown class expressions are separate fields. A score of 100 means no deductions in the assessed checks, not a whole-product pass.

## Host design evidence

When Codex or another host has separately authorized Figma or Paper access, capture the relevant evidence and save a reviewable JSON handoff within the project. This illustrative envelope must be replaced with actual observed identifiers and repository exports:

```json
{
  "source": "figma",
  "documentId": "observed-document-id",
  "nodeId": "12:34",
  "revision": "observed-revision",
  "mappings": [
    {
      "path": "src/components/Button.tsx",
      "exportName": "Button",
      "props": { "variant": "primary" },
      "tokens": ["color.action.primary"]
    }
  ]
}
```

Use `"source": "paper"` for Paper evidence. An optional `sourceHash` on a mapping is the SHA-256 of the source file observed when that mapping was captured. Preserve real capture dates and revisions when available; leave unknown optional fields absent rather than inventing them.

```bash
memi agent brief . --frontend --json --intent "Implement the selected design using the mapped component" --design-evidence design/selection-evidence.json
```

`--design-evidence` requires `--frontend` and a project-relative JSON file. The candidate reads this supplied evidence locally; it does not authenticate to the design host or execute connector instructions. Checked-in evidence should be reviewed for information appropriate to the repository before publication.

Native Figma Code Connect is optional. A supplied mapping can originate from a verified Code Connect result, a host capture, or a reviewed manual handoff; preserve that distinction in the surrounding evidence. Merely supplying JSON does not prove that native Code Connect ran. Missing components, incompatible props, conflicting tokens, and stale hashes remain unresolved until checked.

## Candidate: default MCP tools

```bash
memi --profile locked mcp start --no-figma
```

The default locked server exposes four tools:

| Tool | Use |
| --- | --- |
| `prepare_design_agent_brief` | Local design workflow brief |
| `prepare_apple_design_brief` | Apple-platform guidance; no Xcode execution |
| `diagnose_app_quality` | Read-only local source findings |
| `prepare_frontend_brief` | Repository components, props, tokens, stories, and optional supplied design evidence |

`prepare_frontend_brief` accepts an `intent` and optional `designEvidence` object with the same shape as the JSON handoff. These read responses can contain source information. Do not present them as metadata-only output.

The legacy integration/mutation catalog requires the connected profile and explicit grants for every capability. It is not the locked catalog. Do not add broad grants to a default client configuration to make an old recipe appear supported. The [Codex guide](CODEX_PLUGIN.md) documents a locked client configuration; generic MCP clients can use `memi mcp config --target generic`.

## Candidate: metadata-only stdout

```bash
memi diagnose . --receipt-only --fail-on none
```

Only a `memi.receipt.v1` JSON object is emitted. It contains version/build identity when available, rule IDs, counts, a diagnosis hash, timing, and capability decisions. It excludes source text, project/file paths, and prompts, and does not persist diagnosis reports. A missing build SHA is explicitly `unknown`.

`--receipt-only` cannot be combined with `--agent-context`. The findings gate still controls the exit status unless `--fail-on none` is requested. Use normal `--json --no-write` when a coding agent needs the source report; use the receipt when only metadata should leave the command.

## Review and verification

For repositories with `AGENTS.md`, follow their planning, tests, review, and release requirements. After a patch, run the project's actual checks and inspect the rendered result through an authorized host. Record the commands, artifact provenance, and any unavailable checks. Static evidence leaves rendering, interaction, runtime accessibility, and build execution unassessed until those actions are performed.

Do not infer token or cost savings from a brief or receipt. Such claims need comparable measured runs and an explicit baseline.

## Legacy workflows

Older daemon, suite, simulation, research, installer, registry-write, and integration recipes are not the default locked frontend flow. Their presence in historical documentation or source does not certify candidate capability mappings or release readiness. Consult the [2.8 release plan](trust/RELEASE_2_8_PLAN.md) before making a support claim. Stable installation and marketplace instructions are in the [Codex guide](CODEX_PLUGIN.md); installing stable does not enable candidate-only commands.
