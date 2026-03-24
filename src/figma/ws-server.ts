/**
 * Noche WebSocket Server — Multi-instance bridge server.
 *
 * Each Noche engine instance gets its own port (9223-9232).
 * Multiple Figma plugin instances can connect to the same server.
 * Supports chat relay, command dispatch, and real-time events.
 */

import { WebSocketServer, WebSocket } from "ws";
import { createLogger } from "../engine/logger.js";
import { EventEmitter } from "events";
import type { NocheEvent } from "../engine/core.js";

const log = createLogger("ws-server");

export interface BridgeClient {
  id: string;
  ws: WebSocket;
  file: string;
  fileKey: string;
  editor: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface NocheWsServerConfig {
  port?: number;
  instanceName?: string;
  onCommand?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
  onChat?: (text: string, fromPlugin: string) => void;
  onEvent?: (event: NocheEvent) => void;
}

/** Shape of messages received from the Figma plugin */
interface PluginMessage {
  type: string;
  id?: string;
  file?: string;
  fileKey?: string;
  editor?: string;
  text?: string;
  data?: unknown;
  result?: unknown;
  error?: string;
  action?: string;
  part?: string;
}

/** Per-client rate limiter — sliding window counter */
interface RateLimit {
  messageCount: number;
  bytesCount: number;
  windowStart: number;
}

const RATE_LIMIT = {
  maxMessagesPerMinute: 1000,
  maxBytesPerMinute: 100_000_000, // 100MB
  windowMs: 60_000,
};

export class NocheWsServer extends EventEmitter {
  private config: NocheWsServerConfig;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, BridgeClient>();
  private rateLimits = new Map<string, RateLimit>();
  private port = 0;
  private _running = false;
  private clientCounter = 0;
  private healthInterval: ReturnType<typeof setInterval> | null = null;
  private pendingCommands = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private commandId = 0;

  constructor(config: NocheWsServerConfig = {}) {
    super();
    this.config = config;
  }

  get running(): boolean {
    return this._running;
  }

  get activePort(): number {
    return this.port;
  }

  get connectedClients(): BridgeClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Start the WebSocket server, scanning ports 9223-9232 for an available one.
   * Probes each port first (any interface) so we don't shadow a process already
   * listening on IPv6 localhost while IPv4 is technically free.
   */
  async start(): Promise<number> {
    const startPort = this.config.port ?? 9223;
    const endPort = 9232;

    for (let p = startPort; p <= endPort; p++) {
      const occupied = await this.probePort(p);
      if (occupied) {
        log.info(`Port ${p} already occupied — skipping`);
        continue;
      }
      try {
        await this.startOnPort(p);
        this.port = p;
        this._running = true;
        log.info(`Noche WS server listening on port ${p}`);
        this.emitEvent("success", `Bridge server started on port ${p}`);
        return p;
      } catch {
        // bind failed anyway, try next
      }
    }

    throw new Error("No available ports (9223-9232). Close other Noche instances first.");
  }

  /** Returns true if something is already answering on ws://localhost:port */
  private probePort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      const timer = setTimeout(() => {
        ws.terminate?.();
        try { ws.close(); } catch {}
        resolve(false); // nothing answered in time → port free
      }, 600);

      ws.on("open", () => {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(true); // something is listening
      });

      ws.on("error", () => {
        clearTimeout(timer);
        resolve(false); // connection refused → port free
      });
    });
  }

  /**
   * Stop the server and disconnect all clients.
   */
  stop(): void {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
    }

    // Reject all pending commands
    for (const [id, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Server shutting down"));
      this.pendingCommands.delete(id);
    }

    if (this.wss) {
      for (const client of this.clients.values()) {
        client.ws.close(1000, "Server shutting down");
      }
      this.clients.clear();
      this.wss.close();
      this.wss = null;
      this._running = false;
      this.port = 0;
      log.info("WS server stopped");
    }
  }

  /**
   * Send a command to the first connected Figma plugin and wait for response.
   */
  async sendCommand(
    method: string,
    params: Record<string, unknown> = {},
    timeout = 30000
  ): Promise<unknown> {
    const client = this.getActiveClient();
    if (!client) {
      throw new Error("No Figma plugin connected");
    }

    const id = String(++this.commandId);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(id);
        reject(new Error(`Command timed out: ${method}`));
      }, timeout);

      this.pendingCommands.set(id, { resolve, reject, timeout: timer });

      client.ws.send(JSON.stringify({
        type: "command",
        id,
        method,
        params,
      }));
    });
  }

  /**
   * Send a chat message to all connected Figma plugins.
   */
  sendChat(text: string): void {
    this.broadcast({
      type: "chat",
      text,
      from: this.config.instanceName ?? "noche-terminal",
    });
  }

  /**
   * Send an event notification to all plugins.
   */
  sendEvent(event: NocheEvent): void {
    this.broadcast({
      type: "event",
      level: event.type,
      message: event.message,
      source: event.source,
    });
  }

  /**
   * Broadcast data to all connected clients.
   */
  broadcast(data: unknown): void {
    const payload = JSON.stringify(data);
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }

  /**
   * Get status summary for all connections.
   */
  getStatus(): {
    running: boolean;
    port: number;
    clients: { id: string; file: string; editor: string; connectedAt: string }[];
  } {
    return {
      running: this._running,
      port: this.port,
      clients: this.connectedClients.map((c) => ({
        id: c.id,
        file: c.file,
        editor: c.editor,
        connectedAt: c.connectedAt.toISOString(),
      })),
    };
  }

  // ── Private ──────────────────────────────────────────

  private startOnPort(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port });

      wss.on("listening", () => {
        this.wss = wss;
        this.setupServer();
        resolve();
      });

      wss.on("error", (err: Error & { code?: string }) => {
        if (err.code === "EADDRINUSE") {
          reject(new Error(`Port ${port} in use`));
        } else {
          reject(err);
        }
      });
    });
  }

  private setupServer(): void {
    if (!this.wss) return;

    this.wss.on("connection", (ws) => {
      const clientId = `plugin-${++this.clientCounter}`;

      const client: BridgeClient = {
        id: clientId,
        ws,
        file: "unknown",
        fileKey: "",
        editor: "figma",
        connectedAt: new Date(),
        lastPing: new Date(),
      };

      this.clients.set(clientId, client);
      log.info(`Plugin connected: ${clientId}`);
      this.emitEvent("success", "Figma plugin connected");
      this.emit("client-connected", client);

      // Send identification
      ws.send(JSON.stringify({
        type: "identify",
        name: this.config.instanceName ?? `Noche Terminal`,
        port: this.port,
      }));

      ws.on("message", (data) => {
        try {
          const raw = data.toString();
          // Basic size check — reject messages over 10MB
          if (raw.length > 10_000_000) {
            log.warn({ clientId, sizeMB: Math.round(raw.length / 1_000_000) }, "Oversized message, dropping");
            return;
          }
          // Rate limiting
          if (!this.checkRateLimit(clientId, raw.length)) {
            ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded. Slow down." }));
            return;
          }
          const msg = JSON.parse(raw) as PluginMessage;
          if (!msg.type || typeof msg.type !== "string") {
            log.warn({ clientId }, "Invalid message: missing type field");
            return;
          }
          this.handleMessage(clientId, msg);
        } catch {
          log.warn({ clientId }, "Invalid JSON message");
        }
      });

      ws.on("close", () => {
        this.clients.delete(clientId);
        this.rateLimits.delete(clientId);
        log.info(`Plugin disconnected: ${clientId}`);
        this.emitEvent("warn", "Figma plugin disconnected");
        this.emit("client-disconnected", clientId);
      });

      ws.on("pong", () => {
        client.lastPing = new Date();
      });
    });

    // Health check ping every 30s — stored as instance var for proper cleanup
    this.healthInterval = setInterval(() => {
      for (const client of this.clients.values()) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, 30000);
  }

  private handleMessage(clientId: string, msg: PluginMessage): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case "ping":
        // JSON-level keepalive from plugin UI
        client.lastPing = new Date();
        client.ws.send(JSON.stringify({ type: "pong" }));
        break;

      case "bridge-hello":
        // Plugin identifying itself — validate string types
        if (typeof msg.file === "string") client.file = msg.file;
        if (typeof msg.fileKey === "string") client.fileKey = msg.fileKey;
        if (typeof msg.editor === "string") client.editor = msg.editor;
        this.emit("client-updated", client);
        log.info(`Plugin identified: ${client.file} (${client.editor})`);
        break;

      case "response": {
        // Response to a command we sent
        const pending = msg.id ? this.pendingCommands.get(msg.id) : undefined;
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(msg.id!);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }

      case "chat":
        // Chat from plugin UI
        if (typeof msg.text === "string") {
          this.config.onChat?.(msg.text, clientId);
          this.emit("chat", { text: msg.text, from: clientId, file: client.file });
        }
        break;

      case "selection":
        this.emit("selection", msg.data);
        break;

      case "page-changed":
        this.emit("page-changed", msg.data);
        break;

      case "document-changed":
        this.emit("document-changed", msg.data);
        break;

      case "action-result":
        this.emit("action-result", { action: msg.action, result: msg.result, error: msg.error });
        break;

      case "sync-data":
        this.emit("sync-data", { part: msg.part, result: msg.result, error: msg.error });
        break;

      default:
        log.debug({ clientId, type: msg.type }, "Unknown message type");
    }
  }

  /** Check and update rate limit for a client. Returns true if allowed. */
  private checkRateLimit(clientId: string, messageSize: number): boolean {
    const now = Date.now();
    let limit = this.rateLimits.get(clientId);

    if (!limit || now - limit.windowStart > RATE_LIMIT.windowMs) {
      limit = { messageCount: 0, bytesCount: 0, windowStart: now };
      this.rateLimits.set(clientId, limit);
    }

    limit.messageCount++;
    limit.bytesCount += messageSize;

    if (limit.messageCount > RATE_LIMIT.maxMessagesPerMinute) {
      log.warn({ clientId, count: limit.messageCount }, "Rate limit exceeded (messages)");
      return false;
    }

    if (limit.bytesCount > RATE_LIMIT.maxBytesPerMinute) {
      log.warn({ clientId, bytes: limit.bytesCount }, "Rate limit exceeded (bytes)");
      return false;
    }

    return true;
  }

  private getActiveClient(): BridgeClient | null {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        return client;
      }
    }
    return null;
  }

  private emitEvent(type: NocheEvent["type"], message: string): void {
    const event: NocheEvent = {
      type,
      source: "ws-server",
      message,
      timestamp: new Date(),
    };
    this.config.onEvent?.(event);
    this.emit("event", event);
  }
}
