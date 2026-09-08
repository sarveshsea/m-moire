# Published beta.2 registry verification

Fresh registry replay of `@memi-design/cli@2.8.0-beta.2` completed at 2026-09-08T22:49:20.441Z, bound to source `51f8fb64570fd6c613244432b15fd6ea19450329` and [original publication invocation](https://github.com/memi-design/memi/actions/runs/34286620155/attempts/1). The separately verified release-record digest is recorded in [registry-provenance-observation.json](registry-provenance-observation.json).

- [51 CLI cases](cli-matrix.json) passed using the fresh installed registry artifact.
- Four-tool MCP smoke passed under [Node 22](mcp-node22.json) and [Node 24](mcp-node24.json).
- [17 Storybook tests](storybook.json) passed with zero skips, failures, or flakes; fixture typecheck and production build passed. [Screenshot](mapped-workspace.png) shows the public synthetic fixture.
- [Production audit](production-audit.json) reported explicit zero counts; [signature audit](registry-signatures.json) succeeded.
- Installed CLI [entry hashes](entry-integrity.json) matched before and after. [Artifact digest](artifact.json), [execution records](executions.json), and [raw input hashes](raw-input-hashes.json) preserve the evidence chain.

This replay does not establish new live connector captures, Paper pixel parity, native standalone behavior, stable promotion, managed scanning, model cost savings, or rendered npm website state. Timestamps absent from the raw runner were not reconstructed.
