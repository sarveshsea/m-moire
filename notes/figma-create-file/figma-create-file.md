---
name: Figma Create File
description: >
  Create new Figma design or FigJam files via the MCP create_new_file tool.
  Resolves plan keys, scaffolds files in drafts, and prepares them for
  canvas operations with the figma-use skill.
activateOn: figma-canvas-operation
freedomLevel: high
category: craft
tags:
  - figma
  - file-creation
  - figjam
  - scaffold
author: Figma (adapted for Memoire)
---

# Figma Create File

> Based on Figma's MCP Server Guide `figma-create-new-file` skill.
> Original by Figma. Adapted for Memoire workflows.
> Source: github.com/figma/mcp-server-guide

Creates new blank Figma design or FigJam files. Use this when the user wants
a fresh canvas before running `/figma-generate-design`, `/figma-generate-library`,
or any canvas operation that needs an empty file.

---

## When to Use

- User says "create a new Figma file" or "start a new design"
- Agent needs a blank canvas for library generation
- FigJam board needed for research synthesis or diagramming
- No existing file provided and the workflow requires one

---

## Workflow

### 1. RESOLVE — Get Plan Key

```
whoami()
  -> Returns available plans with plan keys
  -> If user has multiple plans, ask which to use
  -> If only one plan, use it automatically
```

### 2. CREATE — Call MCP Tool

```
create_new_file(
  planKey: "<resolved-plan-key>",
  fileName: "<descriptive-name>",
  editorType: "design" | "figJam"
)
  -> Returns: { file_key, file_url }
```

**Naming conventions:**
- Design files: `[Project] — [Purpose]` (e.g., "Memoire — Component Library")
- FigJam boards: `[Project] — [Activity]` (e.g., "Memoire — Research Synthesis")

### 3. PREPARE — Set Up for Next Steps

After creation:

**For design files:**
```
Load figma-use skill
  -> Create page structure (e.g., "Components", "Tokens", "Templates")
  -> Set up a base frame with proper dimensions
  -> Apply design system variables if available
```

**For FigJam boards:**
```
Load figma-use skill
  -> Create section frames for organization
  -> Add connector-friendly layout
```

### 4. HAND OFF — Continue Pipeline

```
New file created
  -> Store file_key for subsequent operations
  -> If building library: hand off to /figma-generate-library
  -> If building screens: hand off to /figma-generate-design
  -> If capturing research: hand off to research pipeline
```

---

## Parameters

| Parameter | Required | Default | Options |
|-----------|----------|---------|---------|
| `planKey` | Yes | — | From `whoami()` |
| `fileName` | No | "Untitled" | Any string |
| `editorType` | No | "design" | "design", "figJam" |

---

## Important Notes

- Files are created in the user's **drafts folder** for the selected plan
- Only "design" and "figJam" editor types are supported
- Always load the `figma-use` skill before making canvas operations on the new file
- The returned `file_key` is needed for all subsequent MCP calls

---

## Anti-Patterns

- Creating files without checking if user already has one open
- Using generic names like "Untitled" — always give descriptive names
- Making canvas operations before the file creation completes
- Forgetting to pass the `file_key` to subsequent tool calls
