import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanSourcesWithMetadata } from "../source-scanner.js";
import { diagnoseAppQuality } from "../../app-quality/engine.js";
describe("cooperative audit cancellation", () => {
  it("rejects an aborted diagnosis instead of producing a report", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-cancel-"));
    try {
      const controller = new AbortController(); controller.abort(new Error("cancel audit"));
      await expect(diagnoseAppQuality({ projectRoot: root, write: false, signal: controller.signal })).rejects.toThrow("cancel audit");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("rejects mid traversal and does not convert cancellation into an unreadable omission", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-cancel-"));
    try {
      await writeFile(join(root, "a.tsx"), "<main />"); await writeFile(join(root, "b.tsx"), "<main />");
      const controller = new AbortController();
      await expect(scanSourcesWithMetadata({ projectRoot: root, extensions: ["tsx"], signal: controller.signal,
        excludePath: () => { controller.abort(new Error("cancel traversal")); return false; },
      })).rejects.toThrow("cancel traversal");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
