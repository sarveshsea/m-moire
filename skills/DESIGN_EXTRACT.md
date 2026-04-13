# Design Extract

Extract any website's design system from its public URL. No login, no API key, no Figma.

## When to use

- User pastes a URL and wants to understand its visual design
- User wants to replicate a site's look and feel
- User asks "what design system does X use?"
- User wants a DESIGN.md for AI context
- User wants to match an existing site's tokens in their own project

## How it works

1. Fetch the URL's HTML and all linked stylesheets
2. Parse CSS for: custom properties, colors, fonts, spacing, radii, shadows
3. Send extracted raw data to Claude for structured synthesis
4. Output a `DESIGN.md` with: color system, typography, spacing, borders, component patterns, Tailwind config sketch

## Usage

```bash
# CLI
memi design-doc https://linear.app
memi design-doc https://stripe.com --spec    # also write a DesignSpec JSON
memi extract https://vercel.com              # alias

# MCP tool
design_doc({ url: "https://linear.app" })
```

## Output format

The DESIGN.md contains:

- **Color System** -- palette with semantic names (primary, bg, fg, muted, accent)
- **Typography** -- font stacks, size scale, weight usage
- **Spacing** -- scale (4px/8px grid or other rhythm)
- **Borders & Surfaces** -- radii, shadows, border styles
- **Component Patterns** -- inferred from DOM (buttons, cards, inputs, nav)
- **Tailwind Config Sketch** -- partial `tailwind.config.js` with extend values

## Success criteria

- Extraction completes in under 30 seconds for any public URL
- Output contains at least 10 distinct design tokens
- Tailwind config sketch is valid JavaScript
- DESIGN.md is immediately usable as AI prompt context

## Limitations

- Does not work on pure client-side rendered apps (CSR) that inject all styles via JS at runtime
- Works on: static sites, SSR (Next.js, Remix, SvelteKit), and any site that serves CSS in `<link>` or `<style>` tags
