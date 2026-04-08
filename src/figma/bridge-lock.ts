/**
 * Bridge Lock — Read, write, and clear the `.memoire/bridge.json` lock file.
 *
 * The lock file records the PID and port of a running `memi connect` bridge so
 * that other engine instances (pull, sync, compose…) can reuse it rather than
 * starting a new server on a different port.
 *
 * Responsibilities extracted from:
 *   - MemoireEngine._readBridgeLock()  (core.ts)
 *   - memi connect write/cleanup logic (commands/connect.ts)
 */

import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";

export interface BridgeLock {
  pid: number;
  port: number;
  startedAt: string;
}

/**
 * Path to the bridge lock file inside the project's `.memoire/` directory.
 */
export function bridgeLockPath(projectRoot: string): string {
  return join(projectRoot, ".memoire", "bridge.json");
}

/**
 * Read `.memoire/bridge.json`.
 *
 * Returns the lock data if the owning process is still alive.
 * Returns `null` if the file is absent, malformed, or the PID is stale.
 * Automatically deletes stale lock files before returning null.
 */
export async function readBridgeLock(
  projectRoot: string,
): Promise<BridgeLock | null> {
  const lockPath = bridgeLockPath(projectRoot);
  try {
    const raw = await readFile(lockPath, "utf-8");
    const lock = JSON.parse(raw) as BridgeLock;
    if (lock.pid) {
      try {
        process.kill(lock.pid, 0);
      } catch {
        // PID is dead — remove the stale lock before returning null
        await unlink(lockPath).catch(() => { /* already gone */ });
        return null;
      }
    }
    return lock;
  } catch {
    return null;
  }
}

/**
 * Write `.memoire/bridge.json` with the current bridge PID and port.
 * Creates the `.memoire/` directory if it doesn't exist.
 */
export async function writeBridgeLock(
  projectRoot: string,
  port: number,
  pid: number = process.pid,
): Promise<void> {
  const dir = join(projectRoot, ".memoire");
  await mkdir(dir, { recursive: true });
  const lock: BridgeLock = { pid, port, startedAt: new Date().toISOString() };
  await writeFile(bridgeLockPath(projectRoot), JSON.stringify(lock, null, 2));
}

/**
 * Delete `.memoire/bridge.json`.
 * Safe to call even when the file doesn't exist (errors are swallowed).
 */
export async function clearBridgeLock(projectRoot: string): Promise<void> {
  await unlink(bridgeLockPath(projectRoot)).catch(() => { /* file already gone */ });
}
