import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { defaultStudioConfig, saveStudioConfig } from "../config.js";
import { StudioRuntimeServer } from "../server.js";
import type { StudioSession } from "../types.js";
import {
  MemoryTelemetrySink,
  type OpenTelemetryProjection,
  type TelemetrySink,
} from "../tracing/opentelemetry.js";

const servers: StudioRuntimeServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe("studio provider runtime RPC", () => {
  it("replays canonical traced events for every legacy harness, including shell", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-provider-runtime-"));
    try {
      const config = defaultStudioConfig(root);
      await saveStudioConfig(root, {
        ...config,
        enabledTools: { ...config.enabledTools, shell: true },
        harnesses: config.harnesses.map((harness) =>
          harness.id === "shell"
            ? { ...harness, enabled: true, command: "sh", defaultModel: "shell-local" }
            : harness),
      });
      const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
      servers.push(server);
      const runtime = await server.start();
      const session = await server.startSession({
        harness: "shell",
        cwd: root,
        prompt: "printf 'provider runtime\\n'",
        action: "raw",
      });
      await waitForSession(server, session.id);

      const body = await fetch(`${runtime.url}/api/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "replayEvents",
          requestId: "replay-shell",
          sessionId: session.id,
        }),
      }).then((response) => response.json()) as {
        responses: Array<{ kind: string; event?: Record<string, unknown> }>;
      };
      const events = body.responses
        .filter((response) => response.kind === "event")
        .map((response) => response.event!);

      expect(events[0]?.type).toBe("session.created");
      expect(events.some((event) => event.type === "session.created")).toBe(true);
      expect(events.some((event) => event.type === "model.selected")).toBe(true);
      expect(events.some((event) => event.type === "turn.completed")).toBe(true);
      for (const event of events) {
        expect(event.schemaVersion).toBe(1);
        expect(event.contentTrust).toMatch(/^(trusted|user|tool_untrusted|web_untrusted|model_generated)$/);
        expect((event.trace as { traceId: string }).traceId).toMatch(/^[0-9a-f]{32}$/);
        expect((event.trace as { spanId: string }).spanId).toMatch(/^[0-9a-f]{16}$/);
      }
      expect(new Set(events.map((event) => (event.trace as { spanId: string }).spanId)).size)
        .toBeGreaterThan(1);
    } finally {
      await stopServersAndRemove(root);
    }
  });

  it("projects live canonical events to an explicit telemetry sink without content", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-provider-telemetry-"));
    try {
      const config = defaultStudioConfig(root);
      await saveStudioConfig(root, {
        ...config,
        enabledTools: { ...config.enabledTools, shell: true },
        harnesses: config.harnesses.map((harness) =>
          harness.id === "shell"
            ? { ...harness, enabled: true, command: "sh", defaultModel: "shell-local" }
            : harness),
      });
      const telemetrySink = new MemoryTelemetrySink();
      const server = new StudioRuntimeServer({
        projectRoot: root,
        port: 0,
        telemetrySink,
      });
      servers.push(server);
      const runtime = await server.start();
      const session = await server.startSession({
        harness: "shell",
        cwd: root,
        prompt: "printf 'private model content\\n'",
        action: "raw",
      });
      await waitForSession(server, session.id);
      await waitFor(() => telemetrySink.projections.length > 0);

      expect(telemetrySink.projections.some((projection) =>
        projection.attributes["gen_ai.operation.name"] === "invoke_workflow")).toBe(true);
      expect(JSON.stringify(telemetrySink.projections)).not.toContain("private model content");
      expect(telemetrySink.projections.every((projection) =>
        /^[0-9a-f]{32}$/.test(projection.traceId)
        && /^[0-9a-f]{16}$/.test(projection.spanId))).toBe(true);

      const status = await fetch(`${runtime.url}/api/status`).then((res) => res.json());
      expect(status.metrics.runtimeEvents).toMatchObject({
        subscriberCount: expect.any(Number),
        publishedCount: expect.any(Number),
        droppedDueToErrorCount: 0,
      });
      expect(status.metrics.runtimeEvents.subscriberCount).toBeGreaterThanOrEqual(1);
      expect(status.metrics.runtimeEvents.publishedCount).toBeGreaterThan(0);

      const usage = await fetch(`${runtime.url}/api/usage`).then((res) => res.json());
      expect(usage.usage.sessions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: session.id,
          source: "provider-runtime",
        }),
      ]));
    } finally {
      await stopServersAndRemove(root);
    }
  });

  it("waits for pending runtime evidence exports before shutdown resolves", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-provider-shutdown-"));
    const telemetrySink = new DeferredTelemetrySink();
    let server: StudioRuntimeServer | null = null;
    try {
      const config = defaultStudioConfig(root);
      await saveStudioConfig(root, {
        ...config,
        enabledTools: { ...config.enabledTools, shell: true },
        harnesses: config.harnesses.map((harness) =>
          harness.id === "shell"
            ? {
                ...harness,
                enabled: true,
                command: "sh",
              }
            : harness),
      });
      server = new StudioRuntimeServer({ projectRoot: root, port: 0, telemetrySink });
      servers.push(server);
      await server.start();
      const session = await server.startSession({
        harness: "shell",
        cwd: root,
        prompt: "true",
        action: "raw",
      });
      await waitForSession(server, session.id);
      await telemetrySink.waitUntilCalled();

      const stop = server.stop();
      const resolvedBeforeRelease = await Promise.race([
        stop.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      telemetrySink.release();
      await stop;

      expect(resolvedBeforeRelease).toBe(false);
    } finally {
      telemetrySink.release();
      await stopServersAndRemove(root);
    }
  });
});

class DeferredTelemetrySink implements TelemetrySink {
  private readonly called: Promise<void>;
  private markCalled!: () => void;
  private readonly pending: Promise<void>;
  private settlePending!: () => void;

  constructor() {
    this.called = new Promise((resolve) => {
      this.markCalled = resolve;
    });
    this.pending = new Promise((resolve) => {
      this.settlePending = resolve;
    });
  }

  async emit(_projection: OpenTelemetryProjection): Promise<void> {
    this.markCalled();
    await this.pending;
  }

  waitUntilCalled(): Promise<void> {
    return this.called;
  }

  release(): void {
    this.settlePending();
  }
}

async function stopServersAndRemove(root: string): Promise<void> {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 5 : 0,
    retryDelay: 50,
  });
}

async function waitForSession(server: StudioRuntimeServer, sessionId: string): Promise<void> {
  // Cold shell startup on Windows CI can exceed three seconds.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const session = server.getSession(sessionId);
    if (session && session.status !== "running") {
      expect(session.status, `Studio session failure metadata: ${JSON.stringify(sessionFailureMetadata(session))}`).toBe("completed");
      expect(session.exitCode).toBe(0);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const session = server.getSession(sessionId);
  throw new Error(`timed out waiting for Studio session: status=${session?.status ?? "missing"}, exitCode=${session?.exitCode ?? "null"}`);
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 60; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for telemetry");
}

/** Fixed metadata only: session text, paths and environment never enter failure output. */
function sessionFailureMetadata(session: Pick<StudioSession, "exitCode" | "harness" | "events">) {
  const stderrEvents = session.events.filter(event => event.type === "stderr");
  const boundedText = (type: "stdout" | "stderr") => {
    let text = "";
    for (const event of session.events) {
      if (event.type === type) text += event.message.slice(0, 16384 - text.length);
      if (text.length === 16384) break;
    }
    return text;
  };
  const stderr = boundedText("stderr"), stdout = boundedText("stdout");
  const code = session.exitCode;
  return {
    exitCode: code,
    exitCodeHex: code === null ? null : `0x${(code >>> 0).toString(16).padStart(8, "0")}`,
    harness: session.harness === "shell" ? "shell" : "unexpected",
    stderrBytes: stderrEvents.reduce((total, event) => total + Buffer.byteLength(event.message), 0),
    inspectedStderrBytes: Buffer.byteLength(stderr),
    msysFailureFlags: {
      cygheap: /cygheap/i.test(stderr),
      forkFailure: /(?:fork.*(?:fail|unable)|unable to fork)/i.test(stderr),
      dllFailure: /(?:dll.*(?:fail|missing|mismatch)|unable to load.*dll)/i.test(stderr),
      singleStep: /(?:STATUS_SINGLE_STEP|0x80000004)/i.test(stderr),
    },
    fixtureSentinelSeen: ["provider runtime", "private model content"].some(sentinel => stdout.includes(sentinel)),
  };
}
