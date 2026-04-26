# SEO Handoff

Use this copy on the website repo, GitHub metadata, and launch pages until `memoire.cv/components` is healthy. The conversion URL is the npm package page.

## Primary Search Phrase

`Design CI for shadcn/Tailwind apps`

## Marketplace Search Phrases

- `shadcn registry marketplace`
- `installable shadcn design systems`
- `Tailwind design system registry`
- `AI chat shadcn registry`
- `auth UI shadcn registry`
- `landing page shadcn registry`
- `ecommerce shadcn registry`
- `tweakcn registry publishing`

## Title Tags

- Homepage: `Memoire - Design CI for shadcn/Tailwind apps`
- Components fallback: `Shadcn registry marketplace - Memoire`
- Docs: `Memoire docs - Diagnose UI debt, extract tokens, publish registries`
- Launch page: `Memoire 0.13 - Code-first Design CI for frontend teams`

## Meta Descriptions

- Homepage: `Memoire diagnoses UI debt in real shadcn/Tailwind codebases, extracts design tokens, and publishes improved systems as installable registries.`
- Components fallback: `Explore installable shadcn/Tailwind design systems for SaaS, docs, dashboards, landing pages, auth, AI chat, ecommerce, and tweakcn-inspired themes.`
- Docs: `Install Memoire, run memi diagnose, extract tokens from code, and publish a reusable shadcn/Tailwind registry.`
- Launch page: `Memoire 0.13 is a code-first Design CI workflow for teams using shadcn, Tailwind, tweakcn, and installable registries.`

## OpenGraph

- `og:title`: `Memoire - Design CI for shadcn/Tailwind apps`
- `og:description`: `Diagnose UI debt in real code, extract tokens, and publish improved design systems as installable registries.`
- `og:url`: `https://www.npmjs.com/package/@sarveshsea/memoire`
- `og:type`: `website`
- `og:image`: `https://raw.githubusercontent.com/sarveshsea/m-moire/main/assets/theme-workflow-demo.svg`

## Twitter Card

- `twitter:card`: `summary_large_image`
- `twitter:title`: `Memoire - Design CI for shadcn/Tailwind apps`
- `twitter:description`: `Run memi diagnose, extract tokens from code, and publish a reusable shadcn/Tailwind registry.`
- `twitter:image`: `https://raw.githubusercontent.com/sarveshsea/m-moire/main/assets/theme-workflow-demo.svg`

## JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Memoire",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS, Linux, Windows",
  "description": "Design CI for shadcn/Tailwind apps: diagnose UI debt, extract tokens, and publish installable registries.",
  "softwareVersion": "0.13.1",
  "url": "https://www.npmjs.com/package/@sarveshsea/memoire",
  "codeRepository": "https://github.com/sarveshsea/m-moire",
  "programmingLanguage": "TypeScript",
  "keywords": [
    "design-ci",
    "ui-quality",
    "shadcn-audit",
    "tailwind-audit",
    "token-extraction",
    "design-tokens",
    "shadcn-registry",
    "shadcn-registry-marketplace",
    "installable-shadcn-design-systems",
    "tailwind-design-system-registry",
    "tweakcn"
  ],
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

## Sitemap Priorities

- `/` priority `1.0`, changefreq `weekly`
- `/docs` priority `0.8`, changefreq `weekly`
- `/components` priority `0.9`, changefreq `daily` once the registry index is stable
- `/components/starter-saas`, `/components/docs-blog`, `/components/dashboard`, `/components/landing-page`, `/components/auth-flow`, `/components/ai-chat`, `/components/ecommerce` priority `0.8`, changefreq `weekly`
- `/components/starter`, `/components/tweakcn-vercel`, `/components/tweakcn-supabase`, `/components/tweakcn-linear` priority `0.7`, changefreq `weekly`

## Website Acceptance Criteria

- The first screen says `Design CI for shadcn/Tailwind apps`.
- The only primary CTA is `https://www.npmjs.com/package/@sarveshsea/memoire`.
- The first code block uses `npm i -g @sarveshsea/memoire`, `memi diagnose`, `memi tokens --from ./src --report`, and `memi publish --name @you/ds`.
- `/components` renders `examples/marketplace-catalog.v1.json`; if that fails, it falls back to `examples/featured-registries.json` instead of an empty state.
- Footer links use `@sarveshsea/memoire`, not an unscoped package name.
- Individual registry pages use the page templates in [`MARKETPLACE_SEO.md`](./MARKETPLACE_SEO.md).
