import { constants } from "node:fs";
import { lstat, open, realpath, type FileHandle } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export type SourceReadOmission = "outside-workspace" | "symlink" | "file-byte-limit" | "unreadable" | "changed-file";
export type ContainedSource = { ok: true; content: string } | { ok: false; reason: SourceReadOmission };

/** Read a bounded regular file after checking the opened descriptor's authority. */
export async function readContainedSource(rootPath: string, inputPath: string, maxBytes = 262_144, signal?: AbortSignal): Promise<ContainedSource> {
  assertSourceNotAborted(signal);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 10_000_000) throw new Error("Invalid source byte limit");
  if (!inputPath || isAbsolute(inputPath) || inputPath.includes("\\") || inputPath.includes("\0")) {
    return { ok: false, reason: "outside-workspace" };
  }
  let handle: FileHandle | undefined;
  try {
    const root = await realpath(rootPath);
    assertSourceNotAborted(signal);
    const candidate = resolve(root, inputPath);
    if (!within(root, candidate)) return { ok: false, reason: "outside-workspace" };
    const named = await lstat(candidate, { bigint: true });
    if (named.isSymbolicLink()) return { ok: false, reason: "symlink" };
    if (!named.isFile() || named.nlink !== 1n) return { ok: false, reason: "unreadable" };
    const canonical = await realpath(candidate);
    if (!within(root, canonical) || canonical !== candidate) return { ok: false, reason: "symlink" };
    if (named.size > BigInt(maxBytes)) return { ok: false, reason: "file-byte-limit" };
    handle = await open(candidate, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK));
    const opened = await handle.stat({ bigint: true });
    const current = await lstat(candidate, { bigint: true });
    if (!opened.isFile() || opened.ino === 0n || opened.nlink !== 1n ||
        opened.dev !== named.dev || opened.ino !== named.ino ||
        opened.dev !== current.dev || opened.ino !== current.ino || current.isSymbolicLink() ||
        await realpath(candidate) !== canonical) return { ok: false, reason: "changed-file" };
    if (opened.size > BigInt(maxBytes)) return { ok: false, reason: "file-byte-limit" };
    const buffer = Buffer.alloc(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      assertSourceNotAborted(signal);
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) return { ok: false, reason: "file-byte-limit" };
    const after = await handle.stat({ bigint: true });
    const afterName = await lstat(candidate, { bigint: true });
    assertSourceNotAborted(signal);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.nlink !== 1n || afterName.nlink !== 1n ||
        after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs ||
        afterName.isSymbolicLink() || afterName.dev !== opened.dev || afterName.ino !== opened.ino ||
        await realpath(candidate) !== canonical) return { ok: false, reason: "changed-file" };
    return { ok: true, content: buffer.subarray(0, offset).toString("utf8") };
  } catch {
    assertSourceNotAborted(signal);
    return { ok: false, reason: "unreadable" };
  } finally {
    await handle?.close();
  }
}

function within(root: string, file: string): boolean {
  const part = relative(root, file);
  return part !== "" && part !== ".." && !part.startsWith("../") && !part.startsWith("..\\") && !isAbsolute(part);
}

function assertSourceNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) { const error = new Error("Source read cancelled."); error.name = "AbortError"; throw error; }
}
