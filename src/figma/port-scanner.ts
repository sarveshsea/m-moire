/**
 * Port Scanner — Utility for scanning ports 9223-9232 to find available
 * WebSocket bridge endpoints.
 *
 * Extracted from bridge/ws-server so port logic can be unit-tested and
 * reused without instantiating a full server.
 */

import * as net from "net";

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
