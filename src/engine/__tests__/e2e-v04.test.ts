import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
/**
 * E2E integration test for v0.4 systems — pipeline, sync, agent registry,
 * token differ, and task queue working together.
 *
 * No Figma connection required — uses mock design system injection.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdir, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MemoireEngine } from "../core.js";
import { EventPipeline } from "../pipeline.js";
import { diffDesignSystem } from "../token-differ.js";
import type { DesignSystem } from "../registry.js";
import type { MemoireEvent } from "../core.js";

let testDir: string;
let engine: MemoireEngine;
let events: MemoireEvent[];

const originalMax = process.getMaxListeners();
beforeAll(() => process.setMaxListeners(50));
afterAll(() => process.setMaxListeners(originalMax));

beforeEach(async () => {
  testDir = join(tmpdir(), `memoire-e2e-v04-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  configureExecutionPolicy({ projectRoot: testDir, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  await mkdir(testDir, { recursive: true });

  engine = new MemoireEngine({ projectRoot: testDir });
  events = [];
  engine.on("event", (evt: MemoireEvent) => events.push(evt));
});

afterEach(async () => {
  resetExecutionPolicyForTests();
  engine.agentRegistry.stopHealthCheck();
  engine.taskQueue.stop();
  engine.removeAllListeners();
  await engine.registry.save().catch(() => {});
  await rm(testDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

const DS_V1: DesignSystem = {
  tokens: [
    { name: "primary", collection: "colors", type: "color", values: { light: "#3b82f6" }, cssVariable: "--primary" },
    { name: "space-4", collection: "spacing", type: "spacing", values: { default: 16 }, cssVariable: "--space-4" },
  ],
  components: [
    { name: "Button", key: "btn-001", description: "Primary button", variants: ["default"], properties: {}, figmaNodeId: "1:1" },
  ],
  styles: [
    { name: "heading", type: "text", value: { fontSize: 24 } },
  ],
  lastSync: new Date().toISOString(),
};

const DS_V2: DesignSystem = {
  tokens: [
    { name: "primary", collection: "colors", type: "color", values: { light: "#ef4444" }, cssVariable: "--primary" }, // changed
    { name: "space-4", collection: "spacing", type: "spacing", values: { default: 16 }, cssVariable: "--space-4" },
    { name: "radius-md", collection: "radii", type: "radius", values: { default: 8 }, cssVariable: "--radius-md" }, // added
  ],
  components: [
    { name: "Button", key: "btn-001", description: "Primary button", variants: ["default", "outline"], properties: {}, figmaNodeId: "1:1" }, // modified
    { name: "Card", key: "card-001", description: "Content card", variants: ["default"], properties: {}, figmaNodeId: "1:2" }, // added
  ],
  styles: [
    { name: "heading", type: "text", value: { fontSize: 32 } }, // modified
  ],
  lastSync: new Date().toISOString(),
};

describe("E2E v0.4 Integration", () => {
  it("engine init bootstraps all v0.4 subsystems", async () => {
    await engine.init();

    // Verify agent registry loaded
    expect(engine.agentRegistry.getAll()).toHaveLength(0);
    expect(engine.agentRegistry.onlineCount).toBe(0);

    // Verify task queue is operational
    const stats = engine.taskQueue.getStats();
    expect(stats.total).toBe(0);

    // Verify sync loaded
    expect(engine.sync.getConflicts()).toHaveLength(0);
    expect(engine.sync.isGuarded).toBe(false);

    // Verify .memoire directory
    const memoireDir = join(testDir, ".memoire");
    const dirStat = await stat(memoireDir);
    expect(dirStat.isDirectory()).toBe(true);
  });

  it("token differ detects changes between design system versions", async () => {
    await engine.init();

    const diff = diffDesignSystem(DS_V1, DS_V2);
    expect(diff.hasChanges).toBe(true);

    // Tokens: primary modified, radius-md added = 2 changes
    expect(diff.tokens).toHaveLength(2);
    expect(diff.tokens.find((c) => c.name === "primary")?.type).toBe("modified");
    expect(diff.tokens.find((c) => c.name === "radius-md")?.type).toBe("added");

    // Components: Button modified, Card added = 2 changes
    expect(diff.components).toHaveLength(2);
    expect(diff.components.find((c) => c.name === "Card")?.type).toBe("added");

    // Styles: heading modified = 1 change
    expect(diff.styles).toHaveLength(1);
    expect(diff.styles[0].type).toBe("modified");

    expect(diff.summary).toContain("token");
    expect(diff.summary).toContain("component");
    expect(diff.summary).toContain("style");
  });

  it("registry emits events on token mutations", async () => {
    await engine.init();
    await engine.registry.updateDesignSystem(DS_V1);

    const tokenEvents: unknown[] = [];
    engine.registry.on("token-changed", (data) => tokenEvents.push(data));

    // Add a token
    engine.registry.addToken({
      name: "accent", collection: "colors", type: "color",
      values: { light: "#f59e0b" }, cssVariable: "--accent",
    });
    expect(tokenEvents).toHaveLength(1);
    expect((tokenEvents[0] as { action: string }).action).toBe("added");

    // Update a token
    engine.registry.updateToken("primary", {
      name: "primary", collection: "colors", type: "color",
      values: { light: "#ef4444" }, cssVariable: "--primary",
    });
    expect(tokenEvents).toHaveLength(2);
    expect((tokenEvents[1] as { action: string }).action).toBe("updated");

    // Remove a token
    engine.registry.removeToken("accent");
    expect(tokenEvents).toHaveLength(3);
    expect((tokenEvents[2] as { action: string }).action).toBe("removed");
  });

  it("sync tracks figma-side and code-side entity changes", async () => {
    await engine.init();
    await engine.registry.updateDesignSystem(DS_V1);

    const syncEvents: unknown[] = [];
    engine.sync.on("entity-updated", (data) => syncEvents.push(data));

    // Simulate Figma-side change
    engine.sync.onVariableChanged({
      name: "primary",
      collection: "colors",
      values: { light: "#ef4444" },
      updatedAt: Date.now(),
    });
    expect(syncEvents).toHaveLength(1);
    expect((syncEvents[0] as { source: string }).source).toBe("figma");

    // Simulate code-side change
    engine.sync.onCodeTokenChanged({
      name: "space-4", collection: "spacing", type: "spacing",
      values: { default: 20 }, cssVariable: "--space-4",
    });
    expect(syncEvents).toHaveLength(2);
    expect((syncEvents[1] as { source: string }).source).toBe("code");
  });

  it("sync guard prevents echo loops", async () => {
    await engine.init();

    const syncEvents: unknown[] = [];
    engine.sync.on("entity-updated", (data) => syncEvents.push(data));

    engine.sync.enableGuard();

    // These should be suppressed
    engine.sync.onVariableChanged({ name: "x", collection: "c", values: {}, updatedAt: Date.now() });
    engine.sync.onCodeTokenChanged({ name: "x", collection: "c", type: "color", values: {}, cssVariable: "--x" });

    engine.sync.disableGuard();

    // These should go through
    engine.sync.onVariableChanged({ name: "y", collection: "c", values: {}, updatedAt: Date.now() });

    expect(syncEvents).toHaveLength(1);
    expect((syncEvents[0] as { name: string }).name).toBe("y");
  });

  it("agent registry + task queue: full lifecycle", async () => {
    await engine.init();

    // 1. Register an agent
    await engine.agentRegistry.register({
      id: "test-agent-1",
      name: "test-worker",
      role: "token-engineer",
      pid: process.pid,
      port: 9223,
      status: "online",
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      capabilities: ["token-create"],
    });
    expect(engine.agentRegistry.onlineCount).toBe(1);

    // 2. Enqueue a task
    const taskId = engine.taskQueue.enqueue({
      role: "token-engineer",
      name: "update-primary",
      intent: "Change primary color to red",
      payload: { color: "#ef4444" },
      dependencies: [],
      timeoutMs: 30000,
    });

    // 3. Agent claims the task
    const claimed = engine.taskQueue.claim("test-agent-1", "token-engineer");
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(taskId);

    engine.agentRegistry.markBusy("test-agent-1");
    expect(engine.agentRegistry.get("test-agent-1")!.status).toBe("busy");

    // 4. Agent completes the task
    engine.taskQueue.markRunning(taskId, "test-agent-1");
    engine.taskQueue.complete(taskId, "test-agent-1", { updated: true });

    engine.agentRegistry.markOnline("test-agent-1");

    const stats = engine.taskQueue.getStats();
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(0);

    // 5. Deregister
    await engine.agentRegistry.deregister("test-agent-1");
    expect(engine.agentRegistry.onlineCount).toBe(0);
  });

  it("pipeline reacts to design system updates", async () => {
    await engine.init();
    await engine.registry.updateDesignSystem(DS_V1);

    const pipeline = new EventPipeline(engine, {
      figmaDebounceMs: 0,
      specDebounceMs: 0,
      autoPull: false,
      autoSpec: false,
      autoGenerate: false,
    });

    const pipelineEvents: { type: string; detail: string }[] = [];
    pipeline.on("pipeline-event", (evt) => pipelineEvents.push(evt));
    pipeline.start();

    // Simulate a pull completion by emitting the right engine event
    engine.emit("event", {
      type: "success",
      source: "figma",
      message: "Design system pulled — 3 tokens, 2 components extracted",
      timestamp: new Date(),
    });

    // Wait a tick for event processing
    await new Promise((r) => setTimeout(r, 10));

    expect(pipelineEvents.some((e) => e.type === "pull-completed")).toBe(true);

    const stats = pipeline.getStats();
    expect(stats.pullCount).toBe(1);

    pipeline.stop();
  });

  it("full round trip: inject DS → auto-spec → diff → sync state", async () => {
    await engine.init();

    // Inject v1
    await engine.registry.updateDesignSystem(DS_V1);
    const specCount1 = await engine.autoSpec();
    expect(specCount1).toBe(1); // 1 component → 1 spec

    // Take a snapshot
    const snapshot1 = engine.snapshotDesignSystem();

    // Inject v2
    await engine.registry.updateDesignSystem(DS_V2);
    const specCount2 = await engine.autoSpec();
    expect(specCount2).toBe(1); // Card is new, Button already has spec

    // Diff the snapshots
    const diff = diffDesignSystem(snapshot1, engine.registry.designSystem);
    expect(diff.hasChanges).toBe(true);
    expect(diff.tokens.length).toBeGreaterThan(0);
    expect(diff.components.length).toBeGreaterThan(0);

    // Run sync
    const syncResult = await engine.sync.sync(engine.registry.designSystem);
    expect(syncResult.elapsedMs).toBeGreaterThanOrEqual(0);

    // Verify all specs exist
    const allSpecs = await engine.registry.getAllSpecs();
    expect(allSpecs.length).toBe(2); // Button + Card
  });
});
