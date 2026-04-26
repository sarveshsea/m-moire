# Distribution Submissions

Ready-to-submit entries for awesome lists and directories.

---

## 1. awesome-claude-code (hesreallyhim/awesome-claude-code)

**Category:** Agent Skills > General

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) by [sarveshsea](https://github.com/sarveshsea) - Design CI for shadcn/Tailwind apps. Diagnose UI debt in real code, extract tokens, publish installable registries, and connect Claude Code to the same workflow with `memi mcp config --install`.
```

---

## 2. awesome-mcp-servers (punkpeye/awesome-mcp-servers)

**Category:** Server Implementations > Design

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) 📇 🏠 - Design CI for shadcn/Tailwind apps. Diagnose UI debt in real code, publish installable registries from improved systems, pull tokens from Figma or Penpot, and connect the workflow to Claude Code with `memi mcp config --install`.
```

---

## 3. Show HN Post

**Title:** Show HN: Design CI for shadcn/Tailwind apps

**Body:**

```
I built Memoire - Design CI for shadcn/Tailwind apps and a registry-capable CLI + MCP server for design systems.

  npm i -g @sarveshsea/memoire
  memi diagnose
  memi tokens --from ./src --report
  memi publish --name @acme/ds

That turns an existing codebase into a UI-quality audit, token extraction report, and publishable registry.

Then in any shadcn app:

  npx @sarveshsea/memoire add Button --from @acme/ds

It also works as an MCP server for Claude Code / Cursor, so the same registry workflow can be driven from AI tools.

There are Figma, tweakcn, Penpot, and public-site paths too, but the main path is code-first.

MIT licensed.

https://github.com/sarveshsea/m-moire
```

---

## 4. Twitter/X Thread

**Tweet 1 (hook):**
```
i built Design CI for shadcn/Tailwind apps

memi diagnose
memi tokens --from ./src --report
memi publish --name @acme/ds

then from any shadcn app:
npx @sarveshsea/memoire add Button --from @acme/ds

UI debt audit + tokens + real components, not screenshots or specs only
```

**Tweet 2 (how it works):**
```
how it works:

1. diagnose the app you already have
2. extract tokens from code
3. package tokens + specs + generated code
4. publish to npm
5. install components anywhere with `memi add`

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
  npm i -g @sarveshsea/memoire
  memi diagnose
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
