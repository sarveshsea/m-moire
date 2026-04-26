# Social Launch Posts

All posts link to npm until `https://www.memoire.cv/components` is reliable.

Primary link: `https://www.npmjs.com/package/@sarveshsea/memoire`

## X / Twitter

### Main launch

```text
Memoire 0.13 is Design CI for shadcn/Tailwind apps.

Run:
memi diagnose
memi tokens --from ./src --report
memi publish --name @you/ds

It starts from real code, finds UI debt, extracts tokens, and packages the improved system as an installable registry.

https://www.npmjs.com/package/@sarveshsea/memoire
```

### Reply 1

```text
The core bet:

Most teams do not have a perfect Figma source of truth.
They have an app that works, but looks inconsistent.

Memoire starts there.
```

### Reply 2

```text
Claude Design/v0/Bolt help create the first pass.

Memoire is for the next phase:
- diagnose the actual app
- tighten the system
- extract tokens
- publish reusable code
```

## shadcn community

```text
If your team uses shadcn, Memoire gives you a Design CI loop around the app:

1. `memi diagnose`
2. `memi tokens --from ./src --report`
3. `memi publish --name @you/ds`
4. `memi add Button --from @you/ds`

shadcn made components installable. Memoire makes the design system installable.

https://www.npmjs.com/package/@sarveshsea/memoire
```

## tweakcn community

```text
tweakcn is where you shape a shadcn theme.

Memoire is how you validate, package, publish, and install that theme across apps:

memi theme import ./tweakcn-export.css --name "Acme Theme"
memi theme validate "Acme Theme"
memi theme publish "Acme Theme" --package @you/theme
memi add Button --from @you/theme

https://www.npmjs.com/package/@sarveshsea/memoire
```

## Dev-design community

```text
Design systems usually fail after implementation, not before it.

Memoire 0.13 starts from code:
- audits UI debt in a real shadcn/Tailwind app
- extracts token coverage and dark-mode parity
- turns the improved system into an installable registry

npm i -g @sarveshsea/memoire

https://www.npmjs.com/package/@sarveshsea/memoire
```

## Marketplace category posts

Use [`docs/MARKETPLACE_LAUNCH.md`](./MARKETPLACE_LAUNCH.md) for the `0.13.1` registry marketplace campaign. It contains one post each for landing pages, auth flows, AI chat, ecommerce, shadcn, tweakcn, and developer forums.

## Short comments

```text
The code-first path is the point: `memi diagnose` then `memi tokens --from ./src --report`.
```

```text
This is not prompt-to-UI. It is the cleanup and distribution layer after the app exists.
```

```text
Memoire treats a design system like CI: detect drift, extract tokens, publish reusable packages.
```
