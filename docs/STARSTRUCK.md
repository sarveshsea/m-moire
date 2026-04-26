# Starstruck Distribution Plan

Goal: move `sarveshsea/m-moire` from `4` real stars to the Starstruck base tier at `16` stars. We need `12` legitimate stars from developers who see enough value to install, test, or bookmark Memoire.

## Current Reality

| Surface | Status | Meaning |
| --- | --- | --- |
| GitHub stars | `4` | Need `12` more for Starstruck |
| npm latest | `0.14.1` | Published, but the already-published package does not include the later `mcpName` metadata |
| Official MCP Registry | Not listed | `registry.modelcontextprotocol.io` search returns no Memoire result |
| Glama | Listed | Listed as `sarveshsea/m-moire`, but the description still reflects the older design-system MCP positioning |
| GitHub topics | Updated | Strong enough for search: `mcp-server`, `shadcn-native`, `shadcn-registry-generator`, `design-ci`, `token-extraction` |
| Open shadcn PRs | `2` | `bytefer/awesome-shadcn-ui#18`, `birobirobiro/awesome-shadcn-ui#493` |
| Open MCP PRs | `4` | New MCP list and registry PRs opened from this pass |

## Star CTA

Use one ask everywhere:

```text
If this saves you from rebuilding the same shadcn/Tailwind system again, star the repo so more frontend teams can find it:
https://github.com/sarveshsea/m-moire
```

Do not ask for fake stars, star swaps, or bot engagement. The ask must sit after a demo, install command, or useful directory submission.

## First Move: Publish The MCP Patch

The official MCP Registry verifies npm package ownership by matching `server.json#name` to `package.json#mcpName`. Those fields are now in the repo, but npm `0.14.1` was published before that metadata landed. The next publish should be `0.14.2` unless we intentionally choose a larger version.

Release gate:

```bash
npm version patch --no-git-tag-version
npm run lint
npm test
npm run build
SKIP_PACK_GATE=1 npm run check:release
npm publish --access public
```

Then publish to the official MCP Registry:

```bash
mcp-publisher login github
mcp-publisher publish server.json
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.sarveshsea/memoire"
```

Why this matters: the official registry only hosts metadata, but MCP directories and aggregators use it as a trust source. Once this is live, submit or refresh every MCP directory with the same npm/GitHub links.

## Directory Targets

| Priority | Target | Why it matters | Route | Status |
| --- | --- | --- | --- | --- |
| P0 | Official MCP Registry | Trust anchor for downstream MCP aggregators | `mcp-publisher publish server.json` | Blocked until `0.14.2` publish |
| P0 | MCP.Directory | Has a direct submit form and says it auto-pulls GitHub/npm metadata | `https://mcp.directory/submit` | Ready after official registry |
| P0 | Glama | Already indexes Memoire, needs refreshed positioning | Claim/update listing after official registry | Ready |
| P0 | Smithery | Distribution, analytics, and config UI for MCP servers | `smithery.ai/new` or `smithery mcp publish` | Requires URL/MCPB decision |
| P0 | PulseMCP | MCP discovery and server popularity tracking | Confirm auto-index after official registry | Ready |
| P0 | mcp.so | Large MCP marketplace surface | Submit/refresh after official registry | Ready |
| P1 | shadcn official registry directory | Built into `shadcn add @registry/component` discovery | PR to `shadcn-ui/ui` registry directory | Wait for stable public flat registry URL |
| P1 | v0 design systems | v0 treats registries as design-system context | Demo post with Open in v0 workflow | Wait for registry URL |
| P2 | Product Hunt | One-time launch spike | Launch after npm + directories are live | Draft only |
| P2 | Show HN | Developer credibility | Post practical demo, not hype | Draft only |
| P2 | Reddit `r/mcp` | Direct MCP audience | Practical setup/demo | Draft only |
| P2 | Reddit `r/shadcn` | Direct registry audience | Registry export demo | Draft only |

## GitHub PR Targets

| Priority | Repo | Stars at audit | Fit | Status |
| --- | --- | ---: | --- | --- |
| P0 | `punkpeye/awesome-mcp-servers` | `85k+` | Largest MCP list | Merged: https://github.com/punkpeye/awesome-mcp-servers/pull/4373 |
| P0 | `TensorBlock/awesome-mcp-servers` | `639` | MCP list with developer utility category | Open: https://github.com/TensorBlock/awesome-mcp-servers/pull/455 |
| P0 | `YuzeHao2023/Awesome-MCP-Servers` | `1041` | MCP list with development tools category | Open: https://github.com/YuzeHao2023/Awesome-MCP-Servers/pull/208 |
| P0 | `MobinX/awesome-mcp-list` | `878` | Concise MCP list with developer tools category | Open: https://github.com/MobinX/awesome-mcp-list/pull/241 |
| P0 | `toolsdk-ai/toolsdk-mcp-registry` | `169` | Structured MCP registry JSON | Open: https://github.com/toolsdk-ai/toolsdk-mcp-registry/pull/296 |
| P1 | `bytefer/awesome-shadcn-ui` | `683` | shadcn ecosystem list | Open: https://github.com/bytefer/awesome-shadcn-ui/pull/18 |
| P1 | `birobirobiro/awesome-shadcn-ui` | `19k+` | Largest shadcn ecosystem list | Open: https://github.com/birobirobiro/awesome-shadcn-ui/pull/493 |
| P1 | `appcypher/awesome-mcp-servers` | `5492` | MCP list with development tools category | Branch pushed, PR creation blocked by base permissions: https://github.com/appcypher/awesome-mcp-servers/compare/main...sarveshsea:awesome-mcp-servers-2:add-memoire-design-ci |
| P1 | `wong2/awesome-mcp-servers` | `4005` | MCP list with community servers category | Branch pushed, PR creation blocked by base permissions: https://github.com/wong2/awesome-mcp-servers/compare/main...sarveshsea:awesome-mcp-servers-1:add-memoire-design-ci |
| P2 | `react-figma/awesome-figma` | `430` | Figma/dev integration list | Wait until Figma positioning is not competing with shadcn-native wedge |
| P2 | `klaufel/awesome-design-systems` | `843` | Developer-focused design systems list | Wait until website proof page is healthy |
| P2 | `gztchan/awesome-design` | `17k+` | Broad design resources | Do not submit unless there is a polished public article/demo |
| P2 | `RGB-Team/shadcn-registries` | `49` | shadcn registry directory | Wait for stable public registry URL |

## Launch Sequence For 12 Stars

1. Publish `0.14.2` with `mcpName` and `server.json`.
2. Publish to the official MCP Registry and verify search returns `io.github.sarveshsea/memoire`.
3. Submit MCP.Directory, refresh Glama, submit Smithery, confirm PulseMCP and mcp.so indexing.
4. Follow up on all open PRs with one useful comment only after the official registry link exists.
5. Ship one 60-second terminal demo: install, `memi diagnose`, `memi shadcn export`, `memi mcp config --install`.
6. Post the demo to X, Show HN, `r/mcp`, and `r/shadcn` with the GitHub star CTA.
7. Recheck stars daily for 7 days and record which surface drove each bump.

## Demo Script

```bash
npm i -g @sarveshsea/memoire
memi diagnose --no-write
memi tokens --from ./src --report
memi shadcn export --out public/r
memi mcp config --install
```

Narrative:

```text
Most AI UI tools help create the first draft. Memoire is for the app after that: diagnose the messy shadcn/Tailwind codebase, extract the token system, export a shadcn-native registry, and give Claude Code/Cursor/Codex the same design-system context through MCP.
```

## Follow-Up Rules

- Follow up on a PR only when there is new proof: official registry URL, npm patch, demo video, or CI fix.
- Do not ping maintainers repeatedly for achievements.
- Do not submit to broad design lists until the public website and `/components` route are healthy.
- If a directory rejects Memoire as too broad, narrow the listing to the MCP server or shadcn registry export workflow.

## Sources

- Official MCP Registry publish flow: https://modelcontextprotocol.io/registry/quickstart
- MCP npm package verification: https://modelcontextprotocol.io/registry/package-types
- MCP.Directory submit form: https://mcp.directory/submit
- Smithery publish flow: https://smithery.ai/docs/build/publish
- shadcn registry directory requirements: https://ui.shadcn.com/docs/registry/registry-index
- v0 design-system registry workflow: https://v0.app/docs/design-systems
