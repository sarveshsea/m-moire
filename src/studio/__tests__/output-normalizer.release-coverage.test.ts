import { describe, expect, it } from "vitest";
import { createStudioOutputNormalizer, flushStudioOutputNormalizer, normalizeStudioOutputChunk } from "../output-normalizer.js";
import type { StudioOutputParser } from "../types.js";
const decode = (parser: StudioOutputParser, payload: unknown) => normalizeStudioOutputChunk(createStudioOutputNormalizer(parser), "stdout", JSON.stringify(payload) + "\n");

describe("release streaming output compatibility", () => {
  it("preserves partial JSON until complete and flushes malformed fragments losslessly", () => {
    const state = createStudioOutputNormalizer("codex-jsonl");
    expect(normalizeStudioOutputChunk(state, "stdout", '{"type":"error",')).toEqual([]);
    expect(normalizeStudioOutputChunk(state, "stdout", '"message":"offline"}\n')).toMatchObject([{ type: "session_error", message: "offline" }]);
    expect(normalizeStudioOutputChunk(state, "stdout", "{broken")).toEqual([]);
    expect(flushStudioOutputNormalizer(state)).toEqual([{ type: "stdout", message: "{broken" }]);
    expect(flushStudioOutputNormalizer(state)).toEqual([]);
    expect(normalizeStudioOutputChunk(state, "stdout", "warning\n{bad}\n")).toEqual([{ type: "stdout", message: "warning\n{bad}\n" }]);
  });

  it("buffers Hermes results and leaves ordinary output intact", () => {
    const hermes = createStudioOutputNormalizer("hermes-text");
    expect(normalizeStudioOutputChunk(hermes, "stdout", "  first ")).toEqual([]);
    expect(normalizeStudioOutputChunk(hermes, "stdout", "second  ")).toEqual([]);
    expect(flushStudioOutputNormalizer(hermes)).toMatchObject([{ type: "session_result", message: "first second" }]);
    expect(normalizeStudioOutputChunk(hermes, "stderr", " ")).toEqual([]);
    const plain = createStudioOutputNormalizer("stdio");
    expect(normalizeStudioOutputChunk(plain, "stdout", "")).toEqual([]);
    expect(flushStudioOutputNormalizer({ ...plain, stdoutBuffer: "remaining" })).toEqual([{ type: "stdout", message: "remaining" }]);
  });

  it.each([
    [{ status: "done" }, "done done"], [{ intent: "Review navigation" }, "Review navigation"], [{}, "Memoire result"],
    [[], "Memoire result"], [{ category: "audit", execution: { status: "failed" } }, "audit failed"],
    [{ type: "artifact", path: "review.md" }, "review.md"], [{ type: "artifact" }, "artifact"],
  ])("summarizes Memoire payload %j", (payload, message) => { expect(decode("memoire-jsonl", payload)[0].message).toBe(message); });

  it.each([
    [{ type: "tool_result", toolUseId: "t", text: "read" }, "tool_result", "read"],
    [{ type: "tool_result", id: "t", result: "done" }, "tool_result", "done"],
    [{ type: "tool_result" }, "tool_result", "tool result"],
    [{ type: "tool_use" }, "tool_call", "tool"],
    [{ type: "error" }, "session_error", "Claude error"],
    [{ type: "result", message: "done" }, "session_result", "done"],
    [{ type: "result" }, "session_result", "Claude result"],
    [[], "stdout", "[]"],
  ])("supports Claude payload %j", (payload, type, message) => { expect(decode("claude-stream-json", payload)).toMatchObject([{ type, message }]); });

  it("ignores malformed content parts and preserves assistant payloads without usable text", () => {
    const payload = { type: "assistant", content: [null, "text", { type: "text", text: " " }] };
    expect(decode("claude-stream-json", payload)).toEqual([{ type: "stdout", message: JSON.stringify(payload) }]);
    expect(decode("claude-stream-json", { type: "assistant", content: [{ type: "tool_use" }, { type: "tool_result" }] })).toMatchObject([{ type: "tool_call", message: "tool" }, { type: "tool_result", message: "tool result" }]);
  });

  it.each([
    [{ type: "function_call_output", callId: "c", result: "done" }, "tool_result", "done"],
    [{ type: "function_call_result" }, "tool_result", "tool result"],
    [{ type: "error" }, "session_error", "Codex error"],
    [{ type: "turn.failed", message: "failed" }, "session_error", "failed"],
    [{ type: "token_count" }, "token_usage", "Token usage"],
    [{ type: "message" }, "session_result", "Codex result"],
    [{ type: "item.completed", item: { type: "tool_call", tool_name: "Read" } }, "tool_call", "Read"],
    [{ type: "item.completed", item: { type: "function_call" } }, "tool_call", "tool"],
    [{ type: "item.completed", item: { type: "command_execution" } }, "terminal_command", "command"],
    [{ type: "item.completed", item: { type: "message", content: [null, { content: "first" }, { text: "second" }] } }, "session_result", "first\nsecond"],
    [{ type: "item.completed", item: { type: "message", message: "answer" } }, "session_result", "answer"],
    [{ type: "item.completed", item: { type: "message", content: "answer" } }, "session_result", "answer"],
    [[], "stdout", "[]"],
  ])("supports Codex payload %j", (payload, type, message) => { expect(decode("codex-jsonl", payload)).toMatchObject([{ type, message }]); });

  it.each([
    [{ kind: "assistant_delta", delta: "thinking" }, "reasoning", "thinking"],
    [{ kind: "assistant_message", message: "answer" }, "session_result", "answer"],
    [{ kind: "assistant_message" }, "session_result", "OpenCode result"],
    [{ kind: "tool_started", tool_call_id: "t", name: "Read" }, "tool_call", "Read"],
    [{ kind: "tool_started" }, "tool_call", "tool"],
    [{ kind: "tool_output", id: "t", chunk: "line" }, "terminal_output", "line"],
    [{ kind: "tool_output", result: "line" }, "terminal_output", "line"],
    [{ kind: "tool_completed", error: "denied" }, "tool_result", "denied"],
    [{ kind: "tool_completed" }, "tool_result", "tool completed"],
    [{ kind: "turn_completed", ok: false }, "session_error", "OpenCode error"],
    [{ kind: "error" }, "session_error", "OpenCode error"],
    [{ type: "error", message: "offline" }, "session_error", "offline"],
    [[], "stdout", "[]"],
  ])("supports OpenCode payload %j", (payload, type, message) => { expect(decode("opencode-jsonl", payload)).toMatchObject([{ type, message }]); });

  it.each([
    ["Research", "research_note"], ["Rationale", "design_decision"], ["Tools", "tool_call"],
    ["Outputs", "artifact"], ["Verification", "acceptance_statement"], ["Handoff", "session_result"],
    ["Design system artifacts", "design_system_artifact"],
  ])("routes explicit %s headings without losing raw evidence", (heading, type) => {
    const raw = `Preamble\n## ${heading}\nEvidence line\n## Summary\n`;
    expect(decode("claude-stream-json", { type: "result", result: raw })).toMatchObject([{ type, message: "Evidence line", data: { rawResult: raw } }]);
  });
});
