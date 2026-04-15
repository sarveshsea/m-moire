import { describe, expect, it } from "vitest";
import { createCommandQueue } from "../ui/command-queue.js";

describe("createCommandQueue", () => {
  it("first enqueue for a method/key is the leader", () => {
    const q = createCommandQueue<number>();
    const a = q.enqueue("sync", "k1");
    expect(a.isNew).toBe(true);
  });

  it("second enqueue for same method/key joins as a follower", () => {
    const q = createCommandQueue<number>();
    q.enqueue("sync", "k1");
    const b = q.enqueue("sync", "k1");
    expect(b.isNew).toBe(false);
  });

  it("different dedupe keys both become leaders", () => {
    const q = createCommandQueue<number>();
    const a = q.enqueue("sync", "k1");
    const b = q.enqueue("sync", "k2");
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
  });

  it("resolve fans out to every waiter and returns count", async () => {
    const q = createCommandQueue<number>();
    const p1 = q.enqueue("sync", "k").promise;
    const p2 = q.enqueue("sync", "k").promise;
    const p3 = q.enqueue("sync", "k").promise;
    const count = q.resolve("sync", "k", 42);
    expect(count).toBe(3);
    expect(await Promise.all([p1, p2, p3])).toEqual([42, 42, 42]);
  });

  it("reject fans out and each waiter sees the error", async () => {
    const q = createCommandQueue<number>();
    const p1 = q.enqueue("sync", "k").promise;
    const p2 = q.enqueue("sync", "k").promise;
    q.reject("sync", "k", new Error("boom"));
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).rejects.toThrow("boom");
  });

  it("resolve for unknown key is a no-op returning 0", () => {
    const q = createCommandQueue<number>();
    expect(q.resolve("nope", "nope", 1)).toBe(0);
  });

  it("failMethod rejects every waiter on a method", async () => {
    const q = createCommandQueue<number>();
    const p1 = q.enqueue("sync", "a").promise;
    const p2 = q.enqueue("sync", "b").promise;
    const p3 = q.enqueue("inspect", "x").promise;
    const count = q.failMethod("sync", new Error("bridge down"));
    expect(count).toBe(2);
    await expect(p1).rejects.toThrow("bridge down");
    await expect(p2).rejects.toThrow("bridge down");
    // Untouched
    expect(q.size()).toBe(1);
    q.resolve("inspect", "x", 7);
    expect(await p3).toBe(7);
  });

  it("clear rejects every waiter with the given error", async () => {
    const q = createCommandQueue<number>();
    const p1 = q.enqueue("a", "1").promise;
    const p2 = q.enqueue("b", "2").promise;
    const count = q.clear(new Error("shutdown"));
    expect(count).toBe(2);
    await expect(p1).rejects.toThrow("shutdown");
    await expect(p2).rejects.toThrow("shutdown");
    expect(q.size()).toBe(0);
  });

  it("size and pending reflect the queue state", () => {
    const q = createCommandQueue<number>();
    expect(q.size()).toBe(0);
    q.enqueue("sync", "k");
    q.enqueue("sync", "k");
    q.enqueue("inspect", "x");
    expect(q.size()).toBe(3);
    const pending = q.pending();
    expect(pending).toHaveLength(3);
    expect(pending.map((p) => p.method).sort()).toEqual(["inspect", "sync", "sync"]);
  });

  it("enqueuedAt uses the injected clock", () => {
    let clock = 100;
    const q = createCommandQueue<number>({ now: () => clock });
    q.enqueue("sync", "k");
    clock = 200;
    q.enqueue("sync", "k");
    const pending = q.pending();
    const times = pending.map((p) => p.enqueuedAt).sort((a, b) => a - b);
    expect(times).toEqual([100, 200]);
  });
});
