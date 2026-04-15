import { describe, expect, it } from "vitest";
import { createMetricsRegistry } from "../main/telemetry/metrics.js";

describe("createMetricsRegistry", () => {
  it("increments labeled counters with defaults", () => {
    const m = createMetricsRegistry(() => 1000);
    m.inc("cmd_total", "ok:getSelection");
    m.inc("cmd_total", "ok:getSelection");
    m.inc("cmd_total", "err:captureScreenshot");
    const snap = m.snapshot();
    expect(snap.cmd_total["ok:getSelection"]).toBe(2);
    expect(snap.cmd_total["err:captureScreenshot"]).toBe(1);
  });

  it("increments scalar counters", () => {
    const m = createMetricsRegistry();
    m.inc("change_buffer_drops");
    m.inc("change_buffer_drops", undefined, 4);
    m.inc("reconnects");
    m.inc("selection_throttled");
    m.inc("bridge_send_failed");
    const snap = m.snapshot();
    expect(snap.change_buffer_drops).toBe(5);
    expect(snap.reconnects).toBe(1);
    expect(snap.selection_throttled).toBe(1);
    expect(snap.bridge_send_failed).toBe(1);
  });

  it("set() overwrites labeled maps only", () => {
    const m = createMetricsRegistry();
    m.inc("queue_depth", "pending", 4);
    m.set("queue_depth", "pending", 1);
    m.set("change_buffer_drops" as never, "ignored", 99);
    const snap = m.snapshot();
    expect(snap.queue_depth.pending).toBe(1);
    expect(snap.change_buffer_drops).toBe(0);
  });

  it("snapshot is a defensive copy", () => {
    const m = createMetricsRegistry();
    m.inc("cmd_total", "ok:x");
    const s1 = m.snapshot();
    s1.cmd_total["ok:x"] = 999;
    const s2 = m.snapshot();
    expect(s2.cmd_total["ok:x"]).toBe(1);
  });

  it("reset zeroes everything", () => {
    const m = createMetricsRegistry();
    m.inc("cmd_total", "ok");
    m.inc("change_buffer_drops", undefined, 3);
    m.inc("exec_rejects", "E_EXEC_REJECTED");
    m.reset();
    const snap = m.snapshot();
    expect(snap.cmd_total).toEqual({});
    expect(snap.change_buffer_drops).toBe(0);
    expect(snap.exec_rejects).toEqual({});
  });

  it("records startedAt / sampledAt", () => {
    let clock = 100;
    const m = createMetricsRegistry(() => clock);
    clock = 500;
    const snap = m.snapshot();
    expect(snap.startedAt).toBe(100);
    expect(snap.sampledAt).toBe(500);
  });
});
