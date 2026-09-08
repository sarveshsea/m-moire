import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudioRuntimeServer } from "../server.js";
import { defaultStudioConfig, saveStudioConfig } from "../config.js";
let root: string;
let baseUrl: string;
let server: StudioRuntimeServer;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-server-release-"));
  const config = defaultStudioConfig(root);
  await saveStudioConfig(root, { ...config, enabledTools: { ...config.enabledTools, browser: false, figma: false, shell: false } });
  server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
  baseUrl = (await server.start()).url;
});
afterAll(async () => { await server?.stop(); if (root) await rm(root, { recursive: true, force: true }); });
async function request(path: string, method = "GET", body?: unknown) {
  return fetch(`${baseUrl}${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
}

describe("Studio HTTP resource and validation boundaries", () => {
  it.each([
    "/api/tools/calls/missing", "/api/automations/missing", "/api/attachments/missing", "/api/artifacts/missing",
    "/api/design-system/assets?path=missing.png", "/api/knowledge/missing", "/api/project-memory/missing",
    "/api/downloads/missing", "/api/design-audit/latest", "/api/not-a-route",
  ])("returns explicit not found for %s", async (path) => {
    const response = await request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
  it.each(["/api/browser/session", "/api/browser/action"])("rejects disabled browser endpoint %s", async (path) => {
    const response = await request(path, "POST", {});
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("disabled") });
  });
  it.each([
    ["/api/agents/kits?target=unsupported", "GET", undefined],
    ["/api/agents/kits/install", "POST", { target: "unsupported", dryRun: true }],
    ["/api/marketplace/notes/fork", "POST", {}],
    ["/api/automations", "POST", { templateId: "missing" }],
  ])("rejects invalid request %s", async (path, method, body) => {
    const response = await request(path, method, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
  it.each([
    ["/api/automations/missing/run", "POST"], ["/api/automations/missing", "PATCH"],
    ["/api/design-changelog/missing/restore", "POST"], ["/api/design-changelog/missing", "PATCH"],
    ["/api/design-changelog/missing", "DELETE"],
  ])("rejects mutation of missing resource %s", async (path, method) => {
    const response = await request(path, method, {});
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
  it("rejects an automation rooted outside allowed workspaces", async () => {
    const response = await request("/api/automations", "POST", { cwd: join(root, "..", "outside"), name: "Outside" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Workspace path is not allowed") });
  });
  it("rejects unknown run history and does not cancel nonexistent sessions", async () => {
    const missing = await request("/api/automations/missing/runs");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "Unknown automation: missing" });
    expect(await (await request("/api/sessions/missing/cancel", "POST", {})).json()).toEqual({ cancelled: false });
    expect(await (await request("/api/automations/missing", "DELETE")).json()).toEqual({ deleted: false });
    expect(await (await request("/api/automations/run-due", "POST", { now: "2026-09-01T00:00:00Z" })).json()).toEqual({ runs: [] });
  });
  it("persists successful and approval-required tool call receipts for retrieval", async () => {
    const path = join(root, "evidence.md"); await writeFile(path, "Evidence");
    const read = await request("/api/tools/call", "POST", { id: "read-proof", toolId: "workspace.read", input: { path } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ call: { id: "read-proof", status: "completed", data: { content: "Evidence" } } });
    expect(await (await request("/api/tools/calls/read-proof")).json()).toMatchObject({ call: { toolId: "workspace.read" } });
    const write = await request("/api/tools/call", "POST", { id: "write-proof", toolId: "workspace.write", input: { path, content: "Changed" } });
    expect(write.status).toBe(200);
    expect(await write.json()).toMatchObject({ call: { status: "approval_required", approval: { required: true } } });
  });
  it("preserves disabled-tool failures as retrievable receipts", async () => {
    const response = await request("/api/tools/call", "POST", { id: "disabled-proof", toolId: "shell.run", input: { command: "pwd" } });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toMatchObject({ call: { status: "failed", error: expect.stringContaining("disabled") } });
    expect(await (await request("/api/tools/calls/disabled-proof")).json()).toMatchObject({ call: { status: "failed" } });
  });
});
