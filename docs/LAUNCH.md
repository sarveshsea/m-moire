# Memoire Launch Pack

Use one message everywhere for the next 30 days:

> Design CI for web apps: diagnose UI debt, improve the shadcn/Tailwind system, and publish it as an installable registry.

Link to one conversion page only per post. Until `memoire.cv/components` is fixed, prefer the npm package page:

- [npm: `@sarveshsea/memoire`](https://www.npmjs.com/package/@sarveshsea/memoire)

## Competitive positioning

Use this distinction consistently:

- Claude Design is for prompt-first visual exploration and prototypes.
- Figma Make is for prompt-to-app work inside Figma.
- v0 is for first-screen and first-app generation.
- Memoire is for the existing-app phase: diagnose UI debt from code, improve the design system, publish the result, and carry that registry into AI tools.

## Canonical posts

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

- Weekly npm downloads
- npm page views and install conversion
- Clicks to `examples/README.md`
- Which featured registry gets the most installs
