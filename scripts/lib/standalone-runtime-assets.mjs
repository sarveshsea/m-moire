import { copyFile, mkdir, lstat } from "node:fs/promises";
import { dirname, join } from "node:path";

const REQUIRED_ASSETS = Object.freeze([
  "preview/templates/gallery-page.css",
  "preview/templates/gallery-page.client.js",
  "preview/templates/research-page.css",
  "preview/templates/research-page.client.js",
  "studio/harness-manifest.json",
]);

/** Compiled bootstrap modules read these sidecars relative to the executable. */
export async function copyStandaloneRuntimeAssets(root, stageDir) {
  for (const relativePath of REQUIRED_ASSETS) {
    const source = join(root, "src", relativePath);
    const entry = await lstat(source).catch(() => null);
    if (!entry?.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Required standalone runtime asset is missing or unsafe: ${source}`);
    }
  }
  for (const relativePath of REQUIRED_ASSETS) {
    const destination = join(stageDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, "src", relativePath), destination);
  }
}
