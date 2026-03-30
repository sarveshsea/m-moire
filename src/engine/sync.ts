/**
 * BidirectionalSync — Manages two-way sync between Figma and code.
 *
 * Tracks per-entity state (hash + timestamp + source), detects conflicts,
 * and drives sync in both directions through the bridge and registry.
 */

import { EventEmitter } from "events";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "./logger.js";
import type { MemoireEngine } from "./core.js";
import type { DesignSystem, DesignToken } from "./registry.js";
import {
  diffDesignSystem,
  tokenHash,
  componentHash,
  styleHash,
  detectConflicts,
  type TokenDiff,
  type SyncEntity,
  type SyncConflict,
} from "./token-differ.js";

const log = createLogger("sync");

// ── Types ──────────────────────────────────────────────────

export type SyncDirection = "figma-to-code" | "code-to-figma" | "bidirectional";

export interface SyncConfig {
  direction: SyncDirection;
  conflictWindowMs: number;
  autoResolve: "last-write-wins" | "figma-wins" | "code-wins" | "manual";
  persistState: boolean;
}

export interface SyncState {
  figma: Map<string, SyncEntity>;
  code: Map<string, SyncEntity>;
  conflicts: SyncConflict[];
  lastSyncAt: string | null;
}

export interface SyncResult {
  direction: SyncDirection;
  diff: TokenDiff;
  conflicts: SyncConflict[];
  applied: number;
  skipped: number;
  pushed: number;
  elapsedMs: number;
}

const DEFAULT_CONFIG: SyncConfig = {
  direction: "bidirectional",
  conflictWindowMs: 1000,
  autoResolve: "last-write-wins",
  persistState: true,
};

// ── BidirectionalSync ──────────────────────────────────────

export class BidirectionalSync extends EventEmitter {
  private engine: MemoireEngine;
  private config: SyncConfig;
  private state: SyncState;
  private syncing = false;
  private syncGuard = false;
  private stateDir: string;

  constructor(engine: MemoireEngine, config?: Partial<SyncConfig>) {
    super();
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stateDir = join(engine.config.projectRoot, ".memoire");
    this.state = {
      figma: new Map(),
      code: new Map(),
      conflicts: [],
      lastSyncAt: null,
    };
  }

  /** Load persisted sync state from disk. */
  async loadState(): Promise<void> {
    try {
      const raw = await readFile(join(this.stateDir, "sync-state.json"), "utf-8");
      const parsed = JSON.parse(raw);
      this.state.figma = new Map(Object.entries(parsed.figma ?? {}));
      this.state.code = new Map(Object.entries(parsed.code ?? {}));
      this.state.lastSyncAt = parsed.lastSyncAt ?? null;
    } catch {
      // No existing state — fresh start
    }

    try {
      const raw = await readFile(join(this.stateDir, "sync-conflicts.json"), "utf-8");
      this.state.conflicts = JSON.parse(raw);
    } catch {
      // No existing conflicts
    }
  }

  /** Persist sync state to disk. */
  async saveState(): Promise<void> {
    if (!this.config.persistState) return;

    await mkdir(this.stateDir, { recursive: true });

    const statePayload = {
      figma: Object.fromEntries(this.state.figma),
      code: Object.fromEntries(this.state.code),
      lastSyncAt: this.state.lastSyncAt,
    };

    await writeFile(
      join(this.stateDir, "sync-state.json"),
      JSON.stringify(statePayload, null, 2),
    );

    await writeFile(
      join(this.stateDir, "sync-conflicts.json"),
      JSON.stringify(this.state.conflicts, null, 2),
    );
  }

  /** Enable sync guard — prevents echo loops during push operations. */
  enableGuard(): void {
    this.syncGuard = true;
  }

  /** Disable sync guard. */
  disableGuard(): void {
    this.syncGuard = false;
  }

  /** Check if sync guard is active (for orchestrator to check). */
  get isGuarded(): boolean {
    return this.syncGuard;
  }

  /** Get current conflicts. */
  getConflicts(): SyncConflict[] {
    return [...this.state.conflicts.filter((c) => !c.resolved)];
  }

  /** Resolve a conflict by name. */
  resolveConflict(name: string, resolution: "figma-wins" | "code-wins" | "manual"): boolean {
    const conflict = this.state.conflicts.find((c) => c.name === name && !c.resolved);
    if (!conflict) return false;
    conflict.resolved = true;
    conflict.resolution = resolution;
    return true;
  }

  /**
   * Run a full sync cycle: snapshot both sides, diff, detect conflicts, apply changes.
   */
  async sync(snapshot?: DesignSystem): Promise<SyncResult> {
    if (this.syncing) {
      throw new Error("Sync already in progress");
    }

    this.syncing = true;
    const start = Date.now();

    try {
      const currentDS = snapshot ?? this.engine.registry.designSystem;
      const previousDS = this.buildDesignSystemFromState();

      // 1. Diff current state against tracked state
      const diff = diffDesignSystem(previousDS, currentDS);

      // 2. Update Figma-side entity tracking
      this.updateEntityTracking("figma", currentDS);

      // 3. Detect conflicts
      const newConflicts = detectConflicts(
        this.state.figma,
        this.state.code,
        this.config.conflictWindowMs,
      );

      // Add new conflicts to state
      for (const conflict of newConflicts) {
        const existing = this.state.conflicts.find(
          (c) => c.name === conflict.name && !c.resolved,
        );
        if (!existing) {
          this.state.conflicts.push(conflict);
        }
      }

      // 4. Auto-resolve if configured
      let applied = 0;
      let skipped = 0;
      let pushed = 0;

      if (this.config.direction !== "code-to-figma" && diff.hasChanges) {
        // Figma → Code: apply token/component/style changes to registry
        for (const change of diff.tokens) {
          if (change.type === "added" || change.type === "modified") {
            if (change.after) {
              this.engine.registry.updateToken(change.name, change.after);
              applied++;
            }
          } else if (change.type === "removed") {
            this.engine.registry.removeToken(change.name);
            applied++;
          }
        }
      }

      if (this.config.direction !== "figma-to-code") {
        // Code → Figma: push changed tokens
        const codeSideChanges = this.getCodeSideChanges();
        if (codeSideChanges.length > 0 && this.engine.figma.isConnected) {
          try {
            this.enableGuard();
            await this.engine.figma.pushTokens(
              codeSideChanges.map((t) => ({ name: t.name, values: t.values })),
              "code",
            );
            pushed = codeSideChanges.length;
          } finally {
            this.disableGuard();
          }
        }
      }

      // 5. Update state and persist
      this.state.lastSyncAt = new Date().toISOString();
      await this.saveState();

      const result: SyncResult = {
        direction: this.config.direction,
        diff,
        conflicts: newConflicts,
        applied,
        skipped,
        pushed,
        elapsedMs: Date.now() - start,
      };

      this.emit("sync-completed", result);
      log.info({ applied, pushed, conflicts: newConflicts.length }, "Sync cycle completed");

      return result;
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Handle a variable-changed event from Figma (granular update).
   */
  onVariableChanged(data: { name: string; collection: string; values: Record<string, string | number>; updatedAt: number }): void {
    if (this.syncGuard) return;

    const entity: SyncEntity = {
      name: data.name,
      hash: tokenHash({ name: data.name, collection: data.collection, type: "other", values: data.values, cssVariable: "" }),
      updatedAt: data.updatedAt,
      source: "figma",
    };

    this.state.figma.set(data.name, entity);
    this.emit("entity-updated", { source: "figma", name: data.name });
  }

  /**
   * Handle a code-side token change (from code-watcher or manual edit).
   */
  onCodeTokenChanged(token: DesignToken): void {
    if (this.syncGuard) return;

    const entity: SyncEntity = {
      name: token.name,
      hash: tokenHash(token),
      updatedAt: Date.now(),
      source: "code",
    };

    this.state.code.set(token.name, entity);
    this.emit("entity-updated", { source: "code", name: token.name });
  }

  // ── Private Helpers ──────────────────────────────────────

  /** Build a minimal DesignSystem from tracked state for diffing. */
  private buildDesignSystemFromState(): DesignSystem {
    // Use the current registry as the baseline
    return JSON.parse(JSON.stringify(this.engine.registry.designSystem));
  }

  /** Update entity tracking for one side. */
  private updateEntityTracking(side: "figma" | "code", ds: DesignSystem): void {
    const map = side === "figma" ? this.state.figma : this.state.code;
    const now = Date.now();

    for (const token of ds.tokens) {
      map.set(token.name, {
        name: token.name,
        hash: tokenHash(token),
        updatedAt: now,
        source: side,
      });
    }

    for (const component of ds.components) {
      map.set(component.name, {
        name: component.name,
        hash: componentHash(component),
        updatedAt: now,
        source: side,
      });
    }

    for (const style of ds.styles) {
      map.set(style.name, {
        name: style.name,
        hash: styleHash(style),
        updatedAt: now,
        source: side,
      });
    }
  }

  /** Get tokens that changed on the code side since last sync. */
  private getCodeSideChanges(): DesignToken[] {
    const changed: DesignToken[] = [];
    const ds = this.engine.registry.designSystem;

    for (const token of ds.tokens) {
      const codeEntity = this.state.code.get(token.name);
      const figmaEntity = this.state.figma.get(token.name);

      if (codeEntity && figmaEntity && codeEntity.hash !== figmaEntity.hash && codeEntity.source === "code") {
        changed.push(token);
      }
    }

    return changed;
  }
}
