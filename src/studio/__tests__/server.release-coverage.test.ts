import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { StudioRuntimeServer } from "../server.js";
import { defaultStudioConfig, saveStudioConfig } from "../config.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
let root: string;
let baseUrl: string;
let server: StudioRuntimeServer;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "memi-server-release-"));
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  const config = defaultStudioConfig(root);
  await saveStudioConfig(root, { ...config, enabledTools: { ...config.enabledTools, browser: false, figma: false, shell: false } });
  server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
  baseUrl = (await server.start()).url;
});
afterAll(async () => { resetExecutionPolicyForTests(); await server?.stop(); if (root) await rm(root, { recursive: true, force: true }); });
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

describe('Studio HTTP persistence roundtrips', () => {
  it('roundtrips UTF-8 attachments as metadata and exact raw bytes', async () => {
    const response = await request('/api/attachments/capture', 'POST', { kind: 'text', name: 'notes.txt', mimeType: 'text/plain', source: 'paste', text: 'Research résumé' });
    expect(response.status).toBe(200);
    const { attachment } = await response.json();
    expect(attachment.size).toBe(Buffer.byteLength('Research résumé'));
    expect(await (await request(`/api/attachments/${attachment.id}`)).json()).toMatchObject({ attachment: { text: 'Research résumé' } });
    const raw = await request(`/api/attachments/${attachment.id}?raw=1`);
    expect(raw.headers.get('content-type')).toBe('text/plain');
    expect(await raw.text()).toBe('Research résumé');
  });
  it('preserves image bytes and generates the matching raw preview URL', async () => {
    const { attachment } = await (await request('/api/attachments/capture', 'POST', { kind: 'image', name: 'proof.png', mimeType: 'image/png', source: 'paste', dataUrl: 'data:image/png;base64,AQID' })).json();
    expect(attachment.previewUrl).toBe(`/api/attachments/${attachment.id}?raw=1`);
    expect([...new Uint8Array(await (await request(attachment.previewUrl)).arrayBuffer())]).toEqual([1, 2, 3]);
  });
  it('creates, edits, archives and restores an auditable changelog entry', async () => {
    const response = await request('/api/design-changelog', 'POST', { title: 'Navigation decision', summary: 'Document hierarchy', bodyMarkdown: 'Evidence from the local fixture' });
    expect(response.status).toBe(200);
    const { entry } = await response.json();
    expect(await (await request(`/api/design-changelog/${entry.id}`, 'PATCH', { title: 'Updated decision' })).json()).toMatchObject({ entry: { title: 'Updated decision' } });
    expect(await (await request(`/api/design-changelog/${entry.id}`, 'DELETE')).json()).toMatchObject({ entry: { status: 'archived' } });
    expect(await (await request(`/api/design-changelog/${entry.id}/restore`, 'POST', {})).json()).toMatchObject({ entry: { status: 'active' } });
    const markdown = await request('/api/design-changelog?format=markdown');
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(await markdown.text()).toContain('Updated decision');
  });
  it('does not invent changelog evidence for an empty capture', async () => {
    expect(await (await request('/api/design-changelog/capture', 'POST', {})).json()).toMatchObject({ captured: false, entry: null });
  });
  it('creates, updates and deletes an inactive automation without running it', async () => {
    const response = await request('/api/automations', 'POST', { name: 'Fixture review', prompt: 'Review fixture', cwd: root, enabled: false });
    expect(response.status).toBe(201);
    const { automation } = await response.json();
    expect(await (await request(`/api/automations/${automation.id}`)).json()).toMatchObject({ automation: { name: 'Fixture review' } });
    const patched = await request(`/api/automations/${automation.id}`, 'PATCH', { name: 'Revised review' });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ automation: { name: 'Revised review' } });
    expect(await (await request(`/api/automations/${automation.id}/runs`)).json()).toEqual({ runs: [] });
    expect(await (await request(`/api/automations/${automation.id}`, 'DELETE')).json()).toEqual({ deleted: true });
    expect((await request(`/api/automations/${automation.id}`)).status).toBe(404);
  });
  it('rejects workspace listing outside configured roots', async () => {
    const response = await request(`/api/workspace?path=${encodeURIComponent(join(root, '..'))}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('not allowed') });
  });
  it('rejects a session outside configured roots before starting any harness', async () => {
    const response = await request('/api/sessions', 'POST', { cwd: join(root, '..'), prompt: 'Should never run' });
    expect(response.status).toBe(403);
    expect(await (await request('/api/sessions')).json()).toEqual({ sessions: [] });
  });
  it('sets preflight response without executing the endpoint', async () => {
    const response = await request('/api/sessions', 'OPTIONS');
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });
  it.each(['/api/logs/missing', '/api/sessions/missing/trace', '/api/sessions/missing/events?limit=2', '/api/sessions/missing/events?limit=invalid'])('reports absent persisted session data at %s', async path => {
    const response = await request(path); expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('Unknown') });
  });
  it('captures a local markdown corpus and returns its persisted status', async () => {
    const response = await request('/api/markdown-corpus/setup', 'POST', { catalog: [{ owner: 'fixture', repo: 'metadata', license: 'MIT', policy: 'metadata-only' }] });
    expect(response.status).toBe(200);
    const status = await response.json(); expect(status).toMatchObject({ status: 'ready', repos: [{ files: 0 }] });
    expect(await (await request('/api/markdown-corpus/status')).json()).toEqual(status);
  });
  it('analyzes inline markdown as a real flow candidate', async () => {
    const response = await request('/api/markdown-corpus/analyze', 'POST', { source: '# Checkout\n- Review cart\n- Confirm purchase' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ candidates: [{ kind: 'checklist-to-flow', cleanSource: expect.stringContaining('Confirm purchase') }] });
  });
  it('rejects knowledge captures lacking an event', async () => {
    const response = await request('/api/knowledge/capture', 'POST', {}); expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Knowledge capture requires an event' });
  });
  it('returns malformed request failures without closing the server', async () => {
    const response = await fetch(`${baseUrl}/api/attachments/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
    expect((await request('/api/config')).status).toBe(200);
  });
});


describe('Studio attachment session path boundary', () => {
  it('rejects traversal session IDs before writing outside the attachments directory', async () => {
    const response = await request('/api/attachments/capture', 'POST', { kind: 'text', name: 'proof.txt', mimeType: 'text/plain', source: 'paste', text: 'Bounded fixture evidence', sessionId: '../../../escaped-attachments' });
    expect(response.status).toBe(400);
    await expect(readdir(join(root, 'escaped-attachments'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});


describe('Studio local knowledge and configuration integration', () => {
  it('persists captured knowledge and returns it by its encoded identifier', async () => {
    const response = await request('/api/knowledge/capture', 'POST', { event: { id: 'research-event-fixture', sessionId: 'local-session', type: 'research_note', timestamp: '2026-09-01T00:00:00Z', message: 'Participants found settings hard to discover', data: { source: 'Fixture interview' } } });
    expect(response.status).toBe(200);
    const { item } = await response.json();
    expect(item.kind).toBe('agent-capture');
    expect(await (await request(`/api/knowledge/${encodeURIComponent(item.id)}`)).json()).toMatchObject({ item: { id: item.id } });
    const index = await (await request('/api/knowledge?compact=1&includeGenerated=1')).json();
    expect(index.items.some((candidate: { id: string }) => candidate.id === item.id)).toBe(true);
    expect((await request('/api/knowledge/refresh', 'POST', {})).status).toBe(200);
  });
  it('refuses to turn ordinary stdout into captured research evidence', async () => {
    const response = await request('/api/knowledge/capture', 'POST', { event: { type: 'stdout', message: 'Hello' } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('cannot be captured') });
  });
  it('updates persisted configuration while retaining disabled execution tools', async () => {
    const { config } = await (await request('/api/config')).json();
    const response = await request('/api/config', 'PUT', { ...config, defaultHarness: 'codex' });
    expect(response.status).toBe(200);
    const reread = await (await request('/api/config')).json();
    expect(reread.config).toMatchObject({ defaultHarness: 'codex', enabledTools: { shell: false, browser: false, figma: false } });
  });
  it('lists workspace files while withholding dependency and git internals', async () => {
    await mkdir(join(root, '.git'), { recursive: true });
    await mkdir(join(root, 'node_modules'), { recursive: true });
    await writeFile(join(root, 'visible.txt'), 'Exact local content');
    const directory = await (await request(`/api/workspace?path=${encodeURIComponent(root)}`)).json();
    expect(directory.type).toBe('directory');
    expect(directory.entries.map((entry: { name: string }) => entry.name)).toContain('visible.txt');
    expect(directory.entries.map((entry: { name: string }) => entry.name)).not.toContain('node_modules');
    expect(directory.entries.map((entry: { name: string }) => entry.name)).not.toContain('.git');
    expect(await (await request(`/api/workspace?path=${encodeURIComponent(join(root, 'visible.txt'))}`)).json()).toMatchObject({ type: 'file', content: 'Exact local content' });
  });
  it('returns a local memory index and supports refresh without a live session', async () => {
    const refreshed = await request('/api/project-memory/refresh', 'POST', {});
    expect(refreshed.status).toBe(200);
    const index = await refreshed.json();
    expect(Array.isArray(index.items)).toBe(true);
    expect((await request('/api/project-memory')).status).toBe(200);
  });
  it('does not start remote downloads for the local marketplace listing', async () => {
    const response = await request('/api/marketplace/notes');
    expect(response.status).toBe(200);
    expect(Array.isArray((await response.json()).notes)).toBe(true);
    expect(await (await request('/api/downloads')).json()).toEqual({ downloads: [] });
  });
  it.each([
    ['/api/marketplace/notes/remove', 'POST', {}],
    ['/api/marketplace/notes/forks/missing/files', 'PUT', { path: '../escape.md', content: 'Rejected' }],
    ['/api/artifacts/missing/sections/missing/review', 'PATCH', { reviewState: 'accepted' }],
  ])('preserves failure details for invalid local mutation %s', async (path, method, body) => {
    const response = await request(path, method, body);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
  it('rejects nonexistent markdown paths without returning source content', async () => {
    const response = await request('/api/markdown-corpus/analyze', 'POST', { sourcePath: join(root, 'not-there.md') });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
});


describe('Studio descriptor-contained source routes', () => {
  it('does not read a workspace file symlink that points outside its configured root', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'memi-outside-read-'));
    try {
      await writeFile(join(outside, 'secret.md'), 'External fixture sentinel');
      await symlink(join(outside, 'secret.md'), join(root, 'external-source.md'));
      const response = await request(`/api/workspace?path=${encodeURIComponent(join(root, 'external-source.md'))}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('External fixture sentinel');
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it.each(['/api/markdown-corpus/analyze', '/api/markdown-corpus/sync-to-figjam'])('rejects external sourcePath for %s before reading its content', async endpoint => {
    const outside = await mkdtemp(join(tmpdir(), 'memi-outside-markdown-'));
    try {
      const path = join(outside, 'secret.md'); await writeFile(path, 'External fixture sentinel');
      const response = await request(endpoint, 'POST', { sourcePath: path });
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('External fixture sentinel');
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it('prevents active HTML attachment content from executing in the Studio origin', async () => {
    const captured = await (await request('/api/attachments/capture', 'POST', { kind: 'text', name: 'page.html', mimeType: 'text/html', source: 'paste', text: '<script>alert(1)</script>' })).json();
    const response = await request(`/api/attachments/${captured.attachment.id}?raw=1`);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toContain('attachment');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});


describe('Studio attachment consumption-time checks', () => {
  it('rejects an indexed attachment replaced by an external symlink before raw retrieval', async () => {
    const { attachment } = await (await request('/api/attachments/capture', 'POST', { kind: 'text', name: 'race.txt', mimeType: 'text/plain', source: 'paste', text: 'Original fixture' })).json();
    const outside = await mkdtemp(join(tmpdir(), 'memi-attachment-raw-'));
    try {
      await writeFile(join(outside, 'secret.txt'), 'External raw sentinel');
      await rm(attachment.path);
      await symlink(join(outside, 'secret.txt'), attachment.path);
      const response = await request(`/api/attachments/${attachment.id}?raw=1`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('External raw sentinel');
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it('still analyzes an authorized local markdown file after containment hardening', async () => {
    const path = join(root, 'permitted-analysis.md'); await writeFile(path, '# Local evidence\n- Start\n- Complete');
    const response = await request('/api/markdown-corpus/analyze', 'POST', { sourcePath: path });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ candidates: [{ kind: 'checklist-to-flow' }] });
  });
});

describe('Studio persisted session HTTP replay', () => {
  it('reopens stored sessions with bounded events, trace and redacted metadata', async () => {
    const historyRoot = await mkdtemp(join(tmpdir(), 'memi-server-history-'));
    const historyServer = new StudioRuntimeServer({ projectRoot: historyRoot, port: 0 });
    try {
      const { StudioSessionStore } = await import('../session-store.js');
      const store = new StudioSessionStore(historyRoot); store.init();
      const timestamp = '2026-09-01T00:00:00Z';
      const session = { id: 'replayed-session', harness: 'codex' as const, action: 'raw' as const, cwd: historyRoot, prompt: 'Private fixture prompt', status: 'completed' as const, startedAt: timestamp, completedAt: timestamp, exitCode: 0, activeStreamId: null, pendingPrompt: null, events: [] };
      store.appendEvent(session, { id: 'reasoning-event', sessionId: session.id, type: 'reasoning', timestamp, message: 'Private reasoning fixture' });
      store.appendEvent(session, { id: 'done-event', sessionId: session.id, type: 'session_done', timestamp, message: 'Session completed' });
      const { url } = await historyServer.start();
      const list = await (await fetch(`${url}/api/sessions`)).json();
      expect(list.sessions).toEqual([expect.objectContaining({ id: session.id, source: 'persisted', prompt: '[content omitted]' })]);
      const events = await (await fetch(`${url}/api/sessions/${session.id}/events?limit=1`)).json();
      expect(events.events).toHaveLength(1); expect(events.events[0].type).toBe('session_done');
      const log = await (await fetch(`${url}/api/logs/${session.id}?limit=invalid`)).json();
      expect(log.events).toHaveLength(2);
      expect(JSON.stringify(log)).not.toContain('Private reasoning fixture');
      const trace = await (await fetch(`${url}/api/sessions/${session.id}/trace`)).json();
      expect(trace.session).toMatchObject({ id: session.id, source: 'persisted' });
      expect(trace.trace).toBeTruthy();
      const status = await (await fetch(`${url}/api/status`)).json();
      expect(status.metrics).toMatchObject({ indexedSessions: 1, activeProcesses: 0 });
    } finally { await historyServer.stop(); await rm(historyRoot, { recursive: true, force: true }); }
  });
});

describe('Studio attachment request budget', () => {
  it('returns a readable 413 response for oversized JSON before persisting its attachment', async () => {
    const response = await request('/api/attachments/capture', 'POST', { kind: 'text', name: 'too-large.txt', source: 'paste', mimeType: 'text/plain', text: 'Small source', padding: 'x'.repeat(12_000_001) });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('byte limit') });
    expect((await request('/api/config')).status).toBe(200);
  });
});
