import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as scanner from "../source-scanner.js";
const roots: string[] = [];
async function root() { const path = await mkdtemp(join(tmpdir(), "memi-completeness-")); roots.push(path); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe("source scan completeness", () => {
  it("reports every over-budget candidate without claiming a complete scan", async () => {
    const path = await root();
    for (const name of ["a.tsx", "b.tsx", "c.tsx"]) await writeFile(join(path, name), "<div />");
    const result = await scanner.scanSourcesWithMetadata({ projectRoot: path, extensions: ["tsx"], maxFiles: 1 });
    expect(result.sources.map(file => file.path)).toEqual(["a.tsx"]);
    expect(result.completeness).toMatchObject({ complete: false, discoveredFiles: 3, scannedFiles: 1 });
    expect(result.completeness.omissions).toEqual([
      { path: "b.tsx", reason: "max-files" }, { path: "c.tsx", reason: "max-files" },
    ]);
  });
  it("reports oversized, excluded and unreadable files distinctly", async () => {
    const path = await root();
    await writeFile(join(path, "large.tsx"), "x".repeat(100));
    await writeFile(join(path, "secret.tsx"), "<div />");
    await chmod(join(path, "secret.tsx"), 0);
    await mkdir(join(path, "generated"));
    await writeFile(join(path, "generated/ignored.tsx"), "<div />");
    try {
      const result = await scanner.scanSourcesWithMetadata({ projectRoot: path, extensions: ["tsx"], maxBytesPerFile: 30, excludePath: p => p === "generated" });
      expect(result.completeness.complete).toBe(false);
      expect(result.completeness.omissions).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "large.tsx", reason: "oversized" }),
        expect.objectContaining({ path: "secret.tsx", reason: "unreadable" }),
        expect.objectContaining({ path: "generated", reason: "excluded" }),
      ]));
    } finally { await chmod(join(path, "secret.tsx"), 0o600); }
  });
});
