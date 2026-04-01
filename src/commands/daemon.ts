import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { PreviewApiServer } from "../preview/api-server.js";
import { EventPipeline, type PipelineEvent } from "../engine/pipeline.js";

import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { join, basename } from "path";
import { ui } from "../tui/format.js";

interface DaemonPhaseTimings {
  init: number;
  figmaConnect: number;
  previewStart: number;
  ready: number;
}

interface DaemonStatus {
  pid: number;
  port: number;
  figmaPort: number;
  dashboardPort: number;
  startedAt: string;
  phases?: DaemonPhaseTimings;
  pipeline?: {
    enabled: boolean;
    autoPull: boolean;
    autoSpec: boolean;
    autoGenerate: boolean;
  };
}

interface DaemonStatusPayload {
  action: "status";
  status: "running" | "stopped" | "stale-cleaned";
  reason?: "missing-status-file" | "stale-process";
  daemon: {
    pid: number;
    port: number;
    figmaPort: number;
    dashboardPort: number;
    startedAt: string;
    uptimeSeconds: number | null;
    uptimeHuman: string | null;
    alive: boolean;
    figmaConnected: boolean;
    previewUrl: string;
    phases: DaemonPhaseTimings | null;
  } | null;
  cleanup: {
    performed: boolean;
  };
}

/** Resolve the .memoire directory for PID/status files */
function memoireDir(engine: MemoireEngine): string {
  return join(engine.config.projectRoot, ".memoire");
}

function pidPath(engine: MemoireEngine): string {
  return join(memoireDir(engine), "daemon.pid");
}

function statusPath(engine: MemoireEngine): string {
  return join(memoireDir(engine), "daemon.json");
}

/** Check whether a process with the given PID is alive */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Read and parse the daemon status file, or return null */
async function readStatus(engine: MemoireEngine): Promise<DaemonStatus | null> {
  try {
    const raw = await readFile(statusPath(engine), "utf-8");
    return JSON.parse(raw) as DaemonStatus;
  } catch {
    return null;
  }
}

/** Remove PID and status files */
async function cleanupFiles(engine: MemoireEngine): Promise<void> {
  for (const path of [pidPath(engine), statusPath(engine)]) {
    try {
      await unlink(path);
    } catch {
      // Already gone
    }
  }
}

/** Format seconds into a human-readable uptime string */
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export function registerDaemonCommand(program: Command, engine: MemoireEngine): void {
  const daemon = program
    .command("daemon")
    .description("Manage the Memoire background daemon (Figma bridge + preview + dashboard)");

  // ── daemon start ──────────────────────────────────────────────
  daemon
    .command("start")
    .description("Start the Memoire daemon as a persistent background service")
    .option("-p, --port <port>", "Preview server port", "5173")
    .option("-f, --figma-port <port>", "Starting Figma bridge port to scan", "9223")
    .option("--no-auto-pull", "Disable auto-pull on Figma changes")
    .option("--no-auto-spec", "Disable auto-spec on component changes")
    .option("--no-auto-generate", "Disable auto-generate on spec file changes")
    .option("--debounce <ms>", "Spec file change debounce in ms", "500")
    .action(async (opts) => {
      // Check if a daemon is already running
      const existing = await readStatus(engine);
      if (existing && isProcessAlive(existing.pid)) {
        console.log();
        console.log(ui.warn("Daemon already running (PID " + existing.pid + ")"));
        console.log(ui.dots("Preview", `http://localhost:${existing.port}`));
        console.log(ui.dots("Figma", `port ${existing.figmaPort}`));
        console.log();
        return;
      }

      // Phase timing instrumentation
      const t0 = Date.now();

      // Initialize engine
      await engine.init();
      const tInitDone = Date.now();

      const previewPort = parseInt(opts.port, 10);

      // 1. Start Figma bridge
      let figmaPort: number;
      try {
        figmaPort = await engine.connectFigma();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  Failed to start Figma bridge: ${msg}\n`);
        process.exit(1);
      }
      const tFigmaDone = Date.now();

      // 2. Start preview server
      const previewDir = join(engine.config.projectRoot, "preview");
      await mkdir(previewDir, { recursive: true });
      const previewServer = new PreviewApiServer(engine, previewDir, previewPort);
      let actualPreviewPort: number;
      try {
        actualPreviewPort = await previewServer.start();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  Failed to start preview server: ${msg}\n`);
        process.exit(1);
      }
      const tPreviewDone = Date.now();

      // 2.5. Start event pipeline
      const pipeline = new EventPipeline(engine, {
        figmaDebounceMs: 3000,
        specDebounceMs: parseInt(opts.debounce ?? "500", 10),
        autoPull: opts.autoPull !== false,
        autoSpec: opts.autoSpec !== false,
        autoGenerate: opts.autoGenerate !== false,
      });
      pipeline.start();
      previewServer.setPipeline(pipeline);

      pipeline.on("pipeline-event", (evt: PipelineEvent) => {
        const icons: Record<string, string> = {
          "pull-completed": "+", "generate-completed": "+", "spec-created": "+",
          "token-diff-detected": "~", "component-diff-detected": "~",
          "pipeline-error": "x", "generate-failed": "x", "pull-failed": "x",
        };
        const icon = icons[evt.type] ?? "·";
        console.log(`  ${icon} [pipeline] ${evt.detail}`);
      });

      // 3. Write PID file and status JSON
      const tReady = Date.now();
      const phases: DaemonPhaseTimings = {
        init: tInitDone - t0,
        figmaConnect: tFigmaDone - tInitDone,
        previewStart: tPreviewDone - tFigmaDone,
        ready: tReady - t0,
      };

      const dir = memoireDir(engine);
      await mkdir(dir, { recursive: true });

      const status: DaemonStatus = {
        pid: process.pid,
        port: actualPreviewPort,
        figmaPort,
        dashboardPort: 0,
        startedAt: new Date().toISOString(),
        phases,
        pipeline: {
          enabled: true,
          autoPull: opts.autoPull !== false,
          autoSpec: opts.autoSpec !== false,
          autoGenerate: opts.autoGenerate !== false,
        },
      };

      await writeFile(pidPath(engine), String(process.pid));
      await writeFile(statusPath(engine), JSON.stringify(status, null, 2));

      // 4. Log running state
      console.log();
      console.log(`  Daemon ready in ${phases.ready}ms (init: ${phases.init}ms, figma: ${phases.figmaConnect}ms, preview: ${phases.previewStart}ms)`);
      console.log();
      console.log(ui.box(`DAEMON — PID ${process.pid}`, [
        "",
        `Preview:   http://localhost:${actualPreviewPort}`,
        `Figma:     port ${figmaPort}`,
        "",
        "Stop with: memi daemon stop",
        "",
      ]));


      // 5. Set up graceful shutdown handlers
      const shutdown = async () => {
        console.log();
        console.log(ui.active("Shutting down daemon..."));
        pipeline.stop();
        try {
          engine.figma.disconnect();
        } catch {
          // Already disconnected
        }
        await cleanupFiles(engine);
        console.log(ui.ok("Daemon stopped"));
        console.log();
        process.exit(0);
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);

      // 7. Listen for Figma plugin events
      engine.figma.on("plugin-connected", (client: { file: string; editor: string }) => {
        console.log(ui.ok(`Figma connected: ${client.file} (${client.editor})`));
      });

      engine.figma.on("plugin-disconnected", () => {
        console.log(ui.warn("Figma plugin disconnected"));
      });

      console.log(ui.active("Daemon running. Waiting for Figma plugin..."));
      console.log();

      // Keep the process alive — the servers hold open handles, but
      // we also set an interval as a safety net to prevent exit.
      setInterval(() => {}, 60_000);
    });

  // ── daemon stop ───────────────────────────────────────────────
  daemon
    .command("stop")
    .description("Stop the running Memoire daemon")
    .action(async () => {
      let pid: number;
      try {
        const raw = await readFile(pidPath(engine), "utf-8");
        pid = parseInt(raw.trim(), 10);
      } catch {
        console.log("\n  No daemon PID file found. Is the daemon running?\n");
        return;
      }

      if (isNaN(pid)) {
        console.log("\n  Corrupted PID file. Cleaning up.\n");
        await cleanupFiles(engine);
        return;
      }

      if (!isProcessAlive(pid)) {
        console.log(`\n  Daemon process (PID ${pid}) is not running. Cleaning up stale files.\n`);
        await cleanupFiles(engine);
        return;
      }

      // Send SIGTERM to the daemon process
      try {
        process.kill(pid, "SIGTERM");
        console.log(`\n  Sent SIGTERM to daemon (PID ${pid}).`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  Failed to stop daemon: ${msg}\n`);
        return;
      }

      // Clean up files (the daemon's shutdown handler will also try,
      // but we do it here in case the process exits before cleanup)
      await cleanupFiles(engine);
      console.log("  Memoire daemon stopped.\n");
    });

  // ── daemon status ─────────────────────────────────────────────
  daemon
    .command("status")
    .description("Show the current daemon status")
    .option("--json", "Output daemon status as JSON")
    .action(async (opts: { json?: boolean }) => {
      const status = await readStatus(engine);
      const json = Boolean(opts.json);

      if (!status) {
        if (json) {
          console.log(JSON.stringify({
            action: "status",
            status: "stopped",
            reason: "missing-status-file",
            daemon: null,
            cleanup: { performed: false },
          } satisfies DaemonStatusPayload, null, 2));
          return;
        }

        console.log();
        console.log(ui.pending("Daemon stopped " + ui.dim("(no status file)")));
        console.log();
        return;
      }

      const alive = isProcessAlive(status.pid);
      const figmaConnected = engine.figma?.wsServer?.connectedClients?.length > 0;
      const uptimeSeconds = alive
        ? Math.max(0, (Date.now() - new Date(status.startedAt).getTime()) / 1000)
        : null;

      if (!alive) {
        if (json) {
          await cleanupFiles(engine);
          console.log(JSON.stringify({
            action: "status",
            status: "stale-cleaned",
            reason: "stale-process",
            daemon: serializeDaemonStatus(status, false, false, null),
            cleanup: { performed: true },
          } satisfies DaemonStatusPayload, null, 2));
          return;
        }

        console.log();
        console.log(ui.warn(`Daemon stale — PID ${status.pid} is not running`));
        console.log(ui.active("Cleaning up stale files..."));
        await cleanupFiles(engine);
        console.log(ui.ok("Cleaned"));
        console.log();
        return;
      }

      if (json) {
        console.log(JSON.stringify({
          action: "status",
          status: "running",
          daemon: serializeDaemonStatus(status, true, figmaConnected, uptimeSeconds),
          cleanup: { performed: false },
        } satisfies DaemonStatusPayload, null, 2));
        return;
      }

      const runningUptimeSeconds = uptimeSeconds ?? 0;
      console.log(ui.brand("DAEMON"));
      console.log(ui.ok("Running"));
      console.log(ui.dots("PID", String(status.pid)));
      console.log(ui.dots("Uptime", formatUptime(runningUptimeSeconds)));
      console.log(ui.dots("Started", status.startedAt));
      console.log(ui.dots("Preview", `http://localhost:${status.port}`));
      console.log(ui.dots("Figma", `port ${status.figmaPort}`));
      console.log(ui.dots("Figma link", figmaConnected ? ui.green("connected") : ui.dim("waiting")));
      if (status.phases) {
        console.log(ui.dots("Startup", `${status.phases.ready}ms (init: ${status.phases.init}ms, figma: ${status.phases.figmaConnect}ms, preview: ${status.phases.previewStart}ms)`));
      }
      console.log();
    });

  // ── daemon restart ────────────────────────────────────────────
  daemon
    .command("restart")
    .description("Restart the Memoire daemon")
    .option("-p, --port <port>", "Preview server port", "5173")
    .option("-f, --figma-port <port>", "Starting Figma bridge port to scan", "9223")
    .action(async (opts) => {
      // Stop existing daemon if running
      let pid: number | null = null;
      try {
        const raw = await readFile(pidPath(engine), "utf-8");
        pid = parseInt(raw.trim(), 10);
      } catch {
        // No daemon running
      }

      if (pid && !isNaN(pid) && isProcessAlive(pid)) {
        console.log(`\n  Stopping existing daemon (PID ${pid})...`);
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // Already dead
        }
        await cleanupFiles(engine);

        // Give the old process a moment to release ports
        await new Promise((resolve) => setTimeout(resolve, 1000));
        console.log("  Stopped.\n");
      }

      // Delegate to start — programmatically invoke the start subcommand
      console.log("  Restarting daemon...\n");
      await daemon.parseAsync(["start", "-p", opts.port, "-f", opts.figmaPort], {
        from: "user",
      });
    });
}

function serializeDaemonStatus(
  status: DaemonStatus,
  alive: boolean,
  figmaConnected: boolean,
  uptimeSeconds: number | null,
): NonNullable<DaemonStatusPayload["daemon"]> {
  return {
    pid: status.pid,
    port: status.port,
    figmaPort: status.figmaPort,
    dashboardPort: status.dashboardPort,
    startedAt: status.startedAt,
    uptimeSeconds,
    uptimeHuman: uptimeSeconds === null ? null : formatUptime(uptimeSeconds),
    alive,
    figmaConnected,
    previewUrl: `http://localhost:${status.port}`,
    phases: status.phases ?? null,
  };
}
