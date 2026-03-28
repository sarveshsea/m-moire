import { build } from "vite";
import { access, copyFile, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetVersion = "2";

export async function buildPluginBundle(options = {}) {
  const rootDir = options.rootDir ? resolve(options.rootDir) : defaultRoot;
  const outDir = options.outDir ? resolve(options.outDir) : resolve(rootDir, "plugin");
  const uiSourceDir = resolve(rootDir, "src", "plugin", "ui");
  const uiEntry = resolve(uiSourceDir, "index.html");
  const mainEntry = resolve(rootDir, "src", "plugin", "main", "index.ts");
  const tempRoot = await mkdtemp(join(tmpdir(), "memoire-plugin-"));
  const uiOutDir = join(tempRoot, "ui");

  await build({
    configFile: false,
    root: rootDir,
    publicDir: false,
    build: {
      target: "es2019",
      minify: false,
      emptyOutDir: false,
      outDir,
      lib: {
        entry: mainEntry,
        formats: ["iife"],
        name: "MemoirePluginMain",
        fileName: () => "code.js",
      },
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
  });

  const bareMainOutput = join(outDir, "code");
  try {
    await access(bareMainOutput);
    await rm(join(outDir, "code.js"), { force: true });
    await rename(bareMainOutput, join(outDir, "code.js"));
  } catch {
    // Vite emitted code.js directly.
  }

  await build({
    configFile: false,
    root: uiSourceDir,
    publicDir: false,
    build: {
      target: "es2019",
      minify: false,
      emptyOutDir: true,
      outDir: uiOutDir,
      rollupOptions: {
        input: uiEntry,
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  });

  const manifestSource = resolve(rootDir, "plugin", "manifest.json");
  const manifestTarget = join(outDir, "manifest.json");
  try {
    await access(manifestTarget);
  } catch {
    await copyFile(manifestSource, manifestTarget);
  }

  const html = await readFile(join(uiOutDir, "index.html"), "utf-8");
  const inlined = await inlineAssets(html, uiOutDir);
  await writeFile(join(outDir, "ui.html"), inlined, "utf-8");
  await writeWidgetMeta(rootDir, outDir);
  await rm(tempRoot, { recursive: true, force: true });

  return {
    outDir,
    codePath: join(outDir, "code.js"),
    htmlPath: join(outDir, "ui.html"),
    metaPath: join(outDir, "widget-meta.json"),
  };
}

export const buildPlugin = buildPluginBundle;

async function inlineAssets(html, outDir) {
  let result = html;

  const scriptMatches = [...html.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)];
  for (const match of scriptMatches) {
    const assetPath = join(outDir, match[1]);
    const source = await readFile(assetPath, "utf-8");
    result = result.replace(match[0], `<script>${source}</script>`);
  }

  const styleMatches = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];
  for (const match of styleMatches) {
    const assetPath = join(outDir, match[1]);
    const source = await readFile(assetPath, "utf-8");
    result = result.replace(match[0], `<style>\n${source}\n</style>`);
  }

  return result;
}

async function writeWidgetMeta(rootDir, outDir) {
  const packageJson = JSON.parse(await readFile(join(rootDir, "package.json"), "utf-8"));
  const manifest = await createAsset(join(outDir, "manifest.json"));
  const code = await createAsset(join(outDir, "code.js"));
  const ui = await createAsset(join(outDir, "ui.html"));
  const bundleHash = sha256(JSON.stringify([
    manifest.sha256 || "missing",
    code.sha256 || "missing",
    ui.sha256 || "missing",
  ]));

  await writeFile(
    join(outDir, "widget-meta.json"),
    JSON.stringify({
      widgetVersion,
      packageVersion: packageJson.version ?? null,
      builtAt: new Date().toISOString(),
      bundleHash,
      manifest,
      code,
      ui,
    }, null, 2) + "\n",
    "utf-8",
  );
}

async function createAsset(path) {
  const buffer = await readFile(path);
  return {
    path,
    exists: true,
    bytes: buffer.byteLength,
    sha256: sha256(buffer),
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  await buildPluginBundle();
}
