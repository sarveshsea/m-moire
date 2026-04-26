# Release Gates

Use these checks before announcing or tagging a public release.

## Public npm Gate

`npm run check:public-release` verifies the live npm surface after publish:

- npm `dist-tags.latest` matches `package.json`.
- npm README includes the current positioning phrase.
- npm README includes `npm i -g @sarveshsea/memoire`.
- A clean temp install can run `memi --version`.

For the `0.14.1` line, `0.13.1` must be published first. If npm still reports `0.12.3`, do not announce `0.14.1`; publish and verify the existing release line before continuing external launch work.

```bash
npm run check:public-release
SKIP_INSTALL_SMOKE=1 npm run check:public-release
```

The local `npm run check:release` remains repo-only so development can continue while npm is intentionally behind.
