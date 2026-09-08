import { link, mkdir, mkdtemp, opendir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanSourcesWithMetadata } from "../source-scanner.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, opendir: vi.fn(actual.opendir) };
});
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.mocked(opendir).mockReset(); await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function root() { const path = await mkdtemp(join(tmpdir(), "memi-scan-boundary-")); roots.push(path); return path; }

describe("source scanner contained reads", () => {
  it("omits a hard-linked outside source and marks scan incomplete", async () => {
    const projectRoot = await root(); const outside = await root();
    await writeFile(join(outside, "outside.tsx"), "OUTSIDE_SENTINEL");
    await link(join(outside, "outside.tsx"), join(projectRoot, "Secret.tsx"));
    const result = await scanSourcesWithMetadata({ projectRoot, extensions: [".tsx"] });
    expect(result.sources).toEqual([]);
    expect(result.completeness.complete).toBe(false);
    expect(result.completeness.omissions).toContainEqual({ path: "Secret.tsx", reason: "unreadable" });
  });
  it("rejects a directory substituted after candidate enumeration", async () => {
    const projectRoot = await root(); const outside = await root();
    const source = join(projectRoot, "src"); await mkdir(source);
    await writeFile(join(source, "Secret.tsx"), "inside");
    await writeFile(join(outside, "Secret.tsx"), "OUTSIDE_SENTINEL");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let swapped = false;
    vi.mocked(opendir).mockImplementation((async (path: string) => {
      const entries = await actual.opendir(path);
      if (path === source && !swapped) {
        swapped = true; await rename(source, `${source}-parked`); await symlink(outside, source, "dir");
      }
      return entries;
    }) as never);
    const result = await scanSourcesWithMetadata({ projectRoot, extensions: [".tsx"] });
    expect(result.sources).toEqual([]);
    expect(result.completeness.complete).toBe(false);
    expect(result.completeness.omissions).toContainEqual({ path: "src/Secret.tsx", reason: "symlink" });
  });
  it("bounds files even when no byte budget is supplied", async () => {
    const projectRoot = await root(); await writeFile(join(projectRoot, "large.tsx"), "x".repeat(750_001));
    const result = await scanSourcesWithMetadata({ projectRoot, extensions: [".tsx"] });
    expect(result.sources).toEqual([]);
    expect(result.completeness.maxBytesPerFile).toBe(750_000);
    expect(result.completeness.omissions).toContainEqual({ path: "large.tsx", reason: "oversized" });
  });
  it.each([0, -1, Infinity, NaN, 1.5, 10_000_001])("rejects invalid byte budget %s", async maxBytesPerFile => {
    const projectRoot = await root();
    await expect(scanSourcesWithMetadata({ projectRoot, extensions: [".tsx"], maxBytesPerFile })).rejects.toThrow(/positive integer/);
  });
  it("preserves a clean local source and cancellation", async () => {
    const projectRoot = await root(); await writeFile(join(projectRoot, "Page.tsx"), "inside source");
    const options = { projectRoot, extensions: [".tsx"] };
    expect((await scanSourcesWithMetadata(options)).sources[0]?.content).toBe("inside source");
    const controller = new AbortController(); controller.abort();
    await expect(scanSourcesWithMetadata({ ...options, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
