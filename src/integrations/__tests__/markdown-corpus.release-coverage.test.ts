import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeMarkdownText, copyCorpusForHandoff, getMarkdownCorpusStatus, isAllowedMarkdownPath, setupMarkdownCorpus } from '../markdown-corpus.js';

let root: string;
const repo = { owner: 'fixture', repo: 'docs', license: 'MIT' };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const destination = () => join(root, '.memoire', 'markdown-corpus', 'fixture', 'docs');
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memoire-corpus-release-')); });
afterEach(async () => { vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
function remote(tree: unknown[], contents = '# Remote documentation') {
  const fetcher = vi.fn(async (url: string) => url.includes('/commits/') ? json({ sha: 'verified-commit' }) : url.includes('/git/trees/') ? json({ tree }) : new Response(contents));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const setup = () => setupMarkdownCorpus({ projectRoot: root, catalog: [repo] });

describe('corpus path and analysis contracts', () => {
  it.each(['', '/a.md', '../a.md', 'docs/../a.md', '.private/a.md', 'docs//a.md', './a.md', 'a.md\0', 'a.ts'])('rejects unsafe or nonmarkdown path %j', path => {
    expect(isAllowedMarkdownPath(path)).toBe(false);
  });
  it.each(['README.MD', 'docs/page.mdx', 'docs/page.markdown', 'docs\\page.mdoc'])('admits supported documentation %s', path => {
    expect(isAllowedMarkdownPath(path)).toBe(true);
  });
  it.each([['journey', 'journey'], ['stateDiagram-v2', 'state'], ['mindmap', 'mindmap'], ['timeline', 'timeline'], ['graph TD', 'flowchart']])('preserves the %s diagram source', (source, kind) => {
    const report = analyzeMarkdownText('architecture.md', `~~~mermaid\n${source}\n~~~`);
    expect(report.candidates[0]).toMatchObject({ kind, cleanSource: source });
    expect(report.summary).toMatchObject({ codeFences: 1, mermaidBlocks: 1 });
  });
  it('does not turn lists inside code fences into workflow steps', () => {
    const report = analyzeMarkdownText('example.md', '```text\n- not a step\n- also code\n```\n1. Read **guide**\n2. Visit [help](https://example.test)');
    expect(report.summary).toMatchObject({ lists: 2, links: 1 });
    expect(report.candidates[0].cleanSource).toContain('N1["Read guide"]');
    expect(report.candidates[0].cleanSource).toContain('N2["Visit help"]');
    expect(report.candidates[0].cleanSource).not.toContain('not a step');
  });
  it('falls back to a bounded summary for incomplete fences and missing frontmatter title', () => {
    const source = ['---', 'description: prose', '---', '# **Readable** title', '```mermaid', ...Array.from({ length: 80 }, (_, i) => `line ${i}`)].join('\n');
    const report = analyzeMarkdownText('fallback.md', source);
    expect(report.candidates[0]).toMatchObject({ kind: 'markdown-summary', title: 'Readable title' });
    expect(report.candidates[0].cleanSource.split('\n')).toHaveLength(60);
  });
  it('keeps diagram titles unique and recognizes a table ending at EOF', () => {
    const report = analyzeMarkdownText('multi_flow.md', '```mermaid\njourney\n```\n```mermaid\nsequenceDiagram\n```\n| A | B |\n| - | - |');
    expect(report.candidates.map(c => c.title)).toEqual(['multi flow', 'multi flow 2']);
    expect(report.summary.tables).toBe(1);
    expect(report.candidates[1].diagnostics).toContain('Sequence syntax can be rendered as actor lanes.');
  });
});

describe('remote corpus persistence', () => {
  it('downloads only permitted bounded files and records their content hashes', async () => {
    const fetcher = remote([{ type: 'tree', path: 'docs' }, { type: 'blob' }, { type: 'blob', path: '../escape.md' }, { type: 'blob', path: 'large.md', size: 2_000_001 }, { type: 'blob', path: 'guide.md' }]);
    const result = await setup();
    expect(result).toMatchObject({ status: 'ready', repos: [{ files: 1, skipped: 2, commit: 'verified-commit' }] });
    const content = await readFile(join(destination(), 'guide.md'), 'utf8');
    const manifest = JSON.parse(await readFile(join(destination(), 'manifest.json'), 'utf8'));
    expect(manifest.files).toEqual([{ path: 'guide.md', bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') }]);
    expect(fetcher.mock.calls.map(c => c[0])).toContain('https://raw.githubusercontent.com/fixture/docs/verified-commit/guide.md');
    expect(await getMarkdownCorpusStatus(root)).toEqual(result);
    await copyCorpusForHandoff(root, join(root, 'handoff'));
    expect(await readFile(join(root, 'handoff', 'fixture', 'docs', 'guide.md'), 'utf8')).toBe(content);
  });
  it.each(['missing', 'modified'] as const)('redownloads a %s cached file instead of trusting its old hash', async mode => {
    const fetcher = remote([{ type: 'blob', path: 'guide.md' }]);
    await setup();
    if (mode === 'missing') await rm(join(destination(), 'guide.md'));
    else await writeFile(join(destination(), 'guide.md'), 'tampered');
    await setup();
    expect(fetcher.mock.calls.filter(c => c[0].includes('raw.githubusercontent'))).toHaveLength(2);
    expect(await readFile(join(destination(), 'guide.md'), 'utf8')).toBe('# Remote documentation');
  });
  it('reuses a hash-verified cached document without requesting it again', async () => {
    const fetcher = remote([{ type: 'blob', path: 'guide.md' }]);
    const original = await setup();
    expect((await setup()).repos[0].bytes).toBe(original.repos[0].bytes);
    expect(fetcher.mock.calls.filter(c => c[0].includes('raw.githubusercontent'))).toHaveLength(1);
  });
  it('refreshes cached documents when the upstream commit changes', async () => {
    remote([{ type: 'blob', path: 'guide.md' }], '# Original');
    await setup();
    const fetcher = vi.fn(async (url: string) => url.includes('/commits/')
      ? json({ sha: 'new-commit' })
      : url.includes('/git/trees/')
        ? json({ tree: [{ type: 'blob', path: 'guide.md' }] })
        : new Response('# Revised'));
    vi.stubGlobal('fetch', fetcher);
    const refreshed = await setup();
    expect(refreshed.repos[0].commit).toBe('new-commit');
    expect(await readFile(join(destination(), 'guide.md'), 'utf8')).toBe('# Revised');
    expect(fetcher.mock.calls.map(c => c[0])).toContain('https://raw.githubusercontent.com/fixture/docs/new-commit/guide.md');
  });
  it('does not reuse an unverifiable cache when the API omits a commit identifier', async () => {
    const fetcher = vi.fn(async (url: string) => url.includes('/commits/') ? json({}) : url.includes('/git/trees/') ? json({ tree: [{ type: 'blob', path: 'guide.md' }] }) : new Response('# First'));
    vi.stubGlobal('fetch', fetcher);
    await setup();
    fetcher.mockImplementation(async (url: string) => url.includes('/commits/') ? json({}) : url.includes('/git/trees/') ? json({ tree: [{ type: 'blob', path: 'guide.md' }] }) : new Response('# Refreshed'));
    await setup();
    expect(await readFile(join(destination(), 'guide.md'), 'utf8')).toBe('# Refreshed');
  });
  it('records an exhausted server failure after exactly three attempts', async () => {
    const fetcher = vi.fn(async () => new Response('unavailable', { status: 503, statusText: 'Unavailable' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await setup()).toMatchObject({ status: 'failed', repos: [{ errors: [expect.stringContaining('503 Unavailable')] }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('stops content downloads at the per-repository file budget', async () => {
    const fetcher = remote(Array.from({ length: 221 }, (_, i) => ({ type: 'blob', path: `doc-${i}.md` })));
    expect(await setup()).toMatchObject({ repos: [{ files: 220, skipped: 1 }] });
    expect(fetcher).toHaveBeenCalledTimes(222);
  });
  it.each(['AGPL-3.0', 'unknown', 'unclear'])('does not fetch content with license %s', async license => {
    const fetcher = remote([]);
    expect(await setupMarkdownCorpus({ projectRoot: root, catalog: [{ ...repo, license }] })).toMatchObject({ repos: [{ files: 0, skipped: 1 }] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('records permanent HTTP failures without retrying or pretending files were downloaded', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('denied', { status: 403, statusText: 'Forbidden' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await setup()).toMatchObject({ status: 'failed', repos: [{ files: 0, errors: [expect.stringContaining('403 Forbidden')] }] });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('marks mixed success and failure as partial and preserves repository order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const result = await setupMarkdownCorpus({ projectRoot: root, catalog: [{ ...repo, policy: 'metadata-only' }, { ...repo, repo: 'offline' }] });
    expect(result.status).toBe('partial');
    expect(result.repos.map(r => r.repo)).toEqual(['fixture/docs', 'fixture/offline']);
    expect(result.repos[1].errors).toEqual(['offline']);
  });
  it('recovers a transient server failure before persisting the corpus', async () => {
    const fetcher = remote([]);
    fetcher.mockResolvedValueOnce(new Response('retry', { status: 503 }));
    expect(await setup()).toMatchObject({ status: 'ready', repos: [{ errors: [] }] });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('skips unavailable raw documents without fabricating their contents', async () => {
    const fetcher = remote([{ type: 'blob', path: 'gone.md' }]);
    fetcher.mockImplementation(async (url: string) => url.includes('/commits/') ? json({}) : url.includes('/git/trees/') ? json({ tree: [{ type: 'blob', path: 'gone.md' }] }) : new Response('', { status: 404, statusText: 'Not Found' }));
    expect(await setup()).toMatchObject({ repos: [{ files: 0, skipped: 1 }] });
    await expect(readFile(join(destination(), 'gone.md'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('supports an empty tree response and fails an empty catalog without network access', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal('fetch', fetcher);
    // Each fetch needs an unread response body.
    fetcher.mockImplementation(async () => json({}));
    expect(await setup()).toMatchObject({ status: 'ready', repos: [{ files: 0 }] });
    expect(await setupMarkdownCorpus({ projectRoot: root, catalog: [] })).toEqual({ status: 'failed', repos: [] });
  });
  it('honors pre-start cancellation and reports absent corpus state', async () => {
    expect(await getMarkdownCorpusStatus(root)).toEqual({ status: 'failed', repos: [] });
    await expect(setupMarkdownCorpus({ projectRoot: root, catalog: [repo], signal: AbortSignal.abort() })).rejects.toMatchObject({ statusCode: 499 });
  });
  it('recovers status by reading repository manifests when the index is corrupt', async () => {
    remote([]);
    await setup();
    await writeFile(join(root, '.memoire', 'markdown-corpus', 'manifest.json'), '{broken');
    expect(await getMarkdownCorpusStatus(root)).toMatchObject({ status: 'ready', repos: [{ repo: 'fixture/docs' }] });
  });
});
