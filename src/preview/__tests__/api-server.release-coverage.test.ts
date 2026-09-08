import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mocks = vi.hoisted(() => ({ handler: null as any, server: null as any, wss: null as any, wsOptions: null as any, errors: [] as string[], address: undefined as any }));
vi.mock("http", async () => {
  const { EventEmitter } = await import("node:events");
  return { createServer: vi.fn((handler: unknown) => {
    mocks.handler = handler;
    const server = Object.assign(new EventEmitter(), {
      listen: vi.fn(() => { queueMicrotask(() => { const code = mocks.errors.shift(); if (code) server.emit("error", Object.assign(new Error("fixture bind error"), { code })); else server.emit("listening"); }); return server; }),
      address: () => mocks.address === undefined ? { port: 4400 } : mocks.address,
      close: vi.fn(),
    });
    mocks.server = server; return server;
  }) };
});
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return { WebSocket: { OPEN: 1 }, WebSocketServer: class extends EventEmitter {
    close = vi.fn();
    constructor(options: unknown) { super(); mocks.wsOptions = options; mocks.wss = this; }
  } };
});
import { PreviewApiServer, isAllowedPreviewHost, isAllowedPreviewOrigin, isAuthorizedPreviewMutation, resolvePreviewStaticReadPath } from "../api-server.js";

let root: string;
let engine: any;
let server: PreviewApiServer;
let cookie: string;
function response() {
  const headers = new Map<string, string>();
  return { statusCode: 200, writableEnded: false, headers,
    setHeader: (key: string, value: string) => headers.set(key.toLowerCase(), value),
    end: vi.fn(function (this: { writableEnded: boolean }, _body?: unknown) { this.writableEnded = true; }),
    write: vi.fn(() => true),
  };
}
async function request(path: string, options: { method?: string; body?: string; headers?: Record<string, string>; streamError?: Error } = {}) {
  const req = Object.assign(new EventEmitter(), { url: path, method: options.method ?? "GET", headers: { host: "localhost:4400", ...options.headers }, destroy: vi.fn() });
  const res = response();
  const handled = mocks.handler(req, res);
  if (options.streamError) req.emit("error", options.streamError);
  else if (options.body !== undefined) { req.emit("data", Buffer.from(options.body)); req.emit("end"); }
  await handled;
  return { req, res, json: () => JSON.parse(String(res.end.mock.calls.at(-1)?.[0])) };
}
const auth = () => ({ origin: "http://localhost:4400", cookie });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-preview-release-"));
  await mkdir(join(root, "preview")); await writeFile(join(root, "preview", "index.html"), "<h1>Fixture</h1>");
  const figma = Object.assign(new EventEmitter(), {
    isConnected: false,
    wsServer: { activePort: 0, getStatus: () => ({ running: false, port: 0, clients: [] }), sendCommand: vi.fn(async command => ({ command })) },
    getSelection: vi.fn(async () => ({ nodes: [] })), getPageTree: vi.fn(async () => ({ pages: [] })), extractStickies: vi.fn(async () => []), extractDesignSystem: vi.fn(async () => ({})),
  });
  engine = Object.assign(new EventEmitter(), {
    config: { projectRoot: root }, figma,
    registry: { getAllSpecs: vi.fn(async () => []), designSystem: { tokens: [] } },
    research: { load: vi.fn(async () => {}), getStore: () => ({ version: 2, sources: [] }) },
    sync: { getConflicts: () => [], isGuarded: false, resolveConflict: vi.fn(() => true) },
    agentRegistry: { getAll: () => [] }, taskQueue: { getStats: () => ({}) },
  });
  mocks.errors = []; mocks.address = undefined;
  server = new PreviewApiServer(engine, join(root, "preview"), 4400);
  await server.start();
  const initial = await request("/api/status"); cookie = initial.res.headers.get("set-cookie")!.split(";")[0];
});
afterEach(async () => { server.stop(); vi.useRealTimers(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });

describe("preview API release request failures", () => {
  it.each(["/api/action", "/api/sync/resolve"])("contains request stream errors for %s", async path => {
    await expect(request(path, { method: "POST", headers: auth(), streamError: new Error("request disconnected") })).resolves.toMatchObject({ res: { statusCode: 400 } });
  });
});
