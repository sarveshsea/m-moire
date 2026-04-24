# Site and GitHub Handoff

These are the exact external-surface updates that still need credentials or the separate website repo.

## GitHub repo metadata

- Description: `Design CI for web apps: diagnose UI debt, improve shadcn/Tailwind systems, and publish installable registries.`
- Topics: `design-ci`, `ui-audit`, `design-system`, `tailwind`, `shadcn`, `registry`, `figma`, `tweakcn`, `npm`, `mcp`

## Homepage hero

- Heading: `Design CI for web apps.`
- Subhead: `Diagnose UI debt in real shadcn/Tailwind apps, improve the visual system, then publish it as an installable registry.`
- Primary CTA: `https://www.npmjs.com/package/@sarveshsea/memoire`
- Secondary CTA: `https://github.com/sarveshsea/m-moire/tree/main/examples`

## Docs landing

- Lead with the two quickstarts from [`docs/README.md`](./README.md)
- Push MCP, Notes, and agents below the fold under an `Advanced` heading

## `/components` fallback

- When the live component index is unavailable, render the three entries from [`examples/featured-registries.json`](../examples/featured-registries.json)
- Never show an all-zero empty state if this fallback data exists

## Footer

- npm link: `https://www.npmjs.com/package/@sarveshsea/memoire`
- Version string: only show the currently released package version
