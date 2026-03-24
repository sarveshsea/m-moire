/**
 * Preview API Server — Interactive preview with REST API and WebSocket.
 */

import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";
import type { ArkEngine } from "../engine/core.js";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export class PreviewApiServer {
  private engine: ArkEngine;
  private staticDir: string;
  private port: number;
  private server: ReturnType<typeof createServer> | null = null;

  constructor(engine: ArkEngine, staticDir: string, port = 3030) {
    this.engine = engine;
    this.staticDir = staticDir;
    this.port = port;
  }

  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        const url = new URL(req.url || "/", `http://localhost:${this.port}`);

        // API routes
        if (url.pathname.startsWith("/api/")) {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");

          if (url.pathname === "/api/specs") {
            res.end(JSON.stringify([]));
            return;
          }

          if (url.pathname === "/api/tokens") {
            const tokens = this.engine.registry.designSystem;
            res.end(JSON.stringify(tokens));
            return;
          }

          if (url.pathname === "/api/status") {
            res.end(JSON.stringify({
              figma: this.engine.figma.isConnected,
            }));
            return;
          }

          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        // Static file serving
        let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
        const fullPath = join(this.staticDir, filePath);
        const ext = extname(fullPath);

        try {
          const content = await readFile(fullPath);
          res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
          res.end(content);
        } catch {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain");
          res.end("Not found");
        }
      });

      this.server.listen(this.port, () => {
        resolve(this.port);
      });

      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          this.port++;
          this.server?.listen(this.port);
        } else {
          reject(err);
        }
      });
    });
  }

  stop(): void {
    this.server?.close();
  }
}
