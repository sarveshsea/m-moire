/**
 * Live Dashboard Server — HTTP + SSE for the Ark Agent Portal.
 *
 * Serves the portal HTML and pushes real-time events from the
 * Figma bridge (actions, syncs, selections, page changes) to
 * all connected browser clients via Server-Sent Events.
 *
 * Also exposes POST /api/action to trigger Figma plugin actions
 * from the dashboard UI.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import type { FigmaBridge } from "../figma/bridge.js";
import type { ArkEngine } from "../engine/core.js";
import { createLogger } from "../engine/logger.js";
import { generatePortalHTML } from "./portal.js";

const log = createLogger("dashboard");

interface SSEClient {
  id: number;
  res: ServerResponse;
}

export class DashboardServer {
  private engine: ArkEngine;
  private bridge: FigmaBridge;
  private server: ReturnType<typeof createServer> | null = null;
  private sseClients: SSEClient[] = [];
  private clientCounter = 0;
  private port: number;
  private eventLog: { ts: number; type: string; data: unknown }[] = [];
  private maxEventLog = 200;

  constructor(engine: ArkEngine, port = 3333) {
    this.engine = engine;
    this.bridge = engine.figma;
    this.port = port;
  }

  async start(): Promise<number> {
    this.wireEvents();

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err: Error & { code?: string }) => {
        if (err.code === "EADDRINUSE") {
          // Try next port
          this.port++;
          if (this.port > 3399) {
            reject(new Error("No available ports for dashboard (3333-3399)"));
            return;
          }
          this.server!.listen(this.port);
        } else {
          reject(err);
        }
      });

      this.server.on("listening", () => {
        log.info(`Dashboard server on port ${this.port}`);
        resolve(this.port);
      });

      this.server.listen(this.port);
    });
  }

  stop(): void {
    for (const client of this.sseClients) {
      client.res.end();
    }
    this.sseClients = [];
    this.server?.close();
    this.server = null;
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }

  private wireEvents(): void {
    const push = (type: string, data: unknown) => {
      this.eventLog.push({ ts: Date.now(), type, data });
      if (this.eventLog.length > this.maxEventLog) {
        this.eventLog.shift();
      }
      this.broadcast(type, data);
    };

    this.bridge.on("action-result", (d) => push("action-result", d));
    this.bridge.on("sync-data", (d) => push("sync-data", d));
    this.bridge.on("selection", (d) => push("selection", d));
    this.bridge.on("page-changed", (d) => push("page-changed", d));
    this.bridge.on("document-changed", (d) => push("document-changed", d));
    this.bridge.on("plugin-connected", (d) => push("plugin-connected", { id: d.id, file: d.file, editor: d.editor }));
    this.bridge.on("plugin-disconnected", () => push("plugin-disconnected", {}));
    this.bridge.on("chat", (d) => push("chat", d));
    this.bridge.on("event", (d) => push("event", d));
  }

  private broadcast(type: string, data: unknown): void {
    const payload = `data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(payload);
      } catch {
        // Client gone, will be cleaned up
      }
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || "/";

    // CORS for local dev
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === "/" || url === "/index.html") {
      this.servePortal(res);
    } else if (url === "/events") {
      this.handleSSE(req, res);
    } else if (url === "/api/status") {
      this.handleStatus(res);
    } else if (url === "/api/action" && req.method === "POST") {
      this.handleAction(req, res);
    } else if (url === "/api/events") {
      this.handleEventLog(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  private servePortal(res: ServerResponse): void {
    const bridgeStatus = this.bridge.getStatus();
    const html = generatePortalHTML({
      bridgePort: bridgeStatus.port,
      bridgeClients: bridgeStatus.clients,
      dashboardPort: this.port,
    });
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  private handleSSE(req: IncomingMessage, res: ServerResponse): void {
    const clientId = ++this.clientCounter;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    // Send initial state
    const status = this.bridge.getStatus();
    res.write(`data: ${JSON.stringify({ type: "init", data: { status, recentEvents: this.eventLog.slice(-50) }, ts: Date.now() })}\n\n`);

    const client: SSEClient = { id: clientId, res };
    this.sseClients.push(client);

    req.on("close", () => {
      this.sseClients = this.sseClients.filter((c) => c.id !== clientId);
    });
  }

  private handleStatus(res: ServerResponse): void {
    const status = this.bridge.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  }

  private async handleAction(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 10_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
    }

    let parsed: { action: string; params?: Record<string, unknown> };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!parsed.action || typeof parsed.action !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing action field" }));
      return;
    }

    const actionMap: Record<string, { method: string; params: Record<string, unknown> }> = {
      "pull-tokens": { method: "getVariables", params: {} },
      "pull-components": { method: "getComponents", params: {} },
      "pull-styles": { method: "getStyles", params: {} },
      "stickies": { method: "getStickies", params: {} },
      "inspect": { method: "getSelection", params: {} },
      "page-tree": { method: "getPageTree", params: { depth: 2 } },
    };

    // Full sync triggers all three
    if (parsed.action === "full-sync") {
      try {
        const [tokens, components, styles] = await Promise.all([
          this.bridge.wsServer.sendCommand("getVariables", {}, 60000),
          this.bridge.wsServer.sendCommand("getComponents", {}, 60000),
          this.bridge.wsServer.sendCommand("getStyles", {}, 30000),
        ]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, tokens, components, styles }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    }

    const cmd = actionMap[parsed.action];
    if (!cmd) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Unknown action: ${parsed.action}` }));
      return;
    }

    try {
      const result = await this.bridge.wsServer.sendCommand(cmd.method, { ...cmd.params, ...parsed.params }, 60000);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private handleEventLog(res: ServerResponse): void {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.eventLog.slice(-100)));
  }
}
