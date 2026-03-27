import { afterEach, describe, expect, it } from "vitest";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { MemoireEngine } from "../core.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("project context persistence", () => {
  it("keeps detectedAt stable when the project shape has not changed", async () => {
    const root = join(tmpdir(), `memoire-project-context-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-project", type: "module" }, null, 2), "utf-8");

    const firstEngine = new MemoireEngine({ projectRoot: root });
    await firstEngine.init();
    const firstSnapshot = await readFile(join(root, ".memoire", "project.json"), "utf-8");

    const secondEngine = new MemoireEngine({ projectRoot: root });
    await secondEngine.init();
    const secondSnapshot = await readFile(join(root, ".memoire", "project.json"), "utf-8");

    expect(secondSnapshot).toBe(firstSnapshot);
  });
});
