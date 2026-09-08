import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { copyStandaloneRuntimeAssets } from '../../../scripts/lib/standalone-runtime-assets.mjs';
const assets = ['gallery-page.css', 'gallery-page.client.js', 'research-page.css', 'research-page.client.js'];
const roots: string[] = [];
async function fixture(omit?: string) {
  const root = await mkdtemp(join(tmpdir(), 'memi-native-assets-')); roots.push(root);
  await mkdir(join(root, 'src/preview/templates'), {recursive: true});
  for (const name of assets) if (name !== omit) await writeFile(join(root, 'src/preview/templates', name), `fixture ${name}\n`);
  await writeFile(join(root, 'src/preview/templates/gallery-page.ts'), 'source only');
  await mkdir(join(root, 'src/studio'), {recursive: true});
  if (omit !== 'harness-manifest.json') await writeFile(join(root, 'src/studio/harness-manifest.json'), '{"schemaVersion":1}');
  return root;
}
afterEach(async () => {await Promise.all(roots.splice(0).map(root => rm(root, {recursive: true, force: true})));});
describe('standalone required bootstrap assets', () => {
  it('copies exact runtime CSS/client JS to the executable-relative location without TypeScript sources', async () => {
    const root = await fixture(); const stage = join(root, 'binary');
    await copyStandaloneRuntimeAssets(root, stage);
    expect((await readdir(join(stage, 'preview/templates'))).sort()).toEqual([...assets].sort());
    for (const name of assets) expect(await readFile(join(stage, 'preview/templates', name), 'utf8')).toBe(`fixture ${name}\n`);
  });
  it('copies the required Studio bootstrap manifest', async () => {
    const root = await fixture(); const stage = join(root, 'binary');
    await copyStandaloneRuntimeAssets(root, stage);
    expect(await readFile(join(stage, 'studio/harness-manifest.json'), 'utf8')).toBe('{"schemaVersion":1}');
  });
  it.each([...assets, 'harness-manifest.json'])('fails closed when required runtime asset %s is missing', async name => {
    const root = await fixture(name);
    await expect(copyStandaloneRuntimeAssets(root, join(root, 'binary'))).rejects.toThrow(name);
  });
});
