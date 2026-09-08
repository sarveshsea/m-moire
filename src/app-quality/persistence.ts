import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { getExecutionPolicy, MemiCapabilityDeniedError } from "../security/execution-policy.js";

/** Validate the opened inode before writing source-bearing bytes through its handle. */
export async function writeDiagnosisArtifact(
  path: string,
  content: string | ((current: string) => string),
): Promise<void> {
  const policy = getExecutionPolicy();
  const operation = "persist diagnosis source evidence";
  policy.assert("source-content-persistence", operation);
  await policy.assertProjectWrite(path, operation);
  const noFollow = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
  const handle = await open(path, constants.O_RDWR | constants.O_CREAT | noFollow | (typeof content === "function" ? constants.O_APPEND : 0), 0o600);
  try {
    await policy.assertProjectWrite(path, operation);
    const [opened, pathname] = await Promise.all([handle.stat({ bigint: true }), lstat(path, { bigint: true })]);
    if (!opened.isFile() || !pathname.isFile() || pathname.isSymbolicLink()
      || opened.dev !== pathname.dev || opened.ino !== pathname.ino || opened.nlink !== 1n
      || opened.ino <= 0n || opened.dev < 0n) {
      throw new MemiCapabilityDeniedError({ profile: policy.profile, capability: "project-write", operation });
    }
    let output = content;
    if (typeof content === "function") {
      if (opened.size < 0n || opened.size > 8n * 1024n * 1024n) throw new Error("Diagnosis history exceeds the 8 MiB read limit");
      const buffer = Buffer.alloc(Number(opened.size));
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      const current = buffer.subarray(0, offset).toString("utf8");
      output = content(current);
      if (output.startsWith(current)) {
        await handle.writeFile(output.slice(current.length), "utf8");
        return;
      }
    }
    await handle.truncate(0);
    await handle.writeFile(output as string, "utf8");
  } finally {
    await handle.close();
  }
}


/** Cross-process lock keeps ledger compaction from racing another diagnosis append. */
export async function withDiagnosisHistoryLock<T>(path: string, update: () => Promise<T>): Promise<T> {
  const policy = getExecutionPolicy();
  const lockPath = `${path}.lock`;
  const operation = "serialize diagnosis history writes";
  policy.assert("source-content-persistence", operation);
  for (let attempt = 0; attempt < 100; attempt++) {
    const handle = await policy.openProjectWriteExclusive(lockPath, operation).catch(async error => {
      const failure = error as NodeJS.ErrnoException;
      // A prior owner may release the lock between its existence check and
      // realpath. Restart acquisition with all containment checks intact.
      const releasedDuringCheck = failure.code === "ENOENT"
        && failure.syscall === "realpath" && failure.path === lockPath;
      if (failure.code !== "EEXIST" && !releasedDuringCheck) throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
      return undefined;
    });
    if (!handle) continue;
    try {
      return await update();
    } finally {
      try {
        await policy.assertProjectWrite(lockPath, operation);
        const [opened, pathname] = await Promise.all([handle.stat({ bigint: true }), lstat(lockPath, { bigint: true })]);
        if (opened.ino <= 0n || opened.dev < 0n || opened.nlink !== 1n || !pathname.isFile()
          || opened.dev !== pathname.dev || opened.ino !== pathname.ino || pathname.isSymbolicLink()) {
          throw new Error("Diagnosis history lock ownership changed before release");
        }
        const releasedPath = `${lockPath}.released-${randomUUID()}`;
        await policy.assertProjectWrite(releasedPath, operation);
        await rename(lockPath, releasedPath);
        await policy.assertProjectWrite(releasedPath, operation);
        const released = await lstat(releasedPath, { bigint: true });
        if (!released.isFile() || released.nlink !== 1n || opened.dev !== released.dev || opened.ino !== released.ino || released.isSymbolicLink()) {
          throw new Error("Diagnosis history lock ownership changed during release");
        }
        await unlink(releasedPath);
      } finally {
        await handle.close();
      }
    }
  }
  throw new Error("Diagnosis history is busy; retry after the active writer finishes");
}
