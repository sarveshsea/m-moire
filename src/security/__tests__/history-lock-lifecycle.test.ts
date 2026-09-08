import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureExecutionPolicy, getExecutionPolicy, resetExecutionPolicyForTests } from "../execution-policy.js";
import { withDiagnosisHistoryLock } from "../../app-quality/persistence.js";
const handoff = vi.hoisted(() => ({ lock: "", mode: "none", fired: false, afterRelease: null as (() => Promise<void>) | null }));
vi.mock("node:fs/promises", async original => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, realpath: async (...args: Parameters<typeof fs.realpath>) => {
    if (String(args[0]) === handoff.lock && !handoff.fired && handoff.mode !== "none") {
      handoff.fired = true;
      if (handoff.mode === "release") { await fs.rename(handoff.lock, `${handoff.lock}.released-fixture`); await handoff.afterRelease?.(); }
      else throw Object.assign(new Error("unexpected path resolution failure"), { code: handoff.mode === "other-path" ? "ENOENT" : handoff.mode, syscall: "realpath", path: handoff.mode === "other-path" ? `${handoff.lock}.parent` : handoff.lock });
    }
    return fs.realpath(...args);
  } };
});
let root: string; let ledger: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-lock-lifecycle-")); await mkdir(join(root, ".memoire")); ledger = join(root, ".memoire/history.jsonl"); handoff.lock = `${ledger}.lock`; handoff.mode = "none"; handoff.fired = false; handoff.afterRelease = null; configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); });
afterEach(async () => { resetExecutionPolicyForTests(); vi.restoreAllMocks(); vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
describe("history lock acquisition lifecycle", () => {
  it("restarts full acquisition when an existing owner releases between stat and realpath", async () => {
    await writeFile(handoff.lock, "previous owner"); handoff.mode = "release";
    const update = vi.fn(async () => { await writeFile(ledger, "new entry\n"); return "written"; });
    await expect(withDiagnosisHistoryLock(ledger, update)).resolves.toBe("written");
    expect(handoff.fired).toBe(true); expect(update).toHaveBeenCalledOnce();
    expect(await readFile(ledger, "utf8")).toBe("new entry\n");
    expect(await readFile(`${handoff.lock}.released-fixture`, "utf8")).toBe("previous owner");
    await expect(realpath(handoff.lock)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("revalidates containment after a released lock's parent is replaced", async () => {
    const outside = await mkdtemp(join(tmpdir(), "memi-lock-outside-"));
    try {
      await writeFile(handoff.lock, "previous owner"); handoff.mode = "release";
      handoff.afterRelease = async () => { await rename(join(root, ".memoire"), join(root, "retired")); await symlink(outside, join(root, ".memoire"), process.platform === "win32" ? "junction" : "dir"); };
      const update = vi.fn();
      await expect(withDiagnosisHistoryLock(ledger, update)).rejects.toMatchObject({ capability: "project-write" });
      expect(handoff.fired).toBe(true); expect(update).not.toHaveBeenCalled();
      await expect(realpath(join(outside, "history.jsonl.lock"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
  it.each(["EACCES", "EIO"])("propagates unexpected %s resolution failures without entering update", async code => {
    await writeFile(handoff.lock, "previous owner"); handoff.mode = code; const update = vi.fn();
    await expect(withDiagnosisHistoryLock(ledger, update)).rejects.toMatchObject({ code });
    expect(update).not.toHaveBeenCalled(); expect(await readFile(handoff.lock, "utf8")).toBe("previous owner");
  });
  it("propagates missing-path errors unrelated to the exact lock", async () => {
    await writeFile(handoff.lock, "previous owner"); handoff.mode = "other-path"; const update = vi.fn();
    await expect(withDiagnosisHistoryLock(ledger, update)).rejects.toMatchObject({ code: "ENOENT", path: `${handoff.lock}.parent` }); expect(update).not.toHaveBeenCalled();
  });
  it("exhausts the existing bounded acquisition budget without running update", async () => {
    vi.useFakeTimers();
    const acquire = vi.spyOn(Object.getPrototypeOf(getExecutionPolicy()), "openProjectWriteExclusive").mockRejectedValue(Object.assign(new Error("released"), { code: "ENOENT", syscall: "realpath", path: handoff.lock }));
    const update = vi.fn();
    const result = withDiagnosisHistoryLock(ledger, update).then(() => null, error => error as Error);
    await vi.runAllTimersAsync();
    expect((await result)?.message).toContain("history is busy");
    expect(acquire).toHaveBeenCalledTimes(100); expect(update).not.toHaveBeenCalled();
  });
  it("does not retry or create a missing parent directory", async () => {
    const update = vi.fn(); await expect(withDiagnosisHistoryLock(join(root, ".memoire/missing/history.jsonl"), update)).rejects.toMatchObject({ capability: "project-write" }); expect(update).not.toHaveBeenCalled();
  });
});
