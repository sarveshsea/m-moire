# Memoire Quickstart

Memoire is a registry-first CLI. Lead with one loop:

1. Publish a design system from Figma or tweakcn.
2. Install real components into any shadcn app.
3. Update the registry instead of hand-copying components.

## Fastest paths

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

Memoire still supports MCP, research, notes, and agents. Keep those as follow-on surfaces after the registry workflow is already clear.
