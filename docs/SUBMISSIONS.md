# Distribution Submissions

Use this as the operating board for real directory and launch work. Every entry should improve Memoire discovery or trust. Do not submit low-quality PRs for achievements.

## Canonical Positioning

```text
Memoire is an MCP server and CLI for shadcn-native Design CI: diagnose UI debt, extract Tailwind tokens, export shadcn registries, and plan safe UI fixes.
```

## Primary Install Path

```bash
npm i -g @sarveshsea/memoire
memi diagnose
memi shadcn export --out public/r
memi mcp config --install
```

## Directory Matrix

| Priority | Target | Lane | Submission route | Status | Next action |
| --- | --- | --- | --- | --- | --- |
| P0 | Official MCP Registry | MCP directory | `mcp-publisher publish server.json` | Ready next patch | Publish a patch containing `mcpName`, then publish `server.json` |
| P0 | MCP.Directory | MCP directory | `https://mcp.directory/submit` | Ready | Submit GitHub URL, npm package, and one-line description |
| P0 | Smithery | MCP directory | `https://smithery.ai/new` or CLI publish | Ready | Submit after server metadata is published |
| P0 | Glama | MCP directory | Glama MCP server directory submission | Ready | Submit npm/GitHub links and demo |
| P0 | PulseMCP | MCP directory | Directory indexing/submission path | Ready | Confirm listing after official registry submission |
| P0 | MCP Central | MCP directory | Directory listing | Ready | Submit after npm is live |
| P0 | mcp.so | MCP directory | Directory listing | Ready | Submit after npm is live |
| P0 | `punkpeye/awesome-mcp-servers` | Awesome list | Pull request | In progress | Update PR copy to shadcn-native MCP positioning |
| P0 | `hesreallyhim/awesome-claude-code` | Awesome list | Issue or PR | In progress | Comment with 0.14.1 proof and install command |
| P1 | shadcn registry directory | shadcn registry | Pull request to registry index | Ready | Submit when public registry URL is stable |
| P1 | Awesome shadcn/ui | shadcn ecosystem | Submit project or PR | Ready | Pitch as registry generator and MCP bridge |
| P1 | v0/design-system community | v0 ecosystem | Post/demo | Ready | Lead with Open in v0 registry workflow |
| P2 | Product Hunt | Launch | Launch page | Draft | Use demo video and npm CTA |
| P2 | Hacker News | Launch | Show HN post | Draft | Post after npm latest is verified |
| P2 | Reddit `r/mcp` | Community | Demo post | Draft | Share practical setup and demo, not hype |
| P2 | Reddit `r/shadcn` | Community | Registry workflow post | Draft | Lead with shadcn-native registry export |
| P2 | Dev.to/Hashnode | Content | Tutorial | Draft | Publish the 60-second workflow as a written guide |

## Ready-To-Submit Entries

### awesome-claude-code

Category: `Agent Skills > General`

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) by [sarveshsea](https://github.com/sarveshsea) - MCP server and CLI for shadcn-native Design CI. Diagnose UI debt, extract Tailwind tokens, export shadcn registries, plan safe UI fixes, and connect Claude Code with `memi mcp config --install`.
```

### awesome-mcp-servers

Category: `Developer Tools > Design`

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) 📇 🏠 - MCP server and CLI for shadcn-native Design CI. Audits Tailwind/shadcn apps, extracts tokens, exports shadcn registries, plans safe UI fixes, and gives Claude Code/Cursor/Codex design-system context through MCP.
```

### MCP directory one-liner

```text
MCP server and CLI for shadcn-native Design CI in Tailwind apps.
```

### MCP directory description

```text
Memoire lets AI coding tools understand and improve real shadcn/Tailwind apps. It diagnoses UI debt, extracts design tokens, exports shadcn-compatible registries, validates install paths, and exposes the workflow through MCP for Claude Code, Cursor, Codex, and other clients.
```

### shadcn/v0 directory description

```text
Memoire turns existing Tailwind/shadcn applications into shadcn-native registries that work with shadcn CLI, v0, AI editors, and npm. Use it to audit an app, extract tokens, export registry items, and publish installable design-system packages.
```

## Show HN Post

Title: `Show HN: MCP server for shadcn-native Design CI`

```text
I built Memoire, an MCP server and CLI for shadcn-native Design CI.

It starts from the app you already have:

  npm i -g @sarveshsea/memoire
  memi diagnose
  memi shadcn export --out public/r
  memi mcp config --install

That gives you a UI-quality diagnosis, Tailwind token extraction, shadcn-compatible registry output, and MCP tools for Claude Code/Cursor/Codex.

The wedge is code-first design systems. No Figma required. If your team has a messy shadcn/Tailwind app, Memoire helps turn it into an installable registry and a set of safer UI fix plans.

MIT licensed.

https://github.com/sarveshsea/m-moire
```

## X/Twitter Thread

```text
i built an MCP server for shadcn-native Design CI

npm i -g @sarveshsea/memoire
memi diagnose
memi shadcn export --out public/r
memi mcp config --install

it turns a real Tailwind/shadcn app into a UI audit, token report, shadcn registry, and AI-editor context
```

```text
most AI UI tools help with the first draft

Memoire is for after the draft:
- find UI debt
- extract tokens from code
- export shadcn registry items
- validate install paths
- give Claude Code/Cursor/Codex MCP tools for the same system
```

```text
the core loop:

1. run `memi diagnose`
2. export registry items with `memi shadcn export`
3. validate with `memi shadcn doctor`
4. connect MCP with `memi mcp config --install`
5. let AI editors work from the same design-system context
```

```text
repo:
https://github.com/sarveshsea/m-moire

npm:
https://www.npmjs.com/package/@sarveshsea/memoire
```

## Submission Checklist

- [ ] Publish npm 0.14.1 and verify `npm view @sarveshsea/memoire version`
- [ ] Publish next patch with `mcpName` and `server.json`
- [x] Update GitHub description and topics
- [x] Enable GitHub Discussions
- [ ] Submit to Official MCP Registry
- [ ] Submit to MCP.Directory
- [ ] Submit to Smithery
- [ ] Submit to Glama
- [ ] Submit to PulseMCP
- [ ] Submit to MCP Central
- [ ] Submit to mcp.so
- [ ] Update `punkpeye/awesome-mcp-servers` PR
- [ ] Update `hesreallyhim/awesome-claude-code` issue
- [ ] Submit to shadcn registry directory
- [ ] Submit to Awesome shadcn/ui
- [ ] Post Show HN
- [ ] Post X/Twitter thread with demo
- [ ] Post practical walkthrough to `r/mcp`
- [ ] Post registry workflow to `r/shadcn`
- [ ] Publish Dev.to or Hashnode tutorial
