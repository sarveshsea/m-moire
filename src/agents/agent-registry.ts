/**
 * AgentRegistry — Discovery, health monitoring, and file-based persistence
 * for multi-Claude agent instances.
 *
 * Each agent registers with an ID, role, PID, and port.
 * The registry persists to .memoire/agents/ and evicts stale agents
 * after 30s without a heartbeat.
 */

import { EventEmitter } from "events";
import { readFile, writeFile, readdir, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "../engine/logger.js";
import type { AgentRegistryEntry, AgentRole } from "../plugin/shared/contracts.js";

const log = createLogger("agent-registry");

const HEARTBEAT_STALE_MS = 30_000;
const HEALTH_CHECK_INTERVAL_MS = 10_000;

export class AgentRegistry extends EventEmitter {
  private agents = new Map<string, AgentRegistryEntry>();
  private agentsDir: string;
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private evicting = false;

  constructor(memoireDir: string) {
    super();
    this.agentsDir = join(memoireDir, "agents");
  }

  /** Load all persisted agent entries from disk. */
  async load(): Promise<void> {
    await mkdir(this.agentsDir, { recursive: true });

    try {
      const files = await readdir(this.agentsDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = await readFile(join(this.agentsDir, file), "utf-8");
          const entry: AgentRegistryEntry = JSON.parse(raw);
          if (entry.id && entry.role) {
            // Check if process is still alive
            if (this.isProcessAlive(entry.pid)) {
              this.agents.set(entry.id, entry);
            } else {
              // Stale entry — clean up
              await this.removeFile(entry.id);
            }
          }
        } catch {
          // Skip corrupt files
        }
      }
    } catch {
      // Directory might not exist yet
    }

    log.info({ count: this.agents.size }, "Agent registry loaded");
  }

  /** Start the health check timer. */
  startHealthCheck(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => this.evictStale(), HEALTH_CHECK_INTERVAL_MS);
    this.healthTimer.unref?.();
  }

  /** Stop the health check timer. */
  stopHealthCheck(): void {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }
  }

  /** Register a new agent. */
  async register(entry: AgentRegistryEntry): Promise<void> {
    this.agents.set(entry.id, entry);
    await this.persistEntry(entry);
    this.emit("agent-registered", entry);
    log.info({ id: entry.id, role: entry.role, name: entry.name }, "Agent registered");
  }

  /** Deregister an agent by ID. */
  async deregister(agentId: string): Promise<boolean> {
    const entry = this.agents.get(agentId);
    if (!entry) return false;

    this.agents.delete(agentId);
    await this.removeFile(agentId);
    this.emit("agent-deregistered", { agentId, role: entry.role });
    log.info({ id: agentId, role: entry.role }, "Agent deregistered");
    return true;
  }

  /** Update an agent's heartbeat timestamp. */
  heartbeat(agentId: string): boolean {
    const entry = this.agents.get(agentId);
    if (!entry) return false;

    entry.lastHeartbeat = Date.now();
    entry.status = "online";
    return true;
  }

  /** Mark an agent as busy (executing a task). */
  markBusy(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (entry) entry.status = "busy";
  }

  /** Mark an agent as online (idle, ready for tasks). */
  markOnline(agentId: string): void {
    const entry = this.agents.get(agentId);
    if (entry) entry.status = "online";
  }

  /** Get an available agent for a given role. */
  getAvailableAgent(role: AgentRole): AgentRegistryEntry | null {
    for (const entry of this.agents.values()) {
      if (entry.role === role && entry.status === "online") {
        return entry;
      }
    }
    // Fallback: try "general" role agents
    if (role !== "general") {
      for (const entry of this.agents.values()) {
        if (entry.role === "general" && entry.status === "online") {
          return entry;
        }
      }
    }
    return null;
  }

  /** Get all registered agents. */
  getAll(): AgentRegistryEntry[] {
    return Array.from(this.agents.values());
  }

  /** Get a specific agent by ID. */
  get(agentId: string): AgentRegistryEntry | null {
    return this.agents.get(agentId) ?? null;
  }

  /** Get agents matching a role. */
  getByRole(role: AgentRole): AgentRegistryEntry[] {
    return Array.from(this.agents.values()).filter((a) => a.role === role);
  }

  /** Get count of online agents. */
  get onlineCount(): number {
    return Array.from(this.agents.values()).filter((a) => a.status !== "offline").length;
  }

  // ── Private ──────────────────────────────────────────────

  /** Evict agents with stale heartbeats. Guarded against concurrent execution. */
  private async evictStale(): Promise<void> {
    if (this.evicting) return;
    this.evicting = true;
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, entry] of this.agents) {
      const age = now - entry.lastHeartbeat;
      if (age > HEARTBEAT_STALE_MS) {
        stale.push(id);
      } else if (!this.isProcessAlive(entry.pid)) {
        stale.push(id);
      }
    }

    try {
      for (const id of stale) {
        const entry = this.agents.get(id);
        log.warn({ id, role: entry?.role }, "Evicting stale agent");
        this.agents.delete(id);
        await this.removeFile(id);
        this.emit("agent-evicted", { agentId: id, role: entry?.role });
      }
    } finally {
      this.evicting = false;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async persistEntry(entry: AgentRegistryEntry): Promise<void> {
    await mkdir(this.agentsDir, { recursive: true });
    const filePath = join(this.agentsDir, `${entry.id}.json`);
    await writeFile(filePath, JSON.stringify(entry, null, 2));
  }

  private async removeFile(agentId: string): Promise<void> {
    try {
      await unlink(join(this.agentsDir, `${agentId}.json`));
    } catch {
      // Already gone
    }
  }
}
