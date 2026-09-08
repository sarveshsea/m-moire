import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isPrivateOrLocalHostname } from "../security/network-address.js";
import { fetchPublicText } from "../security/safe-fetch.js";
import { readContainedSource } from "../security/contained-source.js";

export interface ScannedSourceFile {
  id: string;
  path: string;
  projectPath: string;
  absolutePath: string;
  content: string;
  extension: string;
  sizeBytes?: number;
  url?: string;
}

export interface SourceScanOptions {
  signal?: AbortSignal;
  projectRoot: string;
  target?: string;
  extensions: Iterable<string>;
  ignoreDirs?: Iterable<string>;
  maxFiles?: number;
  maxBytesPerFile?: number;
  concurrency?: number;
  fetchTimeoutMs?: number;
  includeInlineStyles?: boolean;
  includeLinkedStyles?: boolean;
  maxLinkedStyles?: number;
  userAgent?: string;
  /** Excludes project-relative paths before they consume the max-files budget. */
  excludePath?: (projectPath: string) => boolean;
}

const DEFAULT_IGNORE_DIRS = [
  ".git",
  ".memoire",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
];

const DEFAULT_MAX_FILES = 500;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RESPONSE_BYTES = 750_000;

export interface SourceScanOmission {
  path: string;
  reason: "max-files" | "oversized" | "unreadable" | "excluded" | "symlink" | "linked-style-limit";
}
export interface SourceScanCompleteness {
  /** Complete only for eligible files within configured extensions/target/exclusions, never the entire repository. */
  complete: boolean;
  scope: "configured-extensions-and-exclusions";
  discoveredFiles: number;
  scannedFiles: number;
  maxFiles: number;
  maxBytesPerFile?: number;
  omissions: SourceScanOmission[];
}
export interface SourceScanResult {
  sources: ScannedSourceFile[];
  completeness: SourceScanCompleteness;
}

/** Compatibility surface; audit callers should use scanSourcesWithMetadata. */
export async function scanSources(options: SourceScanOptions): Promise<ScannedSourceFile[]> {
  return (await scanSourcesWithMetadata(options)).sources;
}

export async function scanSourcesWithMetadata(options: SourceScanOptions): Promise<SourceScanResult> {
  options.signal?.throwIfAborted();
  const maxBytesPerFile = options.maxBytesPerFile ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isSafeInteger(maxBytesPerFile) || maxBytesPerFile < 1 || maxBytesPerFile > 10_000_000) {
    throw new Error("maxBytesPerFile must be a positive integer no greater than 10000000");
  }
  const boundedOptions = { ...options, maxBytesPerFile };
  const target = options.target ?? options.projectRoot;
  const maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES);
  if (isHttpUrl(target)) {
    assertSafePublicHttpUrl(target);
    return scanUrlWithMetadata(target, boundedOptions, maxFiles);
  }
  const root = resolve(options.projectRoot);
  const resolvedTarget = resolve(isAbsolute(target) ? target : resolve(root, target));
  assertPathWithinRoot(root, resolvedTarget);
  const targetStat = await stat(resolvedTarget);
  const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(resolvedTarget)]);
  assertPathWithinRoot(realRoot, realTarget);
  const extensions = normalizeExtensions(options.extensions);
  const omissions: SourceScanOmission[] = [];
  const candidates: string[] = [];
  const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs ?? [])]);
  if (targetStat.isFile()) {
    const path = normalizePath(relative(root, resolvedTarget));
    if (options.excludePath?.(path)) omissions.push({ path, reason: "excluded" });
    else if (extensions.has(extname(resolvedTarget).toLowerCase())) candidates.push(resolvedTarget);
  } else if (targetStat.isDirectory()) {
    await walkCandidates(root, resolvedTarget, extensions, ignoreDirs, candidates, omissions, options.excludePath, options.signal);
  } else throw new Error(`Unsupported source target: ${target}`);
  options.signal?.throwIfAborted();
  const selected = candidates.slice(0, maxFiles);
  for (const path of candidates.slice(maxFiles)) omissions.push({ path: normalizePath(relative(root, path)), reason: "max-files" });
  const results = await mapWithConcurrency(selected, options.concurrency ?? DEFAULT_CONCURRENCY, async filePath => {
    const path = normalizePath(relative(root, filePath));
    options.signal?.throwIfAborted();
    try {
      return await readLocalFile(root, filePath, resolvedTarget, maxBytesPerFile, options.signal);
    } catch {
      options.signal?.throwIfAborted();
      return { omission: { path, reason: "unreadable" as const } };
    }
  });
  options.signal?.throwIfAborted();
  const sources = results.flatMap(result => "source" in result ? [result.source] : []);
  const allOmissions = [...omissions, ...results.flatMap(result => "omission" in result ? [result.omission] : [])];
  return scanResult(sources, allOmissions, candidates.length, boundedOptions, maxFiles);
}

function scanResult(sources: ScannedSourceFile[], omissions: SourceScanOmission[], discoveredFiles: number,
  options: SourceScanOptions, maxFiles: number): SourceScanResult {
  return { sources, completeness: {
    complete: omissions.every(omission => omission.reason === "excluded"),
    scope: "configured-extensions-and-exclusions",
    discoveredFiles,
    scannedFiles: sources.length,
    maxFiles,
    maxBytesPerFile: options.maxBytesPerFile,
    omissions: [...omissions].sort((a, b) => a.path.localeCompare(b.path) || a.reason.localeCompare(b.reason)),
  } };
}

async function walkCandidates(projectRoot: string, dir: string, extensions: Set<string>, ignoreDirs: Set<string>,
  files: string[], omissions: SourceScanOmission[], excludePath?: (projectPath: string) => boolean, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { signal?.throwIfAborted(); omissions.push({ path: normalizePath(relative(projectRoot, dir)) || ".", reason: "unreadable" }); return; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    signal?.throwIfAborted();
    const fullPath = join(dir, entry.name);
    const path = normalizePath(relative(projectRoot, fullPath));
    if (entry.isSymbolicLink()) { omissions.push({ path, reason: "symlink" }); continue; }
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name) || excludePath?.(path)) omissions.push({ path, reason: "excluded" });
      else await walkCandidates(projectRoot, fullPath, extensions, ignoreDirs, files, omissions, excludePath, signal);
    } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
      if (excludePath?.(path)) omissions.push({ path, reason: "excluded" });
      else files.push(fullPath);
    }
  }
}

async function readLocalFile(
  projectRoot: string,
  filePath: string,
  sourceRoot: string,
  maxBytesPerFile: number,
  signal?: AbortSignal,
): Promise<{ source: ScannedSourceFile } | { omission: SourceScanOmission }> {
  signal?.throwIfAborted();
  const fileStat = await lstat(filePath);
  if ((fileStat.mode & 0o444) === 0) throw new Error("Source has no read permission bits");
  const projectPath = normalizePath(relative(projectRoot, filePath));
  const result = await readContainedSource(projectRoot, projectPath, maxBytesPerFile, signal);
  if (!result.ok) {
    const reason = result.reason === "file-byte-limit" ? "oversized"
      : result.reason === "symlink" ? "symlink" : "unreadable";
    return { omission: { path: projectPath, reason } };
  }
  signal?.throwIfAborted();
  const path = normalizePath(relative(sourceRoot, filePath)) || projectPath || filePath;
  return { source: {
    id: path,
    path,
    projectPath: projectPath || path,
    absolutePath: filePath,
    content: result.content,
    extension: extname(filePath).toLowerCase(),
    sizeBytes: Buffer.byteLength(result.content),
  } };
}

async function scanUrlWithMetadata(url: string, options: SourceScanOptions, maxFiles: number): Promise<SourceScanResult> {
  const timeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const extensions = normalizeExtensions(options.extensions);
  const html = await fetchText(url, timeoutMs, options.userAgent ?? "Memoire-SourceScanner/1.0");
  options.signal?.throwIfAborted();
  const candidates: ScannedSourceFile[] = extensions.has(".html") ? [urlSource(url, html, ".html")] : [];
  const omissions: SourceScanOmission[] = [];
  if (extensions.has(".css") && options.includeInlineStyles !== false) {
    extractInlineStyles(html).forEach((block, index) => candidates.push(urlSource(`${url}#inline-${index + 1}`, block, ".css")));
  }
  let discoveredFiles = candidates.length;
  if (extensions.has(".css") && options.includeLinkedStyles) {
    const urls = extractStylesheetUrls(html, url);
    discoveredFiles += urls.length;
    const selected = urls.slice(0, options.maxLinkedStyles ?? 12);
    for (const path of urls.slice(selected.length)) omissions.push({ path, reason: "linked-style-limit" });
    for (const [index, sheetUrl] of selected.entries()) {
      options.signal?.throwIfAborted();
      if (candidates.length >= maxFiles) { omissions.push({ path: sheetUrl, reason: "max-files" }); continue; }
      try {
        const content = await fetchText(sheetUrl, timeoutMs, options.userAgent ?? "Memoire-SourceScanner/1.0");
        candidates.push(urlSource(`${sheetUrl}#sheet-${index + 1}`, content, ".css"));
      } catch { options.signal?.throwIfAborted(); omissions.push({ path: sheetUrl, reason: "unreadable" }); }
    }
  }
  const sources: ScannedSourceFile[] = [];
  for (const [index, source] of candidates.entries()) {
    if (index >= maxFiles) omissions.push({ path: source.path, reason: "max-files" });
    else if (options.maxBytesPerFile !== undefined && (source.sizeBytes ?? 0) > options.maxBytesPerFile) {
      omissions.push({ path: source.path, reason: "oversized" });
    } else if (source.content.trim().length > 0) sources.push(source);
  }
  options.signal?.throwIfAborted();
  return scanResult(sources, omissions, discoveredFiles, options, maxFiles);
}

function urlSource(id: string, content: string, extension: string): ScannedSourceFile {
  return {
    id,
    path: id,
    projectPath: id,
    absolutePath: id,
    content,
    extension,
    sizeBytes: Buffer.byteLength(content),
    url: id,
  };
}

async function fetchText(url: string, timeoutMs: number, userAgent: string): Promise<string> {
  assertSafePublicHttpUrl(url);
  const response = await fetchPublicText(url, {
    maxBytes: DEFAULT_MAX_RESPONSE_BYTES,
    timeoutMs,
    headers: {
      "Accept": "text/html,text/css,*/*",
      "User-Agent": userAgent,
    },
  });
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  return response.text;
}

function extractInlineStyles(html: string): string[] {
  const blocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const content = styleMatch[1]?.trim();
    if (content) blocks.push(content);
  }
  return blocks;
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const relFirst = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const hrefFirst = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
  for (const regex of [relFirst, hrefFirst]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      if (!href) continue;
      try {
        const resolved = new URL(href, baseUrl).href;
        assertSafePublicHttpUrl(resolved);
        urls.add(resolved);
      } catch {
        continue;
      }
    }
  }
  return Array.from(urls).sort((a, b) => a.localeCompare(b));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(values.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]!, index);
    }
  }

  const workerCount = Math.min(limit, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function normalizeExtensions(extensions: Iterable<string>): Set<string> {
  return new Set(Array.from(extensions, (extension) => {
    const normalized = extension.trim().toLowerCase();
    return normalized.startsWith(".") ? normalized : `.${normalized}`;
  }));
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function assertPathWithinRoot(root: string, candidate: string): void {
  const relativePath = relative(resolve(root), resolve(candidate));
  if (relativePath === "" || (!relativePath.startsWith(`..${sep}`) && relativePath !== ".." && !isAbsolute(relativePath))) {
    return;
  }
  throw new Error(`Source target is outside the project root: ${candidate}`);
}

function assertSafePublicHttpUrl(value: string): void {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Source URL must use a public http(s) address: ${value}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`Source URL must use a public http(s) address without credentials: ${value}`);
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error(`Source URL must use a public http(s) address: ${value}`);
  }
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
