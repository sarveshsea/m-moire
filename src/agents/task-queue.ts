/**
 * TaskQueue — Distributed task queue with dependency resolution and lock-based claiming.
 *
 * Tasks are enqueued by the orchestrator and claimed by external agent workers.
 * Supports role-based matching, dependency ordering, and timeout reclamation.
 */

import { EventEmitter } from "events";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import { createLogger } from "../engine/logger.js";
import type { AgentRole } from "../plugin/shared/contracts.js";

const log = createLogger("task-queue");

// ── Types ──────────────────────────────────────────────────

export type TaskStatus = "pending" | "claimed" | "running" | "completed" | "failed" | "timeout";

export interface QueueTask {
  id: string;
  role: AgentRole;
  name: string;
  intent: string;
  payload: unknown;
  dependencies: string[];
  status: TaskStatus;
  claimedBy: string | null;
  claimedAt: number | null;
  completedAt: number | null;
  result: unknown;
  error: string | null;
  createdAt: number;
  timeoutMs: number;
}

export interface TaskQueueStats {
  pending: number;
  claimed: number;
  running: number;
  completed: number;
  failed: number;
  total: number;
}

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

// ── TaskQueue ──────────────────────────────────────────────

export class TaskQueue extends EventEmitter {
  private tasks = new Map<string, QueueTask>();
  private taskCounter = 0;
  private reclaimTimer: ReturnType<typeof setInterval> | null = null;
  private persistPath: string | undefined;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(persistPath?: string) {
    super();
    this.persistPath = persistPath;
  }

  /** Start the reclaim timer for timed-out tasks. Loads persisted tasks if persistPath is set. */
  async start(): Promise<void> {
    if (this.reclaimTimer) return;
    if (this.persistPath) {
      await this.loadPersisted();
    }
    this.reclaimTimer = setInterval(() => {
      this.reclaimTimedOut();
      // Auto-prune completed tasks older than 5 minutes every cycle
      if (this.tasks.size > 100) this.prune(300_000);
    }, 10_000);
  }

  /** Stop the reclaim timer. */
  stop(): void {
    if (this.reclaimTimer) {
      clearInterval(this.reclaimTimer);
      this.reclaimTimer = null;
    }
  }

  /** Enqueue a new task. Returns the task ID. */
  enqueue(task: Omit<QueueTask, "id" | "status" | "claimedBy" | "claimedAt" | "completedAt" | "result" | "error" | "createdAt">): string {
    const id = `task-${++this.taskCounter}-${Date.now().toString(36)}`;
    const queueTask: QueueTask = {
      ...task,
      id,
      status: "pending",
      claimedBy: null,
      claimedAt: null,
      completedAt: null,
      result: null,
      error: null,
      createdAt: Date.now(),
      timeoutMs: task.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    this.tasks.set(id, queueTask);
    this.emit("task-enqueued", queueTask);
    log.info({ id, role: task.role, name: task.name }, "Task enqueued");
    this.deferPersist();
    return id;
  }

  /**
   * Claim the next available task for a role.
   * Returns the task if one is available, or null.
   */
  claim(agentId: string, role: AgentRole): QueueTask | null {
    for (const task of this.tasks.values()) {
      if (task.status !== "pending") continue;
      if (task.role !== role && task.role !== "general") continue;

      // Check dependencies are completed
      const depsReady = task.dependencies.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === "completed";
      });
      if (!depsReady) continue;

      // Claim the task
      task.status = "claimed";
      task.claimedBy = agentId;
      task.claimedAt = Date.now();
      this.emit("task-claimed", { taskId: task.id, agentId });
      log.info({ taskId: task.id, agentId, role }, "Task claimed");
      return task;
    }

    return null;
  }

  /** Mark a task as running (agent started executing). */
  markRunning(taskId: string, agentId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.claimedBy !== agentId) return false;
    task.status = "running";
    this.emit("task-running", { taskId, agentId });
    return true;
  }

  /** Complete a task with a result. */
  complete(taskId: string, agentId: string, result: unknown): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.claimedBy !== agentId) return false;

    task.status = "completed";
    task.result = result;
    task.completedAt = Date.now();
    this.emit("task-completed", { taskId, agentId, result });
    log.info({ taskId, agentId }, "Task completed");
    this.deferPersist();
    // Eagerly prune finished tasks to prevent unbounded growth
    if (this.tasks.size > 200) this.prune(300_000);
    return true;
  }

  /** Fail a task with an error. */
  fail(taskId: string, agentId: string, error: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.claimedBy !== agentId) return false;

    task.status = "failed";
    task.error = error;
    task.completedAt = Date.now();
    this.emit("task-failed", { taskId, agentId, error });
    log.warn({ taskId, agentId, error }, "Task failed");
    this.deferPersist();
    return true;
  }

  /** Get a task by ID. */
  get(taskId: string): QueueTask | null {
    return this.tasks.get(taskId) ?? null;
  }

  /** Get all tasks. */
  getAll(): QueueTask[] {
    return Array.from(this.tasks.values());
  }

  /** Get pending tasks for a role. */
  getPendingForRole(role: AgentRole): QueueTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending" && (t.role === role || t.role === "general"),
    );
  }

  /** Get queue stats. */
  getStats(): TaskQueueStats {
    const stats: TaskQueueStats = { pending: 0, claimed: 0, running: 0, completed: 0, failed: 0, total: 0 };
    for (const task of this.tasks.values()) {
      stats.total++;
      switch (task.status) {
        case "pending": stats.pending++; break;
        case "claimed": stats.claimed++; break;
        case "running": stats.running++; break;
        case "completed": stats.completed++; break;
        case "failed":
        case "timeout": stats.failed++; break;
      }
    }
    return stats;
  }

  /**
   * Wait for a specific task to complete or fail.
   * Resolves with the task when done, rejects on timeout.
   */
  async waitForTask(taskId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<QueueTask> {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.status === "completed" || task.status === "failed") return task;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Task ${taskId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onCompleted = (data: { taskId: string }) => {
        if (data.taskId !== taskId) return;
        cleanup();
        resolve(this.tasks.get(taskId)!);
      };

      const onFailed = (data: { taskId: string }) => {
        if (data.taskId !== taskId) return;
        cleanup();
        resolve(this.tasks.get(taskId)!);
      };

      const cleanup = () => {
        clearTimeout(timer);
        this.off("task-completed", onCompleted);
        this.off("task-failed", onFailed);
      };

      this.on("task-completed", onCompleted);
      this.on("task-failed", onFailed);
    });
  }

  /** Clear completed and failed tasks older than the given age. */
  prune(maxAgeMs = 300_000): number {
    const now = Date.now();
    let pruned = 0;
    for (const [id, task] of this.tasks) {
      if ((task.status === "completed" || task.status === "failed" || task.status === "timeout") &&
          task.completedAt && now - task.completedAt > maxAgeMs) {
        this.tasks.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  // ── Persistence ─────────────────────────────────────────

  /** Write pending + claimed tasks to disk (debounced). */
  private deferPersist(): void {
    if (!this.persistPath) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist().catch((err) => {
        log.warn({ err: (err as Error).message }, "Task queue persist failed");
      });
    }, 500);
  }

  /** Persist active tasks (pending, claimed, running) to disk. */
  async persist(): Promise<void> {
    if (!this.persistPath) return;
    const active = Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending" || t.status === "claimed" || t.status === "running",
    );
    await mkdir(dirname(this.persistPath), { recursive: true });
    await writeFile(this.persistPath, JSON.stringify(active, null, 2));
  }

  /** Load persisted tasks from disk. Pending tasks are re-enqueued; claimed/running are marked as timeout. */
  async loadPersisted(): Promise<void> {
    if (!this.persistPath) return;
    let raw: string;
    try {
      raw = await readFile(this.persistPath, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    const tasks: QueueTask[] = JSON.parse(raw);
    const now = Date.now();
    for (const task of tasks) {
      if (this.tasks.has(task.id)) continue;

      if (task.status === "pending") {
        // Re-enqueue as-is
        this.tasks.set(task.id, task);
        log.info({ taskId: task.id, name: task.name }, "Recovered pending task from disk");
      } else if (task.status === "claimed" || task.status === "running") {
        // Mark as timed out so they can be reclaimed
        task.status = "timeout";
        task.error = `Reclaimed after daemon restart: ${task.name}`;
        task.completedAt = now;
        this.tasks.set(task.id, task);
        log.warn({ taskId: task.id, name: task.name }, "Recovered claimed task as timeout");
      }
    }
  }

  // ── Private ──────────────────────────────────────────────

  /** Reclaim tasks that were claimed but timed out. */
  private reclaimTimedOut(): void {
    const now = Date.now();
    for (const task of this.tasks.values()) {
      if ((task.status === "claimed" || task.status === "running") && task.claimedAt) {
        if (now - task.claimedAt > task.timeoutMs) {
          log.warn({ taskId: task.id, agentId: task.claimedBy }, "Task timed out — reclaiming");
          task.status = "timeout";
          task.error = `Timed out after ${task.timeoutMs}ms: ${task.name}`;
          task.completedAt = now;
          this.emit("task-timeout", { taskId: task.id, agentId: task.claimedBy });
          this.emit("task-failed", { taskId: task.id, agentId: task.claimedBy, error: task.error });
        }
      }
    }
  }
}
