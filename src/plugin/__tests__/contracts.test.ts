import { describe, expect, it } from "vitest";
import {
  WIDGET_V2_CHANNEL,
  isWidgetV2Envelope,
  type WidgetMainEnvelope,
} from "../shared/contracts.js";
import {
  BRIDGE_V2_CHANNEL,
  createBridgeCommandEnvelope,
  normalizeBridgeMessage,
  serializeBridgeEnvelope,
} from "../shared/bridge.js";

describe("plugin contracts", () => {
  it("recognizes valid widget v2 envelopes", () => {
    const envelope: WidgetMainEnvelope = {
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "command-result",
      requestId: "cmd-1",
      command: "getSelection",
      ok: true,
      sessionId: "widget-1",
      result: { count: 1 },
    };

    expect(isWidgetV2Envelope(envelope)).toBe(true);
    expect(
      isWidgetV2Envelope({
        ...envelope,
        channel: "memoire.widget.v1",
      }),
    ).toBe(false);
  });

  it("normalizes legacy bridge command and sync payloads into v2 envelopes", () => {
    const command = normalizeBridgeMessage({
      type: "command",
      id: "42",
      method: "getVariables",
      params: { depth: 2 },
    });
    const sync = normalizeBridgeMessage({
      type: "sync-data",
      part: "components",
      result: [{ id: "c-1" }, { id: "c-2" }],
    });

    expect(command).toEqual(
      createBridgeCommandEnvelope("42", "getVariables", { depth: 2 }),
    );
    expect(sync).toMatchObject({
      channel: BRIDGE_V2_CHANNEL,
      source: "plugin",
      type: "sync-result",
      part: "components",
      summary: {
        tokens: 0,
        components: 0,
        styles: 0,
        partialFailures: [],
      },
    });
  });

  it("serializes v2 bridge envelopes back to the legacy wire format", () => {
    const command = createBridgeCommandEnvelope("99", "getPageTree", { depth: 3 });

    expect(serializeBridgeEnvelope(command)).toEqual({
      type: "command",
      id: "99",
      method: "getPageTree",
      params: { depth: 3 },
    });
    expect(
      serializeBridgeEnvelope({
        channel: BRIDGE_V2_CHANNEL,
        source: "plugin",
        type: "response",
        id: "99",
        error: "boom",
      }),
    ).toEqual({
      type: "response",
      id: "99",
      result: undefined,
      error: "boom",
    });
  });
});
