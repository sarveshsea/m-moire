import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { registerDiffCommand } from '../../commands/diff.js';
import type { MemoireEngine } from '../../engine/core.js';
const roots: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
it('diff does not load a previous design-system snapshot through an external symlink', async () => {
 const root = await mkdtemp(join(tmpdir(), 'memi-diff-boundary-')); roots.push(root);
 const project = join(root, 'project'); await mkdir(project); const outside = join(root, 'outside'); await mkdir(outside);
 await writeFile(join(outside, 'design-system.prev.json'), JSON.stringify({ tokens: [{ name: 'OUTSIDE_SENTINEL', values: {} }], components: [], styles: [], lastSync: 'fixture' }));
 await symlink(outside, join(project, '.memoire'), process.platform === 'win32' ? 'junction' : 'dir');
 const engine = { initReadOnly: async () => {}, config: { projectRoot: project }, registry: { designSystem: { tokens: [], components: [], styles: [], lastSync: 'fixture' } } } as unknown as MemoireEngine;
 const output = vi.spyOn(console, 'log').mockImplementation(() => {}); const program = new Command(); registerDiffCommand(program, engine);
 await program.parseAsync(['node', 'memi', 'diff', '--json']);
 expect(JSON.stringify(output.mock.calls)).not.toContain('OUTSIDE_SENTINEL');
});
