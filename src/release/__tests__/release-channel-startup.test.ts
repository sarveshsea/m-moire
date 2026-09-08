import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('release channel resolution before dependency installation', () => {
  it.each([
    ['v2.8.0-beta.1', 'next', '2.7.9', true],
    ['v2.8.0', 'latest', '2.8.0', false],
  ])('routes %s in a copied checkout without node_modules', async (tag, distTag, latest, prerelease) => {
    const root = await mkdtemp(join(tmpdir(), 'memi-channel-startup-'));
    try {
      await mkdir(join(root, 'scripts/lib'), { recursive: true });
      for (const path of ['release-manifest.json', 'scripts/resolve-release-channel.mjs', 'scripts/lib/npm-release-verification.mjs', 'scripts/lib/release-manifest.mjs']) {
        await copyFile(join(process.cwd(), path), join(root, path));
      }
      await expect(stat(join(root, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });
      const result = spawnSync(process.execPath, [join(root, 'scripts/resolve-release-channel.mjs'), '--tag', String(tag)], {
        cwd: root, encoding: 'utf8', timeout: 10000, env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ release_version: String(tag).slice(1), npm_dist_tag: distTag, expected_latest: latest, is_prerelease: prerelease, promote_stable_channels: !prerelease });
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    }
  });
});
