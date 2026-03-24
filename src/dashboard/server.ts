/**
 * Live Dashboard Server — HTTP + SSE for the Noche Agent Portal.
 *
 * Routes:
 *   GET  /            → Portal HTML
 *   GET  /events      → SSE stream
 *   GET  /api/status  → Bridge status JSON
 *   GET  /api/events  → Last 100 events
 *   POST /api/action  → Trigger Figma plugin actions
 *   POST /api/setup   → Save FIGMA_TOKEN or FIGMA_FILE_KEY to .env.local
 *   POST /api/compose → Run compose intent through the orchestrator
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFile, writeFile, readdir } from "fs/promises";
import { join } from "path";
import type { FigmaBridge } from "../figma/bridge.js";
import type { NocheEngine } from "../engine/core.js";
import { createLogger } from "../engine/logger.js";
import { generatePortalHTML } from "./portal.js";

const log = createLogger("dashboard");

interface SSEClient {
  id: number;
  res: ServerResponse;
}

export class DashboardServer {
  private engine: NocheEngine;
  private bridge: FigmaBridge;
  private server: ReturnType<typeof createServer> | null = null;
  private sseClients: SSEClient[] = [];
  private clientCounter = 0;
  private port: number;
  private eventLog: { ts: number; type: string; data: unknown }[] = [];
  private maxEventLog = 200;

  constructor(engine: NocheEngine, port = 3333) {
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
        // Client gone, cleaned up on close
      }
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url || "/";

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
    } else if (url === "/api/setup" && req.method === "POST") {
      this.handleSetup(req, res);
    } else if (url === "/api/compose" && req.method === "POST") {
      this.handleCompose(req, res);
    } else if (url === "/api/data") {
      this.handleData(res);
    } else if (url === "/api/specs") {
      this.handleSpecs(res);
    } else if (url === "/preview" || url === "/preview/") {
      this.handlePreview(res);
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  }

  private async servePortal(res: ServerResponse): Promise<void> {
    const bridgeStatus = this.bridge.getStatus();
    const root = this.engine.config.projectRoot;

    // Read env for portal config
    const token = await this.findEnvVar(root, "FIGMA_TOKEN");
    const fileKey = await this.findEnvVar(root, "FIGMA_FILE_KEY") || this.engine.config.figmaFileKey;
    const nodeId = await this.findEnvVar(root, "FIGMA_NODE_ID");
    const projectName = await this.findEnvVar(root, "NOCHE_PROJECT_NAME") || "Noche";
    const pluginManifestPath = join(root, "plugin", "manifest.json");

    const html = generatePortalHTML({
      bridgePort: bridgeStatus.port,
      bridgeClients: bridgeStatus.clients,
      dashboardPort: this.port,
      hasToken: !!token,
      figmaFileKey: fileKey || "",
      figmaNodeId: nodeId || "",
      projectName,
      pluginManifestPath,
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

    const bridgeStatus = this.bridge.getStatus();
    const root = this.engine.config.projectRoot;
    const pluginManifestPath = join(root, "plugin", "manifest.json");

    const initData = {
      status: { ...bridgeStatus, pluginManifestPath },
      recentEvents: this.eventLog.slice(-50),
    };
    res.write(`data: ${JSON.stringify({ type: "init", data: initData, ts: Date.now() })}\n\n`);

    const client: SSEClient = { id: clientId, res };
    this.sseClients.push(client);

    req.on("close", () => {
      this.sseClients = this.sseClients.filter((c) => c.id !== clientId);
    });
  }

  private handleStatus(res: ServerResponse): void {
    const status = this.bridge.getStatus();
    const pluginManifestPath = join(this.engine.config.projectRoot, "plugin", "manifest.json");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...status, pluginManifestPath }));
  }

  private async handleSetup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 10_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
    }

    let parsed: { key: string; value: string };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    const allowedKeys = ["FIGMA_TOKEN", "FIGMA_FILE_KEY", "FIGMA_NODE_ID", "NOCHE_PROJECT_NAME"];
    if (!parsed.key || !allowedKeys.includes(parsed.key)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Key must be one of: ${allowedKeys.join(", ")}` }));
      return;
    }

    if (!parsed.value || typeof parsed.value !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing value" }));
      return;
    }

    try {
      await this.setEnvVar(this.engine.config.projectRoot, parsed.key, parsed.value);
      // Also update process env so it takes effect immediately
      process.env[parsed.key] = parsed.value;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      log.info(`Setup: saved ${parsed.key}`);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handleCompose(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 50_000) {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Payload too large" }));
        return;
      }
    }

    let parsed: { intent: string; dryRun?: boolean };
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!parsed.intent || typeof parsed.intent !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing intent" }));
      return;
    }

    try {
      // Dynamically import orchestrator to avoid circular deps at startup
      const { AgentOrchestrator } = await import("../agents/orchestrator.js");
      const orchestrator = new AgentOrchestrator(this.engine);
      const result = await orchestrator.execute(parsed.intent, { dryRun: parsed.dryRun });

      const summary = `${result.status.toUpperCase()} — ${result.completedTasks}/${result.totalTasks} tasks, ${result.mutations.length} mutations`;

      // Broadcast so live feed also shows it
      this.broadcast("compose-result", { intent: parsed.intent, summary });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, summary, result }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: msg }));
    }
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
      "pull-tokens":      { method: "getVariables",   params: {} },
      "pull-components":  { method: "getComponents",  params: {} },
      "pull-styles":      { method: "getStyles",      params: {} },
      "stickies":         { method: "getStickies",    params: {} },
      "inspect":          { method: "getSelection",   params: {} },
      "page-tree":        { method: "getPageTree",    params: { depth: 2 } },
    };

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

  private async handleData(res: ServerResponse): Promise<void> {
    const root = this.engine.config.projectRoot;
    const nocheDir = join(root, ".noche");
    try {
      const [dsRaw, treeRaw] = await Promise.all([
        readFile(join(nocheDir, "design-system.json"), "utf-8").catch(() => null),
        readFile(join(nocheDir, "page-tree.json"), "utf-8").catch(() => null),
      ]);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        designSystem: dsRaw ? JSON.parse(dsRaw) : null,
        pageTree: treeRaw ? JSON.parse(treeRaw) : null,
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  private async handlePreview(res: ServerResponse): Promise<void> {
    const root = this.engine.config.projectRoot;
    try {
      const html = await readFile(join(root, "preview", "index.html"), "utf-8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("preview/index.html not found");
    }
  }

  private async handleSpecs(res: ServerResponse): Promise<void> {
    const root = this.engine.config.projectRoot;
    const specsDir = join(root, "specs");
    const result: Record<string, unknown[]> = {};
    try {
      for (const sub of ["components", "pages", "dataviz", "design", "ia"]) {
        try {
          const files = await readdir(join(specsDir, sub));
          result[sub] = [];
          for (const f of files.filter(f => f.endsWith(".json"))) {
            try {
              const raw = await readFile(join(specsDir, sub, f), "utf-8");
              result[sub].push(JSON.parse(raw));
            } catch { /* skip invalid */ }
          }
        } catch { /* dir absent */ }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }

  // ── Env helpers ──────────────────────────────────────

  private async findEnvVar(root: string, key: string): Promise<string | null> {
    for (const file of [".env.local", ".env"]) {
      try {
        const content = await readFile(join(root, file), "utf-8");
        const match = content.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
        if (match) return match[1].trim();
      } catch {
        // file absent
      }
    }
    return process.env[key] || null;
  }

  private async setEnvVar(root: string, key: string, value: string): Promise<void> {
    const envPath = join(root, ".env.local");
    let content = "";
    try {
      content = await readFile(envPath, "utf-8");
    } catch {
      // new file
    }

    const regex = new RegExp(`^${key}\\s*=.*$`, "m");
    const line = `${key}="${value}"`;

    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content.trim() + (content.trim() ? "\n" : "") + line + "\n";
    }

    await writeFile(envPath, content);
  }
}
