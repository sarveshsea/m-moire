import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePluginHealth } from "../install-info.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).reverse().map((path) => rm(path, { recursive: true, force: true })));
});

describe("resolvePluginHealth", () => {
  it("flags symlinked local plugin roots as symlink-risk", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-install-info-"));
    cleanup.push(root);

    const projectRoot = join(root, "project");
    const realPluginRoot = join(root, "real-plugin");
    const linkedPluginRoot = join(projectRoot, "plugin");

    await mkdir(projectRoot, { recursive: true });
    await mkdir(realPluginRoot, { recursive: true });
    await writeBundle(realPluginRoot);
    await symlink(realPluginRoot, linkedPluginRoot);

    const previousHome = process.env.HOME;
    process.env.HOME = join(root, "fake-home");

    try {
      const health = await resolvePluginHealth(projectRoot);
      expect(health.health).toBe("symlink-risk");
      expect(health.symlinked).toBe(true);
      expect(health.source).toBe("local");
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });

  it("flags plugin manifests reached through a symlinked project root", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-install-info-"));
    cleanup.push(root);

    const realProjectRoot = join(root, "real-project");
    const linkedProjectRoot = join(root, "linked-project");
    const realPluginRoot = join(realProjectRoot, "plugin");

    await mkdir(realPluginRoot, { recursive: true });
    await writeBundle(realPluginRoot);
    await symlink(realProjectRoot, linkedProjectRoot);

    const previousHome = process.env.HOME;
    process.env.HOME = join(root, "fake-home");

    try {
      const health = await resolvePluginHealth(linkedProjectRoot);
      expect(health.health).toBe("symlink-risk");
      expect(health.symlinked).toBe(true);
      expect(health.source).toBe("local");
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  });
});

async function writeBundle(pluginRoot: string) {
  await writeFile(join(pluginRoot, "manifest.json"), JSON.stringify({ name: "memoire-plugin" }), "utf-8");
  await writeFile(join(pluginRoot, "code.js"), "console.log('widget');\n", "utf-8");
  await writeFile(join(pluginRoot, "ui.html"), "<html><body>Operator Console</body></html>\n", "utf-8");
  const manifest = await readFile(join(pluginRoot, "manifest.json"), "utf-8");
  const code = await readFile(join(pluginRoot, "code.js"), "utf-8");
  const ui = await readFile(join(pluginRoot, "ui.html"), "utf-8");
  await writeFile(join(pluginRoot, "widget-meta.json"), JSON.stringify({
    widgetVersion: "2",
    packageVersion: "0.2.1",
    builtAt: "2026-03-27T12:00:00.000Z",
    bundleHash: "bundle-hash",
    manifest: {
      path: join(pluginRoot, "manifest.json"),
      exists: true,
      bytes: Buffer.byteLength(manifest),
      sha256: "manifest-hash",
    },
    code: {
      path: join(pluginRoot, "code.js"),
      exists: true,
      bytes: Buffer.byteLength(code),
      sha256: "code-hash",
    },
    ui: {
      path: join(pluginRoot, "ui.html"),
      exists: true,
      bytes: Buffer.byteLength(ui),
      sha256: "ui-hash",
    },
  }, null, 2), "utf-8");
}
