---
paths:
  - src/agents/**
---

When working with the agent orchestrator:
- Agents connect on ports 9223-9232, auto-discovered by the Figma plugin every 5 seconds.
- Each agent must identify itself with `memi connect --role <role> --name <name>`.
- Agent roles: token-engineer, component-architect, layout-designer, dataviz-specialist, code-generator, accessibility-checker, design-auditor, research-analyst.
- Every agent creates a box widget in Figma for human visibility. Expand when busy, collapse when done.
- Broadcast status via `agent-status` messages. Never silently fail — always update the box widget.