/**
 * Token Differ — Pure diff functions for design system entities.
 *
 * Compares tokens, components, and styles between two snapshots and
 * returns structured change sets used by BidirectionalSync.
 */

import { createHash } from "crypto";
import type { DesignToken, DesignComponent, DesignStyle, DesignSystem } from "./registry.js";

// ── Types ──────────────────────────────────────────────────

export type ChangeType = "added" | "removed" | "modified";

export interface EntityChange<T> {
  type: ChangeType;
  name: string;
  before?: T;
  after?: T;
}

export interface TokenDiff {
  tokens: EntityChange<DesignToken>[];
  components: EntityChange<DesignComponent>[];
  styles: EntityChange<DesignStyle>[];
  hasChanges: boolean;
  summary: string;
}

export interface SyncEntity {
  name: string;
  hash: string;
  updatedAt: number;
  source: "figma" | "code" | "manual";
}

export interface SyncConflict {
  entityType: "token" | "component" | "style";
  name: string;
  figmaHash: string;
  codeHash: string;
  figmaUpdatedAt: number;
  codeUpdatedAt: number;
  detectedAt: string;
  resolved: boolean;
  resolution?: "figma-wins" | "code-wins" | "manual";
}

// ── Hashing ────────────────────────────────────────────────

/** Compute a stable SHA-256 hash of a value for change detection. */
export function entityHash(value: unknown): string {
  const json = JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
  return createHash("sha256").update(json).digest("hex").slice(0, 16);
}

/** Hash a design token by its values (mode-sensitive). */
export function tokenHash(token: DesignToken): string {
  return entityHash({ name: token.name, collection: token.collection, type: token.type, values: token.values });
}

/** Hash a component by its key properties. */
export function componentHash(component: DesignComponent): string {
  return entityHash({ name: component.name, key: component.key, variants: component.variants, properties: component.properties });
}

/** Hash a style by its type and value. */
export function styleHash(style: DesignStyle): string {
  return entityHash({ name: style.name, type: style.type, value: style.value });
}

// ── Diff Functions ─────────────────────────────────────────

/** Diff two arrays of named entities using a hash function. */
function diffEntities<T extends { name: string }>(
  before: T[],
  after: T[],
  hashFn: (entity: T) => string,
): EntityChange<T>[] {
  const changes: EntityChange<T>[] = [];

  const beforeMap = new Map(before.map((e) => [e.name, e]));
  const afterMap = new Map(after.map((e) => [e.name, e]));

  // Removed: in before but not in after
  for (const [name, entity] of beforeMap) {
    if (!afterMap.has(name)) {
      changes.push({ type: "removed", name, before: entity });
    }
  }

  // Added or modified: in after
  for (const [name, entity] of afterMap) {
    const prev = beforeMap.get(name);
    if (!prev) {
      changes.push({ type: "added", name, after: entity });
    } else if (hashFn(prev) !== hashFn(entity)) {
      changes.push({ type: "modified", name, before: prev, after: entity });
    }
  }

  return changes;
}

/** Diff two complete design system snapshots. */
export function diffDesignSystem(before: DesignSystem, after: DesignSystem): TokenDiff {
  const tokens = diffEntities(before.tokens, after.tokens, tokenHash);
  const components = diffEntities(before.components, after.components, componentHash);
  const styles = diffEntities(before.styles, after.styles, styleHash);

  const hasChanges = tokens.length > 0 || components.length > 0 || styles.length > 0;

  const parts: string[] = [];
  if (tokens.length > 0) parts.push(`${tokens.length} token${tokens.length > 1 ? "s" : ""}`);
  if (components.length > 0) parts.push(`${components.length} component${components.length > 1 ? "s" : ""}`);
  if (styles.length > 0) parts.push(`${styles.length} style${styles.length > 1 ? "s" : ""}`);

  return {
    tokens,
    components,
    styles,
    hasChanges,
    summary: hasChanges ? `Changed: ${parts.join(", ")}` : "No changes",
  };
}

/** Diff only tokens between two snapshots. */
export function diffTokens(before: DesignToken[], after: DesignToken[]): EntityChange<DesignToken>[] {
  return diffEntities(before, after, tokenHash);
}

/** Diff only components between two snapshots. */
export function diffComponents(before: DesignComponent[], after: DesignComponent[]): EntityChange<DesignComponent>[] {
  return diffEntities(before, after, componentHash);
}

/** Diff only styles between two snapshots. */
export function diffStyles(before: DesignStyle[], after: DesignStyle[]): EntityChange<DesignStyle>[] {
  return diffEntities(before, after, styleHash);
}

// ── Conflict Detection ─────────────────────────────────────

/** Detect conflicts when both sides changed the same entity within a time window. */
export function detectConflicts(
  figmaState: Map<string, SyncEntity>,
  codeState: Map<string, SyncEntity>,
  windowMs = 1000,
): SyncConflict[] {
  const conflicts: SyncConflict[] = [];

  for (const [name, figma] of figmaState) {
    const code = codeState.get(name);
    if (!code) continue;

    // Both changed and hashes differ
    if (figma.hash !== code.hash) {
      const timeDiff = Math.abs(figma.updatedAt - code.updatedAt);
      if (timeDiff <= windowMs) {
        conflicts.push({
          entityType: "token",
          name,
          figmaHash: figma.hash,
          codeHash: code.hash,
          figmaUpdatedAt: figma.updatedAt,
          codeUpdatedAt: code.updatedAt,
          detectedAt: new Date().toISOString(),
          resolved: false,
        });
      }
    }
  }

  return conflicts;
}
