import { createHash } from "node:crypto";
import { existsSync, lstatSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export const WIDGET_SCHEMA_VERSION = "2";

export interface WidgetFileAsset {
  path: string;
  exists: boolean;
  bytes: number | null;
  sha256: string | null;
}

export interface WidgetBundleMeta {
  widgetVersion: string;
  packageVersion: string | null;
  builtAt: string | null;
  bundleHash: string | null;
  manifest: WidgetFileAsset;
  code: WidgetFileAsset;
  ui: WidgetFileAsset;
}

export interface WidgetInstallMeta {
  installedAt: string | null;
  sourcePackageVersion: string | null;
  widgetVersion: string | null;
  bundleHash: string | null;
  sourcePath: string | null;
}

export interface WidgetBundleInfo {
  root: string;
  manifestPath: string;
  codePath: string;
  uiPath: string;
  metaPath: string;
  installMetaPath: string;
  exists: boolean;
  ready: boolean;
  meta: WidgetBundleMeta | null;
  installMeta: WidgetInstallMeta | null;
}

export type PluginHealth =
  | "current"
  | "stale-home-copy"
  | "local-only"
  | "missing-assets"
  | "symlink-risk"
  | "missing";

export interface PluginInstallHealth {
  manifestPath: string;
  installPath: string;
  source: "home" | "local" | "missing";
  symlinked: boolean;
  exists: boolean;
  current: boolean;
  health: PluginHealth;
  operatorConsole: boolean;
  widgetVersion: string | null;
  packageVersion: string | null;
  builtAt: string | null;
  bundleHash: string | null;
  bundle: WidgetBundleInfo;
  localBundle: WidgetBundleInfo;
}

export async function inspectWidgetBundle(pluginRoot: string): Promise<WidgetBundleInfo> {
  const root = resolve(pluginRoot);
  const manifestPath = join(root, "manifest.json");
  const codePath = join(root, "code.js");
  const uiPath = join(root, "ui.html");
  const metaPath = join(root, "widget-meta.json");
  const installMetaPath = join(root, "install-meta.json");

  const manifest = await createAsset(manifestPath);
  const code = await createAsset(codePath);
  const ui = await createAsset(uiPath);

  const exists = manifest.exists || code.exists || ui.exists;
  const ready = manifest.exists && code.exists && ui.exists;
  const meta = await readJson<WidgetBundleMeta>(metaPath);
  const installMeta = await readJson<WidgetInstallMeta>(installMetaPath);

  return {
    root,
    manifestPath,
    codePath,
    uiPath,
    metaPath,
    installMetaPath,
    exists,
    ready,
    meta: meta ?? (ready ? synthesizeMeta(manifest, code, ui) : null),
    installMeta,
  };
}

export async function resolvePluginHealth(projectRoot: string): Promise<PluginInstallHealth> {
  const localRoot = join(projectRoot, "plugin");
  const homeRoot = join(resolveHomeDir(), ".memoire", "plugin");
  const localBundle = await inspectWidgetBundle(localRoot);

  const homeManifestPath = join(homeRoot, "manifest.json");
  const localManifestPath = join(localRoot, "manifest.json");
  const homeExists = existsSync(homeManifestPath);
  const localExists = existsSync(localManifestPath);

  let source: "home" | "local" | "missing" = "missing";
  let installPath = localRoot;
  if (homeExists) {
    source = "home";
    installPath = homeRoot;
  } else if (localExists) {
    source = "local";
    installPath = localRoot;
  }

  const bundle = source === "home"
    ? await inspectWidgetBundle(homeRoot)
    : source === "local"
      ? localBundle
      : await inspectWidgetBundle(localRoot);

  const manifestPath = source === "home" ? homeManifestPath : localManifestPath;
  const symlinked = existsSync(manifestPath) ? safeIsSymlink(manifestPath) : false;
  const current = Boolean(
    source === "home" &&
      bundle.ready &&
      localBundle.ready &&
      bundle.meta?.bundleHash &&
      localBundle.meta?.bundleHash &&
      bundle.meta.bundleHash === localBundle.meta.bundleHash,
  );

  let health: PluginHealth = "missing";
  if (source === "missing") {
    health = "missing";
  } else if (!bundle.ready || !localBundle.ready) {
    health = "missing-assets";
  } else if (source === "home" && current) {
    health = "current";
  } else if (source === "home") {
    health = "stale-home-copy";
  } else if (symlinked) {
    health = "symlink-risk";
  } else {
    health = "local-only";
  }

  return {
    manifestPath,
    installPath,
    source,
    symlinked,
    exists: source !== "missing",
    current,
    health,
    operatorConsole: bundle.ready,
    widgetVersion: bundle.meta?.widgetVersion ?? null,
    packageVersion: bundle.meta?.packageVersion ?? null,
    builtAt: bundle.meta?.builtAt ?? null,
    bundleHash: bundle.meta?.bundleHash ?? null,
    bundle,
    localBundle,
  };
}

function resolveHomeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || "";
}

function safeIsSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

async function createAsset(path: string): Promise<WidgetFileAsset> {
  try {
    const [buffer, stats] = await Promise.all([readFile(path), stat(path)]);
    return {
      path,
      exists: true,
      bytes: stats.size,
      sha256: sha256(buffer),
    };
  } catch {
    return {
      path,
      exists: false,
      bytes: null,
      sha256: null,
    };
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function synthesizeMeta(
  manifest: WidgetFileAsset,
  code: WidgetFileAsset,
  ui: WidgetFileAsset,
): WidgetBundleMeta {
  const bundleHash = sha256(JSON.stringify([
    manifest.sha256 ?? "missing",
    code.sha256 ?? "missing",
    ui.sha256 ?? "missing",
  ]));

  return {
    widgetVersion: WIDGET_SCHEMA_VERSION,
    packageVersion: null,
    builtAt: null,
    bundleHash,
    manifest,
    code,
    ui,
  };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
