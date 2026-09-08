import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerNotesCommand } from '../notes.js';
import type { MemoireEngine } from '../../engine/core.js';
import * as notes from '../../notes/index.js';
import { validateCommunityNoteDir } from '../../notes/community.js';
vi.mock('../../notes/index.js', async original => ({ ...await original<typeof import('../../notes/index.js')>(), loadNotesCatalog: vi.fn(), searchCatalogSkills: vi.fn(), routeInstalledSkills: vi.fn(), buildRepositoryFingerprint: vi.fn(), validateRoutingPattern: vi.fn() }));
vi.mock('../../notes/community.js', () => ({ validateCommunityNoteDir: vi.fn() }));
const manifest = { name: 'fixture', version: '1.0.0', skills: [], sourceUrls: ['https://example.com'], lastResearchedAt: '2026-09-01', freshnessDays: 90 };
const entry = (overrides = {}) => ({ manifest: { ...manifest, ...overrides }, enabled: true });
const catalogNote = (id: string, overrides = {}) => ({ id, name: id, title: id, version: '1.0.0', description: 'Local design guidance', category: 'craft', tags: [], sourceUrls: [], archive: { url: 'https://example.com/note.zip' }, ...overrides });
let output: string[];
const originalExit = process.exitCode;
beforeEach(() => {
  output = []; process.exitCode = 0;
  vi.spyOn(console, 'log').mockImplementation((...args) => { output.push(args.join(' ')); });
  vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [] } as never);
  vi.mocked(notes.searchCatalogSkills).mockReturnValue([]);
  vi.mocked(notes.buildRepositoryFingerprint).mockResolvedValue({ files: [] } as never);
  vi.mocked(notes.routeInstalledSkills).mockResolvedValue({ decision: 'abstain', selected: [] } as never);
  vi.mocked(notes.validateRoutingPattern).mockReturnValue({ valid: true });
  vi.mocked(validateCommunityNoteDir).mockResolvedValue({ ok: true, issues: [], warnings: [] } as never);
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); process.exitCode = originalExit; });
async function run(args: string[], entries = [entry()], loaded = true) {
  const loadAll = vi.fn();
  const engine = { config: { projectRoot: '/fixture' }, notes: { loaded, loadAll, notes: entries } } as unknown as MemoireEngine;
  const command = new Command().exitOverride(); registerNotesCommand(command, engine);
  await command.parseAsync(['notes', ...args], { from: 'user' });
  return { text: output.join('\n'), json: () => JSON.parse(output.at(-1)!), loadAll };
}
describe('notes catalog and routing command boundaries', () => {
  it.each([false, true])('returns unranked catalog for omitted search query, json=%s', async json => {
    vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [catalogNote('alpha')] } as never);
    const result = await run(['search', ...(json ? ['--json'] : [])]);
    expect(notes.searchCatalogSkills).not.toHaveBeenCalled();
    if (json) expect(result.json()).toMatchObject({ status: 'completed', query: '', notes: [{ name: 'alpha', score: 0, matchedTerms: [] }] });
    else expect(result.text).toBe('alpha@1.0.0 — Local design guidance');
  });
  it('maps explicit intents, legacy activation, and absent manifests while excluding unknown ranked IDs', async () => {
    vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [catalogNote('explicit', { manifest: { memoire: { routing: { intents: ['audit'] } } } }), catalogNote('legacy', { manifest: { skills: [{ activateOn: 'build, review' }] } }), catalogNote('absent')] } as never);
    vi.mocked(notes.searchCatalogSkills).mockReturnValue([{ id: 'missing', score: 99 }, { id: 'legacy', score: 4, matchedTerms: ['build'] }] as never);
    const result = await run(['search', 'build', '--catalog', 'https://example.com/catalog', '--json']);
    expect(notes.searchCatalogSkills).toHaveBeenCalledWith(expect.objectContaining({ query: 'build', entries: [expect.objectContaining({ intents: ['audit'] }), expect.objectContaining({ intents: ['build', 'review'] }), expect.objectContaining({ intents: [] })] }));
    expect(result.json()).toMatchObject({ catalogUrl: 'https://example.com/catalog', notes: [{ name: 'legacy', score: 4, matchedTerms: ['build'] }] });
    expect(result.json().notes).toHaveLength(1);
  });
  it('renders relevance in human search output', async () => {
    vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [catalogNote('alpha')] } as never);
    vi.mocked(notes.searchCatalogSkills).mockReturnValue([{ id: 'alpha', score: 3, matchedTerms: [] }] as never);
    expect((await run(['search', 'design'])).text).toContain('alpha@1.0.0 [3]');
  });
  it.each([false, true])('reports catalog rejection with failing exit, json=%s', async json => {
    vi.mocked(notes.loadNotesCatalog).mockRejectedValue(json ? new Error('offline') : 'offline');
    const result = await run(['search', ...(json ? ['--json'] : [])]);
    expect(result.text).toContain('offline'); expect(process.exitCode).toBe(1);
    if (json) expect(result.json()).toMatchObject({ status: 'failed', query: '', error: { message: 'offline' } });
  });
  it('passes normalized routing constraints and repository fingerprint', async () => {
    const result = await run(['route', 'audit', 'interface', '--capabilities', ' read, , browser ', '--platforms', ' web, ios ', '--max-skills', '3', '--max-context-bytes', '1024', '--json'], [entry()], false);
    expect(result.loadAll).toHaveBeenCalledOnce();
    expect(notes.buildRepositoryFingerprint).toHaveBeenCalledWith('/fixture');
    expect(notes.routeInstalledSkills).toHaveBeenCalledWith(expect.objectContaining({ intent: 'audit interface', capabilities: ['read', 'browser'], platforms: ['web', 'ios'], maximumSkills: 3, maximumContextBytes: 1024, repositoryFingerprint: { files: [] } }));
    expect(result.json()).toMatchObject({ status: 'completed', route: { decision: 'abstain' } });
  });
  it('explains abstention and lists selected skill hashes', async () => {
    expect((await run(['route', 'audit'])).text).toContain('No skill met');
    vi.mocked(notes.routeInstalledSkills).mockResolvedValue({ decision: 'select', selected: [{ id: 'audit', score: 7, contentHash: 'sha256:fixture' }] } as never);
    expect((await run(['route', 'audit'])).text).toContain('audit [7] sha256:fixture');
  });
  it.each([['--max-skills', '0'], ['--max-context-bytes', '-1'], ['--max-skills', 'invalid']])('rejects invalid routing limit %s=%s', async (flag, value) => {
    await expect(run(['route', 'audit', flag, value])).rejects.toThrow(/positive integer/);
    expect(notes.routeInstalledSkills).not.toHaveBeenCalled();
  });
});
describe('notes doctor validation receipts', () => {
  it('fails JSON installed community validation with a nonzero exit', async () => {
    const result = await run(['doctor', '--community', '--json'], [entry({ sourceUrls: [], lastResearchedAt: undefined, freshnessDays: undefined })]);
    expect(result.json()).toMatchObject({ status: 'failed', notesChecked: 1 });
    expect(result.json().issues).toHaveLength(3);
    expect(process.exitCode).toBe(1);
  });
  it('keeps local missing metadata advisory and loads notes before validation', async () => {
    const result = await run(['doctor', '--json'], [entry({ sourceUrls: undefined, lastResearchedAt: undefined })], false);
    expect(result.loadAll).toHaveBeenCalledOnce(); expect(result.json().warnings).toHaveLength(2);
    expect(result.json().status).toBe('completed'); expect(process.exitCode).toBe(0);
  });
  it('reports routing migration errors and ignores undefined pattern lists', async () => {
    vi.mocked(notes.validateRoutingPattern).mockReturnValueOnce({ valid: false, reason: 'unsupported glob', migration: '*.tsx' }).mockReturnValueOnce({ valid: false } as never);
    const result = await run(['doctor'], [entry({ memoire: { routing: { repository: { all: ['**/*.tsx', '['], any: undefined } } } })]);
    expect(result.text).toContain('unsupported glob; migrate to *.tsx'); expect(result.text).toContain('invalid pattern'); expect(process.exitCode).toBe(1);
  });
  it('accepts complete manifests and valid repository routing', async () => {
    expect((await run(['doctor', '--community'], [entry({ memoire: { routing: { repository: { all: ['*.tsx'] } } } })])).text).toContain('Notes doctor passed');
    expect(process.exitCode).toBe(0);
  });
  it.each([false, true])('renders directory validation failure, json=%s', async json => {
    vi.mocked(validateCommunityNoteDir).mockResolvedValue({ ok: false, noteName: 'fixture', issues: [{ level: 'error', path: 'SKILL.md', message: 'missing' }], warnings: [{ level: 'warning', message: 'stale' }] } as never);
    const result = await run(['doctor', '--path', '/fixture/note', '--community', ...(json ? ['--json'] : [])]);
    expect(validateCommunityNoteDir).toHaveBeenCalledWith('/fixture/note', { strictCommunity: true });
    expect(result.text).toContain('missing'); expect(result.text).toContain('stale'); expect(process.exitCode).toBe(1);
    if (json) expect(result.json().status).toBe('failed'); else expect(result.text).toContain('warning: fixture: stale');
  });
  it('handles anonymous directory warnings and clean directory validation', async () => {
    vi.mocked(validateCommunityNoteDir).mockResolvedValueOnce({ ok: true, issues: [], warnings: [{ level: 'warning', message: 'unassessed' }] } as never);
    expect((await run(['doctor', '--path', '/fixture'])).text).toContain('warning: note: unassessed');
    expect((await run(['doctor', '--path', '/fixture'])).text).toContain('Notes doctor passed');
  });
});
