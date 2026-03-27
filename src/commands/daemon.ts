import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { PreviewApiServer } from "../preview/api-server.js";

import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { join, basename } from "path";

interface DaemonStatus {
  pid: number;
  port: number;
  figmaPort: number;
  dashboardPort: number;
  startedAt: string;
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
    .action(async (opts) => {
      // Check if a daemon is already running
      const existing = await readStatus(engine);
      if (existing && isProcessAlive(existing.pid)) {
        console.log(`\n  Memoire daemon is already running (PID ${existing.pid})`);
        console.log(`    Preview:   http://localhost:${existing.port}`);
        console.log(`    Figma:     port ${existing.figmaPort}\n`);
        return;
      }

      // Initialize engine
      await engine.init();

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

      // 3. Write PID file and status JSON
      const dir = memoireDir(engine);
      await mkdir(dir, { recursive: true });

      const status: DaemonStatus = {
        pid: process.pid,
        port: actualPreviewPort,
        figmaPort,
        dashboardPort: 0,
        startedAt: new Date().toISOString(),
      };

      await writeFile(pidPath(engine), String(process.pid));
      await writeFile(statusPath(engine), JSON.stringify(status, null, 2));

      // 4. Log running state
      console.log(`
  ┌──────────────────────────────────────────────────┐
  |  MEMOIRE DAEMON — PID ${String(process.pid).padEnd(27)}|
  |                                                  |
  |  Preview:   http://localhost:${String(actualPreviewPort).padEnd(20)}|
  |  Figma:     port ${String(figmaPort).padEnd(31)}|
  |                                                  |
  |  Stop with: memi daemon stop                     |
  └──────────────────────────────────────────────────┘
`);

      // 5. Set up graceful shutdown handlers
      const shutdown = async () => {
        console.log("\n  Shutting down Memoire daemon...");
        try {
          engine.figma.disconnect();
        } catch {
          // Already disconnected
        }
        await cleanupFiles(engine);
        console.log("  Memoire daemon stopped.\n");
        process.exit(0);
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);

      // 7. Listen for Figma plugin events
      engine.figma.on("plugin-connected", (client: { file: string; editor: string }) => {
        console.log(`  + Figma connected: ${client.file} (${client.editor})`);
      });

      engine.figma.on("plugin-disconnected", () => {
        console.log("  - Figma plugin disconnected");
      });

      console.log("  Daemon running. Waiting for Figma plugin...\n");

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
    .action(async () => {
      const status = await readStatus(engine);

      if (!status) {
        console.log("\n  Memoire daemon: stopped (no status file)\n");
        return;
      }

      const alive = isProcessAlive(status.pid);

      if (!alive) {
        console.log(`\n  Memoire daemon: stopped (stale — PID ${status.pid} is not running)`);
        console.log("  Cleaning up stale files...");
        await cleanupFiles(engine);
        console.log("  Done.\n");
        return;
      }

      const uptimeSeconds = (Date.now() - new Date(status.startedAt).getTime()) / 1000;
      const figmaConnected = engine.figma?.wsServer?.connectedClients?.length > 0;

      console.log(`
  Memoire daemon: running
    PID:        ${status.pid}
    Uptime:     ${formatUptime(uptimeSeconds)}
    Started:    ${status.startedAt}
    Preview:    http://localhost:${status.port}
    Figma:      port ${status.figmaPort}
    Figma link: ${figmaConnected ? "connected" : "waiting for plugin"}
`);
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
