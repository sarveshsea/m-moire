import { EventEmitter } from 'node:events';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildPreparedToolEnvironment, createClaudeWorkflowAdapter, createCodexWorkflowAdapter, createToolCallBudgetMonitor, parseClaudeOAuthCredential, parseClaudeStreamJson } from '../workflow-adapters.js';
const fx = vi.hoisted(() => ({ spawn: vi.fn(), run: undefined as undefined | ((child: any) => void) }));
vi.mock('node:child_process', () => ({ spawn: fx.spawn }));
let root: string;
function lines(...events: unknown[]) { return events.map(event => JSON.stringify(event)).join('\n') + '\n'; }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-adapter-coverage-'));
  await writeFile(join(root, 'auth.json'), '{}');
  await writeFile(join(root, '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'synthetic-fixture-token', expiresAt: Date.now() + 60000 } }));
  fx.run = child => { child.stdout.emit('data', lines({ type: 'result', result: 'complete', usage: { input_tokens: 2, output_tokens: 1 } })); child.emit('close', 0); };
  fx.spawn.mockReset().mockImplementation(() => {
    const child: any = new EventEmitter(); child.exitCode = null; child.signalCode = null;
    child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() }); child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
    child.stdin = { end: vi.fn(() => queueMicrotask(() => fx.run!(child))) };
    child.kill = vi.fn(() => { queueMicrotask(() => { child.signalCode = 'SIGTERM'; child.emit('close', null); }); return true; });
    return child;
  });
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
const options = () => ({ executable: 'synthetic-provider', modelId: 'fixture-model', reasoningEffort: 'low', authHome: root });
const input = () => ({ workspaceRoot: root, prompt: 'Synthetic task', timeoutMs: 2000 });
describe('workflow adapter parsing and bounded process accounting', () => {
  it('selects explicit or platform-specific browser caches without mutating caller environment', () => {
    const base = { PATH: 'synthetic', PLAYWRIGHT_BROWSERS_PATH: '/explicit-cache' }; expect(buildPreparedToolEnvironment(base, '/isolated')).toMatchObject({ HOME: '/isolated', PLAYWRIGHT_BROWSERS_PATH: '/explicit-cache' }); expect(base).not.toHaveProperty('HOME');
    expect(buildPreparedToolEnvironment({}, '/isolated', '/host', 'linux').PLAYWRIGHT_BROWSERS_PATH).toBe(join('/host', '.cache', 'ms-playwright'));
    expect(buildPreparedToolEnvironment({}, '/isolated', '/host', 'win32').PLAYWRIGHT_BROWSERS_PATH).toBe(join('/host', 'AppData', 'Local', 'ms-playwright'));
    expect(buildPreparedToolEnvironment({ LOCALAPPDATA: '/local' }, '/isolated', '/host', 'win32').PLAYWRIGHT_BROWSERS_PATH).toBe(join('/local', 'ms-playwright'));
  });
  it.each(['broken', '{}', 'null', '[]', '{"claudeAiOauth":[]}', '{"claudeAiOauth":{"accessToken":12}}', '{"claudeAiOauth":{"accessToken":"x","expiresAt":0}}'])('rejects unusable OAuth envelope %s', value => {
    expect(parseClaudeOAuthCredential(value, 1)).toBeNull();
  });
  it('ignores invalid JSON lines, normalizes incomplete message blocks and retains explicit provider errors', () => {
    const result = parseClaudeStreamJson('broken\n\n' + lines({ type: 'assistant', message: { content: [null, {}, { type: 'tool_use' }] } }, { type: 'user', message: {} }, { type: 'assistant' }, { type: 'result', result: 'first', is_error: true, usage: { input_tokens: 'bad', cache_read_input_tokens: 4, output_tokens: null } }, { type: 'result', result: 3, is_error: true, subtype: 'later', usage: {} }));
    expect(result).toMatchObject({ finalResponse: 'first', failed: true, failure: 'provider-error', usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, estimatedCostUsd: null }, tools: { calls: 1 } }); expect(Object.isFrozen(result.tools)).toBe(true);
  });
  it('deduplicates tool calls and counts mixed output blocks and all token budget dimensions', () => {
    const monitor = createToolCallBudgetMonitor({ maximumToolCalls: 1, maximumToolOutputBytes: 2, maximumInputTokens: 3, maximumOutputTokens: 3, maximumReasoningTokens: 3 });
    const payload = lines({ type: 'item.started', item: { type: 'command_execution', id: 'one' } }, { type: 'item.started', item: { type: 'command_execution', id: 'one' } }, { type: 'assistant', message: { content: [null, { type: 'tool_use', id: 'two' }, { type: 'tool_use' }] } }, { type: 'user', message: { content: [{ type: 'tool_result', content: ['a', { text: 'bc' }, null, {}] }, { type: 'text' }] } }, { type: 'result', usage: { input_tokens: 4, output_tokens: 5, reasoning_output_tokens: 6 } });
    expect(monitor.ingest(payload.slice(0, 5))).toBe(false); expect(monitor.ingest(payload.slice(5))).toBe(true);
    expect(monitor.snapshot()).toMatchObject({ observedToolCalls: 2, observedToolOutputBytes: 3, exceeded: true, exceededDimensions: ['max-tool-calls', 'max-tool-output-bytes', 'max-input-tokens', 'max-output-tokens', 'max-reasoning-tokens'] });
    expect(monitor.finish()).toBe(true);
  });
  it('flushes a final unterminated event and ignores irrelevant or malformed budget messages', () => {
    const monitor = createToolCallBudgetMonitor(0);
    monitor.ingest('broken\n\n' + lines(null, [], {}, { type: 'user', message: { content: [{ type: 'tool_result', text: 'fallback' }, { type: 'tool_result', result: 'result' }, { type: 'tool_result', content: 7 }] } }, { type: 'other', usage: { input_tokens: 999 } }, { type: 'result', usage: [] }));
    expect(monitor.snapshot()).toMatchObject({ observedToolCalls: 0, observedToolOutputBytes: 14, exceeded: false });
    monitor.ingest(JSON.stringify({ type: 'item.started', item: { type: 'command_execution', id: 'last' } })); expect(monitor.finish()).toBe(true); expect(monitor.finish()).toBe(true);
  });
  it.each(['codex', 'claude'])('runs %s with private temporary auth and removes it after completion', async provider => {
    const adapter = provider === 'codex' ? createCodexWorkflowAdapter(options()) : createClaudeWorkflowAdapter(options());
    const result = await adapter.execute(input()); expect(result.exitCode).toBe(0); expect(Object.isFrozen(result)).toBe(true);
    const child = fx.spawn.mock.results[0].value; expect(child.stdin.end).toHaveBeenCalledWith('Synthetic task');
    const env = fx.spawn.mock.calls[0][2].env; expect(env.HOME).not.toBe(root); await expect(access(env.HOME)).rejects.toThrow();
    if (provider === 'claude') expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeTruthy();
  });
  it('converts a provider error at exit zero to failure and preserves nonzero process exits', async () => {
    fx.run = child => { child.stdout.emit('data', lines({ type: 'result', is_error: true, subtype: 'invalid-request' })); child.emit('close', 0); };
    expect((await createClaudeWorkflowAdapter(options()).execute(input())).exitCode).toBe(1);
    fx.run = child => { child.stderr.emit('data', 'provider stderr'); child.emit('close', 7); };
    expect(await createClaudeWorkflowAdapter(options()).execute(input())).toMatchObject({ exitCode: 7, stderr: 'provider stderr' });
    fx.run = child => child.emit('close', null); expect((await createCodexWorkflowAdapter(options()).execute(input())).exitCode).toBe(1);
  });
  it('fails closed on process errors and removes isolated auth', async () => {
    fx.run = child => child.emit('error', new Error('spawn unavailable'));
    await expect(createCodexWorkflowAdapter(options()).execute(input())).rejects.toThrow('spawn unavailable');
    await expect(access(fx.spawn.mock.calls[0][2].env.HOME)).rejects.toThrow();
  });
  it('terminates timed out processes with an explicit failure receipt', async () => {
    fx.run = () => {};
    const result = await createClaudeWorkflowAdapter(options()).execute({ ...input(), timeoutMs: 1 });
    expect(result).toMatchObject({ exitCode: 1, stderr: 'timeout-exhausted:1ms' }); expect(fx.spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGTERM');
  });
  it('counts final output-budget breach before returning process success', async () => {
    fx.run = child => { child.stdout.emit('data', JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', aggregated_output: 'abcdef' } })); child.emit('close', 0); };
    const result = await createCodexWorkflowAdapter(options()).execute({ ...input(), maximumToolOutputBytes: 2 }); expect(result).toMatchObject({ exitCode: 1, tools: { outputBytes: 6, errors: 1 }, stderr: 'budget-exhausted:max-tool-output-bytes' });
  });
  it('skips JSON primitives in provider logs while retaining the next valid result', () => {
    expect(parseClaudeStreamJson(lines(null, true, 42, [], { type: 'result', result: 'valid result', usage: {} }))).toMatchObject({ finalResponse: 'valid result', failed: false });
  });

});
