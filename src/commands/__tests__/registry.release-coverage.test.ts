import { Command } from 'commander';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { registerRegistryCommand, doctorRegistryRef, searchRegistryEntries, findRegistryDiscoveryEntry, toRegistryDiscoveryEntry } from '../registry.js';
const fx = vi.hoisted(() => ({ catalog: vi.fn(), alias: vi.fn(), resolve: vi.fn(), read: vi.fn(), install: vi.fn(), packageRoot: '' }));
vi.mock('../../marketplace/catalog-loader.js', () => ({ loadMarketplaceCatalog: fx.catalog, resolveMarketplaceAlias: fx.alias }));
vi.mock('../../registry/resolver.js', () => ({ resolveRegistry: fx.resolve, readRegistryFile: fx.read }));
vi.mock('../../registry/installer.js', () => ({ installComponent: fx.install }));
vi.mock('../../utils/asset-path.js', () => ({ packagePath: (path: string) => join(fx.packageRoot, path) }));
let root: string, logs: string[], entry: any, resolved: any;
async function run(args: string[], engine: any = { init: vi.fn() }) { const p = new Command(); registerRegistryCommand(p, engine); await p.parseAsync(['registry', ...args], { from: 'user' }); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-registry-coverage-')); fx.packageRoot = join(root, 'packaged'); logs = []; vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); }); vi.spyOn(console, 'error').mockImplementation((...args) => { logs.push(args.join(' ')); });
  entry = { slug: 'sample', title: 'Sample Registry', packageName: '@fixture/sample', description: 'Interface primitives', category: 'forms', tags: ['inputs'], featured: true, installCommand: 'memi add Button --from @fixture/sample', componentCount: 2, components: [{ name: 'Button', category: 'actions' }, { name: 'Input' }], screenshotUrl: 'https://example.test/image.png', sourceUrl: 'https://example.test/source', sourcePath: 'registry' };
  resolved = { baseUrl: root, registry: { name: '@fixture/sample', version: '1.0.0', tokens: { href: 'tokens.json' }, components: [{ name: 'Button', href: 'button.json', code: { href: 'button.tsx' } }] } };
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@fixture/sample', memoire: { registry: true } }));
  fx.catalog.mockResolvedValue({ entries: [entry] }); fx.alias.mockResolvedValue(undefined); fx.resolve.mockImplementation(async () => resolved); fx.read.mockResolvedValue('{}'); fx.install.mockResolvedValue({ source: 'fixture', specPath: 'button.json', codePath: 'button.tsx', generatedFiles: [] });
});
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = 0; await rm(root, { recursive: true, force: true }); });
describe('registry command discovery and verification contracts', () => {
  it('matches catalog aliases, categories and component names without mutating catalog data', () => {
    for (const query of [' sample ', '@fixture/sample', 'SAMPLE REGISTRY']) expect(findRegistryDiscoveryEntry([entry], query)).toBe(entry);
    expect(findRegistryDiscoveryEntry([entry], 'missing')).toBeUndefined();
    for (const query of ['', 'actions', 'INPUT', 'forms']) expect(searchRegistryEntries([entry], query)).toEqual([entry]);
    expect(searchRegistryEntries([entry], 'absent')).toEqual([]); const copy = toRegistryDiscoveryEntry(entry); copy.tags.push('new'); copy.components[0].name = 'Changed'; expect(entry.tags).toEqual(['inputs']); expect(entry.components[0].name).toBe('Button');
  });
  it.each([false, true])('lists, searches and describes actual catalog entries json=%s', async json => {
    const flags = json ? ['--json'] : []; await run(['list', ...flags]); await run(['search', 'Button', ...flags]); await run(['info', 'sample', ...flags]);
    if (json) expect(JSON.parse(logs.at(-1)!)).toMatchObject({ slug: 'sample', componentCount: 2 }); else expect(logs.join('\n')).toContain('Screenshot:');
    await run(['search', 'absent', ...flags]); expect(logs.join('\n')).toContain(json ? '"count": 0' : 'No registries');
    await run(['info', 'absent', ...flags]); expect(process.exitCode).toBe(1); expect(logs.join('\n')).toContain(json ? 'registry_not_found' : 'Registry not found');
  });
  it('requires an engine for installation and forwards explicit install options', async () => {
    await expect(run(['install', 'Button', '--from', 'fixture'], undefined as never)).resolves.toBeUndefined();
    const p = new Command(); registerRegistryCommand(p); await expect(p.parseAsync(['registry', 'install', 'Button', '--from', 'fixture'], { from: 'user' })).rejects.toThrow('requires a Memoire engine');
    await run(['install', 'Button', '--from', 'fixture', '--tokens', '--regenerate', '--target', 'ui', '--refresh', '--json']);
    expect(fx.install).toHaveBeenLastCalledWith(expect.anything(), { from: 'fixture', name: 'Button', withTokens: true, regenerate: true, targetDir: 'ui', refresh: true });
    expect(JSON.parse(logs.at(-1)!)).toMatchObject({ status: 'installed', component: 'Button' });
    fx.install.mockResolvedValueOnce({ source: 'fixture', specPath: 'button.json', generatedFiles: [] }); await run(['install', 'Button', '--from', 'fixture']);
  });
  it('verifies local package identity and registry artifacts before passing', async () => {
    const result = await doctorRegistryRef('fixture', root, { refresh: true }); expect(result.status).toBe('passed'); expect(result.checks.map(c => c.name)).toContain('code:Button');
    expect(fx.resolve).toHaveBeenCalledWith('fixture', root, { refresh: true });
    await run(['doctor', 'fixture']); expect(logs.join('\n')).toContain('Result: passed');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'wrong' })); expect((await doctorRegistryRef('fixture', root)).errors.join(' ')).toContain('does not match');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@fixture/sample' })); expect((await doctorRegistryRef('fixture', root)).errors.join(' ')).toContain('memoire.registry');
  });
  it('retains token, spec and code failures rather than reporting a successful registry', async () => {
    fx.read.mockImplementation(async (_resolved, path) => { if (path === 'tokens.json') return '{invalid'; if (path === 'button.json') throw 'missing spec'; throw new Error('missing code'); });
    const result = await doctorRegistryRef('fixture', root); expect(result.status).toBe('failed'); expect(result.errors).toHaveLength(3); expect(result.errors).toContain('missing spec');
    await run(['doctor', 'fixture', '--json']); expect(JSON.parse(logs.at(-1)!)).toMatchObject({ status: 'failed' }); expect(process.exitCode).toBe(1);
    await run(['doctor', 'fixture']); expect(logs.join('\n')).toContain('x tokens');
  });
  it('marks remote metadata and absent token references skipped', async () => {
    resolved.baseUrl = 'https://example.test'; resolved.registry.tokens = undefined; resolved.registry.components = [{ name: 'Button', href: 'button.json' }];
    expect((await doctorRegistryRef('fixture', root)).checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'tokens', status: 'skipped' }), expect.objectContaining({ name: 'package.json', status: 'skipped' })]));
    resolved.registry.tokens = { href: 'tokens.css' }; fx.read.mockResolvedValue(':root {}'); resolved.registry.components = []; expect((await doctorRegistryRef('fixture', root)).status).toBe('passed');
  });
  it('uses local, packaged and npm alias fallbacks while validating install commands', async () => {
    fx.alias.mockResolvedValue(entry); await mkdir(join(root, 'registry')); await doctorRegistryRef('sample', root); expect(fx.resolve.mock.calls.at(-1)![0]).toBe(join(root, 'registry'));
    await rm(join(root, 'registry'), { recursive: true }); await mkdir(join(fx.packageRoot, 'registry'), { recursive: true }); await doctorRegistryRef('sample', root); expect(fx.resolve.mock.calls.at(-1)![0]).toBe(join(fx.packageRoot, 'registry'));
    await rm(fx.packageRoot, { recursive: true }); await doctorRegistryRef('sample', root); expect(fx.resolve.mock.calls.at(-1)![0]).toBe('@fixture/sample');
    entry.installCommand = 'memi add Missing --from @fixture/sample'; expect((await doctorRegistryRef('sample', root)).errors.join(' ')).toContain('not viable');
    entry.installCommand = 'invalid'; expect((await doctorRegistryRef('sample', root)).status).toBe('failed');
  });
  it.each([new Error('unavailable'), 'unavailable'])('turns resolver errors into an explicit failed check', async error => {
    fx.alias.mockRejectedValueOnce(new Error('catalog unavailable')); fx.resolve.mockRejectedValueOnce(error); const result = await doctorRegistryRef('fixture', root); expect(result).toMatchObject({ status: 'failed', errors: ['unavailable'], checks: [{ name: 'resolve', status: 'failed', message: 'unavailable' }] });
  });
});
