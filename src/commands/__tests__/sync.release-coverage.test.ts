import { Command } from 'commander';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { registerSyncCommand } from '../sync.js';
const effects = vi.hoisted(() => ({ pr: vi.fn() }));
vi.mock('../../sync/auto-pr.js', () => ({ openAutoPR: effects.pr }));
let root: string, engine: any, logs: string[], callbacks: Record<string, () => Promise<void>>, cleanup: (() => void) | undefined;
async function run(...args: string[]) { const p = new Command(); registerSyncCommand(p, engine); await p.parseAsync(['sync', ...args], { from: 'user' }); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-sync-coverage-')); logs = []; callbacks = {}; cleanup = undefined;
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  effects.pr.mockReset().mockResolvedValue({ status: 'opened', prUrl: 'https://example.test/pr/1' });
  const syncResult = { applied: 1, pushed: 2, conflicts: [], diff: { hasChanges: true, summary: 'Changed token' } };
  engine = {
    config: { projectRoot: root }, init: vi.fn(), ensureFigmaConnected: vi.fn(), pullDesignSystem: vi.fn(),
    figma: { isConnected: true, on: vi.fn((name, callback) => { callbacks[name] = callback; }) },
    codeWatcher: { start: vi.fn(), stop: vi.fn(), on: vi.fn((name, callback) => { callbacks[name] = callback; }) },
    sync: { getConflicts: vi.fn(() => []), sync: vi.fn().mockResolvedValue(syncResult) },
    registry: { designSystem: { tokens: [{ name: 'new', values: { Light: 'red' } }], components: [{ name: 'Button' }], styles: [], lastSync: 'now' }, getAllSpecs: vi.fn().mockResolvedValue([{ name: 'Button' }, { name: 'Blocked' }, { name: 'Broken' }]) },
    generateFromSpec: vi.fn(async name => { if (name === 'Broken') throw new Error('broken'); return { blocked: name === 'Blocked' }; }),
  };
});
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
function liveHarness() {
  vi.spyOn(globalThis, 'setInterval').mockReturnValue(1 as never);
  vi.spyOn(process, 'once').mockImplementation(((name: string, callback: () => void) => { if (name === 'SIGINT') cleanup = callback; return process; }) as never);
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
}
describe('sync command outcome and effect boundaries', () => {
  it('lists conflicts without contacting Figma or regenerating source', async () => {
    await run('--conflicts'); expect(logs.join('\n')).toContain('No unresolved');
    engine.sync.getConflicts.mockReturnValue([{ name: 'Button', entityType: 'component', figmaHash: '123456789', codeHash: '987654321', detectedAt: 'today' }]);
    await run('--conflicts'); expect(logs.join('\n')).toContain('12345678');
    await run('--conflicts', '--json'); expect(JSON.parse(logs.at(-1)!)).toHaveProperty('conflicts.0.name', 'Button');
    expect(engine.ensureFigmaConnected).not.toHaveBeenCalled(); expect(engine.generateFromSpec).not.toHaveBeenCalled();
  });
  it('counts only regenerated specs and preserves offline context', async () => {
    engine.figma.isConnected = false; engine.ensureFigmaConnected.mockRejectedValue('offline');
    await run('--json'); const result = JSON.parse(logs.at(-1)!);
    expect(result).toMatchObject({ status: 'partial', figma: { cached: true, error: 'offline' }, specs: { regenerated: 1, total: 3 } });
    expect(engine.pullDesignSystem).not.toHaveBeenCalled();
    await run(); expect(logs.join('\n')).toContain('cached design system');
  });
  it('surfaces sync warnings in human output and reports conflict counts', async () => {
    engine.sync.sync.mockRejectedValueOnce(new Error('transport failed')); await run(); expect(logs.join('\n')).toContain('transport failed');
    engine.sync.sync.mockRejectedValueOnce('string failure'); await run(); expect(logs.join('\n')).toContain('string failure');
    for (const count of [1, 2]) { engine.sync.sync.mockResolvedValueOnce({ applied: 0, pushed: 0, conflicts: Array(count).fill({}) }); await run(); }
    expect(logs.join('\n')).toContain('2 conflicts');
  });
  it.each(['opened', 'pushed-no-gh', 'skipped-no-changes', 'failed'])('reports auto-PR outcome %s from a bounded local snapshot', async status => {
    effects.pr.mockResolvedValue({ status, branch: 'review', prUrl: 'https://example.test/pr/1', error: 'no credentials' });
    await run('--auto-pr', '--base', 'develop');
    expect(effects.pr).toHaveBeenCalledWith(expect.objectContaining({ cwd: root, base: 'develop', diff: expect.objectContaining({ tokens: { added: ['new'], removed: [], changed: [] }, previousSync: null }) }));
    expect(logs.join('\n')).toContain(status === 'opened' ? 'PR opened' : status === 'pushed-no-gh' ? 'Branch pushed' : status === 'failed' ? 'no credentials' : 'No changes');
  });
  it('diffs added, removed, changed and retained snapshot entities before proposing a PR', async () => {
    await mkdir(join(root, '.memoire'));
    await writeFile(join(root, '.memoire/design-system.prev.json'), JSON.stringify({ tokens: [{ name: 'old', values: {} }, { name: 'same', values: { Light: 'blue' } }, { name: 'retained', values: {} }], components: [{ name: 'Removed' }, { name: 'Kept' }], lastSync: 'before' }));
    engine.registry.designSystem.tokens.push({ name: 'same', values: {} }, { name: 'retained', values: {} }); engine.registry.designSystem.components.push({ name: 'Kept' });
    await run('--auto-pr');
    expect(effects.pr.mock.calls[0][0].diff).toMatchObject({ tokens: { added: ['new'], removed: ['old'], changed: [{ name: 'same', field: 'values', from: 'blue', to: '' }] }, components: { added: ['Button'], removed: ['Removed'] }, previousSync: 'before' });
  });
  it.each([false, true])('handles live changes, failures and shutdown with json=%s', async json => {
    liveHarness(); await run('--live', ...(json ? ['--json'] : []));
    expect(engine.codeWatcher.start).toHaveBeenCalledOnce();
    for (const event of ['document-changed', 'code-changed']) {
      await callbacks[event]();
      engine.sync.sync.mockResolvedValueOnce({ applied: 0, pushed: 0, conflicts: [], diff: { hasChanges: false } }); await callbacks[event]();
      engine.sync.sync.mockRejectedValueOnce(new Error('event failed')); await callbacks[event]();
      engine.sync.sync.mockRejectedValueOnce('event string failed'); await callbacks[event]();
    }
    cleanup!(); expect(engine.codeWatcher.stop).toHaveBeenCalledOnce(); expect(process.exit).toHaveBeenCalledWith(0);
    if (json) { expect(logs).toHaveLength(1); expect(JSON.parse(logs[0]).specs.regenerated).toBe(1); }
    else expect(logs.join('\n')).toContain('event string failed');
  });
});
