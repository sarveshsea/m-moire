# Memoire 0.14.1 Launch Campaign

Link every post to `https://www.npmjs.com/package/@sarveshsea/memoire` until `https://www.memoire.cv/components` is deployed, indexed from `examples/site-bundle`, and verified healthy.

## Core message

Memoire 0.14.1 is a shadcn-native registry bridge for Tailwind apps.

Run `memi diagnose`, export `/r/*.json` registry items, open them in v0, install from npm/URLs/aliases, and generate evidence-backed UI fix plans.

## X / Twitter

```text
Memoire 0.14.1 is shadcn-native Design CI for Tailwind apps.

Run:
memi diagnose
memi shadcn export --out public/r
memi fix plan

Turn a real app into registry JSON that works with shadcn, v0, AI editors, npm, and Memoire.

npm i -g @sarveshsea/memoire
```

## shadcn audience

```text
shadcn made components copyable and installable.

Memoire 0.14.1 turns your existing shadcn/Tailwind app into a registry:
- registry.json
- /r/{item}.json
- file targets
- cssVars
- npm/URL installs
- registry doctor

npm i -g @sarveshsea/memoire
memi shadcn export --out public/r
```

## v0 audience

```text
v0 gets better when your design system is real context, not screenshots.

Memoire 0.14.1 exports shadcn registry items from an existing Tailwind app and emits Open-in-v0 URLs for each item.

Diagnose the app, export registry JSON, open the item in v0, then install the result back into code.

npm i -g @sarveshsea/memoire
```

## AI editor / MCP audience

```text
AI editors need product-specific UI context.

Memoire 0.14.1 exposes MCP tools for:
- get_shadcn_registry
- get_registry_item
- diagnose_app_quality
- plan_ui_fixes

Use the app graph + registry items as code-native design-system context.

npm i -g @sarveshsea/memoire
```

## Tailwind audience

```text
Tailwind apps drift fast: arbitrary values, raw colors, weak CSS vars, repeated patterns.

Memoire 0.14.1 scans the app, extracts token signals, builds a UI fix plan, and exports shadcn-native registry files.

memi diagnose
memi tokens --from ./src --report
memi fix plan
memi shadcn export --out public/r
```

## Existing-app audience

```text
Most teams do not start from Figma.

Memoire now starts from the app:
1. diagnose UI debt
2. extract Tailwind/token signals
3. plan safe fixes
4. export shadcn registry items
5. install from npm, URL, GitHub, local path, or alias

npm i -g @sarveshsea/memoire
```

## Release gates before posting

- npm latest reports `0.14.1`.
- npm README first screen contains `Shadcn-native Design CI for Tailwind apps`.
- `npm i -g @sarveshsea/memoire && memi --version` returns `0.14.1`.
- GitHub description/topics match `docs/SITE_HANDOFF.md`.
- Website `/components` renders from `examples/site-bundle/catalog.json` or the catalog fallback.
