---
paths:
  - src/codegen/**
  - generated/**
---

When generating or modifying component code:
- Every component must specify an atomic level (atom/molecule/organism/template) in its spec.
- Output to the correct atomic folder: atoms → `components/ui/`, molecules → `components/molecules/`, organisms → `components/organisms/`, templates → `components/templates/`.
- Use shadcn/ui primitives exclusively. Prefer `npx shadcn@latest add <component>` over hand-writing primitives.
- Use Tailwind utility classes exclusively — no CSS modules, styled-components, or inline style objects.
- Every generated component must have a corresponding JSON spec in `specs/`.
- After generation, establish Code Connect mapping with `add_code_connect_map`.