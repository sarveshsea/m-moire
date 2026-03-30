/**
 * AgentWorker — Standalone agent process that registers with the daemon,
 * connects via WebSocket, sends heartbeats, and executes tasks.
 *
 * Modes:
 *   - In-process: Spawned by `memi agent spawn <role>`, uses engine directly
 *   - Remote: Connects to a running daemon via WebSocket on ports 9223-9232
 *
 * Usage:
 *   Spawned by `memi agent spawn <role>` or run directly.
 *   Connects to the bridge, registers itself, sends heartbeats,
 *   and claims tasks matching its role.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import { createLogger } from "../engine/logger.js";
import type { AgentRegistryEntry, AgentRole, AgentTaskEnvelope } from "../plugin/shared/contracts.js";
import {
  BRIDGE_V2_CHANNEL,
  normalizeBridgeMessage,
  serializeBridgeEnvelope,
} from "../plugin/shared/bridge.js";

const log = createLogger("agent-worker");

export type AgentWorkerMode = "in-process" | "remote";

export interface AgentWorkerConfig {
  id: string;
  name: string;
  role: AgentRole;
  mode: AgentWorkerMode;
  daemonHost: string;
  daemonPort: number;
  heartbeatIntervalMs: number;
  reconnectIntervalMs: number;
}

const DEFAULT_HEARTBEAT_MS = 10_000;
const DEFAULT_RECONNECT_MS = 5_000;
const PORT_SCAN_START = 9223;
const PORT_SCAN_END = 9232;

export class AgentWorker extends EventEmitter {
  private config: AgentWorkerConfig;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private ws: WebSocket | null = null;
  private running = false;
  private _connected = false;

  constructor(config: Partial<AgentWorkerConfig> & { role: AgentRole }) {
    super();
    this.config = {
      id: config.id ?? `agent-${config.role}-${Date.now().toString(36)}`,
      name: config.name ?? `${config.role}-worker`,
      role: config.role,
      mode: config.mode ?? "in-process",
      daemonHost: config.daemonHost ?? "localhost",
      daemonPort: config.daemonPort ?? PORT_SCAN_START,
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_MS,
      reconnectIntervalMs: config.reconnectIntervalMs ?? DEFAULT_RECONNECT_MS,
    };
  }

  /** Build the registry entry for this worker. */
  toRegistryEntry(): AgentRegistryEntry {
    return {
      id: this.config.id,
      name: this.config.name,
      role: this.config.role,
      pid: process.pid,
      port: this.config.daemonPort,
      status: "online",
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      capabilities: this.getCapabilities(),
    };
  }

  /** Start the worker. In remote mode, connects to daemon via WebSocket. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    log.info({ id: this.config.id, role: this.config.role, mode: this.config.mode }, "Agent worker starting");

    if (this.config.mode === "remote") {
      await this.connectRemote();
    }

    // Start heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatIntervalMs);

    log.info({ id: this.config.id }, "Agent worker started — waiting for tasks");
  }

  /** Stop the worker and disconnect. */
  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(1000, "Agent stopping"); } catch { /* ignore */ }
      this.ws = null;
    }
    this._connected = false;
    log.info({ id: this.config.id }, "Agent worker stopped");
  }

  get id(): string { return this.config.id; }
  get role(): AgentRole { return this.config.role; }
  get name(): string { return this.config.name; }
  get isRunning(): boolean { return this.running; }
  get connected(): boolean { return this._connected; }
  get mode(): AgentWorkerMode { return this.config.mode; }

  /** Send a task result back to the daemon (remote mode). */
  sendTaskResult(taskId: string, result?: unknown, error?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const envelope: AgentTaskEnvelope = {
      id: `msg-${Date.now().toString(36)}`,
      type: "task-result",
      agentId: this.config.id,
      taskId,
      result,
      error,
    };

    this.ws.send(JSON.stringify(
      serializeBridgeEnvelope({
        channel: BRIDGE_V2_CHANNEL,
        source: "server",
        type: "agent-message",
        data: envelope,
      }),
    ));
  }

  // ── Remote Connection ────────────────────────────────

  /** Connect to the daemon by scanning ports 9223-9232. */
  private async connectRemote(): Promise<void> {
    for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port++) {
      try {
        await this.connectToPort(port);
        this.config.daemonPort = port;
        return;
      } catch {
        // Try next port
      }
    }
    log.warn("No daemon found on ports 9223-9232 — will retry");
    this.scheduleReconnect();
  }

  private connectToPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.daemonHost}:${port}`;
      const ws = new WebSocket(url);

      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection timeout to ${url}`));
      }, 3000);

      ws.on("open", () => {
        clearTimeout(timer);
        this.ws = ws;
        this._connected = true;
        log.info({ port }, "Connected to daemon");

        // Send bridge-hello to identify as an agent
        ws.send(JSON.stringify({
          type: "bridge-hello",
          file: `agent:${this.config.role}`,
          fileKey: this.config.id,
          editor: "agent-worker",
        }));

        this.setupMessageHandler(ws);
        this.emit("connected", { port });
        resolve();
      });

      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private setupMessageHandler(ws: WebSocket): void {
    ws.on("message", (data) => {
      try {
        const raw = JSON.parse(data.toString());
        const msg = normalizeBridgeMessage(raw);
        if (!msg) return;

        if (msg.type === "agent-message") {
          const taskEnvelope = msg.data as AgentTaskEnvelope;
          if (taskEnvelope.agentId === this.config.id) {
            this.handleTaskEnvelope(taskEnvelope);
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    ws.on("close", () => {
      this._connected = false;
      this.ws = null;
      log.warn("Disconnected from daemon");
      this.emit("disconnected");
      if (this.running) {
        this.scheduleReconnect();
      }
    });

    ws.on("error", (err) => {
      log.warn({ err: err.message }, "WebSocket error");
    });
  }

  private handleTaskEnvelope(envelope: AgentTaskEnvelope): void {
    switch (envelope.type) {
      case "task-assign":
        log.info({ taskId: envelope.taskId }, "Task assigned");
        this.emit("task-assigned", {
          taskId: envelope.taskId,
          payload: envelope.payload,
        });
        break;
      case "task-cancel":
        log.info({ taskId: envelope.taskId }, "Task cancelled");
        this.emit("task-cancelled", { taskId: envelope.taskId });
        break;
    }
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.running) return;
      log.info("Attempting reconnect...");
      await this.connectRemote();
    }, this.config.reconnectIntervalMs);
  }

  /** Send heartbeat ping over WebSocket (remote mode). */
  private sendHeartbeat(): void {
    if (this.config.mode === "remote" && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ping" }));
    }
    log.debug({ id: this.config.id }, "Heartbeat");
  }

  /** Get capabilities for this role. */
  private getCapabilities(): string[] {
    switch (this.config.role) {
      case "token-engineer":
        return ["token-create", "token-update", "token-delete", "color-palette", "spacing-system"];
      case "component-architect":
        return ["component-create", "component-modify", "spec-create", "atomic-design"];
      case "layout-designer":
        return ["page-layout", "responsive-layout", "template-create"];
      case "dataviz-specialist":
        return ["dataviz-create", "chart-config", "data-mapping"];
      case "code-generator":
        return ["code-generate", "shadcn-map", "tailwind-style"];
      case "accessibility-checker":
        return ["wcag-audit", "aria-check", "contrast-check", "focus-order"];
      case "design-auditor":
        return ["design-audit", "token-coverage", "naming-check", "consistency"];
      case "research-analyst":
        return ["research-synthesis", "persona-create", "insight-extract"];
      case "general":
        return ["general-task"];
      default:
        return [];
    }
  }
}
