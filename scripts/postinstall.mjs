#!/usr/bin/env node

/**
 * Mémoire postinstall — copies the Figma plugin to a user-accessible
 * location and prints PATH guidance if the `memi` binary isn't reachable.
 */

import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, realpathSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");

// ── 1. Copy Figma plugin to ~/.memoire/plugin ───────────────────

const pluginSrc = join(packageRoot, "plugin");
const home = process.env.HOME || process.env.USERPROFILE || "";
const pluginDest = join(home, ".memoire", "plugin");

if (existsSync(pluginSrc) && home) {
  try {
    const resolvedPluginSrc = realpathSync.native(pluginSrc);
    mkdirSync(dirname(pluginDest), { recursive: true });
    rmSync(pluginDest, { recursive: true, force: true });
    cpSync(resolvedPluginSrc, pluginDest, { recursive: true, dereference: true, force: true });
    const widgetMetaPath = join(pluginDest, "widget-meta.json");
    let widgetMeta = null;
    try {
      widgetMeta = JSON.parse(readFileSync(widgetMetaPath, "utf-8"));
    } catch {
      widgetMeta = null;
    }
    writeFileSync(
      join(pluginDest, "install-meta.json"),
      JSON.stringify({
        installedAt: new Date().toISOString(),
        sourcePackageVersion: widgetMeta?.packageVersion ?? null,
        widgetVersion: widgetMeta?.widgetVersion ?? null,
        bundleHash: widgetMeta?.bundleHash ?? null,
        sourcePath: resolvedPluginSrc,
      }, null, 2) + "\n",
      "utf-8",
    );
    console.log(`  + Figma plugin copied to ${pluginDest}`);
    if (widgetMeta?.packageVersion || widgetMeta?.widgetVersion) {
      console.log(
        `    Widget V2 bundle ${widgetMeta?.widgetVersion ?? "unknown"} / package ${widgetMeta?.packageVersion ?? "unknown"}`,
      );
    }
    console.log(`    Use this path when importing the plugin manifest in Figma.`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`  ! Could not copy the Figma plugin to ${pluginDest}: ${detail}`);
    console.warn(`    Import ${join(pluginSrc, "manifest.json")} manually if needed.`);
  }
}

// ── 2. Check if memi is reachable via PATH ──────────────────────
// npm sets npm_config_prefix during install — no shell spawning needed.

const pathDirs = (process.env.PATH || "").split(":");
const memiReachable = pathDirs.some((dir) => existsSync(join(dir, "memi")));

if (!memiReachable) {
  // npm_config_prefix is set by npm during install (no execSync needed)
  const npmPrefix = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX || "";
  if (npmPrefix) {
    const binDir = join(npmPrefix, "bin");
    const shell = process.env.SHELL || "/bin/zsh";
    const rcFile = shell.includes("zsh") ? "~/.zshrc" : "~/.bashrc";

    console.log(`
  ! The "memi" command is not in your PATH.
    Add this to ${rcFile}:

      export PATH="${binDir}:$PATH"

    Then restart your terminal or run: source ${rcFile}
`);
  }
}
