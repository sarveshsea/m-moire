---
paths:
  - src/figma/**
  - plugin/**
---

When working in Figma-related code:
- Use `use_figma` (Official MCP) for design-system-aware canvas writes. Fall back to `figma_execute` only for raw Plugin API operations.
- Call `figma_search_components` at session start — nodeIds are session-scoped, never reuse from previous sessions.
- Call `get_code_connect_map` before creating any component. Use mapped components when they exist.
- Always run the self-healing loop after canvas modifications: CREATE → SCREENSHOT → ANALYZE → FIX → VERIFY (max 3 rounds).
- `counterAxisSizingMode` only accepts `"FIXED"` or `"AUTO"` (never `"FILL"`).
- `DROP_SHADOW` effects require `blendMode: "NORMAL"`.
- Always `await figma.loadFontAsync()` before setting text content.