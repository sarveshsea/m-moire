# Distribution Submissions

Ready-to-submit entries for awesome lists and directories.

---

## 1. awesome-claude-code (hesreallyhim/awesome-claude-code)

**Category:** Agent Skills > General

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) by [sarveshsea](https://github.com/sarveshsea) - Design intelligence MCP server with 20 tools for Claude Code. Extract any website's design system from a URL (`design_doc`), pull tokens from Figma or Penpot, generate React + shadcn/ui components from specs, run design audits. One command: `npx @sarveshsea/memoire design-doc https://stripe.com`. 698 tests.
```

---

## 2. awesome-mcp-servers (punkpeye/awesome-mcp-servers)

**Category:** Server Implementations > Design

**Entry:**

```markdown
- [Memoire](https://github.com/sarveshsea/m-moire) 📇 🏠 - Design system MCP server. 20 tools: extract design tokens from any URL, pull from Figma (REST or WebSocket) and Penpot, generate React components from specs, run WCAG audits, sync tokens bidirectionally. `memi mcp config --install` to set up.
```

---

## 3. Show HN Post

**Title:** Show HN: Extract any website's design system with one command

**Body:**

```
I built Memoire — a CLI + MCP server that extracts design systems from any public URL.

  npx @sarveshsea/memoire design-doc https://stripe.com

It fetches the HTML and all linked stylesheets, parses CSS for custom properties, colors, fonts, spacing, radii, and shadows, then uses Claude to synthesize a structured DESIGN.md with a Tailwind config sketch.

Also works as an MCP server (20 tools) for Claude Code / Cursor — pull tokens from Figma or Penpot, generate React + shadcn/ui components from JSON specs, run design audits.

No account needed. No Figma required to get started. MIT licensed.

https://github.com/sarveshsea/m-moire
```

---

## 4. Twitter/X Thread

**Tweet 1 (hook):**
```
i built a CLI that extracts any website's design system in 10 seconds

npx @sarveshsea/memoire design-doc https://stripe.com

colors, typography, spacing, shadows, component patterns — all in a DESIGN.md with a Tailwind config sketch

no account. no figma. one command.
```

**Tweet 2 (how it works):**
```
how it works:

1. fetches HTML + all linked stylesheets
2. parses CSS: custom properties, colors, fonts, spacing, radii, shadows
3. claude synthesizes into structured DESIGN.md

works on any SSR/static site. stripe, linear, vercel, github — all work.
```

**Tweet 3 (MCP angle):**
```
it's also an MCP server with 20 tools

add to claude code in one command:
  memi mcp config --install

then your AI assistant can:
- pull tokens from figma or penpot
- generate react + shadcn/ui components
- run WCAG design audits
- extract design systems from URLs
```

**Tweet 4 (CTA):**
```
698 tests. MIT licensed. works offline.

github.com/sarveshsea/m-moire

try it:
  npx @sarveshsea/memoire design-doc [your-favorite-site]
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
