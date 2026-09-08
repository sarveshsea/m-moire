import { lstat, readdir, realpath } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fingerprint } from './evidence.js';
import { readContainedSource } from '../security/contained-source.js';
import type { FrontendOmission } from './types.js';
export const SOURCE_LIMITS = { maxFiles: 500, maxBytesPerFile: 750000, maxTotalBytes: 10000000 } as const;
export interface FrontendSource { path: string; content: string; hash: string; }
const ignored = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'vendor']);
const extensions = new Set(['.tsx', '.jsx', '.ts', '.js', '.css', '.json']);

export async function readFrontendSources(projectRoot: string, signal?: AbortSignal) {
  assertNotAborted(signal);
  const root = await realpath(resolve(projectRoot));
  if (!(await lstat(root)).isDirectory()) throw new Error('Frontend project root must be a directory.');
  const sources: FrontendSource[] = [];
  const omissions: FrontendOmission[] = [];
  let entriesSeen = 0; let bytesRead = 0; let exhausted = false;
  async function walk(directory: string, depth: number): Promise<void> {
    assertNotAborted(signal);
    if (exhausted) return;
    const directoryRef = relative(root, directory).split(sep).join('/') || '.';
    if (depth > 20) { omissions.push({ path: directoryRef, reason: 'depth-limit' }); return; }
    let entries;
    try {
      const actual = await realpath(directory);
      if (actual !== directory || (await lstat(directory)).isSymbolicLink()) throw new Error('Changed directory');
      entries = await readdir(directory, { withFileTypes: true });
    } catch { omissions.push({ path: directoryRef, reason: 'unreadable-directory' }); return; }
    for (const entry of entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      assertNotAborted(signal);
      if (++entriesSeen > 5000) { omissions.push({ path: directoryRef, reason: 'entry-limit' }); exhausted = true; return; }
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (entry.isSymbolicLink()) { omissions.push({ path, reason: 'symlink' }); continue; }
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
      if (entry.isDirectory()) { await walk(absolute, depth + 1); continue; }
      if (!entry.isFile() || !extensions.has(extname(entry.name))) continue;
      if (/lock|shrinkwrap/.test(entry.name) || (extname(entry.name) === '.json' && !/tokens?|theme/i.test(entry.name))) continue;
      if (sources.length >= SOURCE_LIMITS.maxFiles) { omissions.push({ path, reason: 'file-count-limit' }); exhausted = true; return; }
      if (bytesRead >= SOURCE_LIMITS.maxTotalBytes) { omissions.push({ path, reason: 'total-byte-limit' }); exhausted = true; return; }
      try {
        const source = await readBoundedSource(root, absolute, SOURCE_LIMITS.maxTotalBytes - bytesRead, signal);
        bytesRead += Buffer.byteLength(source.content);
        sources.push({ path, content: source.content, hash: fingerprint(source.content) });
      } catch (error) { assertNotAborted(signal); omissions.push({ path, reason: error instanceof SourceOmission ? error.reason : 'unreadable-file' }); }
    }
  }
  await walk(root, 0);
  assertNotAborted(signal);
  return { sources, omissions, bytesRead };
}
class SourceOmission extends Error { constructor(readonly reason: string) { super(reason); } }
async function readBoundedSource(root: string, absolute: string, remaining: number, signal?: AbortSignal) {
  assertNotAborted(signal);
  const named = await lstat(absolute, { bigint: true });
  if (named.isSymbolicLink()) throw new SourceOmission('symlink');
  if (!named.isFile()) throw new SourceOmission('unreadable-file');
  if (named.nlink !== 1n) throw new SourceOmission('hardlink');
  if (named.size > BigInt(SOURCE_LIMITS.maxBytesPerFile)) throw new SourceOmission('file-byte-limit');
  if (named.size > BigInt(remaining)) throw new SourceOmission('total-byte-limit');
  const source = await readContainedSource(root, relative(root, absolute).split(sep).join('/'), Math.min(SOURCE_LIMITS.maxBytesPerFile, remaining), signal);
  assertNotAborted(signal);
  if (!source.ok) throw new SourceOmission(source.reason);
  return { content: source.content };
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) { const error = new Error('Frontend brief cancelled.'); error.name = 'AbortError'; throw error; }
}
