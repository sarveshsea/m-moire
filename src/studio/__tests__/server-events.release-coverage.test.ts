import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioRuntimeServer } from '../server.js';
import { defaultStudioConfig, saveStudioConfig } from '../config.js';
import { MemoryTelemetrySink } from '../tracing/opentelemetry.js';
import { spawnPortable } from '../../utils/subprocess.js';
import type { StudioHarnessId } from '../types.js';
vi.mock('../../utils/subprocess.js', async original => ({ ...await original<typeof import('../../utils/subprocess.js')>(), spawnPortable: vi.fn() }));
vi.mock('../harnesses.js', async original => ({
  ...await original<typeof import('../harnesses.js')>(),
  listHarnesses: vi.fn(async () => []),
  buildHarnessCommand: vi.fn((_config, input) => ({ command: 'fixture-process', args: [], cwd: input.cwd, action: input.action, harness: input.harnessId, outputParser: input.harnessId === 'claude-code' ? 'claude-stream-json' : 'memoire-jsonl' })),
}));
class FixtureChild extends EventEmitter {
  stdin = new PassThrough(); stdout = new PassThrough(); stderr = new PassThrough();
  exitCode: number | null = null; signalCode: string | null = null;
  kill = vi.fn((signal: string) => { this.signalCode = signal; queueMicrotask(() => this.emit('close', null)); return true; });
  output(type: string, data?: unknown, message = type) { this.stdout.emit('data', Buffer.from(`${JSON.stringify({ type, message, data })}\n`)); }
  close(code = 0) { this.exitCode = code; this.emit('close', code); }
}
let root: string; let url: string; let server: StudioRuntimeServer; let children: FixtureChild[]; let telemetry: MemoryTelemetrySink;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-server-events-')); children = []; telemetry = new MemoryTelemetrySink();
  vi.mocked(spawnPortable).mockImplementation(() => { const child = new FixtureChild(); children.push(child); return child as never; });
  const config = defaultStudioConfig(root); await saveStudioConfig(root, config);
  server = new StudioRuntimeServer({ projectRoot: root, port: 0, telemetrySink: telemetry }); url = (await server.start()).url;
});
afterEach(async () => {
  await server.stop();
  // Allow transient Windows directory locks to clear after the server stops.
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  vi.clearAllMocks();
});
async function start(extra: Record<string, unknown> = {}) {
  const response = await fetch(`${url}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ harness: 'codex', cwd: root, prompt: 'Review the fixture', ...extra }) });
  expect(response.status).toBe(201); return (await response.json()).session;
}
async function api(path: string) { return (await fetch(`${url}${path}`)).json(); }

describe('Studio process-boundary event lifecycle', () => {
  it('pairs tool-call spans, records usage, and completes the session', async () => {
    const session = await start({ model: 'fixture-model', effort: 'high', mode: 'brokered' }); const child = children[0];
    child.output('tool_call', { id: 'paired-tool', name: 'workspace.read', input: { path: 'fixture.md' } });
    child.output('tool_result', { id: 'paired-tool', ok: true, output: 'Fixture result', elapsedMs: 12 });
    child.output('token_usage', { inputTokens: 10, outputTokens: 4, cachedInputTokens: 2, reasoningTokens: 1, estimatedCostUsd: 0.01 });
    child.close();
    expect(server.getSession(session.id)).toMatchObject({ status: 'completed', exitCode: 0 });
    const usage = (await api('/api/usage')).usage;
    expect(usage.totals).toMatchObject({ inputTokens: 10, outputTokens: 4, cachedInputTokens: 2, reasoningTokens: 1, totalTokens: 15, estimatedCostUsd: 0.01 });
    const calls = telemetry.projections.filter(p => p.attributes['memi.event.type'] === 'tool.call.started' || p.attributes['memi.event.type'] === 'tool.call.completed');
    expect(calls).toHaveLength(2); expect(calls[0].spanId).toBe(calls[1].spanId);
    expect(telemetry.projections.some(p => p.attributes['gen_ai.request.model'] === 'fixture-model')).toBe(true);
  });
  it.each([['claude-code', 'anthropic'], ['gemini', 'google'], ['ollama', 'local'], ['shell', 'shell'], ['opencode', 'openai'], ['memoire', 'memoire']] as const)('aggregates %s session usage under its provider', async (harness, provider) => {
    const session = await start({ harness });
    children[0].output('token_usage', { input_tokens: 5, output_tokens: 3, cached_input_tokens: 1, reasoning_tokens: 2, estimated_cost_usd: 0.02 }); children[0].close();
    const usage = (await api('/api/usage')).usage;
    expect(usage.sessions.find((entry: { id: string }) => entry.id === session.id)).toMatchObject({ provider, totals: { inputTokens: 5, outputTokens: 3, totalTokens: 10 } });
    expect(usage.byProvider[provider].totalTokens).toBe(10);
  });
  it('redacts provider reasoning before persisted log retrieval', async () => {
    const session = await start({ harness: 'claude-code' });
    children[0].stdout.emit('data', Buffer.from(`${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Private reasoning fixture' }] } })}\n`));
    children[0].close();
    const log = await api(`/api/logs/${session.id}`);
    expect(log.events.some((event: { type: string }) => event.type === 'reasoning')).toBe(true);
    expect(JSON.stringify(log)).not.toContain('Private reasoning fixture');
  });
  it('ignores nonnumeric usage fields and defaults missing totals to zero', async () => {
    await start(); children[0].output('token_usage', { inputTokens: 'not-a-number', elapsedMs: 'unknown' }); children[0].close();
    expect((await api('/api/usage')).usage.totals).toMatchObject({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
  });
  it('retains independent trace identity for an unmatched tool result', async () => {
    await start(); children[0].output('tool_result', { toolUseId: 'unmatched', ok: false, error: 'Fixture failure', result: null, elapsedMs: 'unknown' }); children[0].close();
    expect(telemetry.projections.filter(p => p.attributes['memi.event.type'] === 'tool.call.completed')).toHaveLength(1);
  });
  it('records a nonzero subprocess exit and stderr without claiming success', async () => {
    const session = await start(); children[0].stderr.emit('data', Buffer.from('Fixture diagnostic')); children[0].close(7);
    expect(server.getSession(session.id)).toMatchObject({ status: 'failed', exitCode: 7 });
    expect((await api(`/api/sessions/${session.id}/events`)).events.some((event: { type: string }) => event.type === 'session_error')).toBe(true);
  });
  it('handles process launch errors once even when followed by close', async () => {
    const session = await start(); children[0].emit('error', new Error('Fixture spawn failure')); children[0].close(1);
    const stored = server.getSession(session.id)!;
    expect(stored.status).toBe('failed');
    expect(stored.events.filter(event => event.type === 'session_error')).toHaveLength(1);
  });
  it('cancels the live child and clears active process accounting', async () => {
    const session = await start();
    const response = await fetch(`${url}/api/sessions/${session.id}/cancel`, { method: 'POST' });
    expect(await response.json()).toEqual({ cancelled: true });
    await vi.waitFor(() => expect(server.getSession(session.id)?.status).toBe('cancelled'));
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
    expect((await api('/api/status')).metrics.activeProcesses).toBe(0);
  });
  it('closes active children during server shutdown', async () => {
    await start(); await server.stop();
    expect(children[0].kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('replays live events to SSE clients and allows the client to disconnect', async () => {
    const session = await start();
    const response = await fetch(`${url}/api/sessions/${session.id}/events`, { headers: { accept: 'text/event-stream' } });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.getReader(); const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: session_started');
    await reader.cancel(); children[0].close();
  });
  it('increments conversation turn indices and retains requested context', async () => {
    const first = await start({ conversationId: 'fixture-conversation', goal: 'Document fixture', model: 'model-one', effort: 'xhigh' }); children[0].close();
    const next = await start({ conversationId: 'fixture-conversation', goal: 'Document fixture', model: 'model-two', effort: 'low' }); children[1].close();
    expect(first.turnIndex).toBe(0); expect(next).toMatchObject({ turnIndex: 1, goal: 'Document fixture', model: 'model-two', effort: 'low' });
  });
  it.each([['Research interviews', 'research'], ['Implement change', 'build'], ['Run terminal command', 'terminal'], ['Imagine a layout', 'ideate']] as const)('chooses the default chat mode for %s', async (prompt, chatMode) => {
    const session = await start({ prompt }); children[0].close(); expect(session.chatMode).toBe(chatMode);
  });
  it('attaches brokered tool-call receipts to the originating session trace', async () => {
    const session = await start(); await writeFile(join(root, 'fixture.md'), 'Fixture evidence');
    const response = await fetch(`${url}/api/tools/call`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'broker-read', sessionId: session.id, toolId: 'workspace.read', input: { path: join(root, 'fixture.md') } }) });
    expect((await response.json()).call.status).toBe('completed');
    expect(server.getSession(session.id)?.events.some(event => event.type === 'tool_result')).toBe(true); children[0].close();
  });
});

async function post(path: string, body: unknown) {
  return fetch(`${url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
describe('Studio HTTP automation and RPC integration', () => {
  it.each([0, 9])('persists automation run outcome for subprocess exit %s', async code => {
    const created = await (await post('/api/automations', { name: 'Fixture automation', prompt: 'Review the fixture', status: 'PAUSED', cwd: root })).json();
    const pending = post(`/api/automations/${created.automation.id}/run`, {});
    await vi.waitFor(() => expect(children).toHaveLength(1)); children[0].close(code);
    const response = await pending; expect(response.status).toBe(200);
    const { run } = await response.json();
    expect(run).toMatchObject({ status: code === 0 ? 'completed' : 'failed', sessionId: expect.any(String), error: code === 0 ? null : 'Session exited with code 9' });
    expect((await api(`/api/automations/${created.automation.id}/runs`)).runs).toEqual([run]);
  });
  it('persists automation launch failure when the child process cannot be created', async () => {
    const { automation } = await (await post('/api/automations', { name: 'Fixture failure', prompt: 'Review fixture', status: 'PAUSED' })).json();
    vi.mocked(spawnPortable).mockImplementationOnce(() => { throw new Error('Fixture launch denied'); });
    expect(await (await post(`/api/automations/${automation.id}/run`, {})).json()).toMatchObject({ run: { status: 'failed', sessionId: null, error: 'Fixture launch denied' } });
  });
  it('rechecks workspace authorization when an edited automation is run', async () => {
    const { automation } = await (await post('/api/automations', { name: 'Fixture scope', prompt: 'Review fixture', status: 'PAUSED' })).json();
    await fetch(`${url}/api/automations/${automation.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd: join(root, '..') }) });
    const response = await post(`/api/automations/${automation.id}/run`, {});
    expect(response.status).toBe(403); expect(children).toHaveLength(0);
  });
  it('replays canonical journal events when RPC receives a legacy Studio session ID', async () => {
    const session = await start(); children[0].output('token_usage', { inputTokens: 7 }); children[0].close();
    await vi.waitFor(async () => {
      const response = await post('/api/rpc', { op: 'replayEvents', requestId: 'replay-fixture', sessionId: session.id });
      const { responses } = await response.json();
      expect(responses.at(-1)).toMatchObject({ kind: 'end', reason: 'replay-complete' });
      expect(responses.some((item: { event?: { type?: string } }) => item.event?.type === 'usage.updated')).toBe(true);
    });
  });
  it.each([null, {}, { op: 'unknown', sessionId: 42 }])('returns structured RPC validation failures for malformed request %#', async body => {
    const response = await post('/api/rpc', body);
    expect(response.status).toBe(200);
    expect((await response.json()).responses).toEqual([expect.objectContaining({ kind: 'error', error: expect.stringContaining('invalid rpc request') })]);
  });
  it.each(['missing', 'ses_missing'])('reports missing RPC harness identity for session %s', async sessionId => {
    const response = await post('/api/rpc', { op: 'dispatchCommand', requestId: 'start-missing', sessionId, command: 'start' });
    expect((await response.json()).responses).toEqual([expect.objectContaining({ kind: 'error', errorTag: 'HarnessConfigError' })]);
  });
  it('does not pretend legacy sessions have a mounted provider driver', async () => {
    const session = await start(); children[0].close();
    const response = await post('/api/rpc', { op: 'dispatchCommand', requestId: 'start-existing', sessionId: session.id, command: 'start' });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('not mounted') });
  });
  it('serves an HTML fallback with the actual runtime address when the desktop bundle is absent', async () => {
    const response = await fetch(`${url}/`);
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain(`${url}/api/status`);
  });
});
