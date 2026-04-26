# Memoire Launch Pack

Use one message everywhere for the `0.13.1` launch:

> Design CI for shadcn/Tailwind apps: diagnose UI debt in real code, extract tokens, and publish the improved system as an installable registry.

Link to one conversion page only per post. Until `memoire.cv/components` is fixed, prefer the npm package page:

- [npm: `@sarveshsea/memoire`](https://www.npmjs.com/package/@sarveshsea/memoire)

## Launch baseline

- Repo release target: `0.13.1`
- npm package behind repo before launch: `0.12.3` latest while repo was `0.12.4`
- Demand baseline from the 30-day plan: `66` weekly downloads for Apr 17-23, 2026 and `1532` monthly downloads for Mar 25-Apr 23, 2026
- 30-day target: `1500+` weekly downloads and `4000+` monthly downloads
- Primary search phrase: `Design CI for shadcn/Tailwind apps`

## Competitive positioning

Use this distinction consistently:

- Claude Design is for prompt-first visual exploration and prototypes.
- Figma Make is for prompt-to-app work inside Figma.
- v0 is for first-screen and first-app generation.
- Memoire is for the existing-app phase: diagnose UI debt from code, improve the design system, publish the result, and carry that registry into AI tools.

## Tweet pack

### Launch

```text
Memoire 0.13 is Design CI for shadcn/Tailwind apps.

Run `memi diagnose`, find UI debt in real code, extract tokens, then publish the improved system as an installable registry.

npm i -g @sarveshsea/memoire
https://www.npmjs.com/package/@sarveshsea/memoire
```

### No Figma

```text
Most dev teams do not start in Figma.

Memoire now starts from the app:
`memi diagnose` + `memi tokens --from ./src --report`

That turns code into a design-system audit.

https://www.npmjs.com/package/@sarveshsea/memoire
```

### shadcn

```text
shadcn made components installable.

Memoire makes the design system installable: tokens, components, registry, and update path.

npm i -g @sarveshsea/memoire
memi publish --name @you/ds
memi add Button --from @you/ds

https://www.npmjs.com/package/@sarveshsea/memoire
```

### tweakcn

```text
tweakcn is where you shape the theme.

Memoire is how you validate, package, publish, and install it across apps.

memi theme import ./tweakcn-export.css --name "Acme Theme"
memi theme publish "Acme Theme" --package @you/theme

https://www.npmjs.com/package/@sarveshsea/memoire
```

### Competitive

```text
Claude Design and v0 help create the first pass.

Memoire is for the part after: diagnose the real app, clean the system, and publish reusable code.

https://www.npmjs.com/package/@sarveshsea/memoire
```

### Proof

```text
Memoire 0.13 target:
- faster CLI
- code-first token extraction
- SEO-clean npm page
- Design CI workflow devs can try in under 60 seconds

https://www.npmjs.com/package/@sarveshsea/memoire
```

## Marketplace campaign

The `0.13.1` marketplace-specific launch posts live in [`docs/MARKETPLACE_LAUNCH.md`](./MARKETPLACE_LAUNCH.md). Use those for category-specific pushes around `landing-page`, `auth-flow`, `ai-chat`, `ecommerce`, shadcn, tweakcn, and developer forums.

The `0.14.1` shadcn-native registry bridge campaign lives in [`docs/LAUNCH_0_14_1.md`](./LAUNCH_0_14_1.md). Use it for shadcn, v0, AI editor/MCP, Tailwind, and existing-app audiences.

## Canonical posts

Standalone post templates and reply copy live in [`docs/SOCIAL.md`](./SOCIAL.md).

### X / Twitter

```text
Memoire is Design CI for shadcn/Tailwind apps.

diagnose:
memi diagnose http://localhost:3000

package the improved system:
memi publish --name @you/ds

It finds UI debt in real apps, then turns the cleaned-up system into something installable.

https://www.npmjs.com/package/@sarveshsea/memoire
```

### shadcn community

```text
If you like the shadcn install pattern, Memoire applies it to whole design systems.

- publish a Figma system or tweakcn theme to npm
- install real components with memi add
- keep tokens + components synced through one registry

Quickstart:
npm i -g @sarveshsea/memoire
memi publish --name @you/ds --figma <url> --push
memi add Button --from @you/ds

https://www.npmjs.com/package/@sarveshsea/memoire
```

### tweakcn audience

```text
tweakcn is great for visual theme editing.
Memoire handles the next step: validate, preview, diff, package, and publish the theme as an installable shadcn registry.

memi theme import ./tweakcn-export.css --name "Acme Theme"
memi theme validate "Acme Theme"
memi theme publish "Acme Theme" --package @you/theme

https://www.npmjs.com/package/@sarveshsea/memoire
```

### Figma / dev-design audience

```text
Memoire takes a Figma design system and ships it as an npm registry instead of a screenshot or token dump.

publish:
memi publish --name @you/ds --figma <url> --push

install anywhere:
memi add Button --from @you/ds

Registry-first docs and examples:
https://www.npmjs.com/package/@sarveshsea/memoire
```

## Weekly checks

- Fill in [`docs/METRICS.md`](./METRICS.md)
- Weekly npm downloads
- Monthly npm downloads
- npm latest version
- GitHub stars and metadata status
- README first-screen CTA
- Website `/components` health
- Which featured registry gets the most installs
