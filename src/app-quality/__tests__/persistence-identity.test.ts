import { afterEach, describe, expect, it, vi } from "vitest";
import { lstat, open, unlink } from "node:fs/promises";
import { configureExecutionPolicy, getExecutionPolicy, MemiExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { withDiagnosisHistoryLock, writeDiagnosisArtifact } from "../persistence.js";

vi.mock("node:fs/promises", () => ({ lstat: vi.fn(), mkdir: vi.fn(), open: vi.fn(), rename: vi.fn(), unlink: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); resetExecutionPolicyForTests(); });

function fixture(openedInode: bigint, pathInode = openedInode, size = 0n) {
  configureExecutionPolicy({ projectRoot: "/workspace", profile: "connected", allow: ["project-write", "source-content-persistence"] });
  vi.spyOn(MemiExecutionPolicy.prototype, "assertProjectWrite").mockResolvedValue();
  const stats = (ino: bigint, bigint: boolean) => ({
    dev: bigint ? 123n : 123, ino: bigint ? ino : Number(ino),
    nlink: bigint ? 1n : 1, size: bigint ? size : Number(size),
    isFile: () => true, isDirectory: () => true, isSymbolicLink: () => false,
  });
  const handle = {
    stat: vi.fn(async (options?: { bigint?: boolean }) => stats(openedInode, options?.bigint === true)),
    truncate: vi.fn(), writeFile: vi.fn(), close: vi.fn(async () => undefined), read: vi.fn(),
  };
  vi.mocked(open).mockResolvedValue(handle as never);
  vi.mocked(lstat).mockImplementation((async (_path: unknown, options?: { bigint?: boolean }) => stats(pathInode, options?.bigint === true)) as never);
  return handle;
}

describe("exact Windows file identities", () => {
  it("accepts matching inode IDs above the number precision limit", async () => {
    const handle = fixture(9_007_199_254_740_993n);
    await writeDiagnosisArtifact("/workspace/report", "source");
    expect(handle.writeFile).toHaveBeenCalledWith("source", "utf8");
    expect(handle.stat).toHaveBeenCalledWith({ bigint: true });
  });
  it.each([
    [9_007_199_254_740_992n, 9_007_199_254_740_993n],
    [0n, 0n],
  ])("denies mismatched or unknown inode %s / %s before truncation", async (opened, pathname) => {
    const handle = fixture(opened, pathname);
    await expect(writeDiagnosisArtifact("/workspace/report", "source")).rejects.toMatchObject({ capability: "project-write" });
    expect(handle.truncate).not.toHaveBeenCalled();
    expect(handle.writeFile).not.toHaveBeenCalled();
  });
  it("bounds bigint history sizes before buffer allocation", async () => {
    const handle = fixture(9_007_199_254_740_993n, undefined, 9_007_199_254_740_993n);
    await expect(writeDiagnosisArtifact("/workspace/history", current => current)).rejects.toThrow(/8 MiB/);
    expect(handle.read).not.toHaveBeenCalled();
    expect(handle.truncate).not.toHaveBeenCalled();
  });
  it.each([
    [9_007_199_254_740_993n, 9_007_199_254_740_993n, true],
    [9_007_199_254_740_992n, 9_007_199_254_740_993n, false],
    [0n, 0n, false],
  ])("binds exclusive handles using exact inode %s / %s", async (opened, pathname, accepted) => {
    const handle = fixture(opened, pathname);
    const result = getExecutionPolicy().openProjectWriteExclusive("/workspace/receipt", "write receipt");
    if (accepted) await expect(result).resolves.toBe(handle);
    else {
      await expect(result).rejects.toMatchObject({ capability: "project-write" });
      expect(handle.close).toHaveBeenCalled();
    }
    expect(handle.stat).toHaveBeenCalledWith({ bigint: true });
  });
  it("uses exact identities when releasing a history lock", async () => {
    const handle = fixture(9_007_199_254_740_992n, 9_007_199_254_740_993n);
    vi.spyOn(MemiExecutionPolicy.prototype, "openProjectWriteExclusive").mockResolvedValue(handle as never);
    await expect(withDiagnosisHistoryLock("/workspace/history", async () => undefined)).rejects.toThrow(/ownership changed/);
    expect(unlink).not.toHaveBeenCalled();
  });
});
