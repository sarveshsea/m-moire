import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureDesignChangelogEntry, createDesignChangelogEntry, designChangelogDir, exportDesignChangelogMarkdown, getDesignChangelogEntry, listDesignChangelogEntries, updateDesignChangelogEntry } from '../design-changelog.js';
import type { StudioEvent, StudioDesignSystemTrace } from '../types.js';
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memi-changelog-release-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
const event = (overrides: Partial<StudioEvent> = {}): StudioEvent => ({ id: 'event-1', sessionId: 'fixture-session', type: 'design_decision', timestamp: '2026-09-01T00:00:00Z', message: 'Prioritize navigation clarity', ...overrides });
const trace = (designSystemFiles: unknown[] = [], error?: string) => ({ designSystemFiles, error } as StudioDesignSystemTrace);

describe('design changelog normalization and evidence updates', () => {
  it('normalizes identifiers and rejects malformed records from the readable inventory', async () => {
    await mkdir(designChangelogDir(root), { recursive: true });
    for (const [name, value] of [['bad', '{'], ['null', 'null'], ['wrong-version', '{"schemaVersion":2}'], ['wrong-id', '{"schemaVersion":1,"id":42,"title":"Bad"}']] as const) await writeFile(join(designChangelogDir(root), `${name}.json`), value);
    const created = await createDesignChangelogEntry(root, { id: 'Café / Navigation', title: 'Actual entry' });
    expect(created.id).toBe('cafe-navigation');
    expect((await listDesignChangelogEntries(root)).map(entry => entry.id)).toEqual(['cafe-navigation']);
  });
  it('reads legacy sparse metadata using explicit defaults', async () => {
    await mkdir(designChangelogDir(root), { recursive: true });
    await writeFile(join(designChangelogDir(root), 'legacy.json'), JSON.stringify({ schemaVersion: 1, id: 'legacy', title: ' ', authoredBy: 'legacy-agent', harness: 42, action: {}, sessionId: 7, tags: null, eventIds: {}, fileRefs: null }));
    expect(await getDesignChangelogEntry(root, 'legacy')).toMatchObject({ title: 'Untitled design change', summary: '', status: 'active', authoredBy: 'agent', harness: null, action: null, sessionId: null, createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z', tags: [], fileRefs: [], eventIds: [] });
  });
  it('sorts equally updated entries deterministically by title', async () => {
    await createDesignChangelogEntry(root, { title: 'Zebra', updatedAt: '2026-09-01' });
    await createDesignChangelogEntry(root, { title: 'Alpha', updatedAt: '2026-09-01' });
    expect((await listDesignChangelogEntries(root)).map(entry => entry.title)).toEqual(['Alpha', 'Zebra']);
  });
  it('preserves an existing title when a patch clears it but permits clearing optional body fields', async () => {
    const entry = await createDesignChangelogEntry(root, { title: 'Keep title', summary: 'Old summary', bodyMarkdown: 'Old body' });
    const patched = await updateDesignChangelogEntry(root, entry.id, { title: ' ', summary: ' ', bodyMarkdown: ' ', tags: ['Design System', 'Design System', 42] as never, eventIds: ['one', '', 'one'], captureWarnings: ['Check', 'Check'] });
    expect(patched).toMatchObject({ title: 'Keep title', summary: '', bodyMarkdown: '', tags: ['design-system'], eventIds: ['one'], captureWarnings: ['Check'] });
  });
  it.each(['component', 'style', 'token', 'spec', 'figma', 'config', 'research', 'unknown'])('normalizes persisted file reference kind %s', async kind => {
    const entry = await createDesignChangelogEntry(root, { fileRefs: [{ path: ' file.ts ', kind, insertions: '4', deletions: 'not-number', designSystem: false }, null, {}, { path: '' }] as never });
    expect(entry.fileRefs).toEqual([{ path: 'file.ts', kind: kind === 'unknown' ? 'other' : kind, insertions: 4, deletions: 0, status: 'modified', designSystem: false }]);
  });
  it('deduplicates file paths using latest evidence and ranks design-system files first', async () => {
    const entry = await createDesignChangelogEntry(root, { fileRefs: [{ path: 'z.ts', kind: 'component', insertions: 1 }, { path: 'a.ts', kind: 'config', designSystem: false }, { path: 'z.ts', kind: 'component', insertions: 2, deletions: 1 }] as never });
    expect(entry.fileRefs.map(file => file.path)).toEqual(['z.ts', 'a.ts']);
    expect(entry.fileRefs[0].insertions).toBe(2);
  });
  it('does not treat arbitrary artifacts or incomplete events as design evidence', async () => {
    expect(await captureDesignChangelogEntry(root, { events: [null, {} as StudioEvent, event({ type: 'artifact', message: 'Unrelated output' })] as never, trace: trace() })).toEqual({ captured: false, entry: null, warnings: [] });
  });
  it('uses bounded design-event titles without requiring a session identity', async () => {
    const result = await captureDesignChangelogEntry(root, { event: event({ message: 'Navigation '.repeat(20) }), trace: trace() });
    expect(result.entry?.title).toHaveLength(86);
    expect(result.entry?.title.endsWith('...')).toBe(true);
    expect(result.entry?.sessionId).toBeNull();
    expect(result.warnings).toContain('No changed design-system files were detected for this capture.');
  });
  it.each([1, 2])('derives a capture from %s changed files without inventing design rationale', async count => {
    const files = Array.from({ length: count }, (_, index) => ({ path: `tokens-${index}.css`, kind: 'token', status: 'modified', insertions: 1, deletions: 0, designSystem: true }));
    const result = await captureDesignChangelogEntry(root, { trace: trace(files, 'Fixture trace warning') });
    expect(result.entry).toMatchObject({ title: 'Captured design change', summary: `${count} design-system file${count === 1 ? '' : 's'} changed.` });
    expect(result.warnings).toContain('Captured without a design_decision event; add rationale in the editor.');
    expect(result.warnings).toContain('Design trace warning: Fixture trace warning');
  });
  it('preserves human-authored revisions when new evidence arrives for the same session', async () => {
    const first = await captureDesignChangelogEntry(root, { session: { id: 'stable-session', harness: 'codex', action: 'compose' }, event: event(), trace: trace() });
    await updateDesignChangelogEntry(root, first.entry!.id, { authoredBy: 'human', title: 'Reviewed title', summary: 'Reviewed summary', bodyMarkdown: 'Reviewed rationale', status: 'archived' });
    const next = await captureDesignChangelogEntry(root, { session: { id: 'stable-session' }, event: event({ id: 'event-2', message: 'Additional evidence' }), trace: trace() });
    expect(next.entry).toMatchObject({ id: first.entry!.id, authoredBy: 'human', title: 'Reviewed title', summary: 'Reviewed summary', bodyMarkdown: 'Reviewed rationale', status: 'archived', harness: 'codex', action: 'compose', eventIds: ['event-1', 'event-2'] });
    expect(await listDesignChangelogEntries(root)).toHaveLength(1);
  });
  it('exports session identity, evidence file references and capture warnings', async () => {
    await createDesignChangelogEntry(root, { title: 'Exported decision', sessionId: 'session-a', tags: ['reviewed'], fileRefs: [{ path: 'tokens.css', kind: 'token' }] as never, captureWarnings: ['Needs visual confirmation'] });
    const markdown = await exportDesignChangelogMarkdown(root);
    expect(markdown).toContain('human / session-a'); expect(markdown).toContain('tokens.css'); expect(markdown).toContain('Needs visual confirmation');
  });
});
