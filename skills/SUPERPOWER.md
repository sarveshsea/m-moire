---
name: superpower
description: Legacy workflow reference; inactive in Memi 2.8 beta
user-invocable: false
---

# Legacy Superpower Workflow

This historical canvas-to-code workflow is inactive in 2.8.0-beta.1. It is not the default operating mode and grants no authority to read, write, contact services, install packages, or start other agents.

Start with the `memoire-design-tooling` skill. For supported local inspection:

```bash
memi --profile locked agent brief . --intent "Review this interface" --detail compact --json
memi --profile locked diagnose . --no-write --json --fail-on none
```

Use the brief as source-bounded project context. Static diagnosis does not establish runtime, screenshot, native UI, or accessibility conformance.

Useful design principles from the older workflow remain:

1. Inspect existing components and tokens before proposing additions.
2. Reuse verified Code Connect mappings when an authorized external Figma provider supplies them.
3. Describe component states, hierarchy, and accessibility requirements before implementation.
4. Use the repository's build and test commands, and report exactly what was verified.
5. Use an installed, authorized external Figma tool for canvas changes and visual capture when required.

The former automatic spec-creation pipeline is unavailable: `spec component`, `spec page`, and `spec dataviz` remain deferred in every profile. There is no certified replacement for that pipeline. Other effects require their specific supported capabilities; changing profiles alone is not permission to run them.
