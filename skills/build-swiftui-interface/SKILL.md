---
name: build-swiftui-interface
description: Use when a coding agent must design, scaffold, implement, or verify an iOS or macOS SwiftUI interface with Apple-platform state, accessibility, availability, testing, and Xcode evidence.
---

# Build SwiftUI Interface

Use this as Apple-platform design and verification guidance. Pair it with an installed host's Apple-platform tools when simulator, profiling, App Intents, or detailed framework guidance is needed.

## 2.8 beta availability

This skill requires the reviewed 2.8 frontend contract. Check `memi --version` and npm registry availability first. If the beta is unpublished, use a reviewed local build; after publication, use the exact verified beta version. npm stable remains 2.7.9.

Memi's `ios brief` and `ios scaffold` commands are unavailable in 2.8.0-beta.1, including preview and write modes. Capability grants do not enable them. This skill does not provide an automatic SwiftUI scaffolding pipeline.

With a reviewed candidate running `memi --profile locked mcp start --no-figma`, the host may call the read-only `prepare_apple_design_brief` tool:

```json
{"intent":"Review the feature contract","platform":"ios","detail":"compact"}
```

`platform` accepts `ios` or `macos`. This tool prepares guidance without running Xcode or writing files; it does not inspect native source or replace project verification.

Inspect the actual project: deployment target, Swift language mode, shared schemes, local components, assets, navigation, state ownership, test targets, and nearby implementation patterns. Prepare the feature contract with the coding host using that evidence, and review proposed paths and source before writing. Preserve the repository's project-generation workflow.

The supported `memi agent brief . --json` command can provide general project context; it is not an equivalent Apple-platform brief or proof that SwiftUI was analyzed. Memi's frontend checks do not establish native UI correctness.

## Implementation rules

1. Reuse local SwiftUI components and semantic assets before adding primitives.
2. Keep state ownership narrow; keep I/O and expensive work out of `body`.
3. Define loading, empty, populated, error, Dynamic Type, VoiceOver, reduced-motion, and dark-appearance states.
4. Gate newer APIs. Liquid Glass requires an iOS 26+ branch and a behaviorally equivalent fallback.
5. Treat June 2026 APIs by their documented availability; do not invent an iOS version label.
6. Preserve the existing architecture and project-generation workflow.

## Verification receipt

Run the repository's canonical commands. When none exist, discover shared schemes and explicit destinations with `xcodebuild -list -json` and `xcrun simctl list devices available`, then build and test the smallest target.

Report exact commands, files, deployment assumptions, simulator flow, accessibility states, and anything not executed. A source review is not simulator proof, and a simulator build is not signing or App Store proof.
