# Site and GitHub Handoff

These are the exact external-surface updates that still need credentials or the separate website repo.

## GitHub repo metadata

- Description: `Publish Figma and tweakcn design systems as installable shadcn registries.`
- Topics: `registry`, `design-system`, `figma`, `tweakcn`, `shadcn`, `tailwind`, `npm`, `mcp`

## Homepage hero

- Heading: `Publish Figma and tweakcn design systems as installable registries.`
- Subhead: `Ship tokens and real components to npm. Install them into any shadcn app with one command.`
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
