import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink, link, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Registry } from '../registry.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memi-registry-boundary-')); roots.push(root);
  const project = join(root, 'project'); const outside = join(root, 'outside');
  await mkdir(project); await mkdir(outside);
  await writeFile(join(outside, 'design-system.json'), JSON.stringify({ tokens: [{ name: 'OUTSIDE_SENTINEL' }], components: [], styles: [], lastSync: 'fixture' }));
  await writeFile(join(outside, 'generations.json'), JSON.stringify([{ specName: 'OUTSIDE_SENTINEL' }]));
  await writeFile(join(outside, 'Outside.json'), JSON.stringify({ name: 'OUTSIDE_SENTINEL', type: 'component' }));
  return { project, outside };
}
describe('read-only registry authority', () => {
  it('does not follow a .memoire directory symlink outside the project', async () => {
    const { project, outside } = await fixture();
    await symlink(outside, join(project, '.memoire'), process.platform === 'win32' ? 'junction' : 'dir');
    const registry = new Registry(join(project, '.memoire')); await registry.load({ readOnly: true });
    expect(JSON.stringify(registry.designSystem)).not.toContain('OUTSIDE_SENTINEL');
    expect(registry.getGenerationState('OUTSIDE_SENTINEL')).toBeNull();
  });
  it.each(['directory', 'leaf', 'hardlink'] as const)('rejects a %s escape from specs', async kind => {
    const { project, outside } = await fixture();
    if (kind === 'directory') await symlink(outside, join(project, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
    else {
      await mkdir(join(project, 'specs/components'), { recursive: true });
      if (kind === 'leaf') await symlink(join(outside, 'Outside.json'), join(project, 'specs/components/Outside.json'));
      else await link(join(outside, 'Outside.json'), join(project, 'specs/components/Outside.json'));
    }
    if (kind === 'directory') { await mkdir(join(outside, 'components')); await writeFile(join(outside, 'components/Outside.json'), '{"name":"OUTSIDE_SENTINEL"}'); }
    const registry = new Registry(join(project, '.memoire')); await registry.load({ readOnly: true });
    expect(await registry.getAllSpecs()).toEqual([]);
  });
  it('bounds individual registry files and handles a missing .memoire without creating files', async () => {
    const { project } = await fixture(); const registry = new Registry(join(project, '.memoire'));
    await registry.load({ readOnly: true }); expect(await readdir(project)).toEqual([]);
    await mkdir(join(project, '.memoire'));
    await writeFile(join(project, '.memoire/design-system.json'), JSON.stringify({ tokens: [{ name: 'OVERSIZE_SENTINEL', value: 'x'.repeat(750001) }] }));
    await registry.load({ readOnly: true }); expect(registry.designSystem.tokens.some(token => token.name === 'OVERSIZE_SENTINEL')).toBe(false);
  });
  it('loads ordinary contained data and specifications', async () => {
    const { project } = await fixture();
    await mkdir(join(project, '.memoire')); await mkdir(join(project, 'specs/components'), { recursive: true });
    await writeFile(join(project, '.memoire/design-system.json'), JSON.stringify({ tokens: [{ name: 'allowed' }], components: [], styles: [], lastSync: 'fixture' }));
    await writeFile(join(project, 'specs/components/Button.json'), '{"name":"Button","type":"component"}');
    const registry = new Registry(join(project, '.memoire')); await registry.load({ readOnly: true });
    expect(registry.designSystem.tokens[0].name).toBe('allowed'); expect((await registry.getSpec('Button'))?.name).toBe('Button');
  });
});
