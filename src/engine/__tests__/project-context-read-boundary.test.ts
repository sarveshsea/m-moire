import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectProject } from '../project-context.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'memi-project-boundary-')); roots.push(root); await mkdir(join(root, 'project')); await mkdir(join(root, 'outside')); return { project: join(root, 'project'), outside: join(root, 'outside') }; }
describe('project detection read authority', () => {
 it('does not import symlinked external package or component configuration', async () => {
  const { project, outside } = await fixture();
  await writeFile(join(outside, 'package.json'), '{"dependencies":{"next":"1.0.0"}}');
  await writeFile(join(outside, 'components.json'), '{"sentinel":"OUTSIDE_SENTINEL"}');
  await symlink(join(outside, 'package.json'), join(project, 'package.json'));
  await symlink(join(outside, 'components.json'), join(project, 'components.json'));
  const result = await detectProject(project); expect(result.framework).toBe('unknown'); expect(JSON.stringify(result)).not.toContain('OUTSIDE_SENTINEL');
 });
 it('does not follow an external source directory for CSS or component discovery', async () => {
  const { project, outside } = await fixture();
  await writeFile(join(outside, 'index.css'), '@import "tailwindcss";');
  await mkdir(join(outside, 'components/ui'), { recursive: true });
  await writeFile(join(outside, 'components/ui/OUTSIDE_SENTINEL.tsx'), '');
  await symlink(outside, join(project, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = await detectProject(project); expect(result.styling.tailwind).toBe(false); expect(result.shadcn.components).toEqual([]);
 });
 it('ignores oversized configuration without returning its fields', async () => {
  const { project } = await fixture();
  await writeFile(join(project, 'components.json'), JSON.stringify({ sentinel: 'x'.repeat(750001) }));
  const result = await detectProject(project); expect(result.shadcn.config === undefined).toBe(true);
 });
});
