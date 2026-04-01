/**
 * EventPipeline — Reactive automation for the Mémoire daemon.
 *
 * Subscribes to engine events and file system changes, then drives
 * the pull → diff → auto-spec → generate pipeline automatically.
 */

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { join, basename } from "path";
import { readdir, stat } from "fs/promises";
import { createLogger } from "./logger.js";
import type { MemoireEngine } from "./core.js";
import type { DesignSystem } from "./registry.js";

const log = createLogger("pipeline");

// ── Types ──────────────────────────────────────────────────

export interface PipelineConfig {
  figmaDebounceMs: number;
  specDebounceMs: number;
  autoPull: boolean;
  autoSpec: boolean;
  autoGenerate: boolean;
}

export interface PipelineStats {
  startedAt: string;
  pullCount: number;
  specCount: number;
  generateCount: number;
  syncCount: number;
  errorCount: number;
  lastPullAt: string | null;
  lastGenerateAt: string | null;
  lastError: string | null;
  queueDepth: number;
}

export interface PipelineEvent {
  type: PipelineEventType;
  timestamp: string;
  detail: string;
  data?: unknown;
}

export type PipelineEventType =
  | "pull-started" | "pull-completed" | "pull-failed"
  | "spec-created" | "spec-updated"
  | "generate-started" | "generate-completed" | "generate-failed"
  | "token-diff-detected"
  | "component-diff-detected"
  | "pipeline-error";

interface PipelineTask {
  id: string;
  type: "pull" | "auto-spec" | "generate";
  target?: string;
  createdAt: number;
}

const DEFAULT_CONFIG: PipelineConfig = {
  figmaDebounceMs: 3000,
  specDebounceMs: 500,
  autoPull: true,
  autoSpec: true,
  autoGenerate: true,
};

// ── EventPipeline ──────────────────────────────────────────

export class EventPipeline extends EventEmitter {
  private engine: MemoireEngine;
  private config: PipelineConfig;
  private stats: PipelineStats;
  private queue: PipelineTask[] = [];
  private processing = false;
  private specWatchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private recentEvents: PipelineEvent[] = [];
  private static readonly MAX_RECENT_EVENTS = 50;
  private lastSnapshot: DesignSystem | null = null;
  private taskCounter = 0;
  private engineEventHandler: ((evt: { type: string; source: string; message: string }) => void) | null = null;

  constructor(engine: MemoireEngine, config?: Partial<PipelineConfig>) {
    super();
    this.engine = engine;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      startedAt: new Date().toISOString(),
      pullCount: 0,
      specCount: 0,
      generateCount: 0,
      syncCount: 0,
      errorCount: 0,
      lastPullAt: null,
      lastGenerateAt: null,
      lastError: null,
      queueDepth: 0,
    };
  }

  start(): void {
    // Clean up any prior listener to prevent double-registration
    if (this.engineEventHandler) {
      this.engine.off("event", this.engineEventHandler);
    }

    // Snapshot current design system for future diffs
    this.lastSnapshot = this.snapshotDesignSystem();

    // Listen for engine events to detect completed pulls
    this.engineEventHandler = (evt) => this.onEngineEvent(evt);
    this.engine.on("event", this.engineEventHandler);

    // Watch spec directories for file changes — clean up listener if watcher setup fails
    try {
      if (this.config.autoGenerate) {
        this.startSpecWatchers();
      }
    } catch (err) {
      this.engine.off("event", this.engineEventHandler);
      this.engineEventHandler = null;
      throw err;
    }

    log.info(this.config, "Pipeline started");
    this.emitPipelineEvent("pull-started", "Pipeline started — watching for changes");
  }

  stop(): void {
    if (this.engineEventHandler) {
      this.engine.off("event", this.engineEventHandler);
      this.engineEventHandler = null;
    }

    for (const watcher of this.specWatchers) {
      watcher.close();
    }
    this.specWatchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.queue = [];

    log.info("Pipeline stopped");
  }

  getStats(): PipelineStats {
    return { ...this.stats, queueDepth: this.queue.length };
  }

  getRecentEvents(): PipelineEvent[] {
    return [...this.recentEvents];
  }

  // ── Event Handlers ────────────────────────────────────────

  private onEngineEvent(evt: { type: string; source: string; message: string }): void {
    // Detect pull completion (engine emits this after pullDesignSystem)
    if (evt.source === "figma" && evt.type === "success" && /design system/i.test(evt.message)) {
      this.onPullCompleted();
    }
    // Detect auto-spec completion
    if (evt.source === "auto-spec" && evt.type === "success") {
      this.stats.specCount++;
      this.emitPipelineEvent("spec-created", evt.message);
    }
  }

  private onPullCompleted(): void {
    this.stats.pullCount++;
    this.stats.lastPullAt = new Date().toISOString();
    this.emitPipelineEvent("pull-completed", "Design system pulled from Figma");

    // Diff against last snapshot
    const current = this.snapshotDesignSystem();
    if (this.lastSnapshot) {
      const tokenDiff = this.diffTokenCount(this.lastSnapshot, current);
      const componentDiff = this.diffComponentCount(this.lastSnapshot, current);

      if (tokenDiff !== 0) {
        this.emitPipelineEvent("token-diff-detected", `Token changes detected: ${tokenDiff > 0 ? "+" : ""}${tokenDiff}`);
      }

      if (componentDiff !== 0) {
        this.emitPipelineEvent("component-diff-detected", `Component changes detected: ${componentDiff > 0 ? "+" : ""}${componentDiff}`);

        // Enqueue auto-spec if components changed
        if (this.config.autoSpec) {
          this.enqueueTask({ type: "auto-spec" });
        }
      }
    }
    this.lastSnapshot = current;
  }

  private onSpecFileChanged(specName: string): void {
    const key = `generate:${specName}`;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      this.enqueueTask({ type: "generate", target: specName });
    }, this.config.specDebounceMs));
  }

  // ── Task Queue ────────────────────────────────────────────

  private enqueueTask(task: Omit<PipelineTask, "id" | "createdAt">): void {
    // Dedup: don't enqueue if an identical task is already pending
    const isDuplicate = this.queue.some(
      (t) => t.type === task.type && t.target === task.target,
    );
    if (isDuplicate) return;

    this.queue.push({
      ...task,
      id: `pipeline-${++this.taskCounter}`,
      createdAt: Date.now(),
    });

    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await this.executeTask(task);
      } catch (err) {
        this.stats.errorCount++;
        const msg = err instanceof Error ? err.message : String(err);
        this.stats.lastError = msg;
        this.emitPipelineEvent("pipeline-error", `Task ${task.type} failed: ${msg}`);
        log.warn({ task: task.type, target: task.target, err: msg }, "Pipeline task failed");
      }
      // Yield control between tasks to prevent starving the event loop
      await new Promise((r) => setTimeout(r, 0));
    }

    this.processing = false;
  }

  private async executeTask(task: PipelineTask): Promise<void> {
    switch (task.type) {
      case "auto-spec": {
        this.emitPipelineEvent("spec-created", "Running auto-spec from pulled components...");
        const count = await this.engine.autoSpec();
        if (count > 0) {
          this.stats.specCount += count;
          this.emitPipelineEvent("spec-created", `Auto-spec created ${count} new specs`);
        }
        break;
      }

      case "generate": {
        if (!task.target) break;
        this.emitPipelineEvent("generate-started", `Generating code for ${task.target}...`);
        try {
          await this.engine.generateFromSpec(task.target);
          this.stats.generateCount++;
          this.stats.lastGenerateAt = new Date().toISOString();
          this.emitPipelineEvent("generate-completed", `Code generated for ${task.target}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.emitPipelineEvent("generate-failed", `Generation failed for ${task.target}: ${msg}`);
          throw err;
        }
        break;
      }
    }
  }

  // ── Spec File Watchers ────────────────────────────────────

  private startSpecWatchers(): void {
    // Close existing watchers before creating new ones to prevent accumulation
    for (const watcher of this.specWatchers) {
      watcher.close();
    }
    this.specWatchers = [];

    const specsRoot = join(this.engine.config.projectRoot, "specs");
    const subdirs = ["components", "pages", "dataviz", "design", "ia"];

    for (const subdir of subdirs) {
      const dir = join(specsRoot, subdir);
      try {
        const watcher = watch(dir, (event, filename) => {
          if (!filename || !filename.endsWith(".json")) return;
          const specName = basename(filename, ".json");
          this.onSpecFileChanged(specName);
        });
        this.specWatchers.push(watcher);
        log.info({ dir: subdir }, "Watching spec directory");
      } catch {
        // Directory may not exist yet — that's fine
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private snapshotDesignSystem(): DesignSystem {
    return structuredClone(this.engine.registry.designSystem);
  }

  private diffTokenCount(before: DesignSystem, after: DesignSystem): number {
    return after.tokens.length - before.tokens.length;
  }

  private diffComponentCount(before: DesignSystem, after: DesignSystem): number {
    return after.components.length - before.components.length;
  }

  private emitPipelineEvent(type: PipelineEventType, detail: string, data?: unknown): void {
    const event: PipelineEvent = {
      type,
      timestamp: new Date().toISOString(),
      detail,
      data,
    };

    this.recentEvents.push(event);
    // Cap at MAX_RECENT_EVENTS using splice to avoid repeated shift() overhead
    if (this.recentEvents.length > EventPipeline.MAX_RECENT_EVENTS * 2) {
      this.recentEvents = this.recentEvents.slice(-EventPipeline.MAX_RECENT_EVENTS);
    }

    this.emit("pipeline-event", event);
  }
}
