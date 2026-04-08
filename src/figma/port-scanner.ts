/**
 * Port Scanner — Utility for scanning ports 9223-9232 to find available
 * WebSocket bridge endpoints.
 *
 * Extracted from bridge/ws-server so port logic can be unit-tested and
 * reused without instantiating a full server.
 */

import * as net from "net";
import { spawnSync } from "child_process";

/** Default port range for Mémoire bridge instances. */
export const BRIDGE_PORT_START = 9223;
export const BRIDGE_PORT_END = 9232;

/**
 * Check whether a given TCP port is already bound by another process.
 *
 * Opens a one-shot TCP server on `port`. If binding succeeds the port is
 * free (server is immediately closed and we return `false`). If binding
 * fails with `EADDRINUSE` the port is in use and we return `true`. Any
 * other error propagates so callers can distinguish "in use" from "broken".
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (err: Error & { code?: string }) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        reject(err);
      }
    });

    server.once("listening", () => {
      server.close(() => resolve(false));
    });

    server.listen(port, "127.0.0.1");
  });
}

/**
 * Scan ports from `start` to `end` (inclusive) and return the first one
 * that is not currently in use.
 *
 * @throws {Error} If no port in the range is available.
 */
export async function findAvailablePort(
  start: number = BRIDGE_PORT_START,
  end: number = BRIDGE_PORT_END,
): Promise<number> {
  for (let port = start; port <= end; port++) {
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }
  throw new Error(
    `No available ports (${start}-${end}). Close other Mémoire instances first.`,
  );
}

/**
 * Try to find the PID that is currently listening on `port`.
 *
 * Uses `lsof` on macOS/Linux and `netstat` on Windows. Returns `null`
 * when the PID cannot be determined (missing tool, permission error,
 * or no listener found). Never throws — failures are silently swallowed
 * so callers can always fall back to a generic "port in use" message.
 */
export function getPortOwnerPid(port: number): number | null {
  try {
    if (process.platform === "win32") {
      // netstat -ano lists PID for each TCP listener
      const result = spawnSync("netstat", ["-ano"], {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      });
      if (result.status !== 0 || !result.stdout) return null;
      const re = new RegExp(`0\\.0\\.0\\.0:${port}\\s+.*\\s+(\\d+)`, "m");
      const match = result.stdout.match(re);
      return match ? parseInt(match[1], 10) : null;
    } else {
      // lsof -iTCP:<port> -sTCP:LISTEN -n -P -t → just the PID
      const result = spawnSync(
        "lsof",
        ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
        { stdio: ["ignore", "pipe", "ignore"], encoding: "utf-8" },
      );
      if (result.status !== 0 || !result.stdout?.trim()) return null;
      const pid = parseInt(result.stdout.trim().split("\n")[0], 10);
      return isNaN(pid) ? null : pid;
    }
  } catch {
    return null;
  }
}

/**
 * Returns `true` when `pid` belongs to a known Mémoire / Node.js process
 * that is likely part of the same npm package.
 *
 * Heuristic: checks whether the process command line contains the string
 * "memoire" or "memi" (the CLI binary name). This is not foolproof but is
 * sufficient to distinguish a stale Mémoire instance from a genuinely
 * foreign process.
 */
export function isMemoireProcess(pid: number): boolean {
  try {
    if (process.platform === "win32") {
      const result = spawnSync("wmic", ["process", "where", `ProcessId=${pid}`, "get", "CommandLine"], {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      });
      const cmd = result.stdout?.toLowerCase() ?? "";
      return cmd.includes("memoire") || cmd.includes("memi");
    } else {
      const result = spawnSync("ps", ["-p", String(pid), "-o", "command="], {
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      });
      const cmd = result.stdout?.toLowerCase() ?? "";
      return cmd.includes("memoire") || cmd.includes("memi");
    }
  } catch {
    return false;
  }
}
