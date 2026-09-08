import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, resolve, parse } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceManager } from '../workspace.js';
vi.mock('../logger.js', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
let root: string, manager: WorkspaceManager;
const project = resolve('/fixture/project');
const id = createHash('sha256').update(project).digest('hex').slice(0, 12);
const timestamp = '2026-09-08T00:00:00.000Z';
const generation = { timestamp, specName: 'button', status: 'success' as const, message: 'Generated', files: ['button.tsx'] };
const file = (...parts: string[]) => join(root, id, ...parts);
async function seed(parts: string[], value: string) { await mkdir(join(file(...parts), '..'), { recursive: true }); await writeFile(file(...parts), value); }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memi-workspace-')); manager = new WorkspaceManager(root); });
afterEach(async () => { vi.useRealTimers(); await rm(root, { recursive: true, force: true }); });
describe('workspace persistence and recovery', () => {
  it('creates project metadata and registry, then preserves creation while refreshing access', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(timestamp));
    const first = await manager.getWorkspace(project);
    expect(first).toEqual({ name: 'project', path: project, created: timestamp, lastAccessed: timestamp });
    vi.setSystemTime(new Date('2026-09-09T00:00:00.000Z'));
    const second = await manager.getWorkspace(project);
    expect(second.created).toBe(timestamp); expect(second.lastAccessed).toBe('2026-09-09T00:00:00.000Z');
    expect(await manager.listWorkspaces()).toEqual([second]);
    const registry = JSON.parse(await readFile(join(root, 'registry.json'), 'utf8'));
    expect(registry.entries[project]).toEqual({ workspaceId: id, created: timestamp });
    expect(await readdir(root)).not.toContain('.registry.json.tmp');
    expect(await readdir(file())).not.toContain('.meta.json.tmp');
  });
  it('names filesystem root deterministically when no basename exists', async () => {
    expect((await manager.getWorkspace(parse(project).root)).name).toBe('unknown');
  });
  it.each(['{', '{"version":2,"entries":{}}'])('recovers invalid registry %s and corrupt metadata', async contents => {
    await writeFile(join(root, 'registry.json'), contents); await seed(['meta.json'], '{');
    expect(await manager.listWorkspaces()).toEqual([]);
    expect((await manager.getWorkspace(project)).path).toBe(project);
    expect(await manager.listWorkspaces()).toHaveLength(1);
  });
  it('skips missing or malformed registered metadata without hiding healthy entries', async () => {
    const valid = await manager.getWorkspace(project);
    const registry = JSON.parse(await readFile(join(root, 'registry.json'), 'utf8'));
    registry.entries['/missing'] = { workspaceId: 'missing', created: timestamp };
    await writeFile(join(root, 'registry.json'), JSON.stringify(registry));
    expect(await manager.listWorkspaces()).toEqual([valid]);
  });
  it('treats a missing or unreadable registry as no known projects', async () => {
    expect(await manager.listWorkspaces()).toEqual([]);
    await mkdir(join(root, 'registry.json'));
    expect(await manager.listWorkspaces()).toEqual([]);
  });
  it('propagates metadata write failures after a failed read', async () => {
    await mkdir(file('meta.json'), { recursive: true });
    await expect(manager.getWorkspace(project)).rejects.toThrow();
  });
  it('removes only the requested workspace and registry membership', async () => {
    await manager.getWorkspace(project); await manager.getWorkspace(resolve('/fixture/other'));
    await manager.cleanWorkspace(project);
    expect((await manager.listWorkspaces()).map(value => value.path)).toEqual([resolve('/fixture/other')]);
    await expect(readFile(file('meta.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('propagates a registry write failure during cleanup', async () => {
    await mkdir(join(root, 'registry.json'));
    await expect(manager.cleanWorkspace(project)).rejects.toThrow();
  });
  it('round trips design data and applies schema defaults', async () => {
    await manager.saveDesignSystem(project, { tokens: [{ name: 'primary' }], components: [], styles: [], lastSync: timestamp });
    expect(await manager.getDesignSystem(project)).toMatchObject({ tokens: [{ name: 'primary' }], lastSync: timestamp });
    await seed(['design-system', 'tokens.json'], '{}');
    expect(await manager.getDesignSystem(project)).toEqual({ tokens: [], components: [], styles: [], lastSync: 'never' });
    await expect(manager.saveDesignSystem(project, { tokens: false } as never)).rejects.toThrow();
  });
  it('round trips server state and rejects invalid states before replacement', async () => {
    await manager.saveServerState(project, { status: 'running', port: 4000, pid: 42, startedAt: timestamp });
    expect(await manager.getServerState(project)).toMatchObject({ status: 'running', port: 4000 });
    await expect(manager.saveServerState(project, { status: 'unknown' } as never)).rejects.toThrow();
    expect((await manager.getServerState(project))?.status).toBe('running');
    await seed(['server', 'state.json'], '{}'); expect(await manager.getServerState(project)).toEqual({ status: 'stopped' });
  });
  it.each(['missing', 'malformed', 'directory'])('handles %s cache reads without claiming cached data', async mode => {
    for (const parts of [['design-system', 'tokens.json'], ['server', 'state.json'], ...['research', 'patterns', 'decisions'].map(key => ['knowledge', `${key}.json`])]) {
      if (mode === 'malformed') await seed(parts, '{');
      if (mode === 'directory') await mkdir(file(...parts), { recursive: true });
    }
    expect(await manager.getDesignSystem(project)).toBeNull(); expect(await manager.getServerState(project)).toBeNull();
    expect(await manager.getKnowledge(project)).toEqual({});
  });
  it('stores independent knowledge documents without losing siblings', async () => {
    await manager.saveKnowledge(project, 'research', { insights: ['contrast'] });
    await manager.saveKnowledge(project, 'patterns', ['navigation']); await manager.saveKnowledge(project, 'decisions', { approved: true });
    expect(await manager.getKnowledge(project)).toEqual({ research: { insights: ['contrast'] }, patterns: ['navigation'], decisions: { approved: true } });
    expect((await readdir(file('knowledge'))).sort()).toEqual(['decisions.json', 'patterns.json', 'research.json']);
  });
  it.each(['missing', 'malformed', 'nonarray', 'existing'])('appends validated generation to %s history', async mode => {
    if (mode !== 'missing') await seed(['codegen-history', 'generations.json'], mode === 'malformed' ? '{' : mode === 'nonarray' ? '{}' : JSON.stringify([generation]));
    await manager.logGeneration(project, { ...generation, specName: 'card', status: 'failed', error: 'Rejected' });
    const stored = JSON.parse(await readFile(file('codegen-history', 'generations.json'), 'utf8'));
    expect(stored).toHaveLength(mode === 'existing' ? 2 : 1); expect(stored.at(-1)).toMatchObject({ specName: 'card', status: 'failed', error: 'Rejected' });
    await expect(manager.logGeneration(project, { ...generation, timestamp: 'invalid' })).rejects.toThrow();
    expect(JSON.parse(await readFile(file('codegen-history', 'generations.json'), 'utf8'))).toEqual(stored);
  });
  it('propagates an unwritable history destination', async () => {
    await mkdir(file('codegen-history', 'generations.json'), { recursive: true });
    await expect(manager.logGeneration(project, generation)).rejects.toThrow();
  });
});
