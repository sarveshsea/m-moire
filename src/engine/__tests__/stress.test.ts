/**
 * Stress tests for v0.4 modules — edge cases, concurrency, boundary conditions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { EventEmitter } from "events";
import { TaskQueue } from "../../agents/task-queue.js";
import { AgentRegistry } from "../../agents/agent-registry.js";
import {
  entityHash,
  tokenHash,
  diffDesignSystem,
  diffTokens,
  detectConflicts,
  type SyncEntity,
} from "../token-differ.js";
import { BidirectionalSync } from "../sync.js";
import type { DesignToken, DesignSystem } from "../registry.js";

// ── Helpers ─────────────────────────────────────────────

function makeToken(name: string, value: string): DesignToken {
  return { name, collection: "colors", type: "color", values: { Light: value }, cssVariable: `--${name}` };
}

function makeDS(tokens: DesignToken[] = []): DesignSystem {
  return { tokens, components: [], styles: [], lastSync: new Date().toISOString() };
}

function makeMockEngine(ds?: DesignSystem) {
  const registry = new EventEmitter() as EventEmitter & {
    designSystem: DesignSystem;
    updateToken: (name: string, token: DesignToken) => void;
    removeToken: (name: string) => boolean;
  };
  registry.designSystem = ds ?? makeDS();
  registry.updateToken = (name: string, token: DesignToken) => {
    const idx = registry.designSystem.tokens.findIndex((t) => t.name === name);
    if (idx >= 0) registry.designSystem.tokens[idx] = token;
    else registry.designSystem.tokens.push(token);
  };
  registry.removeToken = (name: string) => {
    const idx = registry.designSystem.tokens.findIndex((t) => t.name === name);
    if (idx >= 0) { registry.designSystem.tokens.splice(idx, 1); return true; }
    return false;
  };
  return {
    config: { projectRoot: "/tmp/memoire-stress-test" },
    registry,
    figma: { isConnected: false, pushTokens: async () => {} },
  };
}

// ── Token Differ Stress ─────────────────────────────────

describe("token-differ stress", () => {
  it("handles large token sets (1000 tokens)", () => {
    const before: DesignToken[] = [];
    const after: DesignToken[] = [];
    for (let i = 0; i < 1000; i++) {
      before.push(makeToken(`token-${i}`, `#${i.toString(16).padStart(6, "0")}`));
      // Modify every 10th token, remove every 50th, keep the rest
      if (i % 50 === 0) continue; // removed
      if (i % 10 === 0) {
        after.push(makeToken(`token-${i}`, `#${(i + 1).toString(16).padStart(6, "0")}`));
      } else {
        after.push(makeToken(`token-${i}`, `#${i.toString(16).padStart(6, "0")}`));
      }
    }
    // Add 50 new tokens
    for (let i = 1000; i < 1050; i++) {
      after.push(makeToken(`token-${i}`, `#${i.toString(16).padStart(6, "0")}`));
    }

    const changes = diffTokens(before, after);
    expect(changes.length).toBeGreaterThan(0);

    const removed = changes.filter((c) => c.type === "removed");
    const modified = changes.filter((c) => c.type === "modified");
    const added = changes.filter((c) => c.type === "added");

    expect(removed.length).toBe(20); // every 50th from 0-999
    expect(modified.length).toBeGreaterThan(0);
    expect(added.length).toBe(50);
  });

  it("entityHash handles deeply nested objects", () => {
    const deep = { a: { b: { c: { d: { e: "value" } } } } };
    const h1 = entityHash(deep);
    const h2 = entityHash(deep);
    expect(h1).toBe(h2);

    const different = { a: { b: { c: { d: { e: "other" } } } } };
    expect(entityHash(different)).not.toBe(h1);
  });

  it("entityHash handles arrays", () => {
    const a = entityHash({ items: [1, 2, 3] });
    const b = entityHash({ items: [1, 2, 3] });
    const c = entityHash({ items: [3, 2, 1] });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("entityHash handles empty objects and arrays", () => {
    expect(entityHash({})).toBeTruthy();
    expect(entityHash([])).toBeTruthy();
    expect(entityHash({})).not.toBe(entityHash([]));
  });

  it("diffDesignSystem with empty before and large after", () => {
    const tokens = Array.from({ length: 500 }, (_, i) => makeToken(`t${i}`, `#${i}`));
    const diff = diffDesignSystem(makeDS(), makeDS(tokens));
    expect(diff.hasChanges).toBe(true);
    expect(diff.tokens).toHaveLength(500);
    expect(diff.tokens.every((c) => c.type === "added")).toBe(true);
  });

  it("tokenHash stability across property order", () => {
    const t1: DesignToken = { name: "x", collection: "c", type: "color", values: { a: "1" }, cssVariable: "--x" };
    const t2: DesignToken = { values: { a: "1" }, name: "x", type: "color", collection: "c", cssVariable: "--x" };
    expect(tokenHash(t1)).toBe(tokenHash(t2));
  });
});

// ── Conflict Detection Stress ────────────────────────────

describe("conflict detection stress", () => {
  it("handles 100 simultaneous conflicts", () => {
    const now = Date.now();
    const figma = new Map<string, SyncEntity>();
    const code = new Map<string, SyncEntity>();

    for (let i = 0; i < 100; i++) {
      figma.set(`token-${i}`, { name: `token-${i}`, hash: `figma-${i}`, updatedAt: now, source: "figma" });
      code.set(`token-${i}`, { name: `token-${i}`, hash: `code-${i}`, updatedAt: now + 100, source: "code" });
    }

    const conflicts = detectConflicts(figma, code, 1000);
    expect(conflicts).toHaveLength(100);
    expect(conflicts.every((c) => !c.resolved)).toBe(true);
  });

  it("handles mixed conflict and non-conflict entities", () => {
    const now = Date.now();
    const figma = new Map<string, SyncEntity>();
    const code = new Map<string, SyncEntity>();

    // 10 conflicting
    for (let i = 0; i < 10; i++) {
      figma.set(`conflict-${i}`, { name: `conflict-${i}`, hash: `f${i}`, updatedAt: now, source: "figma" });
      code.set(`conflict-${i}`, { name: `conflict-${i}`, hash: `c${i}`, updatedAt: now + 500, source: "code" });
    }
    // 20 matching
    for (let i = 0; i < 20; i++) {
      figma.set(`match-${i}`, { name: `match-${i}`, hash: `same${i}`, updatedAt: now, source: "figma" });
      code.set(`match-${i}`, { name: `match-${i}`, hash: `same${i}`, updatedAt: now, source: "code" });
    }
    // 15 figma-only (no conflict)
    for (let i = 0; i < 15; i++) {
      figma.set(`figma-only-${i}`, { name: `figma-only-${i}`, hash: `f${i}`, updatedAt: now, source: "figma" });
    }

    const conflicts = detectConflicts(figma, code, 1000);
    expect(conflicts).toHaveLength(10);
  });
});

// ── TaskQueue Stress ──────────────────────────────────────

describe("TaskQueue stress", () => {
  let queue: TaskQueue;

  beforeEach(() => { queue = new TaskQueue(); });
  afterEach(() => { queue.stop(); });

  it("handles 200 concurrent enqueue operations", () => {
    for (let i = 0; i < 200; i++) {
      queue.enqueue({ role: "general", name: `task-${i}`, intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });
    }
    expect(queue.getStats().total).toBe(200);
    expect(queue.getStats().pending).toBe(200);
  });

  it("handles rapid claim/complete cycles", () => {
    const ids: string[] = [];
    for (let i = 0; i < 50; i++) {
      ids.push(queue.enqueue({ role: "general", name: `task-${i}`, intent: "", payload: {}, dependencies: [], timeoutMs: 30000 }));
    }

    for (let i = 0; i < 50; i++) {
      const claimed = queue.claim("agent-1", "general");
      expect(claimed).not.toBeNull();
      queue.complete(claimed!.id, "agent-1", { index: i });
    }

    expect(queue.getStats().completed).toBe(50);
    expect(queue.getStats().pending).toBe(0);
  });

  it("handles diamond dependency graph", () => {
    //    A
    //   / \
    //  B   C
    //   \ /
    //    D
    const a = queue.enqueue({ role: "general", name: "A", intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });
    const b = queue.enqueue({ role: "general", name: "B", intent: "", payload: {}, dependencies: [a], timeoutMs: 30000 });
    const c = queue.enqueue({ role: "general", name: "C", intent: "", payload: {}, dependencies: [a], timeoutMs: 30000 });
    queue.enqueue({ role: "general", name: "D", intent: "", payload: {}, dependencies: [b, c], timeoutMs: 30000 });

    // Only A should be claimable
    const first = queue.claim("ag", "general");
    expect(first!.name).toBe("A");
    expect(queue.claim("ag", "general")).toBeNull(); // B and C blocked

    queue.complete(a, "ag", null);

    // B and C now claimable
    const second = queue.claim("ag", "general");
    const third = queue.claim("ag2", "general");
    expect(second).not.toBeNull();
    expect(third).not.toBeNull();
    const names = [second!.name, third!.name].sort();
    expect(names).toEqual(["B", "C"]);

    // D still blocked
    expect(queue.claim("ag", "general")).toBeNull();

    queue.complete(b, "ag", null);
    queue.complete(c, "ag2", null);

    // D now claimable
    const fourth = queue.claim("ag", "general");
    expect(fourth!.name).toBe("D");
  });

  it("prune keeps pending/running tasks", () => {
    queue.enqueue({ role: "general", name: "pending", intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });
    const id2 = queue.enqueue({ role: "general", name: "done", intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });
    queue.claim("a", "general"); // claims "pending" (first)
    // Claim and complete "done" manually
    const claimed = queue.claim("b", "general");
    queue.complete(claimed!.id, "b", null);
    queue.get(claimed!.id)!.completedAt = Date.now() - 999999;

    const pruned = queue.prune(1000);
    expect(pruned).toBe(1);
    // pending (claimed) task should still exist
    expect(queue.getAll().length).toBe(1);
  });

  it("multiple agents claiming different roles", () => {
    for (let i = 0; i < 5; i++) queue.enqueue({ role: "token-engineer", name: `te-${i}`, intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });
    for (let i = 0; i < 5; i++) queue.enqueue({ role: "design-auditor", name: `da-${i}`, intent: "", payload: {}, dependencies: [], timeoutMs: 30000 });

    const te = queue.claim("te-agent", "token-engineer");
    const da = queue.claim("da-agent", "design-auditor");

    expect(te!.role).toBe("token-engineer");
    expect(da!.role).toBe("design-auditor");

    // Cross-role claim returns null
    expect(queue.claim("te-agent", "code-generator")).toBeNull();
  });
});

// ── AgentRegistry Stress ──────────────────────────────────

describe("AgentRegistry stress", () => {
  let testDir: string;
  let registry: AgentRegistry;

  beforeEach(async () => {
    testDir = join(tmpdir(), `memoire-stress-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });
    registry = new AgentRegistry(testDir);
    await registry.load();
  });

  afterEach(async () => {
    registry.stopHealthCheck();
    await rm(testDir, { recursive: true, force: true });
  });

  it("handles 50 simultaneous agent registrations", async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      registry.register({
        id: `agent-${i}`,
        name: `worker-${i}`,
        role: "general",
        pid: process.pid,
        port: 9223,
        status: "online",
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
        capabilities: [],
      }),
    );
    await Promise.all(promises);
    expect(registry.getAll()).toHaveLength(50);
    expect(registry.onlineCount).toBe(50);
  });

  it("handles rapid register/deregister cycles", async () => {
    for (let i = 0; i < 30; i++) {
      await registry.register({
        id: `agent-${i}`,
        name: `worker-${i}`,
        role: "token-engineer",
        pid: process.pid,
        port: 9223,
        status: "online",
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
        capabilities: [],
      });
    }
    expect(registry.getAll()).toHaveLength(30);

    // Deregister half
    for (let i = 0; i < 15; i++) {
      await registry.deregister(`agent-${i}`);
    }
    expect(registry.getAll()).toHaveLength(15);

    // Register replacements
    for (let i = 100; i < 115; i++) {
      await registry.register({
        id: `agent-${i}`,
        name: `worker-${i}`,
        role: "general",
        pid: process.pid,
        port: 9223,
        status: "online",
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
        capabilities: [],
      });
    }
    expect(registry.getAll()).toHaveLength(30);
  });

  it("getAvailableAgent with mixed statuses", async () => {
    await registry.register({ id: "busy-1", name: "b1", role: "token-engineer", pid: process.pid, port: 9223, status: "online", lastHeartbeat: Date.now(), registeredAt: Date.now(), capabilities: [] });
    await registry.register({ id: "busy-2", name: "b2", role: "token-engineer", pid: process.pid, port: 9223, status: "online", lastHeartbeat: Date.now(), registeredAt: Date.now(), capabilities: [] });

    registry.markBusy("busy-1");
    const available = registry.getAvailableAgent("token-engineer");
    expect(available).not.toBeNull();
    expect(available!.id).toBe("busy-2");

    registry.markBusy("busy-2");
    expect(registry.getAvailableAgent("token-engineer")).toBeNull();

    registry.markOnline("busy-1");
    expect(registry.getAvailableAgent("token-engineer")!.id).toBe("busy-1");
  });
});

// ── BidirectionalSync Stress ──────────────────────────────

describe("BidirectionalSync stress", () => {
  it("handles rapid variable-changed events", () => {
    const engine = makeMockEngine(makeDS([makeToken("a", "#000")]));
    const sync = new BidirectionalSync(engine as never, { persistState: false });

    const events: unknown[] = [];
    sync.on("entity-updated", (data) => events.push(data));

    for (let i = 0; i < 100; i++) {
      sync.onVariableChanged({
        name: `token-${i}`,
        collection: "colors",
        values: { Light: `#${i.toString(16).padStart(6, "0")}` },
        updatedAt: Date.now() + i,
      });
    }

    expect(events).toHaveLength(100);
  });

  it("guard suppresses all events during push", () => {
    const engine = makeMockEngine();
    const sync = new BidirectionalSync(engine as never, { persistState: false });

    const events: unknown[] = [];
    sync.on("entity-updated", (data) => events.push(data));

    sync.enableGuard();
    for (let i = 0; i < 50; i++) {
      sync.onVariableChanged({ name: `t-${i}`, collection: "c", values: {}, updatedAt: Date.now() });
      sync.onCodeTokenChanged(makeToken(`t-${i}`, "#fff"));
    }
    sync.disableGuard();

    expect(events).toHaveLength(0);
  });

  it("multiple sequential syncs don't corrupt state", async () => {
    const engine = makeMockEngine(makeDS([makeToken("a", "#000"), makeToken("b", "#111")]));
    const sync = new BidirectionalSync(engine as never, { persistState: false });

    for (let i = 0; i < 10; i++) {
      const result = await sync.sync();
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    }
  });
});
