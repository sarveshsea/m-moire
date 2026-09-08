import { afterEach, describe, expect, it, vi } from "vitest";
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { configureExecutionPolicy, MemiExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { withDiagnosisHistoryLock, writeDiagnosisArtifact } from "../persistence.js";
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(rename).mockReset();
  resetExecutionPolicyForTests();
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function root() { const path = await mkdtemp(join(tmpdir(), "memi-report-race-")); roots.push(path); return path; }

describe("diagnosis handle persistence", () => {
  it("preserves a replacement lock substituted during cleanup rename", async () => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    const path = join(projectRoot, "history.jsonl");
    const lockPath = `${path}.lock`;
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(rename).mockImplementationOnce(async (from, to) => {
      await actual.rename(from, `${lockPath}.original`);
      await writeFile(from, "replacement owner");
      await actual.rename(from, to);
      await writeFile(lockPath, "next owner");
    });
    await expect(withDiagnosisHistoryLock(path, async () => undefined)).rejects.toThrow(/ownership changed/);
    expect(await readFile(lockPath, "utf8")).toBe("next owner");
    const released = (await readdir(projectRoot)).find(name => name.includes(".released-"));
    expect(released).toBeDefined();
    expect(await readFile(join(projectRoot, released!), "utf8")).toBe("replacement owner");
  });
  it("replaces report content and updates existing ledger content without stale trailing bytes", async () => {
    const projectRoot = await root();
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    const path = join(projectRoot, "report.json");
    await writeDiagnosisArtifact(path, "first report");
    await writeDiagnosisArtifact(path, "next");
    await writeDiagnosisArtifact(path, current => `${current}\nentry`);
    expect(await readFile(path, "utf8")).toBe("next\nentry");
  });
  it("does not truncate or write an outside file when its parent is swapped after validation", async () => {
    const projectRoot = await root();
    const outsideRoot = await root();
    const directory = join(projectRoot, "reports");
    await mkdir(directory);
    await writeFile(join(outsideRoot, "report.json"), "outside sentinel");
    const policy = configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    const original = MemiExecutionPolicy.prototype.assertProjectWrite;
    let swapped = false;
    vi.spyOn(MemiExecutionPolicy.prototype, "assertProjectWrite").mockImplementation(async function (path, operation) {
      await original.call(this, path, operation);
      if (this === policy && !swapped) {
        swapped = true;
        await rename(directory, `${directory}-safe`);
        await symlink(outsideRoot, directory, "dir");
      }
    });
    await expect(writeDiagnosisArtifact(join(directory, "report.json"), "private source")).rejects.toMatchObject({ capability: "project-write" });
    expect(await readFile(join(outsideRoot, "report.json"), "utf8")).toBe("outside sentinel");
  });
  it("rejects hard-linked output before modifying the shared inode", async () => {
    const projectRoot = await root();
    const outsideRoot = await root();
    const outside = join(outsideRoot, "sentinel");
    await writeFile(outside, "untouched");
    const path = join(projectRoot, "report");
    await link(outside, path);
    configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
    await expect(writeDiagnosisArtifact(path, "private source")).rejects.toMatchObject({ capability: "project-write" });
    expect(await readFile(outside, "utf8")).toBe("untouched");
  });
});
