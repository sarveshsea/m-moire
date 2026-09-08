import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AnthropicClient, getAI, hasAI, getTracker } from '../client.js';
import { configureExecutionPolicy, resetExecutionPolicyForTests } from '../../security/execution-policy.js';
const fx = vi.hoisted(() => ({ config: null as any }));
vi.mock('../../engine/logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
vi.mock('../provider-config.js', () => ({ resolveAIProviderConfig: () => fx.config }));
vi.mock('../openai-compatible.js', () => ({ OpenAICompatibleClient: class { tracker = { provider: 'openai-compatible' }; constructor(readonly config: unknown) {} } }));
let create: ReturnType<typeof vi.fn>, stream: ReturnType<typeof vi.fn>, loader: ReturnType<typeof vi.fn>, client: AnthropicClient;
const options = { messages: [{ role: 'user' as const, content: 'Prompt' }] };
function response(content = 'Answer', stop: string | null = 'end_turn') { return { content: [{ type: 'text', text: content }, { type: 'tool_use', name: 'ignored' }], usage: { input_tokens: 5, output_tokens: 3 }, stop_reason: stop }; }
beforeEach(() => {
  configureExecutionPolicy({ projectRoot: process.cwd(), profile: 'connected', allow: ['host-integration-code'] });
  fx.config = null; getAI(); create = vi.fn().mockResolvedValue(response()); stream = vi.fn();
  loader = vi.fn(async () => ({ default: class { messages = { create, stream }; } }));
  client = new AnthropicClient('synthetic-test-key', undefined, loader as never);
});
afterEach(() => { fx.config = null; getAI(); resetExecutionPolicyForTests(); vi.restoreAllMocks(); });
describe('Anthropic client real completion and provider lifecycle', () => {
  it('serializes prompts and records successful usage once while caching the SDK', async () => {
    const first = await client.complete({ ...options, system: 'Short system', temperature: 0, maxTokens: 20 });
    expect(first).toMatchObject({ content: 'Answer', provider: 'anthropic', usage: { inputTokens: 5, outputTokens: 3 }, stopReason: 'end_turn' });
    expect(create.mock.calls[0][0]).toMatchObject({ system: 'Short system', temperature: 0, max_tokens: 20 });
    create.mockResolvedValueOnce(response('Long prompt', null)); await client.complete({ ...options, system: 'x'.repeat(4096), model: 'deep' });
    expect(create.mock.calls[1][0].system[0]).toMatchObject({ type: 'text', cache_control: { type: 'ephemeral' } });
    await client.complete(options); expect(create.mock.calls[2][0].system).toBeUndefined();
    expect(loader).toHaveBeenCalledOnce(); expect(client.tracker.callCount).toBe(3);
  });
  it('rechecks the integration grant after the SDK has been loaded', async () => {
    await client.complete(options); configureExecutionPolicy({ projectRoot: process.cwd() });
    await expect(client.complete(options)).rejects.toThrow('denied host-integration-code'); expect(create).toHaveBeenCalledOnce();
  });
  it.each([new Error('not installed'), 'not installed'])('reports an unavailable optional SDK without making a model call', async failure => {
    loader.mockRejectedValueOnce(failure); await expect(client.complete(options)).rejects.toThrow('MEMI_OPTIONAL_INTEGRATION_MISSING'); expect(create).not.toHaveBeenCalled();
  });
  it('does not retry client failures or count failed calls as successful usage', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { status: 401 }));
    await expect(client.complete(options)).rejects.toThrow('Unauthorized'); expect(create).toHaveBeenCalledOnce(); expect(client.tracker.callCount).toBe(0);
  });
  it('retries transient failures with bounded backoff and returns the last error on exhaustion', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => { callback(); return 1; }) as never);
    create.mockRejectedValueOnce(Object.assign(new Error('server'), { status: 503 })).mockRejectedValueOnce('transport');
    expect((await client.complete(options)).content).toBe('Answer'); expect(timer.mock.calls.map(call => call[1])).toEqual([1000, 2000]);
    create.mockRejectedValue('exhausted'); await expect(client.complete(options)).rejects.toThrow('exhausted'); expect(create).toHaveBeenCalledTimes(6); expect(client.tracker.callCount).toBe(1);
  });
  it.each(['{"ok":true}', '```json\n{"ok":true}\n```', 'Result: {"ok":true}'])('extracts valid JSON from %s', async content => {
    create.mockResolvedValueOnce(response(content)); expect(await client.completeJSON({ ...options, schema: z.object({ ok: z.boolean() }) })).toEqual({ ok: true });
  });
  it('requests one JSON correction then enforces the supplied schema', async () => {
    create.mockResolvedValueOnce(response('not json')).mockResolvedValueOnce(response('[1,2]'));
    expect(await client.completeJSON(options)).toEqual([1, 2]); expect(create.mock.calls[1][0].messages).toHaveLength(3);
    create.mockResolvedValueOnce(response('{"ok":"wrong"}')); await expect(client.completeJSON({ ...options, schema: z.object({ ok: z.boolean() }) })).rejects.toThrow();
    create.mockResolvedValueOnce(response('invalid')).mockResolvedValueOnce(response('still invalid')); await expect(client.completeJSON(options)).rejects.toThrow('Could not extract JSON');
  });
  it('sends vision content once and makes parse correction text-only', async () => {
    create.mockResolvedValueOnce(response('not JSON')).mockResolvedValueOnce(response('{"ok":true}'));
    expect(await client.visionJSON({ system: '', prompt: 'Inspect', imageBase64: 'image-marker', schema: z.object({ ok: z.boolean() }) })).toEqual({ ok: true });
    expect(create.mock.calls[0][0].messages[0].content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'image-marker' } }, { type: 'text', text: 'Inspect' }]);
    expect(JSON.stringify(create.mock.calls[1][0])).not.toContain('image-marker');
    create.mockResolvedValueOnce(response('{"ok":true}')); expect(await client.visionJSON({ system: 'System', prompt: 'Inspect', imageBase64: 'image', mediaType: 'image/jpeg', model: 'fast' })).toEqual({ ok: true });
  });
  it('streams only text deltas and records final usage and stop reason', async () => {
    stream.mockImplementation(() => ({
      async *[Symbol.asyncIterator]() { yield { type: 'message_start' }; yield { type: 'content_block_delta', delta: { type: 'thinking_delta' } }; yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First' } }; yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' second' } }; },
      finalMessage: async () => response('', null),
    }));
    const iterator = client.stream(options); expect(await iterator.next()).toEqual({ done: false, value: 'First' }); expect(await iterator.next()).toEqual({ done: false, value: ' second' });
    expect(await iterator.next()).toMatchObject({ done: true, value: { content: 'First second', stopReason: 'end_turn', usage: { inputTokens: 5, outputTokens: 3 } } });
    const second = client.stream({ ...options, system: 'cached', model: 'deep', maxTokens: 5, temperature: 0 }); while (!(await second.next()).done) { /* drain */ }
    expect(stream.mock.calls[1][0]).toMatchObject({ max_tokens: 5, temperature: 0 }); expect(client.tracker.callCount).toBe(2);
  });
  it('selects and refreshes provider instances when credentials or model configuration changes', () => {
    expect(hasAI()).toBe(false); expect(getAI()).toBeNull(); expect(getTracker()).toBeNull();
    fx.config = { provider: 'anthropic', apiKey: 'synthetic-one', models: { fast: 'custom-fast', deep: 'custom-deep' } };
    expect(hasAI()).toBe(true); const first = getAI(); expect(first).toBeInstanceOf(AnthropicClient); expect(getAI()).toBe(first); expect(getTracker()).toBe(first!.tracker);
    fx.config = { ...fx.config, apiKey: 'synthetic-two' }; expect(getAI()).not.toBe(first);
    fx.config = { provider: 'openai-compatible', models: { fast: 'local', deep: 'local' }, baseUrl: 'http://localhost:1234' }; const other = getAI(); expect(getAI()).toBe(other);
    fx.config = null; expect(getAI()).toBeNull(); expect(getTracker()).toBeNull();
  });
});
