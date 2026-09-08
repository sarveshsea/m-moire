import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerNotesCommand } from '../notes.js';
import type { MemoireEngine } from '../../engine/core.js';
import * as notes from '../../notes/index.js';
vi.mock('../../notes/index.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../notes/index.js')>(),
  installNote: vi.fn(), removeNote: vi.fn(), scaffoldNote: vi.fn(), getNoteInfo: vi.fn(), loadNotesCatalog: vi.fn(),
}));
const manifest = { name: 'test-note', version: '1.0.0', description: 'Test guidance', category: 'craft', tags: [], dependencies: [], skills: [{ name: 'Test skill', file: 'SKILL.md', activateOn: 'always', freedomLevel: 'high' }] };
const installed = (overrides = {}) => ({ manifest, enabled: true, builtIn: false, path: '/fixture/note', ...overrides });
let logs: string[];
const originalExit = process.exitCode;
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  vi.mocked(notes.installNote).mockResolvedValue(manifest as never);
  vi.mocked(notes.removeNote).mockResolvedValue(undefined);
  vi.mocked(notes.scaffoldNote).mockResolvedValue('/fixture/note');
  vi.mocked(notes.getNoteInfo).mockResolvedValue(manifest as never);
  vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [] } as never);
  process.exitCode = 0;
});
afterEach(() => { vi.restoreAllMocks(); vi.resetAllMocks(); process.exitCode = originalExit; });
async function invoke(args: string[], entries: ReturnType<typeof installed>[] = [], loaded = true) {
  const loadAll = vi.fn();
  const engine = { config: { projectRoot: '/fixture' }, notes: { loaded, loadAll, notes: entries, getNote: (name: string) => entries.find(entry => entry.manifest.name === name) } } as unknown as MemoireEngine;
  const command = new Command().exitOverride();
  registerNotesCommand(command, engine);
  await command.parseAsync(['notes', ...args], { from: 'user' });
  return { loadAll, text: logs.join('\n'), payload: () => JSON.parse(logs.at(-1)!) };
}

describe('notes command presentation and failures', () => {
  it.each([false, true])('lists empty state accurately with JSON=%s', async json => {
    const result = await invoke(['list', ...(json ? ['--json'] : [])], [], false);
    expect(result.loadAll).toHaveBeenCalledOnce();
    if (json) expect(result.payload()).toMatchObject({ notes: [], summary: { total: 0, active: 0 } });
    else expect(result.text).toContain('No notes installed');
  });
  it('counts enabled, built-in and category memberships independently', async () => {
    const entries = ['craft', 'research', 'connect', 'generate'].map((category, index) => installed({ manifest: { ...manifest, name: `note-${index}`, category }, enabled: index % 2 === 0, builtIn: index < 2 }));
    const result = await invoke(['list', '--json'], entries);
    expect(result.loadAll).not.toHaveBeenCalled();
    expect(result.payload().summary).toEqual({ total: 4, builtIn: 2, installed: 2, active: 2, byCategory: { craft: 1, research: 1, connect: 1, generate: 1 } });
  });
  it('shows activation and disabled state in the human list', async () => {
    const result = await invoke(['list'], [installed({ enabled: false, builtIn: true })]);
    expect(result.text).toContain('[built-in] [disabled]');
    expect(result.text).toContain('activateOn: always');
  });
  it.each([false, true])('reports absent note info as failure with JSON=%s', async json => {
    expect((await invoke(['info', 'missing', ...(json ? ['--json'] : [])])).text).toContain('not found');
    expect(process.exitCode).toBe(1);
  });
  it.each([false, true])('identifies built-in versus installed details for builtIn=%s', async builtIn => {
    const result = await invoke(['info', 'test-note', '--json'], [installed({ builtIn })], false);
    expect(result.payload()).toMatchObject({ source: builtIn ? 'built-in' : 'installed', note: { enabled: true, author: null, sourceUrls: [] } });
    expect(result.loadAll).toHaveBeenCalledOnce();
  });
  it('renders author and dependencies when available', async () => {
    const result = await invoke(['info', 'test-note'], [installed({ manifest: { ...manifest, author: 'Fixture author', tags: ['design'], dependencies: ['base'] } })]);
    expect(result.text).toContain('Fixture author');
    expect(result.text).toContain('base');
    expect(result.text).toContain('SKILL.md');
  });
  it.each(['install', 'remove', 'create', 'update'])('reports human %s success', async action => {
    expect((await invoke([action, 'test-note'])).text).toMatch(/test-note/);
    expect(process.exitCode).toBe(0);
  });
  it.each(['install', 'remove', 'create', 'update'])('reports human %s failure and nonzero exit', async action => {
    const method = { install: notes.installNote, remove: notes.removeNote, create: notes.scaffoldNote, update: notes.installNote }[action]!;
    vi.mocked(method).mockRejectedValue('operation denied');
    expect((await invoke([action, 'test-note'])).text).toContain('operation denied');
    expect(process.exitCode).toBe(1);
  });
  it.each([false, true])('rejects missing update target with JSON=%s', async json => {
    const result = await invoke(['update', ...(json ? ['--json'] : [])]);
    expect(result.text).toContain('Pass a note name or --all');
    expect(notes.installNote).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('deduplicates update-all targets and passes the explicit catalog', async () => {
    const result = await invoke(['update', '--all', '--catalog', 'https://catalog.test/notes.json', '--json'], [installed(), installed()], false);
    expect(notes.installNote).toHaveBeenCalledExactlyOnceWith('test-note', '/fixture', { catalogUrl: 'https://catalog.test/notes.json' });
    expect(result.payload()).toMatchObject({ status: 'completed', updated: [{ name: 'test-note' }] });
  });
  it('rejects an invalid scaffold category before writing files', async () => {
    expect((await invoke(['create', 'test-note', '--category', 'invalid'])).text).toContain('Invalid category');
    expect(notes.scaffoldNote).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('reports successful scaffold with unavailable manifest without inventing note details', async () => {
    vi.mocked(notes.getNoteInfo).mockResolvedValue(null);
    expect((await invoke(['create', 'test-note', '--json'])).payload()).toMatchObject({ status: 'completed', note: null });
  });
  it.each([false, true])('reports catalog failure with JSON=%s', async json => {
    vi.mocked(notes.loadNotesCatalog).mockRejectedValue(new Error('catalog offline'));
    const result = await invoke(['search', 'motion', ...(json ? ['--json'] : [])]);
    expect(result.text).toContain('catalog offline');
    expect(process.exitCode).toBe(1);
  });
  it('does not call a current note outdated when catalog retrieval fails', async () => {
    vi.mocked(notes.loadNotesCatalog).mockRejectedValue(new Error('offline'));
    expect((await invoke(['outdated'], [installed()])).text).toContain('All notes are current');
  });
  it('reports research age separately from a newer catalog version', async () => {
    vi.mocked(notes.loadNotesCatalog).mockResolvedValue({ notes: [{ ...manifest, id: 'test-note', version: '2.0.0' }] } as never);
    const result = await invoke(['outdated', '--json'], [installed({ manifest: { ...manifest, lastResearchedAt: '2020-01-01', freshnessDays: 1 } })]);
    expect(result.payload().outdated[0].reason).toMatch(/remote version 2.0.0 is newer; last researched \d+ days ago/);
  });
});
