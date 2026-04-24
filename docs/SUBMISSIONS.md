# Distribution Submissions

Ready-to-submit entries for awesome lists and directories.

---

## 1. awesome-claude-code (hesreallyhim/awesome-claude-code)

**Category:** Agent Skills > General

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) by [sarveshsea](https://github.com/sarveshsea) - Design CI for web apps. Diagnose UI debt in shadcn/Tailwind codebases, improve the visual system, publish installable registries, and connect Claude Code to the same workflow with `memi mcp config --install`.
```

---

## 2. awesome-mcp-servers (punkpeye/awesome-mcp-servers)

**Category:** Server Implementations > Design

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) 📇 🏠 - Design CI for web apps. Diagnose UI debt in shadcn/Tailwind codebases, publish installable registries from improved systems, pull tokens from Figma or Penpot, and connect the workflow to Claude Code with `memi mcp config --install`.
```

---

## 3. Show HN Post

**Title:** Show HN: Publish your Figma design system as an installable npm registry

**Body:**

```
I built Memoire — Design CI for web apps and a registry-capable CLI + MCP server for design systems.

  npx @sarveshsea/memoire publish --name @acme/ds --figma https://figma.com/design/xxx --push

That turns a Figma file into an npm package with tokens, specs, and real components.

Then in any shadcn app:

  npx @sarveshsea/memoire add Button --from @acme/ds

It also works as an MCP server for Claude Code / Cursor, so the same registry workflow can be driven from AI tools.

There is also a `design-doc` path if you want to start from a public site URL instead of Figma.

MIT licensed.

https://github.com/sarveshsea/m-moire
```

---

## 4. Twitter/X Thread

**Tweet 1 (hook):**
```
i built a CLI that turns a Figma design system into an installable npm registry

npx @sarveshsea/memoire publish --name @acme/ds --figma https://figma.com/design/xxx --push

then from any shadcn app:
npx @sarveshsea/memoire add Button --from @acme/ds

tokens + real components, not screenshots or specs only
```

**Tweet 2 (how it works):**
```
how it works:

1. pull from figma or load a tweakcn theme
2. package tokens + specs + generated code
3. publish to npm
4. install components anywhere with `memi add`

it’s basically the shadcn pattern for whole design systems
```

**Tweet 3 (MCP angle):**
```
it also runs as an MCP server

add to claude code in one command:
  memi mcp config --install

then your AI assistant can:
- pull tokens from figma or penpot
- generate shadcn/ui code from specs
- audit and sync the design system
- work against the same published registry
```

**Tweet 4 (CTA):**
```
MIT licensed. works offline. npm package + standalone binary.

github.com/sarveshsea/m-moire

try it:
  npx @sarveshsea/memoire publish --name @you/ds --figma [your-file]
```

---

## 5. Dev.to Article

**Title:** I built a CLI that reverse-engineers any website's design system

**Outline:**

1. The problem — manually eyeballing design systems from DevTools
2. The solution — `memi design-doc <url>` (with demo output)
3. How it works (CSS parsing + AI synthesis)
4. Beyond extraction — full Figma-to-code pipeline
5. MCP server for AI coding tools
6. Try it now (npx one-liner)

---

## Submission Checklist

- [ ] PR to hesreallyhim/awesome-claude-code
- [ ] PR to punkpeye/awesome-mcp-servers
- [ ] Show HN post
- [ ] Twitter thread (attach demo GIF/video)
- [ ] Dev.to article
- [ ] Product Hunt launch
- [ ] Submit to glama.ai/mcp/servers directory
