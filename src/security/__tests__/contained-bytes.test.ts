import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { readContainedBytes, readContainedSource } from '../contained-source.js';
describe('descriptor-contained binary reads', () => {
  it('preserves arbitrary binary bytes while retaining text and byte-limit contracts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-contained-bytes-'));
    try {
      const bytes = Buffer.from([0, 255, 128, 1]); await writeFile(join(root, 'image.bin'), bytes);
      expect(await readContainedBytes(root, 'image.bin', 4)).toEqual({ ok: true, bytes });
      expect(await readContainedBytes(root, 'image.bin', 3)).toEqual({ ok: false, reason: 'file-byte-limit' });
      await writeFile(join(root, 'text.txt'), 'résumé');
      expect(await readContainedSource(root, 'text.txt')).toEqual({ ok: true, content: 'résumé' });
      await symlink(join(root, 'text.txt'), join(root, 'link.txt'));
      expect(await readContainedBytes(root, 'link.txt')).toEqual({ ok: false, reason: 'symlink' });
      await expect(readContainedBytes(root, 'text.txt', 20, AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
