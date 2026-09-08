import { Command } from 'commander';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { registerThemeCommand } from '../theme.js';
const fx = vi.hoisted(() => ({ get: vi.fn(), imported: vi.fn(), apply: vi.fn(), preview: vi.fn(), variants: vi.fn(), save: vi.fn(), diff: vi.fn(), publish: vi.fn(), artifacts: vi.fn(), spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawnSync: fx.spawn }));
vi.mock('../../registry/publisher.js', () => ({ publishRegistry: fx.publish }));
vi.mock('../../themes/workflow.js', () => ({ getTheme: fx.get, importThemeFromSource: fx.imported, applyThemeToProject: fx.apply, writeThemePreview: fx.preview, createThemeVariants: fx.variants, saveTheme: fx.save, diffThemes: fx.diff, writeThemePackageArtifacts: fx.artifacts, slugifyThemeName: (name: string) => name.toLowerCase().replaceAll(' ', '-') }));
let root: string, engine: any, theme: any, logs: string[];
async function run(...args: string[]) { const p = new Command(); registerThemeCommand(p, engine); await p.parseAsync(['theme', ...args], { from: 'user' }); }
function json() { return JSON.parse(logs.at(-1)!); }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-theme-coverage-')); logs = []; vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  theme = { name: 'Acme', slug: 'acme', tokens: [{ name: 'primary' }], importedAt: 'today', source: { kind: 'css' }, hasDarkMode: true, summary: {}, validation: { status: 'pass', summary: { errors: 0, warnings: 0 }, issues: [] } };
  engine = { config: { projectRoot: root }, init: vi.fn(), registry: { designSystem: { components: [], styles: [] }, updateDesignSystem: vi.fn(), getAllSpecs: vi.fn().mockResolvedValue([{ name: 'Button', type: 'component' }, { name: 'Home', type: 'page' }]) } };
  fx.get.mockImplementation(async () => theme); fx.imported.mockImplementation(async () => ({ theme, filePath: join(root, 'acme.json') }));
  fx.apply.mockImplementation(async opts => ({ outDir: opts.outputDir, filesWritten: ['theme.css'], designSystem: { tokens: theme.tokens } }));
  fx.preview.mockImplementation(async (_theme, outFile) => ({ outFile })); fx.save.mockResolvedValue(join(root, 'variant.json'));
  fx.variants.mockImplementation((_theme, recipes) => recipes.map((name: string) => ({ ...theme, name, lineage: { parent: 'acme' } })));
  fx.diff.mockReturnValue({ from: theme, to: { name: 'Next' }, highlights: [], tokens: { added: [], removed: [], changed: [] }, contrastRegressions: [] });
  fx.publish.mockImplementation(async opts => ({ outDir: opts.outDir, filesWritten: ['package.json'] }));
  fx.artifacts.mockResolvedValue({ themePath: 'theme.css', previewPath: 'preview.html' }); fx.spawn.mockReturnValue({ status: 0 });
});
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
describe('theme handler results and guarded side effects', () => {
  it.each([false, true])('imports with optional apply and serializes json=%s', async asJson => {
    await run('import', 'source.css', ...(asJson ? ['--json'] : []));
    expect(engine.registry.updateDesignSystem).not.toHaveBeenCalled();
    if (asJson) expect(json()).toMatchObject({ status: 'imported', apply: null, theme: { tokens: 1, lineage: null } });
    theme.hasDarkMode = false;
    await run('import', 'source.css', '--apply', '--mode', 'replace', '--output', root, ...(asJson ? ['--json'] : []));
    expect(engine.registry.updateDesignSystem).toHaveBeenCalledWith({ tokens: theme.tokens });
    if (asJson) expect(json().apply).toMatchObject({ mode: 'replace', registryUpdated: true, outDir: root });
    else expect(logs.join('\n')).toContain('Applied');
  });
  it.each([false, true])('previews and reports validation json=%s', async asJson => {
    const flags = asJson ? ['--json'] : [];
    await run('preview', ...flags); expect(fx.preview).toHaveBeenLastCalledWith(theme, join(root, 'preview/generated/theme-acme.html'));
    await run('preview', 'Acme', '--output', join(root, 'custom.html'), ...flags);
    if (asJson) expect(json().status).toBe('preview-built');
    await run('validate', ...flags); expect(process.exitCode ?? 0).toBe(0);
    theme.validation = { status: 'fail', summary: { errors: 1, warnings: 1 }, issues: [{ severity: 'error', message: 'Bad contrast' }, { severity: 'warning', message: 'Missing dark mode' }] };
    await run('validate', ...flags); expect(process.exitCode).toBe(1);
    if (asJson) expect(json().validation.issues).toHaveLength(2); else expect(logs.join('\n')).toContain('Bad contrast');
  });
  it.each([false, true])('applies merge defaults and optional registry updates json=%s', async asJson => {
    const flags = asJson ? ['--json'] : [];
    await run('apply', ...flags); expect(engine.registry.updateDesignSystem).toHaveBeenCalledOnce();
    await run('apply', '--no-registry', '--mode', 'replace', '--output', root, ...flags);
    expect(engine.registry.updateDesignSystem).toHaveBeenCalledOnce();
    if (asJson) expect(json()).toMatchObject({ status: 'applied', registryUpdated: false, mode: 'replace' });
    else expect(logs.join('\n')).toContain('skipped');
    await run('apply', '--mode', 'invalid', ...flags); expect(process.exitCode).toBe(1);
  });
  it('deduplicates recipes, preserves variant lineage and rejects invalid recipes', async () => {
    await run('variants', '--json'); expect(json().variants).toHaveLength(4);
    await run('variants', '--recipe', 'DARK', 'dark', 'warm'); expect(fx.variants).toHaveBeenLastCalledWith(theme, ['dark', 'warm']);
    for (const recipes of [['invalid'], ['bad', 'worse']]) {
      await run('variants', '--json', '--recipe', ...recipes); expect(json().status).toBe('failed');
    }
  });
  it('renders semantic diffs for unchanged, singular and plural changes', async () => {
    await run('diff', 'before', 'after', '--json'); expect(json()).toMatchObject({ status: 'diffed', diff: { highlights: [] } });
    await run('diff', 'before', 'after');
    for (const count of [1, 2]) {
      fx.diff.mockReturnValue({ from: theme, to: { name: 'Next' }, highlights: ['Token updates'], tokens: { added: Array(count).fill('new'), removed: Array(count).fill('old'), changed: Array(count).fill('primary') }, contrastRegressions: Array(count).fill({ pair: 'primary/background', mode: 'light', from: 7, to: 2 }) });
      await run('diff', 'before', 'after');
    }
    expect(logs.join('\n')).toContain('2 contrast regressions'); expect(logs.join('\n')).toContain('primary/background');
  });
  it.each([false, true])('builds package artifacts before an explicit push json=%s', async asJson => {
    const flags = asJson ? ['--json'] : [];
    await run('publish', '--package', '@acme/theme', ...flags);
    expect(fx.spawn).not.toHaveBeenCalled(); expect(fx.publish).toHaveBeenLastCalledWith(expect.objectContaining({ outDir: join(root, 'theme'), specsOnly: true, specs: [], frameworks: ['react'] }));
    await run('publish', 'Acme', '--package', '@acme/theme', '--dir', root, '--description', 'Theme', '--with-components', '--framework', 'vue', '--push', ...flags);
    expect(fx.publish).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Theme', specsOnly: false, specs: [{ name: 'Button', type: 'component' }], frameworks: ['vue'] }));
    expect(fx.spawn).toHaveBeenCalledWith('npm', ['publish', '--access', 'public'], expect.objectContaining({ cwd: root }));
    if (asJson) expect(json()).toMatchObject({ status: 'published', pushed: true });
    else expect(logs.join('\n')).toContain('Published');
    fx.spawn.mockReturnValueOnce({ status: null }); await run('publish', '--package', 'theme', '--push', ...flags);
    expect(process.exitCode).toBe(1); if (asJson) expect(json().error).toContain('exited 1');
  });
  it.each(['preview', 'validate', 'apply', 'variants', 'publish'])('returns a structured missing-theme failure for %s', async command => {
    fx.get.mockResolvedValueOnce(null); await run(command, '--json', ...(command === 'publish' ? ['--package', 'theme'] : []));
    expect(json()).toMatchObject({ status: 'failed', error: expect.stringContaining('No imported themes') });
    fx.get.mockResolvedValueOnce(null); await run(command, 'Missing', ...(command === 'publish' ? ['--package', 'theme'] : []));
    expect(logs.join('\n')).toContain('not found'); expect(fx.spawn).not.toHaveBeenCalled();
  });
  it('surfaces import and diff service errors without fabricating success', async () => {
    fx.imported.mockRejectedValueOnce('invalid CSS'); await run('import', 'broken.css', '--json'); expect(json()).toEqual({ status: 'failed', error: 'invalid CSS' });
    fx.diff.mockImplementationOnce(() => { throw new Error('diff failed'); }); await run('diff', 'a', 'b'); expect(logs.join('\n')).toContain('diff failed');
  });
});
