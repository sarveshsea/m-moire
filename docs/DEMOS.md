# Demo Scripts

These are the two demos to keep reusing in README, npm, and launch posts.

## 60-second terminal demo

Goal: show the whole loop in one screen.

```bash
npm i -g @sarveshsea/memoire
memi publish --name @demo/ds --figma https://figma.com/design/xxx --push
memi add Button --from @demo/ds
memi view @demo/ds/Button --print
```

Talk track:

- publish a Figma design system to npm
- install a real component into a shadcn app
- open the component source or package surface

## 60-second tweakcn demo

Goal: show that tweakcn is a first-class workflow, not a one-off flag.

```bash
memi theme import ./tweakcn-export.css --name "Acme Theme"
memi theme validate "Acme Theme"
memi theme preview "Acme Theme"
memi theme publish "Acme Theme" --package @demo/theme
memi add Button --from @demo/theme
```

Talk track:

- import a tweakcn theme
- validate and preview it
- publish it as an installable package
- install a component from the published registry

## Recording notes

- Prefer the scoped npm package page over the website until the components index is healthy.
- Keep the terminal font large enough that `publish`, `theme publish`, and `add` are readable on mobile.
- End both demos on a real install command, not a dashboard or settings page.
