import { mkdir, mkdtemp, rm, rename, access, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const NPM_REGISTRY_URL = "https://registry.npmjs.org";
const FETCH_TIMEOUT_MS = 15000;

export interface NpmPackageDist {
  tarball: string;
  shasum?: string;
  integrity?: string;
}

export interface NpmPackageMetadata {
  name: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, { name: string; version: string; dist?: NpmPackageDist }>;
}

export interface CachedNpmPackage {
  packageName: string;
  version: string;
  packageDir: string;
  tarballPath: string;
  dist: NpmPackageDist;
}

export async function fetchNpmPackageToCache(
  packageName: string,
  cwd: string,
  versionRange = "latest",
): Promise<CachedNpmPackage> {
  const metadata = await fetchNpmMetadata(packageName);
  const version = resolveVersion(metadata, versionRange);
  const dist = metadata.versions?.[version]?.dist;
  if (!dist?.tarball) {
    throw new Error(`npm package ${packageName}@${version} has no tarball`);
  }

  const cacheRoot = join(cwd, ".memoire", "cache", "registries", sanitizePackageName(packageName), version);
  const packageDir = join(cacheRoot, "package");
  const tarballPath = join(cacheRoot, "package.tgz");
  if (await exists(join(packageDir, "registry.json"))) {
    return { packageName, version, packageDir, tarballPath, dist };
  }

  await mkdir(cacheRoot, { recursive: true });
  await downloadFile(dist.tarball, tarballPath);

  const tempExtractDir = await mkdtemp(join(tmpdir(), "memoire-npm-registry-"));
  try {
    await extractTarball(tarballPath, tempExtractDir);
    await rm(packageDir, { recursive: true, force: true });
    await rename(join(tempExtractDir, "package"), packageDir);
  } finally {
    await rm(tempExtractDir, { recursive: true, force: true });
  }

  return { packageName, version, packageDir, tarballPath, dist };
}

async function fetchNpmMetadata(packageName: string): Promise<NpmPackageMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${NPM_REGISTRY_URL}/${encodeURIComponent(packageName)}`, {
      signal: controller.signal,
      headers: { "User-Agent": "memoire-registry-resolver" },
    });
    if (!response.ok) {
      throw new Error(`npm registry lookup failed for ${packageName}: ${response.status}`);
    }
    return await response.json() as NpmPackageMetadata;
  } finally {
    clearTimeout(timer);
  }
}

function resolveVersion(metadata: NpmPackageMetadata, versionRange: string): string {
  if (versionRange === "latest") {
    const latest = metadata["dist-tags"]?.latest;
    if (!latest) throw new Error(`npm package ${metadata.name} has no latest dist-tag`);
    return latest;
  }
  if (metadata.versions?.[versionRange]) return versionRange;
  throw new Error(`npm package ${metadata.name} does not contain version ${versionRange}`);
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) {
      throw new Error(`tarball download failed (${response.status}): ${url}`);
    }
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  } finally {
    clearTimeout(timer);
  }
}

async function extractTarball(tarballPath: string, outDir: string): Promise<void> {
  await run("tar", ["-xzf", tarballPath, "-C", outDir]);
}

async function run(command: string, args: string[]): Promise<void> {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const code = await new Promise<number | null>((resolve) => {
    child.on("close", resolve);
  });
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${stderr.trim() || code}`);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function sanitizePackageName(packageName: string): string {
  return packageName.replace(/^@/, "").replace(/\//g, "__").replace(/[^a-zA-Z0-9_.-]/g, "_");
}
