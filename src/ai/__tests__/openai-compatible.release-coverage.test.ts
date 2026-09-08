import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAICompatibleClient } from "../openai-compatible.js";
import type { AIProviderConfig } from "../types.js";
const config: AIProviderConfig = { provider: "openai-compatible", baseUrl: "https://example.test/v1", models: { fast: "fast", deep: "deep" }, capabilities: { text: true, vision: true, streaming: true, json: true, tools: false } };
const opts = { system: "", messages: [{ role: "user" as const, content: "Review" }] };
const response = (content: string | null, extra = {}) => new Response(JSON.stringify({ model: "served", choices: [{ message: { content }, ...extra }] }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const streamResponse = (chunks: string[]) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }));
async function consume(client: OpenAICompatibleClient) {
  const chunks: string[] = [];
  const stream = client.stream(opts);
  while (true) { const next = await stream.next(); if (next.done) return { chunks, response: next.value }; chunks.push(next.value); }
}

describe("provider response boundaries", () => {
  it("rejects incompatible constructor configuration", () => {
    expect(() => new OpenAICompatibleClient({ ...config, provider: "anthropic" })).toThrow("Anthropic");
    expect(() => new OpenAICompatibleClient({ ...config, baseUrl: undefined })).toThrow("base URL");
  });
  it("defaults absent usage and includes refusal content without authentication headers", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ model: "served", choices: [{ message: { content: null, refusal: "Cannot comply" } }] })));
    vi.stubGlobal("fetch", fetch);
    const result = await new OpenAICompatibleClient(config).complete(opts);
    expect(result).toMatchObject({ content: "Cannot comply", stopReason: "refusal", usage: { inputTokens: 0, outputTokens: 0 } });
    const init = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(String(init[1].body)).messages).toEqual([{ role: "user", content: "Review" }]);
  });
  it.each([null, ""])("rejects empty model content %j", async (content) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(content)));
    await expect(new OpenAICompatibleClient(config).complete(opts)).rejects.toThrow("neither content nor a refusal");
  });
  it("rejects an absent HTTP body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null)));
    await expect(new OpenAICompatibleClient(config).complete(opts)).rejects.toThrow("Invalid chat completion");
    await expect(consume(new OpenAICompatibleClient(config))).rejects.toThrow("empty stream");
  });
  it.each([400, 401, 403, 404])("does not retry permanent HTTP %s failures", async (status) => {
    const fetch = vi.fn(async () => new Response("private upstream details", { status })); vi.stubGlobal("fetch", fetch);
    await expect(new OpenAICompatibleClient(config).complete(opts)).rejects.toThrow(`HTTP ${status}`);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500])("retries HTTP %s only up to the configured attempt limit", async (status) => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response("upstream", { status })); vi.stubGlobal("fetch", fetch);
    const checked = expect(new OpenAICompatibleClient(config).complete(opts)).rejects.toThrow(`HTTP ${status}`);
    await vi.runAllTimersAsync(); await checked;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("recovers from transient transport failure and normalizes non-Error rejection", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockRejectedValueOnce("offline").mockResolvedValueOnce(response("Recovered")); vi.stubGlobal("fetch", fetch);
    const completion = new OpenAICompatibleClient(config).complete(opts);
    await vi.runAllTimersAsync();
    expect(await completion).toMatchObject({ content: "Recovered", stopReason: "end_turn" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['{"count":2}', { count: 2 }], ['```json\n{"count":2}\n```', { count: 2 }], ['Result: {"count":2}', { count: 2 }], ['Result: [1,2]', [1, 2]], ['null', null],
  ])("extracts JSON response %s", async (content, expected) => {
    vi.stubGlobal("fetch", vi.fn(async () => response(content)));
    expect(await new OpenAICompatibleClient(config).completeJSON(opts)).toEqual(expected);
  });
  it("rejects invalid or schema-incompatible JSON", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response("not json")).mockResolvedValueOnce(response('{"count":"two"}'));
    vi.stubGlobal("fetch", fetch);
    const client = new OpenAICompatibleClient(config);
    await expect(client.completeJSON(opts)).rejects.toThrow("Could not extract JSON");
    await expect(client.completeJSON({ ...opts, schema: z.object({ count: z.number() }) })).rejects.toThrow();
  });
  it("enforces declared JSON and vision capabilities before fetch", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const client = new OpenAICompatibleClient({ ...config, capabilities: { ...config.capabilities, vision: false, json: false } });
    await expect(client.completeJSON(opts)).rejects.toThrow("JSON capability");
    await expect(client.visionJSON({ system: "", prompt: "Read", imageBase64: "AA==" })).rejects.toThrow("JSON capability");
    await expect(client.vision({ system: "", prompt: "Read", imageBase64: "AA==" })).rejects.toThrow("vision capability");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates vision JSON through the same schema boundary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response('{"count":1}')));
    expect(await new OpenAICompatibleClient(config).visionJSON({ system: "Review", prompt: "Count", imageBase64: "AA==", schema: z.object({ count: z.number() }) })).toEqual({ count: 1 });
  });
});

describe("provider SSE compatibility", () => {
  it("handles split UTF-8 frames, comments, usage-only records, refusal deltas and terminal markers", async () => {
    const chunks = [
      ': keepalive\r\n\r\ndata: {"model":"served","choices":[{"delta":{"content":"Hel',
      'lo"}}]}\r\n\r\n',
      'data: {"choices":[{"delta":{"refusal":" world"},"finish_reason":"stop"}]}\n\n',
      'data: {"usage":{"prompt_tokens":5,"completion_tokens":2,"prompt_tokens_details":{"cached_tokens":1}}}\n\n',
      'data: [DONE]\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(chunks)));
    const client = new OpenAICompatibleClient(config);
    expect(await consume(client)).toMatchObject({ chunks: ["Hello", " world"], response: { model: "served", content: "Hello world", stopReason: "stop", usage: { inputTokens: 5, outputTokens: 2, cacheReadTokens: 1 } } });
    expect(client.tracker.unpricedCallCount).toBe(1);
  });
  it("accepts final SSE data without a newline and falls back to the requested model", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(['data: {"choices":[{"delta":{"content":"final"}}]}'])));
    expect(await consume(new OpenAICompatibleClient(config))).toMatchObject({ chunks: ["final"], response: { model: "fast", stopReason: "end_turn" } });
  });
  it("ignores empty deltas and comment-only trailing records", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse(['data: {"choices":[{"delta":{}}]}\n\n', ': trailing comment'])));
    expect(await consume(new OpenAICompatibleClient(config))).toMatchObject({ chunks: [], response: { content: "" } });
  });
  it.each(['data: not-json\n\n', 'data: {"choices":"invalid"}\n\n'])("rejects malformed SSE %s", async (chunk) => {
    vi.stubGlobal("fetch", vi.fn(async () => streamResponse([chunk])));
    await expect(consume(new OpenAICompatibleClient(config))).rejects.toThrow("Invalid streaming chunk");
  });
});
