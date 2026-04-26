# Site and GitHub Handoff

These are the exact external-surface updates that still need credentials or the separate website repo.

## GitHub repo metadata

- Description: `Design CI for shadcn/Tailwind apps: diagnose UI debt, extract tokens, and publish installable registries.`
- Topics: `design-ci`, `ui-quality`, `ui-audit`, `shadcn-audit`, `tailwind-audit`, `design-quality`, `frontend-quality`, `token-extraction`, `design-tokens`, `shadcn-registry`, `tweakcn`, `registry`

## Homepage hero

- Heading: `Design CI for shadcn/Tailwind apps.`
- Subhead: `Diagnose UI debt in real code, extract tokens, and publish the improved system as an installable registry.`
- Primary CTA: `https://www.npmjs.com/package/@sarveshsea/memoire`
- Secondary CTA: omit until `/components` is reliable. If one is required, use `https://github.com/sarveshsea/m-moire#no-figma-required`.

## Docs landing

- Lead with the two quickstarts from [`docs/README.md`](./README.md)
- Push MCP, Notes, and agents below the fold under an `Advanced` heading

## `/components` fallback

- Primary data: render all entries from [`examples/marketplace-catalog.v1.json`](../examples/marketplace-catalog.v1.json)
- Fallback data: when the full catalog cannot load, render the three entries from [`examples/featured-registries.json`](../examples/featured-registries.json)
- Never show an all-zero empty state if either catalog exists
- Registry cards must show screenshot, title, description, install command, tags, component count, source link, and npm package link
- Individual pages should use the template and keyword clusters in [`docs/MARKETPLACE_SEO.md`](./MARKETPLACE_SEO.md)

## Footer

- npm link: `https://www.npmjs.com/package/@sarveshsea/memoire`
- Version string: only show the currently released package version
- OpenGraph, Twitter card, sitemap, and JSON-LD copy: [`docs/SEO.md`](./SEO.md)
