## Published beta verification

The npm registry artifact `@memi-design/cli@2.8.0-beta.1` was downloaded on 2026-09-08T17:24:12.113Z and tested through 2026-09-08T17:26:12.461Z. Source checkpoint: `71d17ecb8b44a39d81e18a831155eb010779bdfe`. The published tarball is 655,540 bytes; its registry SHA-512 and downloaded SHA-256 are recorded in [artifact.json](artifact.json).

- [51 CLI cases](cli-matrix.json) passed against the installed registry bytes.
- [17 Storybook tests](storybook.json) passed with zero skips, failures, or flakes; typecheck and production build also passed. [Screenshot](mapped-workspace.png) shows the public synthetic fixture.
- Locked MCP checks passed on [Node 22.22.3](mcp-node22.json) and [Node 24.19.0](mcp-node24.json), exposing four audited tools with no sentinel side effects.
- [Production audit](production-audit.json) reported zero known vulnerabilities.
- The [installed entry hash](entry-integrity.json) remained unchanged before and after verification.
- [Recovery workflow signature output](registry-signatures.json) reports 143 verified registry signatures and 20 verified attestations, including the registry-installed CLI.

[The separate registry provenance observation](registry-provenance-observation.json) binds the package and tarball to the source checkpoint and publish invocation. Its publication-record field is still null; this evidence does not replace that record. No offline-bundle claim is made.

Historical local candidate receipts for `3308b20e` remain retained separately and must continue to be labeled historical. These fresh registry receipts do not relabel or overwrite them.
