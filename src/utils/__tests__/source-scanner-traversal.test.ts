import { mkdir, mkdtemp, opendir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanSourcesWithMetadata } from "../source-scanner.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, opendir: vi.fn(actual.opendir) };
});
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "memi-traversal-")); roots.push(root); return root; }

describe("bounded source traversal", () => {
  it("stops enumerating a wide directory, reports partial discovery, and retains eligible source", async () => {
    const root = await fixture(); await writeFile(join(root, "00000.tsx"), "inside");
    let yielded = 0;
    vi.mocked(opendir).mockImplementationOnce((async () => ({
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < 100_000; index++) {
          yielded += 1;
          yield { name: `${String(index).padStart(5, "0")}.tsx`, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
        }
      },
    })) as never);
    const result = await scanSourcesWithMetadata({ projectRoot: root, extensions: [".tsx"], maxFiles: 1 });
    expect(result.sources[0]?.content).toBe("inside");
    expect(yielded).toBeGreaterThan(0);
    expect(yielded).toBeLessThanOrEqual(5001);
    expect(result.completeness.complete).toBe(false);
    expect(result.completeness.omissions).toContainEqual({ path: ".", reason: "entry-limit" });
    expect(result.completeness).toMatchObject({ traversal: { maxEntries: 5000, maxDepth: 20, entriesVisited: 5000, discoveryComplete: false } });
  });

  it("omits descendants beyond depth twenty and keeps shallower sources", async () => {
    const root = await fixture(); await writeFile(join(root, "Page.tsx"), "inside");
    const nested = join(root, ...Array.from({ length: 21 }, () => "d"));
    await mkdir(nested, { recursive: true }); await writeFile(join(nested, "Deep.tsx"), "DEEP_SENTINEL");
    const result = await scanSourcesWithMetadata({ projectRoot: root, extensions: [".tsx"] });
    expect(result.sources.map(source => source.content)).toEqual(["inside"]);
    expect(result.completeness.complete).toBe(false);
    expect(result.completeness.omissions).toContainEqual({ path: Array(21).fill("d").join("/"), reason: "depth-limit" });
    expect(result.completeness).toMatchObject({ traversal: { discoveryComplete: false } });
  });

  it("reports complete discovery for an ordinary bounded tree", async () => {
    const root = await fixture(); await mkdir(join(root, "src")); await writeFile(join(root, "src/Page.tsx"), "inside");
    const result = await scanSourcesWithMetadata({ projectRoot: root, extensions: [".tsx"] });
    expect(result.completeness.complete).toBe(true);
    expect(result.completeness).toMatchObject({ traversal: { entriesVisited: 2, discoveryComplete: true } });
  });

  it("shares the entry budget across sibling directories", async () => {
    const root = await fixture();
    for (const name of ["a", "b"]) await mkdir(join(root, name));
    await writeFile(join(root, "a/00000.tsx"), "inside");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(opendir).mockImplementation((async (path: string) => path === root ? actual.opendir(path) : ({
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index < 3000; index++) {
          yield { name: `${String(index).padStart(5, "0")}.tsx`, isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
        }
      },
    })) as never);
    const result = await scanSourcesWithMetadata({ projectRoot: root, extensions: [".tsx"], maxFiles: 1 });
    expect(result.sources[0]?.content).toBe("inside");
    expect(result.completeness.traversal?.entriesVisited).toBe(5000);
    expect(result.completeness.omissions).toContainEqual({ path: "b", reason: "entry-limit" });
  });

  it("closes the directory iterator and rejects cancellation during enumeration", async () => {
    const root = await fixture(); const controller = new AbortController(); let closed = false;
    vi.mocked(opendir).mockImplementationOnce((async () => ({
      async *[Symbol.asyncIterator]() {
        try {
          controller.abort(new Error("cancel directory enumeration"));
          yield { name: "Page.tsx", isFile: () => true, isDirectory: () => false, isSymbolicLink: () => false };
        } finally { closed = true; }
      },
    })) as never);
    await expect(scanSourcesWithMetadata({ projectRoot: root, extensions: [".tsx"], signal: controller.signal })).rejects.toThrow("cancel directory enumeration");
    expect(closed).toBe(true);
  });
});
