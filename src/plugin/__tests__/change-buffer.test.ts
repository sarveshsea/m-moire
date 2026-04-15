import { describe, expect, it, vi } from "vitest";
import {
  createChangeBuffer,
  type ChangeBufferDropEvent,
  type ChangeBufferEntry,
} from "../main/state/change-buffer.js";

function entry(id: string, timestamp: number): ChangeBufferEntry {
  return {
    type: "PROPERTY_CHANGE",
    id,
    origin: null,
    sessionId: "session-1",
    runId: null,
    pageId: "page-1",
    timestamp,
  };
}

describe("createChangeBuffer", () => {
  it("rejects non-positive capacity", () => {
    expect(() => createChangeBuffer({ capacity: 0 })).toThrow();
    expect(() => createChangeBuffer({ capacity: -1 })).toThrow();
    expect(() => createChangeBuffer({ capacity: 1.5 })).toThrow();
  });

  it("accepts entries up to capacity without dropping", () => {
    const onDrop = vi.fn();
    const buf = createChangeBuffer({ capacity: 3, onDrop });
    buf.push(entry("a", 1));
    buf.push(entry("b", 2));
    buf.push(entry("c", 3));
    expect(buf.size()).toBe(3);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("evicts FIFO and emits a drop event on single overflow", () => {
    const drops: ChangeBufferDropEvent[] = [];
    const buf = createChangeBuffer({
      capacity: 2,
      onDrop: (e) => drops.push(e),
    });
    buf.push(entry("a", 10));
    buf.push(entry("b", 20));
    buf.push(entry("c", 30));
    expect(buf.peek().map((e) => e.id)).toEqual(["b", "c"]);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      droppedCount: 1,
      firstDroppedAt: 10,
      lastDroppedAt: 10,
      remaining: 2,
      capacity: 2,
    });
  });

  it("emits a single drop event covering an overflowing batch", () => {
    const drops: ChangeBufferDropEvent[] = [];
    const buf = createChangeBuffer({
      capacity: 3,
      onDrop: (e) => drops.push(e),
    });
    buf.pushMany([entry("a", 1), entry("b", 2)]);
    buf.pushMany([entry("c", 3), entry("d", 4), entry("e", 5)]);
    expect(buf.peek().map((e) => e.id)).toEqual(["c", "d", "e"]);
    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({
      droppedCount: 2,
      firstDroppedAt: 1,
      lastDroppedAt: 2,
      remaining: 3,
    });
  });

  it("drain returns all and clears", () => {
    const buf = createChangeBuffer({ capacity: 4 });
    buf.pushMany([entry("a", 1), entry("b", 2)]);
    const drained = buf.drain();
    expect(drained.map((e) => e.id)).toEqual(["a", "b"]);
    expect(buf.size()).toBe(0);
    expect(buf.peek()).toEqual([]);
  });

  it("clear empties without emitting drop", () => {
    const onDrop = vi.fn();
    const buf = createChangeBuffer({ capacity: 2, onDrop });
    buf.push(entry("a", 1));
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("handles a batch larger than capacity in one call", () => {
    const drops: ChangeBufferDropEvent[] = [];
    const buf = createChangeBuffer({
      capacity: 2,
      onDrop: (e) => drops.push(e),
    });
    buf.pushMany([entry("a", 1), entry("b", 2), entry("c", 3), entry("d", 4)]);
    expect(buf.peek().map((e) => e.id)).toEqual(["c", "d"]);
    expect(drops).toHaveLength(1);
    expect(drops[0].droppedCount).toBe(2);
  });

  it("capacity reports correctly", () => {
    const buf = createChangeBuffer({ capacity: 7 });
    expect(buf.capacity()).toBe(7);
  });

  it("pushMany with empty array is a no-op", () => {
    const onDrop = vi.fn();
    const buf = createChangeBuffer({ capacity: 2, onDrop });
    buf.pushMany([]);
    expect(buf.size()).toBe(0);
    expect(onDrop).not.toHaveBeenCalled();
  });
});
