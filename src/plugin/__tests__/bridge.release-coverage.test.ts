import { afterEach, describe, expect, it, vi } from "vitest";
import { BRIDGE_V2_CHANNEL, createBridgeCommandEnvelope, createBridgeResponseEnvelope, isBridgeEnvelope, normalizeBridgeMessage, serializeBridgeEnvelope } from "../shared/bridge.js";
import { WIDGET_COMMAND_NAMES } from "../shared/contracts.js";
afterEach(() => vi.restoreAllMocks());
describe("shared bridge message compatibility", () => {
  it.each([null, undefined, false, 42, "message", {}, { type: 42 }, { type: "unknown" }])("ignores non-envelope input %j", value => { expect(normalizeBridgeMessage(value)).toBeNull(); expect(isBridgeEnvelope(value)).toBe(false); });
  it("roundtrips each approved command with arguments and result/error responses", () => {
    for (const method of WIDGET_COMMAND_NAMES) {
      const command = createBridgeCommandEnvelope("request-1", method, { count: 2 });
      expect(normalizeBridgeMessage(serializeBridgeEnvelope(command))).toEqual(command);
      expect(normalizeBridgeMessage(command)).toBe(command);
      expect(serializeBridgeEnvelope(command, "v2")).toBe(command);
    }
    const response = createBridgeResponseEnvelope("request-1", { saved: false }, "cancelled");
    expect(normalizeBridgeMessage(serializeBridgeEnvelope(response))).toEqual(response);
    expect(normalizeBridgeMessage({ type: "command", id: "1", method: WIDGET_COMMAND_NAMES[0], params: 42 })).toMatchObject({ params: {} });
  });
  it.each([{ type: "command", id: 1, method: WIDGET_COMMAND_NAMES[0] }, { type: "command", id: "1", method: "unregistered" }, { type: "response", id: 1 }, { type: "identify", name: 1 }, { type: "chat", text: 1 }, { type: "event", message: 1 }, { type: "error", message: 1 }])("rejects malformed required legacy fields %j", value => { expect(normalizeBridgeMessage(value)).toBeNull(); });
  it.each(["ping", "pong"])("preserves %s direction", type => { const value = normalizeBridgeMessage({ type })!; expect(value.source).toBe(type === "ping" ? "server" : "plugin"); expect(serializeBridgeEnvelope(value)).toEqual({ type }); });
  it("preserves handshake authentication fields when adapting legacy wire format", () => {
    const identify = { type: "identify", name: "fixture", port: 9223, studioUrl: "http://localhost", runtimeUrl: "http://localhost/runtime", auth: "pre-shared-hmac-sha256-v1", minimumProtocolVersion: 2, challenge: "fixture", serverProof: "fixture-proof" };
    const hello = { type: "bridge-hello", file: "Design", fileKey: "fixture-file", editor: "figma", protocolVersion: 2, proof: "fixture-proof" };
    for (const message of [identify, hello]) { const value = normalizeBridgeMessage(message)!; expect(isBridgeEnvelope(value)).toBe(true); expect(serializeBridgeEnvelope(value)).toEqual(message); }
    expect(normalizeBridgeMessage({ type: "identify", name: "fixture", port: "9223", minimumProtocolVersion: "2" })).toMatchObject({ port: undefined, minimumProtocolVersion: undefined });
    expect(normalizeBridgeMessage({ type: "bridge-hello" })).toMatchObject({ file: "unknown", fileKey: "", editor: "figma", protocolVersion: undefined });
  });
  it.each([{ name: 3 }, { auth: "unexpected" }, { minimumProtocolVersion: "2" }, { challenge: 3 }, { serverProof: 3 }])("detects invalid v2 identify optional field %j", invalid => { expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: "identify", name: "fixture", ...invalid })).toBe(false); });
  it.each([{ proof: 3 }, { protocolVersion: "2" }])("detects invalid v2 hello field %j", invalid => { expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: "bridge-hello", ...invalid })).toBe(false); });
  it("validates minimal handshake envelopes and command allowlist", () => {
    expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: "identify", name: "fixture" })).toBe(true);
    expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: "bridge-hello" })).toBe(true);
    expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: 3 })).toBe(false);
    expect(isBridgeEnvelope({ channel: BRIDGE_V2_CHANNEL, type: "command", method: "not-approved" })).toBe(false);
  });
  it.each(["success", "warn", "error", "info", "unknown"])("normalizes event level %s", level => { const value = normalizeBridgeMessage({ type: "event", level, message: "bounded event", data: { count: 1 } })!; expect(serializeBridgeEnvelope(value)).toMatchObject({ level: level === "unknown" ? "info" : level, data: { count: 1 } }); });
  it("retains chat/error fields and fills legacy chat origin", () => {
    expect(serializeBridgeEnvelope(normalizeBridgeMessage({ type: "chat", text: "hello" })!)).toEqual({ type: "chat", text: "hello", from: "memoire-terminal" });
    expect(serializeBridgeEnvelope(normalizeBridgeMessage({ type: "chat", text: "hello", from: "fixture" })!)).toMatchObject({ from: "fixture" });
    expect(serializeBridgeEnvelope(normalizeBridgeMessage({ type: "error", message: "failed", details: { retry: false } })!)).toMatchObject({ message: "failed", details: { retry: false } });
  });
  it("normalizes change notifications with stable fallback timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    expect(serializeBridgeEnvelope(normalizeBridgeMessage({ type: "document-changed", data: null })!)).toMatchObject({ data: { changes: 0, buffered: 0, sessionId: "unknown", runId: null, updatedAt: 123 } });
    for (const message of [{ type: "document-changed", data: { changes: 2, buffered: 1, sessionId: "s", runId: "r", updatedAt: 4 } }, { type: "page-changed", data: { page: "Main", pageId: "p", updatedAt: 4 } }]) expect(serializeBridgeEnvelope(normalizeBridgeMessage(message)!)).toEqual(message);
    expect(normalizeBridgeMessage({ type: "page-changed", data: { page: "Main" } })).toMatchObject({ data: { pageId: null, updatedAt: 123 } });
    expect(serializeBridgeEnvelope(normalizeBridgeMessage({ type: "action-result", result: 3, error: "failed" })!)).toMatchObject({ action: "unknown", result: 3, error: "failed" });
    expect(normalizeBridgeMessage({ type: "action-result", action: "capture" })).toMatchObject({ action: "capture" });
  });
  it.each(["tokens", "components", "styles", "unknown"])("maps legacy sync part %s and keeps failures", part => {
    const value = normalizeBridgeMessage({ type: "sync-data", part, result: { count: 2 }, error: "partial" })!;
    expect(serializeBridgeEnvelope(value)).toMatchObject({ type: "sync-data", part: part === "unknown" ? "tokens" : part, summary: { tokens: 0, components: 0, styles: 0, partialFailures: [] }, error: "partial" });
    expect(normalizeBridgeMessage({ type: "sync-data", part, summary: { tokens: 1 } })).toMatchObject({ summary: { tokens: 1 } });
  });
  it.each(["selection", "connection-state", "job-status", "heal-result", "agent-status", "token-push", "variable-changed", "component-changed", "agent-register", "agent-deregister", "agent-message"])("preserves %s payload through adapters", type => {
    const message = { type, data: { id: "fixture", count: 2 } }; const envelope = normalizeBridgeMessage(message)!;
    expect(serializeBridgeEnvelope(envelope)).toEqual(message); expect(serializeBridgeEnvelope(envelope, "v2")).toBe(envelope);
  });
});
