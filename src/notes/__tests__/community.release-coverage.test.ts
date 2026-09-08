import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { validateCommunityNoteDir, forkNoteDirectory, listNoteForks, getNoteForkFiles, updateNoteForkFile, diffNoteFork, buildNoteForkPrHandoff, forkSourceFilter } from '../community.js';
let root: string, source: string;
const base = () => ({ name: 'example', version: '1.0.0', description: 'Example note', category: 'craft', skills: [{ file: 'SKILL.md', name: 'Example', activateOn: 'always' }] });
async function save(value: object, path = source) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'note.json'), JSON.stringify(value)); }
async function fork() { return forkNoteDirectory(root, { sourcePath: source }); }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memi-community-coverage-')); source = join(root, 'source'); await save(base()); await writeFile(join(source, 'SKILL.md'), '# Source skill'); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
describe('community note validation and fork artifacts', () => {
  it('distinguishes local metadata warnings from community admission errors', async () => {
    const local = await validateCommunityNoteDir(source); expect(local.ok).toBe(true); expect(local.warnings).toHaveLength(2);
    const strict = await validateCommunityNoteDir(source, { strictCommunity: true }); expect(strict.ok).toBe(false); expect(strict.issues).toHaveLength(3);
    await save({ ...base(), sourceUrls: ['https://example.test/evidence'], lastResearchedAt: '2026-09-08T00:00:00Z', freshnessDays: 30 });
    await writeFile(join(source, 'package.json'), '{"scripts":{"install":"ignored"}}');
    expect(await validateCommunityNoteDir(source, { strictCommunity: true })).toMatchObject({ ok: true, warnings: [{ path: 'package.json', message: expect.stringContaining('ignored') }] });
  });
  it('returns manifest errors for absent and malformed files', async () => {
    expect(await validateCommunityNoteDir(join(root, 'missing'))).toMatchObject({ ok: false, noteName: null });
    await writeFile(join(source, 'note.json'), '{broken'); expect((await validateCommunityNoteDir(source)).ok).toBe(false);
    await save({ ...base(), version: 'latest' }); expect((await validateCommunityNoteDir(source)).issues[0].path).toBe('note.json');
  });
  it.each(['../escape.md', '/absolute.md', 'C:\\file.md', 'folder\\file.md', 'script.js', 'missing.md', 'directory.md'])('rejects unsafe or unavailable skill file %s', async file => {
    await mkdir(join(source, 'directory.md'));
    await save({ ...base(), skills: [{ file, name: 'Invalid', activateOn: 'always' }] });
    const result = await validateCommunityNoteDir(source); expect(result.ok).toBe(false); expect(result.issues.some(issue => issue.path === file)).toBe(true);
  });
  it('records default upstream facts without modifying source and excludes noneditable artifacts', async () => {
    await mkdir(join(source, '.git')); await writeFile(join(source, '.git/private.md'), 'ignored git data');
    await writeFile(join(source, 'binary.dat'), 'not editable');
    const result = await fork(); expect(result).toMatchObject({ name: 'example-fork', reviewStatus: 'draft', forkOf: { name: 'example', version: '1.0.0', sourcePath: 'notes/example' } });
    expect(JSON.parse(await readFile(join(source, 'note.json'), 'utf8')).name).toBe('example');
    const files = await getNoteForkFiles(root, result.name); expect(files.map(file => file.path)).toEqual(['note.json', 'SKILL.md']);
    expect(files.find(file => file.path === 'SKILL.md')).toMatchObject({ content: '# Source skill', size: 14 });
    const handoff = await buildNoteForkPrHandoff(root, result.name); expect(handoff).toMatchObject({ sourceRepo: 'https://github.com/memi-design/design-skills', targetPath: 'skills/example-fork', files: ['note.json', 'SKILL.md'] });
    expect(handoff.commands.at(-1)).toBe('Open a pull request for review.');
  });
  it('preserves explicit provenance and filters malformed or ordinary installed notes from fork listing', async () => {
    expect(await listNoteForks(root)).toEqual([]);
    await save({ ...base(), sourceUrls: ['https://example.test/source'], lastResearchedAt: '2026-08-01T00:00:00Z', freshnessDays: 7 });
    const result = await forkNoteDirectory(root, { sourcePath: source, sourceRepo: 'https://example.test/upstream', sourcePathInRepo: 'skills/original' });
    const stored = JSON.parse(await readFile(join(result.path, 'note.json'), 'utf8')); expect(stored).toMatchObject({ freshnessDays: 7, sourceUrls: ['https://example.test/source'], forkOf: { sourcePath: 'skills/original' } });
    const notes = join(root, '.memoire/notes'); await writeFile(join(notes, 'ignore.txt'), 'not a note'); await save(base(), join(notes, 'ordinary')); await mkdir(join(notes, 'broken'));
    expect((await listNoteForks(root)).map(f => f.name)).toEqual(['example-fork']);
    await expect(getNoteForkFiles(root, 'ordinary')).rejects.toThrow('not a fork');
  });
  it('validates edits and computes added, removed, modified and unchanged file distinctions', async () => {
    await writeFile(join(source, 'removed.md'), 'remove me'); await writeFile(join(source, 'same.md'), 'preserve');
    const result = await fork();
    expect(await updateNoteForkFile(root, result.name, { path: 'nested/new.md', content: 'New guidance' })).toMatchObject({ path: 'nested/new.md', size: 12 });
    await updateNoteForkFile(root, result.name, { path: 'SKILL.md', content: '# Revised' }); await rm(join(result.path, 'removed.md'));
    const diff = await diffNoteFork(root, result.name); expect(diff.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'SKILL.md', status: 'modified', original: '# Source skill', modified: '# Revised' }), expect.objectContaining({ path: 'nested/new.md', status: 'added', original: null }), expect.objectContaining({ path: 'removed.md', status: 'removed', modified: null })]));
    expect(diff.files.some(file => file.path === 'same.md')).toBe(false);
    const content = await readFile(join(result.path, 'note.json'), 'utf8'); await updateNoteForkFile(root, result.name, { path: 'note.json', content });
    await expect(updateNoteForkFile(root, result.name, { path: 'note.json', content: '{}' })).rejects.toThrow();
    for (const path of ['../outside.md', 'script.js']) await expect(updateNoteForkFile(root, result.name, { path, content: 'no' })).rejects.toThrow();
    await expect(getNoteForkFiles(root, '../outside')).rejects.toThrow('Invalid fork name');
  });
  it('handles missing upstream metadata conservatively and refuses editable symlink traversal', async () => {
    const result = await fork(); await rm(join(result.path, '.memoire-fork.json'));
    expect((await diffNoteFork(root, result.name)).files.every(file => file.original === null)).toBe(true);
    await symlink(join(source, 'SKILL.md'), join(result.path, 'link.md')); await expect(getNoteForkFiles(root, result.name)).rejects.toThrow('unsupported link');
  });
  it.each([['local-fork', true, true, 'forks'], ['community-catalog', true, true, 'community'], ['other', false, true, 'installed'], ['other', true, false, 'official'], ['other', false, false, 'updates']])('classifies %s source without inventing installation state', (source, builtin, installed, expected) => {
    expect(forkSourceFilter(source as string, builtin as boolean, installed as boolean)).toBe(expected);
  });
  it('fails community admission when recursive listing finds an unsupported symlink', async () => {
    await symlink(join(source, 'SKILL.md'), join(source, 'linked.md'));
    const result = await validateCommunityNoteDir(source);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error', message: expect.stringContaining('unsupported link') })]));
  });

});
