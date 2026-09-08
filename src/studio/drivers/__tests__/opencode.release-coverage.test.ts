import { afterEach, describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { asId } from "../../contracts/ids.js";
import type { HarnessDriverConfig } from "../base.js";
import type { ProviderRuntimeEvent } from "../../contracts/provider-runtime.js";
import { OpenCodeDriver } from "../opencode.js";

function fixture(options: Record<string, unknown> = {}) {
  const events: ProviderRuntimeEvent[] = [];
  const lines = new Set<(line: string, stream: "stdout" | "stderr") => void>();
  const exits = new Set<(code: number | null, signal: NodeJS.Signals | null) => void>();
  const transport = {
    write: vi.fn(async (_line: string) => {}), close: vi.fn(async (_reason?: string) => {}), kill: vi.fn(async () => {}),
    onLine: (cb: (line: string, stream: "stdout" | "stderr") => void) => { lines.add(cb); return () => lines.delete(cb); },
    onExit: (cb: (code: number | null, signal: NodeJS.Signals | null) => void) => { exits.add(cb); return () => exits.delete(cb); },
  };
  const spawnTransport = vi.fn(async () => transport);
  const config = {
    harnessId: asId("HarnessId", "hns_fixture"), providerInstanceId: asId("ProviderInstanceId", "prv_fixture"),
    sessionId: asId("SessionId", "ses_fixture"), options: { spawnTransport, ...options },
    eventBus: { publish: (event: ProviderRuntimeEvent) => events.push(event) },
  } as unknown as HarnessDriverConfig;
  const driver = new OpenCodeDriver(config);
  const line = (raw: string, stream: "stdout" | "stderr" = "stdout") => { for (const cb of lines) cb(raw, stream); };
  return { driver, events, transport, spawnTransport, lines, exits, line,
    frame: (tag: string, value: Record<string, unknown> = {}, stream: "stdout" | "stderr" = "stdout") => line(JSON.stringify({ kind: tag, ...value }), stream),
    exit: (code: number | null, signal: NodeJS.Signals | null = null) => { for (const cb of exits) cb(code, signal); },
  };
}
const run = Effect.runPromise;
const turn = { turnId: asId("TurnId", "trn_fixture"), prompt: "Build the existing component" };
afterEach(() => vi.restoreAllMocks());

describe("opencode release protocol boundaries", () => {
  it("diagnoses null JSON frames without throwing or breaking the next valid message", async () => {
    const f = fixture();
    await run(f.driver.start());
    try {
      expect(() => f.line("null")).not.toThrow();
      expect(f.events.some(e => e.type === "diagnostic.warn")).toBe(true);
      f.frame("assistant_message", { text: "still ready" });
      expect(f.events.at(-1)).toMatchObject({ type: "message.assistant.complete", text: "still ready" });
    } finally { await run(f.driver.shutdown()); }
  });

  it.each([undefined, {}, { spawnTransport: "invalid" }])("rejects invalid transport config %j", async options => {
    const f = fixture();
    const driver = new OpenCodeDriver({ ...f.driver.config, options });
    await expect(run(driver.start())).rejects.toThrow(/spawnTransport/);
    expect(driver.sessionState()).toBe("idle");
  });
  it.each([new Error("spawn failed"), "spawn string failure"])("maps transport startup failures %s", async failure => {
    const f = fixture({ spawnTransport: async () => { throw failure; } });
    await expect(run(f.driver.start())).rejects.toThrow(/spawn/);
    await run(f.driver.shutdown());
  });
  it("forwards explicit spawn settings and uses defaults when absent", async () => {
    for (const options of [{}, { model: "local-model", env: { FIXTURE: "yes" }, cwd: "/fixture", baseUrl: "http://127.0.0.1:12345" }]) {
      const f = fixture(options); await run(f.driver.start());
      expect(f.spawnTransport).toHaveBeenCalledWith(expect.objectContaining({ model: options.model ?? "gpt-5.5", env: options.env ?? process.env, cwd: options.cwd ?? process.cwd() }));
      expect(f.driver.sessionState()).toBe("ready");
      await run(f.driver.shutdown());
      expect(f.transport.close).toHaveBeenCalledWith("shutdown");
      expect(f.lines.size + f.exits.size).toBe(0);
      const count = f.events.length;
      f.frame("assistant_message", { text: "late" });
      expect(f.events).toHaveLength(count);
      await run(f.driver.shutdown());
      expect(f.transport.close).toHaveBeenCalledTimes(1);
    }
  });
  it("rejects a turn before startup and safely interrupts or shuts down before startup", async () => {
    const f = fixture();
    await expect(run(f.driver.sendTurn(turn))).rejects.toThrow(/before start/);
    await run(f.driver.interrupt());
    expect(f.transport.write).not.toHaveBeenCalled();
    await run(f.driver.shutdown());
    expect(f.driver.sessionState()).toBe("stopped");
  });
  it("writes the full prompt while bounding the turn preview and preserves ordered event envelopes", async () => {
    const f = fixture(); await run(f.driver.start());
    const prompt = "x".repeat(200);
    await run(f.driver.sendTurn({ ...turn, prompt }));
    expect(JSON.parse(f.transport.write.mock.calls[0][0])).toEqual({ kind: "user_turn", prompt });
    expect(f.events.find(e => e.type === "turn.created")).toMatchObject({ promptPreview: "x".repeat(120), turnId: turn.turnId });
    expect(f.events.find(e => e.type === "message.user")).toMatchObject({ text: prompt });
    expect(f.events.map(e => e.seq)).toEqual([...f.events.map(e => e.seq)].sort((a,b) => a-b));
    expect(new Set(f.events.map(e => e.eventId)).size).toBe(f.events.length);
    await run(f.driver.shutdown());
  });
  it.each([undefined, "operator cancellation"])("interrupts the active turn with reason %s", async reason => {
    const f = fixture(); await run(f.driver.start()); await run(f.driver.sendTurn(turn));
    await run(f.driver.interrupt(reason));
    expect(JSON.parse(f.transport.write.mock.calls[1][0])).toEqual({ kind: "interrupt", reason: reason ?? "user" });
    expect(f.driver.sessionState()).toBe("interrupted");
    await run(f.driver.shutdown());
  });
  it.each(["sendTurn", "interrupt", "shutdown"] as const)("surfaces %s transport failures", async operation => {
    const f = fixture(); await run(f.driver.start());
    if (operation === "shutdown") f.transport.close.mockRejectedValueOnce(new Error("transport failure"));
    else f.transport.write.mockRejectedValueOnce(new Error("transport failure"));
    const effect = operation === "sendTurn" ? f.driver.sendTurn(turn) : f.driver[operation]();
    await expect(run(effect)).rejects.toThrow(/transport failure/);
    await run(f.driver.shutdown());
  });
  it.each([[0, null, "stopped"], [null, "SIGTERM", "stopped"], [2, null, "error"], [null, "SIGKILL", "error"]] as const)("handles exit %s / %s as %s", async (code, signal, state) => {
    const f = fixture(); await run(f.driver.start()); f.exit(code, signal);
    expect(f.driver.sessionState()).toBe(state);
    if (state === "error") expect(f.events.some(e => e.type === "diagnostic.error")).toBe(true);
    else { f.exit(0); expect(f.driver.sessionState()).toBe("stopped"); }
    await run(f.driver.shutdown());
    expect(f.lines.size + f.exits.size).toBe(0);
  });
  it.each(["stdout", "stderr"] as const)("handles blank, invalid JSON and unknown %s frames as diagnostics", async stream => {
    const f = fixture(); await run(f.driver.start());
    const count = f.events.length; f.line(" \n ", stream); expect(f.events).toHaveLength(count);
    f.line("invalid".repeat(100), stream);
    expect(f.events.at(-1)).toMatchObject({ type: stream === "stderr" ? "diagnostic.error" : "diagnostic.warn" });
    expect((f.events.at(-1) as { message: string }).message.length).toBeLessThan(250);
    f.frame("future_event", { source: "untrusted fixture" }, stream);
    expect(f.events.at(-1)).toMatchObject({ type: stream === "stderr" ? "diagnostic.error" : "diagnostic.warn", message: expect.stringContaining("future_event") });
    f.line("{}", stream);
    expect(f.events.at(-1)).toMatchObject({ type: stream === "stderr" ? "diagnostic.error" : "diagnostic.warn" });
    await run(f.driver.shutdown());
  });
  it("converts message, tool and usage payloads to the canonical event envelope", async () => {
    const f = fixture(); await run(f.driver.start()); await run(f.driver.sendTurn(turn));
    f.frame("assistant_delta", { delta: "Hello " });
    f.frame("assistant_message", { text: "Hello world" });
    f.frame("tool_started", { toolCallId: "tcl_fixture", tool: "Read", args: { path: "Button.tsx" } });
    f.frame("tool_output", { toolCallId: "tcl_fixture", chunk: "source", stream: "stderr" });
    f.frame("tool_completed", { toolCallId: "tcl_fixture", ok: true, elapsedMs: "12", result: { found: true } });
    f.frame("usage", { inputTokens: "10", outputTokens: "20", cachedInputTokens: "3", reasoningTokens: "4", estimatedCostUsd: "0.01" });
    expect(f.events.find(e => e.type === "message.assistant.delta")).toMatchObject({ delta: "Hello ", turnId: turn.turnId });
    expect(f.events.find(e => e.type === "message.assistant.complete")).toMatchObject({ text: "Hello world" });
    expect(f.events.find(e => e.type === "tool.call.started")).toMatchObject({ toolCallId: "tcl_fixture", tool: "Read", args: { path: "Button.tsx" } });
    expect(f.events.find(e => e.type === "tool.call.output")).toMatchObject({ toolCallId: "tcl_fixture", chunk: "source", stream: "stderr" });
    expect(f.events.find(e => e.type === "tool.call.completed")).toMatchObject({ ok: true, elapsedMs: 12, result: { found: true } });
    expect(f.events.at(-1)).toMatchObject({ type: "usage.updated", inputTokens: 10, outputTokens: 20, cachedInputTokens: 3, reasoningTokens: 4, estimatedCostUsd: 0.01 });
    await run(f.driver.shutdown());
  });
  it("provides defined defaults for optional protocol fields", async () => {
    const f = fixture(); await run(f.driver.start());
    f.frame("assistant_delta"); expect(f.events.at(-1)).toMatchObject({ delta: "" });
    f.frame("assistant_message"); expect(f.events.at(-1)).toMatchObject({ text: "" });
    f.frame("tool_started"); expect(f.events.at(-1)).toMatchObject({ tool: "unknown", toolCallId: expect.any(String) });
    f.frame("tool_output", { toolCallId: "tcl_defaults" }); expect(f.events.at(-1)).toMatchObject({ toolCallId: "tcl_defaults", chunk: "", stream: "stdout" });
    f.frame("tool_completed", { toolCallId: "tcl_defaults" }); expect(f.events.at(-1)).toMatchObject({ toolCallId: "tcl_defaults", ok: false, elapsedMs: 0 });
    f.frame("usage"); expect(f.events.at(-1)).toMatchObject({ inputTokens: 0, outputTokens: 0, cachedInputTokens: undefined, reasoningTokens: undefined, estimatedCostUsd: undefined });
    await run(f.driver.shutdown());
  });
  it.each([true, false])("completes an active turn ok=%s and clears its identity", async ok => {
    const f = fixture(); await run(f.driver.start()); await run(f.driver.sendTurn(turn));
    f.frame("turn_completed", { ok, error: "fixture error" });
    expect(f.events.find(e => e.type === "turn.completed")).toMatchObject({ outcome: ok ? "success" : "error", error: ok ? undefined : "fixture error", turnId: turn.turnId });
    expect(f.driver.sessionState()).toBe("ready");
    f.frame("assistant_message", { text: "between turns" });
    expect(f.events.at(-1)?.turnId).toBeUndefined();
    f.frame("turn_completed", { ok: false });
    expect(f.events.at(-1)).toMatchObject({ type: "turn.completed", outcome: "error", error: "", turnId: undefined });
    await run(f.driver.shutdown());
  });
  it("handles a failed turn with no error detail and provider-default completion", async () => {
    const f = fixture(); await run(f.driver.start()); await run(f.driver.sendTurn(turn));
    f.frame("turn_completed", { ok: false });
    expect(f.events.find(e => e.type === "turn.completed")).toMatchObject({ outcome: "error", error: "" });
    f.frame("turn_completed"); expect(f.events.at(-1)).toMatchObject({ type: "turn.completed", outcome: "error" });
    await run(f.driver.shutdown());
  });

  it.each(["tool_output", "tool_completed"])("diagnoses missing tool identity in %s and continues parsing", async tag => {
    const f = fixture(); await run(f.driver.start());
    try {
      expect(() => f.frame(tag)).not.toThrow();
      expect(f.events.at(-1)).toMatchObject({ type: "diagnostic.warn" });
      f.frame("assistant_message", { text: "recovered" });
      expect(f.events.at(-1)).toMatchObject({ text: "recovered" });
    } finally { await run(f.driver.shutdown()); }
  });

  it.each(["null", "[]", "42", "true", '"text"'])("rejects non-object frame %s on stderr", async raw => {
    const f = fixture(); await run(f.driver.start());
    try {
      expect(() => f.line(raw, "stderr")).not.toThrow();
      expect(f.events.at(-1)).toMatchObject({ type: "diagnostic.error", message: expect.stringContaining("invalid") });
    } finally { await run(f.driver.shutdown()); }
  });

  it("keeps malformed field diagnostics bounded and excludes raw error details", async () => {
    const f = fixture(); await run(f.driver.start());
    try {
      expect(() => f.frame("tool_output", { toolCallId: "PRIVATE_INVALID_ID" }, "stderr")).not.toThrow();
      expect(f.events.at(-1)).toMatchObject({ type: "diagnostic.error", message: expect.stringContaining("invalid event frame") });
      expect(JSON.stringify(f.events.at(-1))).not.toContain("PRIVATE_INVALID_ID");
      expect(() => f.line('{"kind":{"toString":null}}', "stderr")).not.toThrow();
      expect(f.events.at(-1)).toMatchObject({ type: "diagnostic.error" });
      f.frame("assistant_message", { text: "valid after malformed fields" });
      expect(f.events.at(-1)).toMatchObject({ text: "valid after malformed fields" });
    } finally { await run(f.driver.shutdown()); }
  });

});
