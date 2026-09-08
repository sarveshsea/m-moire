import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("compiled package version sidecar resolution", () => {
  it.each([
    "file:///B:/~BUN/root/memi.exe",
    "file:///B:/%7EBUN/root/probe.exe",
    "file:///b:/%7ebun/root/probe.exe",
    "file:///b:/~bun/root/memi.exe",
    "file:///$bunfs/root/memi",
  ])("reads the executable sidecar for virtual module URL %s", async moduleUrl => {
    const root = await mkdtemp(join(tmpdir(), "memi-compiled-version-"));
    roots.push(root);
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.8.0-beta.1" }));
    // Execute the actual bundled resolver with Bun's virtual module URL and a
    // real sidecar. This reproduces resolution semantics, not Windows execution.
    const built = buildSync({
      entryPoints: [resolve("src/utils/package-version.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false,
      define: { "import.meta.url": JSON.stringify(moduleUrl) },
    });
    const module = { exports: {} as { getMemoirePackageVersion(): string } };
    runInNewContext(built.outputFiles[0].text, {
      module,
      exports: module.exports,
      require: createRequire(import.meta.url),
      process: { execPath: join(root, "memi.exe"), env: {} },
    });
    expect(module.exports.getMemoirePackageVersion()).toBe("2.8.0-beta.1");
  });
  it("keeps an ordinary file URL containing ~BUN rooted at its package", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-normal-version-"));
    roots.push(root);
    const modulePath = join(root, "~BUN", "utils", "package-version.ts");
    await mkdir(dirname(modulePath), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "9.8.7-test" }));
    const built = buildSync({
      entryPoints: [resolve("src/utils/package-version.ts")],
      bundle: true, platform: "node", format: "cjs", write: false,
      define: { "import.meta.url": JSON.stringify(pathToFileURL(modulePath).href) },
    });
    const module = { exports: {} as { getMemoirePackageVersion(): string } };
    runInNewContext(built.outputFiles[0].text, {
      module, exports: module.exports, require: createRequire(import.meta.url),
      process: { execPath: join(root, "elsewhere", "memi.exe"), env: {} },
    });
    expect(module.exports.getMemoirePackageVersion()).toBe("9.8.7-test");
  });

});
