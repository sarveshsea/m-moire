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

});
