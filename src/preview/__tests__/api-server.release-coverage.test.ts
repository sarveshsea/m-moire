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
  it("rejects request bodies over one MiB without leaking handler rejections", async () => {
    const result = await request("/api/action", { method: "POST", headers: auth(), body: "x".repeat(1_048_577) });
    expect(result.res.statusCode).toBe(400); expect(result.req.destroy).toHaveBeenCalled();
  });
  it("times out incomplete request bodies without leaking handler rejections", async () => {
    vi.useFakeTimers();
    const req = Object.assign(new EventEmitter(), { url: "/api/action", method: "POST", headers: { host: "localhost:4400", ...auth() }, destroy: vi.fn() });
    const res = response(); const handled = mocks.handler(req, res);
    const assertion = expect(handled).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000); await assertion;
    expect(res.statusCode).toBe(400); expect(req.destroy).toHaveBeenCalled();
  });
  it("rejects a wrong Host and disallows missing Origin or malformed session cookies", async () => {
    expect((await request("/api/status", { headers: { host: "wrong.test:4400" } })).res.statusCode).toBe(403);
    expect(isAllowedPreviewHost(undefined, 4400)).toBe(false); expect(isAllowedPreviewOrigin(undefined, 4400)).toBe(false);
    for (const value of [undefined, "bad; other=value", "memoire_preview_session=", "memoire_preview_session=short"]) {
      expect(isAuthorizedPreviewMutation({ host: "localhost:4400", origin: "http://localhost:4400", cookie: value }, 4400, "valid")).toBe(false);
    }
    expect(isAuthorizedPreviewMutation({ host: "localhost:4400", origin: "http://localhost:4400", cookie: "bad; other=value; memoire_preview_session=valid" }, 4400, "valid")).toBe(true);
    expect((await request("/api/sync/resolve", { method: "POST", body: "{}" })).res.statusCode).toBe(403);
  });
  it("returns defaults when spec or research loading fails and covers empty research", async () => {
    engine.registry.getAllSpecs.mockRejectedValueOnce(new Error("fixture read failed"));
    expect((await request("/api/specs")).json()).toEqual([]);
    engine.research.load.mockRejectedValueOnce(new Error("fixture research failure"));
    expect((await request("/api/research")).json()).toMatchObject({ sources: [], coverage: { total: 0, ratio: 1 } });
    expect((await request("/api/research")).json()).toMatchObject({ coverage: { total: 0, ratio: 1 } });
    expect((await request("/api/pipeline/stats")).res.statusCode).toBe(404);
    expect((await request("/api/pipeline/events")).res.statusCode).toBe(404);
  });
  it.each(["/api/action", "/api/sync/resolve"])("returns sanitized errors for invalid JSON or failed %s", async path => {
    const malformed = await request(path, { method: "POST", headers: auth(), body: "{bad" }); expect(malformed.res.statusCode).toBe(400);
    const error = new Error("failed reading /Users/fixture/private.md");
    engine.figma.getSelection.mockRejectedValueOnce(error); engine.sync.resolveConflict.mockImplementationOnce(() => { throw error; });
    const failed = await request(path, { method: "POST", headers: auth(), body: JSON.stringify({ action: "inspect", name: "Button", resolution: "code" }) });
    expect(failed.res.statusCode).toBe(400); expect(failed.json().error).toBe("failed reading <path>");
  });
  it("rejects absent actions, supports non-Error failure values and scopes CORS", async () => {
    expect((await request("/api/action", { method: "POST", headers: auth(), body: "{}" })).res.statusCode).toBe(400);
    engine.figma.getSelection.mockRejectedValueOnce("fixture error");
    expect((await request("/api/action", { method: "POST", headers: auth(), body: '{"action":"inspect"}' })).json()).toMatchObject({ error: "fixture error" });
    const allowed = await request("/api/status", { headers: { origin: "http://localhost:4400" } }); expect(allowed.res.headers.get("access-control-allow-origin")).toBe("http://localhost:4400");
    const denied = await request("/api/status", { headers: { origin: "http://localhost:4401" } }); expect(denied.res.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("serves static files with known and fallback MIME types and an omitted URL", async () => {
    await writeFile(join(root, "preview", "fixture.unknown"), "bytes");
    expect((await request("/fixture.unknown")).res.headers.get("content-type")).toBe("application/octet-stream");
    expect((await request(undefined as never)).res.end).toHaveBeenCalledWith(Buffer.from("<h1>Fixture</h1>"));
    expect(await resolvePreviewStaticReadPath(join(root, "preview"), "/../outside.txt")).toBeNull();
  });
  it("returns an empty shadcn registry and ignores files that are not component directories", async () => {
    expect((await request("/r/registry.json")).json()).toMatchObject({ items: [] });
    await mkdir(join(root, "generated", "components", "ui"), { recursive: true });
    await writeFile(join(root, "generated", "components", "ui", "ignored.tsx"), "data");
    expect((await request("/r/registry.json", { headers: { origin: "http://localhost:4400" } })).json().items).toEqual([]);
    const untrusted = await request("/r/registry.json", { headers: { origin: "https://fixture.invalid" } }); expect(untrusted.res.headers.has("access-control-allow-origin")).toBe(false);
  });
  it("authenticates WebSockets and closes errored or disconnected clients", async () => {
    const verify = mocks.wsOptions.verifyClient;
    expect(verify({ req: { headers: { host: "localhost:4400", ...auth() } } })).toBe(true);
    expect(verify({ req: { headers: { host: "wrong:4400", ...auth() } } })).toBe(false);
    expect(verify({ req: { headers: { host: "localhost:4400", origin: "wrong" } } })).toBe(false);
    expect(verify({ req: { headers: { host: "localhost:4400", origin: "http://localhost:4400" } } })).toBe(false);
    const socket = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn(), close: vi.fn() });
    mocks.wss.emit("connection", socket); engine.emit("event", { source: "codegen", type: "success", message: "Button generated" });
    expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ type: "reload", reason: "Button generated" });
    socket.readyState = 0; server.notifyReload("connecting"); expect(socket.send).toHaveBeenCalledTimes(1);
    socket.emit("close"); server.notifyReload("removed"); expect(socket.send).toHaveBeenCalledTimes(1);
    const failedSocket = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn(), close: vi.fn() });
    mocks.wss.emit("connection", failedSocket); failedSocket.emit("error", new Error("closed")); expect(failedSocket.close).toHaveBeenCalledTimes(1);
    const closedSocket = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn(), close: vi.fn(() => { throw new Error("already closed"); }) });
    mocks.wss.emit("connection", closedSocket);
    expect(() => closedSocket.emit("error", new Error("closed twice"))).not.toThrow();
    const live = Object.assign(new EventEmitter(), { readyState: 1, send: vi.fn(), close: vi.fn() });
    mocks.wss.emit("connection", live); mocks.wss.emit("error", new Error("WebSocket server failed"));
    expect(live.close).toHaveBeenCalledTimes(1); server.notifyReload("after failure"); expect(live.send).not.toHaveBeenCalled();
  });
  it("streams cached Figma updates and detaches all engine listeners on stop", async () => {
    const { req, res } = await request("/events", { headers: { origin: "http://localhost:4400" } });
    expect(res.headers.get("content-type")).toBe("text/event-stream"); expect(res.write.mock.calls[0][0]).toContain('"type":"init"');
    engine.figma.emit("plugin-disconnected"); engine.figma.emit("plugin-connected"); engine.figma.emit("plugin-connected");
    engine.figma.emit("connection-state", { stage: "connected", port: 9223 });
    engine.figma.emit("selection", { count: 0, nodes: [], updatedAt: 10 });
    engine.figma.emit("job-status", { id: "job", status: "running", updatedAt: 10 });
    engine.figma.emit("agent-status", { runId: "run", taskId: "task", role: "fixture", status: "busy" });
    engine.figma.emit("sync-result", {}); engine.figma.emit("sync-result", { summary: { tokens: 2 } }); engine.figma.emit("heal-result", { round: 1, healed: true, issueCount: 0 });
    engine.figma.emit("plugin-disconnected"); engine.emit("event", { source: "auto-spec", type: "success", message: "updated" }); engine.emit("event", { source: "engine", type: "info", message: "ready" });
    expect((await request("/api/figma/jobs")).json().jobs).toHaveLength(1);
    expect((await request("/api/figma/agents")).json().agents).toHaveLength(1);
    expect((await request("/api/figma/selection")).json().selection).toMatchObject({ count: 0 });
    expect((await request("/api/figma/status")).json()).toHaveProperty("sync");
    const count = res.write.mock.calls.length; req.emit("close"); engine.figma.emit("selection", { count: 0, nodes: [] }); expect(res.write).toHaveBeenCalledTimes(count);
    const other = await request("/events"); server.stop(); expect(other.res.end).toHaveBeenCalled();
    expect(engine.listenerCount("event")).toBe(0); expect(engine.figma.eventNames()).toEqual([]); server.stop();
  });
  it("ignores ended SSE responses and stops writing to backpressured clients", async () => {
    const ended = await request("/events"); ended.res.writableEnded = true; const count = ended.res.write.mock.calls.length;
    engine.emit("event", { source: "engine", message: "ready" }); expect(ended.res.write).toHaveBeenCalledTimes(count);
    const slow = await request("/events"); slow.res.write.mockReturnValue(false);
    engine.emit("event", { source: "engine", message: "one" }); const writes = slow.res.write.mock.calls.length;
    engine.emit("event", { source: "engine", message: "two" }); expect(slow.res.write).toHaveBeenCalledTimes(writes);
    slow.req.emit("close");
  });
  it.each(["EADDRINUSE", "EACCES"])("reports terminal port bind failure %s", async code => {
    server.stop(); mocks.errors = code === "EADDRINUSE" ? Array(11).fill(code) : [code]; server = new PreviewApiServer(engine, root, 5500);
    await expect(server.start()).rejects.toMatchObject({ code, port: code === "EADDRINUSE" ? 5510 : 5500 });
  });
  it("retries an occupied port and tolerates unavailable address metadata", async () => {
    server.stop(); mocks.errors = ["EADDRINUSE"]; mocks.address = null; server = new PreviewApiServer(engine, root, 5500);
    expect(await server.start()).toBe(5501); expect(mocks.server.listen).toHaveBeenCalledTimes(2);
  });

});
