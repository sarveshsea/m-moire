# memi in Codex

**Beta2 preparation:** `2.8.0-beta.2` is an unpublished correction candidate. Use only a reviewed local build reporting that version to test the candidate; do not install beta2 from npm. Published npm beta `2.8.0-beta.1` remains available on `next`, and `latest` remains `2.7.9`. Beta1’s immutable record is retained. Native Windows package-path handling and macOS arm64 JSON output require fresh verification before corrected native downloads are claimed.

npm `latest` remains **2.7.9**. Published beta **2.8.0-beta.1** is available on `next`; use the exact verified beta executable for the features below. Installing `latest` does not install the beta. The [npm release record](../release-artifacts/npm/2.8.0-beta.1.release.json) binds its published source and artifact.

```bash
npx -y @memi-design/cli@2.8.0-beta.1 --version
```

Managed independent security scanning and the reviewed-candidate-audit and swiftui-rendered-rerun receipts remain pending for stable. Paper pixel parity is unassessed. Of 158 inventoried CLI paths, 105 remain deferred; broad grants do not enable them. No complete-task dollar or token savings claim is established.

## Public integration

The existing public Git-backed marketplace can be added with:

```bash
codex plugin marketplace add memi-design/memi --ref main --sparse .agents/plugins --sparse plugins/memoire
```

Open `/plugins` in Codex and select the memi plugin. The sparse checkout contains marketplace metadata, the plugin manifest, MCP wiring, and the `memoire-design-tooling` skill. See the [public plugin page](https://www.memoire.cv/codex-plugin).

For a reproducible stable CLI audit:

```bash
npx -y @memi-design/cli@2.7.9 diagnose . --json --no-write --fail-on none
```

The frontend evidence and metadata-only receipt commands below are beta features, not claims about the stable package.

## Beta MCP connection

With `memi --version` reporting `2.8.0-beta.1`, print a configuration for your host:

```bash
memi mcp config --target generic
```

The configuration starts the server in the locked profile:

```json
{
  "mcpServers": {
    "memoire": {
      "command": "memi",
      "args": ["--profile", "locked", "mcp", "start", "--no-figma"]
    }
  }
}
```

This default connection requires no Figma credentials, network access, subprocesses, or report persistence. It exposes four tools:

| Tool | Local purpose |
| --- | --- |
| `prepare_design_agent_brief` | Prepare a bounded design workflow brief |
| `prepare_apple_design_brief` | Prepare Apple-platform guidance without running Xcode |
| `diagnose_app_quality` | Inspect local source and return file-anchored findings without writing reports |
| `prepare_frontend_brief` | Inspect existing components, props, tokens, stories, and supplied design mappings |

Read tool responses contain repository evidence and can include source excerpts and paths. They are not metadata-only receipts.

The legacy MCP catalog is registered only when the connected profile explicitly grants **every capability**. That compatibility surface includes integration and mutation workflows; it is not the default tool list or a recommended way to enable one missing feature. Supplying Figma credentials alone does not grant capabilities. Keep the default plugin configuration locked.

## Existing components before a patch

Use the beta frontend brief to identify reusable components and unresolved evidence:

```bash
memi agent brief . --frontend --json --intent "Improve the settings form using existing components"
```

A host with authorized Figma or Paper access can capture design evidence separately and supply it as a project-relative JSON file:

```bash
memi agent brief . --frontend --json --intent "Implement the selected settings design" --design-evidence design/settings-evidence.json
```

The file is an explicit handoff from the host or user. Memi does not silently call Figma or Paper to obtain it. Include the source, document/node identifiers, captured revision when known, and mappings to actual repository exports. See the [evidence example](AGENT_RECIPES.md#host-design-evidence).

Native Figma Code Connect is optional. If the host provides a verified mapping, preserve its source and revision; do not claim a native integration ran merely because a JSON mapping was supplied. Unknown props, missing exports, stale source hashes, conflicting tokens, and unsupported syntax remain visible for review. The beta reports static evidence; visual, interaction, accessibility-runtime, and build verification remain unassessed until separately performed.

## Metadata-only receipt

For a stdout record that excludes source, paths, and intent strings:

```bash
memi diagnose . --receipt-only --fail-on none
```

This emits only a `memi.receipt.v1` JSON object containing artifact identifiers, rule IDs, counts, a diagnosis digest, timing, and capability decisions. It never persists diagnosis reports. An unavailable build commit is recorded as `unknown`; a receipt is not proof of rendered correctness. `--receipt-only` and `--agent-context` are mutually exclusive. Omit `--fail-on none` when the configured findings gate should control the process exit status.

## Integration evidence

- [2.8 release plan](trust/RELEASE_2_8_PLAN.md)
- Plugin manifest: `plugins/memoire/.codex-plugin/plugin.json`
- MCP wiring: `plugins/memoire/.mcp.json`
- Local smoke command: `npm run smoke:codex-plugin`
- [Privacy](https://www.memoire.cv/privacy) · [Terms](https://www.memoire.cv/terms)

A successful local smoke run does not establish marketplace approval, npm publication, or host-rendered verification.
