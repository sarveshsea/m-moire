# Frontend workflow fixture

This private synthetic React/TypeScript consumer tests Memi's design-evidence → existing component → reuse → browser-verification workflow. It is not an existing customer application or a shipped Memi interface. The fixture creates its component catalog first, freezes those source fingerprints, then adds `WorkspaceSidebar` using the mapped `SideNavTab` export without modifying or duplicating it.

The package pins React 19.2.4, Storybook 10.6.0, Playwright 1.59.1 and locally served Inter font assets. Its npm lockfile and dependencies are separate from the Memi package. No model call is part of the workflow.

## Run

From this directory:

```sh
npm ci --ignore-scripts
npm run typecheck
MEMI_INSTALLED_ENTRY=/absolute/path/to/consumer/node_modules/@memi-design/cli/dist/index.js npm test
npm run build
```

`MEMI_INSTALLED_ENTRY` must point to an installed candidate tarball, not a source entry. Install that tarball into a disposable consumer with lifecycle scripts disabled. Chromium must be available to Playwright (`npx playwright install chromium` if needed). The tests launch Storybook on localhost port 6017 and shut it down afterward. `npm run storybook` opens the fixture for manual review.

## Evidence boundary

- `evidence/figma.json` describes the live Figma Side-Nav Tab reference (file `PhJjGL4bfxRRgxYYhfdeLJ`, node `5:452`). Native Code Connect was unavailable; the explicit checked-in mapping is the fallback.
- `evidence/paper.json` describes the equivalent node created in a disposable synthetic Paper file. Live JSX/style inspection succeeded, but the connector's screenshot output was all black. **Paper pixel comparison remains unassessed.**
- `evidence/catalog-baseline.json` contains source fingerprints, not a test-pass receipt. Both design envelopes resolve to the same existing export and source hash.
- The default dark story preserves the supplied CSS contract: File label, 182 × 25 px, 5 px padding/radius, Inter regular 12 px with normal line height, off-white text, transparent background. The native button semantics, selected/disabled behavior and light theme are authored fixture extensions. CSS assertions are not a pixel-diff certification of Figma or Paper.

The tests require Memi to prioritize the mapped export with `mustReuse: true` while keeping its own rendered verification `unassessed`. Separate Playwright checks verify keyboard activation, focus indication, selected and disabled states, and dark/light rendering at 320 and 1024 px. Source hashes and the exported component count check that the reuse task did not replace or duplicate the catalog component.

Run receipts, logs, traces and screenshots live under ignored `.dist/review/`; the static Storybook build uses ignored `.dist/storybook` to keep generated bundles outside source discovery. Other generated directories may produce explicit scan omissions if they exceed per-file bounds; successful component mapping does not imply a complete repository scan. Re-run against the final release artifact before treating the workflow as release evidence. This fixture does not establish complete accessibility conformance, model savings, cross-browser support or production readiness.

Story configuration follows the official [Storybook args](https://storybook.js.org/docs/writing-stories/args) and [toolbar/global theme](https://storybook.js.org/docs/essentials/toolbars-and-globals) APIs.
