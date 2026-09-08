# Design Extraction Reference

## 2.8 beta availability

`design-doc` and its `extract` alias are unavailable in 2.8.0-beta.1, regardless of profile or capability grants. The locked Memi MCP surface does not expose `design_doc`. There is no certified URL-to-DESIGN.md replacement in this beta.

For an authorized external browser or design tool workflow, inspect the supplied page and identify CSS variables, colors, fonts, spacing, radii, shadows, and reusable components. Attribute observed values to their source and separate observations from inferred design rules. Dynamic pages may require runtime inspection; HTML and linked CSS alone do not establish the rendered result.

A useful design reference can document semantic colors, typography, spacing, surfaces, component states, and a clearly labeled configuration sketch. Do not guarantee a token count, elapsed time, or complete coverage for an arbitrary website. Save a reference only within the host's authorized write scope.

For a local project, `memi --profile locked agent brief . --json` provides supported source-bounded context. It does not extract a website or generate DESIGN.md.
