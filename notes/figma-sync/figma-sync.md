---
name: Figma Sync Patterns
description: >
  Bidirectional sync between Figma and codebase. Handles incremental design
  system updates, conflict resolution, multi-file orchestration, and
  change detection. Works with Memoire's WebSocket bridge and document-changed events.
activateOn: figma-canvas-operation
freedomLevel: high
category: connect
tags:
  - figma
  - sync
  - design-system
  - bidirectional
  - incremental
---

# Figma Sync Patterns — Memoire Connect Skill

Orchestrates reliable bidirectional sync between Figma and the local codebase
through the Memoire bridge.

---

## Sync Modes

### 1. Pull Sync (Figma to Code)

**Trigger**: `memi pull`, `document-changed` event, or manual

**Pipeline:**
```
Figma Plugin
  -> getVariables + getComponents + getStyles (parallel)
  -> Parse raw data to DesignSystem
  -> Diff against existing registry
  -> Update changed tokens/components only
  -> Auto-spec new components
  -> Regenerate affected specs
```

**Incremental strategy:**
- Compare token values by name + collection — only update changed
- Compare components by `figmaNodeId` — detect added/removed/modified
- Track `lastSync` timestamp to skip unchanged files

### 2. Push Sync (Code to Figma)

**Trigger**: `memi sync --push`, agent canvas operations

**Pipeline:**
```
Local Specs + Tokens
  -> Diff against Figma state
  -> Generate Figma Plugin API calls
  -> Execute via bridge
  -> Self-heal (screenshot + verify)
  -> Update Code Connect mappings
```

**Safety rules:**
- Never overwrite Figma components that have been modified since last pull
- Prompt user if Figma-side changes detected since last sync
- Use `figma.currentPage.findOne()` to target specific nodes, not blind creation

### 3. Bidirectional Merge

When both sides have changes:

| Scenario | Resolution |
|----------|-----------|
| Token value changed in Figma only | Accept Figma |
| Token value changed in code only | Push to Figma |
| Both changed same token | Prompt user — show diff |
| New component in Figma | Pull + auto-spec |
| New spec in code | Push to Figma on next sync |
| Component deleted in Figma | Flag in CLI, don't auto-delete spec |
| Spec deleted locally | Flag, don't auto-delete in Figma |

---

## Change Detection

### Token Diffing

```typescript
interface TokenDiff {
  added: DesignToken[];
  removed: DesignToken[];
  modified: { before: DesignToken; after: DesignToken }[];
  unchanged: number;
}
```

Compare by: `name` + `collection` as composite key.
Modified = same key but different `values` object (deep equal).

### Component Diffing

```typescript
interface ComponentDiff {
  added: DesignComponent[];
  removed: DesignComponent[];
  modified: { before: DesignComponent; after: DesignComponent; changes: string[] }[];
}
```

Compare by: `figmaNodeId` as primary key, `name` as fallback.
Track changes: `name`, `description`, `variants`, `properties`.

---

## Multi-File Orchestration

When syncing across multiple Figma files:

1. **Enumerate files**: Each connected plugin reports its `fileKey`
2. **Parallel pull**: Pull from all connected plugins simultaneously
3. **Namespace tokens**: Prefix with file name to avoid collisions
4. **Merge design systems**: Combine into single registry with source tracking
5. **Conflict resolution**: Same-name tokens from different files prompt user

---

## Event-Driven Sync

The Memoire bridge emits these sync-relevant events:

| Event | When | Suggested Action |
|-------|------|-----------------|
| `document-changed` | Any node modified in Figma | Debounced pull (3s) |
| `selection` | User selects different nodes | Update context, no sync |
| `page-changed` | User switches Figma pages | Refresh page tree |
| `sync-data` | Plugin sends bulk data | Process and update registry |

### Operator Console

Widget V2 exposes the bridge as an operator console:

- `Jobs` shows sync, capture, inspect, and healer activity as tracked job state
- `Selection` shows current node IDs, styles, variants, and layout facts
- `System` shows bridge status, ports, latency, reconnect state, and buffered changes
- `agent-status` surfaces on-canvas task visibility from the orchestrator
- `connection-state`, `job-status`, `sync-result`, and healer state are better sources of truth than raw bridge logs

### Debounce Strategy

- `document-changed`: 3 second debounce — batch rapid edits
- Multiple changes within window: single pull covers all
- Ignore events while a pull is already in progress
- Queue one follow-up pull if changes arrive during active pull

---

## Error Recovery

| Error | Recovery |
|-------|---------|
| Plugin disconnected mid-sync | Retry on reconnect and re-run the affected operation explicitly |
| Timeout on getVariables | Retry once with 2x timeout, fall back to cached data |
| Rate limited | Back off 5s, retry with exponential backoff |
| Corrupted response | Log warning, skip this sync cycle, retry next event |
| Registry write fails | Keep in-memory state, retry disk write |

## Best Practices

- Always pull before push — ensure local state is current
- Log every sync with timestamp, direction, and counts
- Keep sync operations idempotent — safe to retry
- Never modify Figma pages the user is actively editing (check selection first)
- Preserve user's undo stack — batch Figma operations into single undo group
