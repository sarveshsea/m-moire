import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStudioAttachment, readStudioAttachmentBytes } from '../attachment-store.js';
import { readContainedBytes, readContainedSource } from '../../security/contained-source.js';
import { StudioRuntimeServer } from '../server.js';

// Exercise Windows-shaped relative-path output on every host, including Linux CI.
vi.mock('node:path', async importOriginal => {
  const actual = await importOriginal<typeof import('node:path')>();
  return { ...actual, sep: '\\', isAbsolute: (path: string) => actual.isAbsolute(path) || actual.win32.isAbsolute(path), relative: (from: string, to: string) => to.endsWith('cross-drive-directory') && from !== to ? 'D:\\cross-drive-directory' : actual.relative(from, to).replaceAll('/', '\\') };
});
vi.mock('../../security/contained-source.js', () => ({
  readContainedBytes: vi.fn(async () => ({ ok: true, bytes: Buffer.from([255, 0]) })),
  readContainedSource: vi.fn(async () => ({ ok: true, content: '[]' })),
}));
afterEach(() => { vi.clearAllMocks(); });
describe('Studio portable contained-reader paths', () => {
  it('normalizes the index path before calling the shared reader', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-portable-index-'));
    try {
      await mkdir(join(root, '.memoire', 'studio', 'attachments'), { recursive: true });
      await writeFile(join(root, '.memoire', 'studio', 'attachments', 'index.json'), '[]');
      expect(await getStudioAttachment(root, 'missing')).toBeNull();
      expect(readContainedSource).toHaveBeenCalledWith(root, '.memoire/studio/attachments/index.json', 10_000_000);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('normalizes raw attachment paths without changing their binary bytes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-portable-bytes-'));
    const id = 'attachment-00000000-0000-0000-0000-000000000000';
    try {
      const bytes = await readStudioAttachmentBytes(root, { id, name: 'proof.png', sessionId: null, kind: 'image', source: 'paste', path: join(root, '.memoire', 'studio', 'attachments', 'draft', `${id}-proof.png`), mimeType: 'image/png', size: 2, createdAt: '2026-09-01T00:00:00Z' });
      expect(bytes).toEqual(Buffer.from([255, 0]));
      expect(readContainedBytes).toHaveBeenCalledWith(root, `.memoire/studio/attachments/draft/${id}-proof.png`, 8_000_000);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('normalizes nested workspace paths before descriptor-bound source reading', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-portable-workspace-'));
    const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
    try {
      await mkdir(join(root, 'docs')); await writeFile(join(root, 'docs', 'proof.md'), 'Fixture');
      const { url } = await server.start();
      const response = await fetch(`${url}/api/workspace?path=${encodeURIComponent(join(root, 'docs', 'proof.md'))}`);
      expect(response.status).toBe(200);
      expect(readContainedSource).toHaveBeenCalledWith(root, 'docs/proof.md', 10_000_000);
    } finally { await server.stop(); await rm(root, { recursive: true, force: true }); }
  });
});


describe('Studio Windows cross-drive workspace boundary', () => {
  it('rejects a directory when Windows relative returns an absolute other-drive path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-drive-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'memi-other-drive-'));
    const target = join(outside, 'cross-drive-directory');
    const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
    try {
      await mkdir(target); await writeFile(join(target, 'private.txt'), 'External fixture');
      const { url } = await server.start();
      const response = await fetch(`${url}/api/workspace?path=${encodeURIComponent(target)}`);
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('private.txt');
    } finally { await server.stop(); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
});
