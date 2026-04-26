# Memoire Quickstart

Memoire is Design CI for shadcn/Tailwind apps. Lead with one loop:

1. Diagnose the app you already have.
2. Improve the visual system behind it.
3. Publish the improved system as an installable registry.

## Fastest paths

### Existing app to diagnosis

```bash
npm i -g @sarveshsea/memoire
memi diagnose
memi diagnose http://localhost:3000
```

### Existing app to tokens

```bash
npm i -g @sarveshsea/memoire
memi tokens --from ./src --save
memi tokens --from http://localhost:3000 --output generated/tokens --report
```

Use this when the team is code-first and not starting in Figma. Memoire extracts CSS variables, Tailwind `@theme` tokens, `:root`/`.dark` modes, aliases, repeated literal candidates, mode coverage, duplicate values, alias graph issues, and token quality recommendations.

## No Figma required

The highest-conversion path is code-first:

```bash
npm i -g @sarveshsea/memoire
memi diagnose
memi tokens --from ./src --report
memi publish --name @you/ds
```

Use a single CTA until the website is fully synced: [`@sarveshsea/memoire` on npm](https://www.npmjs.com/package/@sarveshsea/memoire).

### Figma to npm

```bash
npm i -g @sarveshsea/memoire
memi publish --name @you/ds --figma https://figma.com/design/xxx --push
memi add Button --from @you/ds
```

### tweakcn to npm

```bash
npm i -g @sarveshsea/memoire
memi theme import ./tweakcn-export.css --name "Acme Theme"
memi theme publish "Acme Theme" --package @you/theme
memi add Button --from @you/theme
```

## Proof

- Featured installable registries: [`examples/README.md`](../examples/README.md)
- Recording scripts: [`docs/DEMOS.md`](./DEMOS.md)
- Launch copy: [`docs/LAUNCH.md`](./LAUNCH.md)
- Full package overview: [`README.md`](../README.md)

## Advanced

Memoire still supports Figma, MCP, research, notes, and agents. Keep those as follow-on surfaces after the app-quality workflow is already clear.
