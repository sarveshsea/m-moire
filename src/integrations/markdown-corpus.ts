import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

const ALLOWED_EXTENSIONS = new Set([".md", ".mdx", ".markdown", ".mdoc"]);
const MAX_REMOTE_FILE_BYTES = 2_000_000;
const MAX_REMOTE_FILES_PER_REPO = 220;

export type MarkdownCorpusStatusValue = "ready" | "downloading" | "partial" | "failed";
export type MarkdownCorpusRepoPolicy = "download" | "metadata-only";

export interface MarkdownCorpusRepo {
  owner: string;
  repo: string;
  license: string;
  branch?: string;
  policy?: MarkdownCorpusRepoPolicy;
  localSource?: string | null;
}

export interface MarkdownCorpusStatus {
  status: MarkdownCorpusStatusValue;
  repos: MarkdownCorpusRepoStatus[];
}

export interface MarkdownCorpusRepoStatus {
  repo: string;
  license: string;
  commit: string;
  files: number;
  bytes: number;
  skipped: number;
  errors: string[];
  fetchedAt: string;
}

export interface MarkdownDiagramCandidate {
  title: string;
  sourcePath: string;
  kind: "flowchart" | "journey" | "sequence" | "state" | "mindmap" | "timeline" | "checklist-to-flow" | "markdown-summary";
  confidence: number;
  diagnostics: string[];
  cleanSource: string;
}

export interface MarkdownAnalysisReport {
  status: "ready";
  candidates: MarkdownDiagramCandidate[];
  summary: MarkdownSummary;
}

export interface MarkdownSummary {
  headings: number;
  lists: number;
  codeFences: number;
  mermaidBlocks: number;
  links: number;
  tables: number;
  frontmatter: boolean;
}

interface CorpusManifest {
  schemaVersion: 1;
  repoUrl: string;
  repo: string;
  license: string;
  commit: string;
  branch: string;
  fetchedAt: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  skipped: string[];
  errors: string[];
}

interface CorpusIndexManifest {
  schemaVersion: 1;
  generatedAt: string;
  repos: string[];
}

interface SetupOptions {
  projectRoot: string;
  catalog?: MarkdownCorpusRepo[];
  signal?: AbortSignal;
}

interface AnalyzeOptions {
  projectRoot: string;
  sourcePath?: string;
  source?: string;
}

export const DEFAULT_MARKDOWN_CORPUS_CATALOG: MarkdownCorpusRepo[] = [
  { owner: "microsoft", repo: "markitdown", license: "MIT", branch: "main", policy: "download" },
  { owner: "mermaid-js", repo: "mermaid", license: "MIT", branch: "develop", policy: "download" },
  { owner: "adam-p", repo: "markdown-here", license: "MIT", branch: "master", policy: "download" },
  { owner: "usememos", repo: "memos", license: "MIT", branch: "main", policy: "download" },
  { owner: "docling-project", repo: "docling", license: "MIT", branch: "main", policy: "download" },
  { owner: "marktext", repo: "marktext", license: "MIT", branch: "develop", policy: "download" },
  { owner: "prettier", repo: "prettier", license: "MIT", branch: "main", policy: "download" },
  { owner: "jekyll", repo: "jekyll", license: "MIT", branch: "master", policy: "download" },
  { owner: "markdown-it", repo: "markdown-it", license: "MIT", branch: "master", policy: "download" },
  { owner: "mdx-js", repo: "mdx", license: "MIT", branch: "main", policy: "download" },
  { owner: "commonmark", repo: "commonmark-spec", license: "BSD-3-Clause", branch: "master", policy: "download" },
];

export async function setupMarkdownCorpus(options: SetupOptions): Promise<MarkdownCorpusStatus> {
  const projectRoot = resolve(options.projectRoot);
  const catalog = options.catalog ?? DEFAULT_MARKDOWN_CORPUS_CATALOG;
  const root = corpusRoot(projectRoot);
  await mkdir(root, { recursive: true });

  const repos: MarkdownCorpusRepoStatus[] = [];
  for (const repo of catalog) {
    throwIfAborted(options.signal);
    repos.push(await setupRepo(root, repo, options.signal));
  }
  await writeFile(join(root, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    repos: repos.map((repo) => repo.repo),
  } satisfies CorpusIndexManifest, null, 2)}\n`, "utf-8");
  return { status: aggregateStatus(repos), repos };
}

export async function getMarkdownCorpusStatus(projectRoot: string): Promise<MarkdownCorpusStatus> {
  const root = corpusRoot(resolve(projectRoot));
  if (!(await exists(root))) return { status: "failed", repos: [] };

  const index = await readJson<CorpusIndexManifest>(join(root, "manifest.json"));
  const manifests = new Map<string, CorpusManifest>();
  for (const ownerEntry of await readdir(root, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory()) continue;
    const ownerPath = join(root, ownerEntry.name);
    for (const repoEntry of await readdir(ownerPath, { withFileTypes: true })) {
      if (!repoEntry.isDirectory()) continue;
      const manifest = await readJson<CorpusManifest>(join(ownerPath, repoEntry.name, "manifest.json"));
      if (manifest) manifests.set(manifest.repo, manifest);
    }
  }

  const order = index?.repos ?? Array.from(manifests.keys()).sort();
  const repos = order
    .map((repo) => manifests.get(repo))
    .filter((manifest): manifest is CorpusManifest => Boolean(manifest))
    .map(statusFromManifest);
  return { status: aggregateStatus(repos), repos };
}

export async function analyzeMarkdownForFigJam(options: AnalyzeOptions): Promise<MarkdownAnalysisReport> {
  const sourcePath = options.sourcePath ?? "inline.md";
  const source = options.source ?? await readFile(sourcePath, "utf-8");
  return analyzeMarkdownText(sourcePath, source);
}

export function analyzeMarkdownText(sourcePath: string, source: string): MarkdownAnalysisReport {
  const title = parseFrontmatterTitle(source) ?? firstHeading(source) ?? titleFromPath(sourcePath);
  const summary = summarizeMarkdown(source);
  const candidates: MarkdownDiagramCandidate[] = [];

  for (const [index, cleanSource] of extractMermaidBlocks(source).entries()) {
    candidates.push({
      title: index === 0 ? title : `${title} ${index + 1}`,
      sourcePath,
      kind: mermaidKind(cleanSource),
      confidence: 0.92,
      diagnostics: diagnosticsForMermaid(cleanSource),
      cleanSource,
    });
  }

  const bullets = extractBullets(source);
  if (bullets.length >= 2) {
    candidates.push({
      title,
      sourcePath,
      kind: "checklist-to-flow",
      confidence: summary.tables > 0 ? 0.78 : 0.72,
      diagnostics: ["Converted markdown list items into a sequential FigJam flow candidate."],
      cleanSource: bulletsToFlowchart(bullets),
    });
  }

  if (candidates.length === 0) {
    candidates.push({
      title,
      sourcePath,
      kind: "markdown-summary",
      confidence: 0.35,
      diagnostics: ["No Mermaid fence or flow-like list found; emitted a summary candidate."],
      cleanSource: source.split(/\r?\n/).slice(0, 60).join("\n"),
    });
  }

  return { status: "ready", candidates, summary };
}

export function isAllowedMarkdownPath(pathname: string): boolean {
  const normalized = pathname.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return false;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.startsWith("."))) return false;
  return ALLOWED_EXTENSIONS.has(extname(normalized).toLowerCase());
}

async function setupRepo(root: string, repo: MarkdownCorpusRepo, signal?: AbortSignal): Promise<MarkdownCorpusRepoStatus> {
  const policy = repo.policy ?? "download";
  const branch = repo.branch ?? "main";
  const destination = join(root, repo.owner, repo.repo);
  const previous = await readJson<CorpusManifest>(join(destination, "manifest.json"));
  await mkdir(destination, { recursive: true });
  const manifest: CorpusManifest = {
    schemaVersion: 1,
    repoUrl: `https://github.com/${repo.owner}/${repo.repo}`,
    repo: `${repo.owner}/${repo.repo}`,
    license: repo.license,
    commit: "metadata-only",
    branch,
    fetchedAt: new Date().toISOString(),
    files: [],
    skipped: [],
    errors: [],
  };

  if (policy !== "download" || isBlockedLicense(repo.license)) {
    manifest.skipped.push("content download disabled by corpus license policy");
    await writeManifest(destination, manifest);
    return statusFromManifest(manifest);
  }

  if (repo.localSource) {
    await copyLocalSource(resolve(repo.localSource), destination, manifest, signal);
  } else {
    await fetchRemoteRepo(repo, destination, manifest, previous, signal).catch((error: unknown) => {
      manifest.errors.push(error instanceof Error ? error.message : String(error));
    });
  }

  await writeManifest(destination, manifest);
  return statusFromManifest(manifest);
}

async function copyLocalSource(source: string, destination: string, manifest: CorpusManifest, signal?: AbortSignal): Promise<void> {
  const files = await collectFiles(source);
  for (const file of files.sort()) {
    throwIfAborted(signal);
    const rel = slashPath(relative(source, file));
    if (!isAllowedMarkdownPath(rel)) {
      manifest.skipped.push(rel);
      continue;
    }
    const bytes = await readFile(file);
    await writeCorpusFile(destination, rel, bytes, manifest);
  }
}

async function fetchRemoteRepo(
  repo: MarkdownCorpusRepo,
  destination: string,
  manifest: CorpusManifest,
  previous: CorpusManifest | null,
  signal?: AbortSignal,
): Promise<void> {
  const branch = repo.branch ?? "main";
  const commit = await githubJson<{ sha?: string }>(`https://api.github.com/repos/${repo.owner}/${repo.repo}/commits/${branch}`, signal);
  if (commit.sha) manifest.commit = commit.sha;
  const tree = await githubJson<{ tree?: Array<{ path?: string; type?: string; size?: number }> }>(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
    signal,
  );
  const files = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => ({ path: entry.path as string, size: entry.size ?? 0 }))
    .sort((a, b) => a.path.localeCompare(b.path));

  for (const file of files) {
    throwIfAborted(signal);
    if (!isAllowedMarkdownPath(file.path)) {
      manifest.skipped.push(file.path);
      continue;
    }
    if (manifest.files.length >= MAX_REMOTE_FILES_PER_REPO) {
      manifest.skipped.push(`${file.path} (remote file limit reached)`);
      continue;
    }
    if (file.size > MAX_REMOTE_FILE_BYTES) {
      manifest.skipped.push(`${file.path} (larger than ${MAX_REMOTE_FILE_BYTES} bytes)`);
      continue;
    }
    if (await reuseExistingFile(destination, file.path, previous, manifest)) {
      continue;
    }
    const response = await fetchWithRetry(`https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${manifest.commit}/${file.path}`, {
      headers: { "user-agent": "memoire-markdown-corpus/0.15" },
      signal,
    });
    if (!response.ok) {
      manifest.skipped.push(`${file.path} (${response.status} ${response.statusText})`);
      continue;
    }
    await writeCorpusFile(destination, file.path, Buffer.from(await response.arrayBuffer()), manifest);
  }
}

async function githubJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchWithRetry(url, {
    headers: { "user-agent": "memoire-markdown-corpus/0.15", accept: "application/vnd.github+json" },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${response.statusText} ${url}`);
  return response.json() as Promise<T>;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500 || attempt === attempts) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 200 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw Object.assign(new Error("Markdown corpus setup cancelled"), { statusCode: 499 });
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function writeCorpusFile(destination: string, rel: string, bytes: Buffer, manifest: CorpusManifest): Promise<void> {
  const safeDestination = resolve(destination, rel);
  if (!isSubpath(safeDestination, destination)) throw new Error(`Corpus destination escaped root: ${rel}`);
  await mkdir(dirname(safeDestination), { recursive: true });
  await writeFile(safeDestination, bytes);
  manifest.files.push({ path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength });
}

async function reuseExistingFile(
  destination: string,
  rel: string,
  previous: CorpusManifest | null,
  manifest: CorpusManifest,
): Promise<boolean> {
  // A matching local hash proves integrity only for the same resolved upstream commit.
  if (!previous || manifest.commit === "metadata-only" || previous.commit !== manifest.commit) return false;
  const prior = previous.files.find((file) => file.path === rel);
  if (!prior) return false;
  const existingPath = resolve(destination, rel);
  if (!isSubpath(existingPath, destination)) return false;
  try {
    const bytes = await readFile(existingPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== prior.sha256) return false;
    manifest.files.push({ path: prior.path, sha256: prior.sha256, bytes: prior.bytes });
    return true;
  } catch {
    return false;
  }
}

async function writeManifest(destination: string, manifest: CorpusManifest): Promise<void> {
  await writeFile(join(destination, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
}

function statusFromManifest(manifest: CorpusManifest): MarkdownCorpusRepoStatus {
  return {
    repo: manifest.repo,
    license: manifest.license,
    commit: manifest.commit,
    files: manifest.files.length,
    bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    skipped: manifest.skipped.length,
    errors: manifest.errors,
    fetchedAt: manifest.fetchedAt,
  };
}

function aggregateStatus(repos: MarkdownCorpusRepoStatus[]): MarkdownCorpusStatusValue {
  if (repos.length === 0) return "failed";
  const failed = repos.filter((repo) => repo.errors.length > 0).length;
  if (failed === 0) return "ready";
  if (failed === repos.length) return "failed";
  return "partial";
}

function corpusRoot(projectRoot: string): string {
  return join(projectRoot, ".memoire", "markdown-corpus");
}

function isBlockedLicense(license: string): boolean {
  const normalized = license.toLowerCase();
  return normalized.includes("agpl") || normalized === "unknown" || normalized === "unclear";
}

function parseFrontmatterTitle(source: string): string | null {
  if (!source.startsWith("---\n")) return null;
  const lines = source.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    const match = line.match(/^title:\s*["']?(.+?)["']?\s*$/);
    if (match) return match[1].trim();
  }
  return null;
}

function firstHeading(source: string): string | null {
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (match) return stripInlineMarkdown(match[1]);
  }
  return null;
}

function titleFromPath(sourcePath: string): string {
  return basename(sourcePath, extname(sourcePath)).replace(/[-_]+/g, " ") || "Markdown diagram";
}

function summarizeMarkdown(source: string): MarkdownSummary {
  const summary: MarkdownSummary = {
    headings: 0,
    lists: 0,
    codeFences: 0,
    mermaidBlocks: 0,
    links: 0,
    tables: 0,
    frontmatter: source.startsWith("---\n"),
  };
  let inFence = false;
  let tableLines = 0;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      summary.codeFences += 1;
      if (/^(```|~~~)\s*mermaid/i.test(trimmed)) summary.mermaidBlocks += 1;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{1,6}\s+/.test(trimmed)) summary.headings += 1;
    if (bulletText(trimmed)) summary.lists += 1;
    summary.links += (trimmed.match(/\]\(/g) ?? []).length;
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) tableLines += 1;
    else {
      if (tableLines >= 2) summary.tables += 1;
      tableLines = 0;
    }
  }
  if (tableLines >= 2) summary.tables += 1;
  summary.codeFences = Math.floor(summary.codeFences / 2);
  return summary;
}

function extractMermaidBlocks(source: string): string[] {
  const blocks: string[] = [];
  let active: string[] | null = null;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!active && /^(```|~~~)\s*mermaid/i.test(trimmed)) {
      active = [];
      continue;
    }
    if (active) {
      if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
        const block = active.join("\n").trim();
        if (block) blocks.push(block);
        active = null;
      } else {
        active.push(line);
      }
    }
  }
  return blocks;
}

function mermaidKind(source: string): MarkdownDiagramCandidate["kind"] {
  const first = source.split(/\r?\n/).find((line) => line.trim())?.trim().toLowerCase() ?? "";
  if (first.startsWith("sequencediagram")) return "sequence";
  if (first.startsWith("journey")) return "journey";
  if (first.startsWith("statediagram")) return "state";
  if (first.startsWith("mindmap")) return "mindmap";
  if (first.startsWith("timeline")) return "timeline";
  return "flowchart";
}

function diagnosticsForMermaid(source: string): string[] {
  const diagnostics = ["Detected Mermaid source compatible with Mermaid Jam semantics."];
  if (/journey/i.test(source)) diagnostics.push("Journey syntax can be rendered as FigJam steps.");
  if (/sequenceDiagram/i.test(source)) diagnostics.push("Sequence syntax can be rendered as actor lanes.");
  return diagnostics;
}

function extractBullets(source: string): string[] {
  const items: string[] = [];
  let inFence = false;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const item = bulletText(trimmed);
    if (item) items.push(stripInlineMarkdown(item));
  }
  return items;
}

function bulletText(trimmed: string): string | null {
  const unordered = trimmed.match(/^[-*]\s+(.+)$/);
  if (unordered) return unordered[1].trim();
  const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
  return ordered ? ordered[1].trim() : null;
}

function bulletsToFlowchart(items: string[]): string {
  const lines = ["flowchart TD"];
  items.forEach((item, index) => {
    lines.push(`  N${index + 1}["${escapeMermaidLabel(item)}"]`);
    if (index > 0) lines.push(`  N${index} --> N${index + 1}`);
  });
  return lines.join("\n");
}

function escapeMermaidLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"").replaceAll("[", "(").replaceAll("]", ")");
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();
}

function slashPath(path: string): string {
  return path.split(sep).join("/");
}

function isSubpath(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`) && rel !== "..");
}

async function exists(path: string): Promise<boolean> {
  return access(path, constants.F_OK).then(() => true, () => false);
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function copyCorpusForHandoff(projectRoot: string, destination: string): Promise<void> {
  await cp(corpusRoot(resolve(projectRoot)), destination, { recursive: true, force: true });
}
