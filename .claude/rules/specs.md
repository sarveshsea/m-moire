---
paths:
  - src/specs/**
  - specs/**
---

When creating or editing specs:
- All specs are validated with Zod schemas before saving. Ensure the shape matches the schema.
- ComponentSpec must include `atomicLevel` (atom/molecule/organism/template) and `codeConnect` fields.
- Atoms: `composesSpecs` must be empty. Molecules: compose 2-5 atoms. Organisms: compose molecules and/or atoms. Templates: define layout structure only.
- PageSpec is separate from ComponentSpec — pages use `PageSpec`.
- DataViz specs use `DataVizSpec` with `chartType` and `dataShape` fields.