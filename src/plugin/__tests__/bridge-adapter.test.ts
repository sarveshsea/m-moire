import { describe, expect, it } from "vitest";
import type { WidgetCommandResultEnvelope } from "../shared/contracts.js";
import {
  createBridgeCommandDispatch,
  createBridgeSyncResultMessage,
  resolveBridgeResponse,
  summarizeSyncResult,
  trackBridgeRequest,
} from "../ui/bridge-adapter.js";
import { BRIDGE_V2_CHANNEL, createBridgeCommandEnvelope } from "../shared/bridge.js";

describe("plugin ui bridge adapter", () => {
  it("tracks and resolves bridge commands by request id and command", () => {
    const pending = new Map();
    const commandA = createBridgeCommandEnvelope("bridge-1", "getSelection");
    const commandB = createBridgeCommandEnvelope("bridge-2", "getPageTree", { depth: 2 });
    const dispatchA = createBridgeCommandDispatch(commandA);
    const dispatchB = createBridgeCommandDispatch(commandB);

    trackBridgeRequest(pending, dispatchA.requestId, commandA);
    trackBridgeRequest(pending, dispatchB.requestId, commandB);

    const resultB: WidgetCommandResultEnvelope = {
      channel: "memoire.widget.v2",
      source: "main",
      type: "command-result",
      requestId: dispatchB.requestId,
      command: "getPageTree",
      ok: true,
      sessionId: "widget-1",
      result: { pages: [] },
    };
    const resultA: WidgetCommandResultEnvelope = {
      channel: "memoire.widget.v2",
      source: "main",
      type: "command-result",
      requestId: dispatchA.requestId,
      command: "getSelection",
      ok: true,
      sessionId: "widget-1",
      result: { count: 1 },
    };

    expect(resolveBridgeResponse(pending, resultB)).toEqual({
      channel: BRIDGE_V2_CHANNEL,
      source: "plugin",
      type: "response",
      id: "bridge-2",
      result: { pages: [] },
      error: undefined,
    });
    expect(resolveBridgeResponse(pending, resultA)).toEqual({
      channel: BRIDGE_V2_CHANNEL,
      source: "plugin",
      type: "response",
      id: "bridge-1",
      result: { count: 1 },
      error: undefined,
    });
    expect(pending.size).toBe(0);
  });

  it("ignores mismatched command results and keeps pending state intact", () => {
    const pending = new Map();
    const command = createBridgeCommandEnvelope("bridge-3", "getStyles");
    const dispatch = createBridgeCommandDispatch(command);
    trackBridgeRequest(pending, dispatch.requestId, command);

    const mismatched: WidgetCommandResultEnvelope = {
      channel: "memoire.widget.v2",
      source: "main",
      type: "command-result",
      requestId: dispatch.requestId,
      command: "getComponents",
      ok: true,
      sessionId: "widget-1",
      result: [],
    };

    expect(resolveBridgeResponse(pending, mismatched)).toBeNull();
    expect(pending.size).toBe(1);
  });

  it("builds sync summaries with stable counts", () => {
    expect(summarizeSyncResult("tokens", { collections: [{ id: "a" }, { id: "b" }] })).toEqual({
      tokens: 2,
      components: 0,
      styles: 0,
      partialFailures: [],
    });
    expect(createBridgeSyncResultMessage("styles", [{ id: "s-1" }], "partial").summary).toEqual({
      tokens: 0,
      components: 0,
      styles: 1,
      partialFailures: ["partial"],
    });
  });
});
