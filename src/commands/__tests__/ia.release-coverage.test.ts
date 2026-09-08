import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerIACommand } from '../ia.js';
import { IASpecSchema } from '../../specs/types.js';
vi.mock('../_deprecated.js', () => ({ warnDeprecated: vi.fn() }));
let logs: string[];
const originalExit = process.exitCode;
beforeEach(() => {
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('CLI_EXIT'); });
  process.exitCode = 0;
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = originalExit; });
function spec() {
  return IASpecSchema.parse({ name: 'SiteMap', type: 'ia', purpose: 'Navigate a product', root: { id: 'root', label: 'Root', type: 'page', children: [] } });
}
function harness(entries = [spec()]) {
  const engine = { init: vi.fn(), registry: { getAllSpecs: vi.fn().mockResolvedValue(entries), saveSpec: vi.fn(), getSpec: vi.fn().mockResolvedValue(null) }, figma: { isConnected: true, extractIA: vi.fn().mockResolvedValue(spec()) } };
  async function run(args: string[]) {
    const program = new Command().exitOverride(); registerIACommand(program, engine as never);
    await program.parseAsync(['ia', ...args], { from: 'user' });
    return { text: logs.join('\n'), payload: () => JSON.parse(logs.at(-1)!) };
  }
  return { engine, run };
}
describe('IA command boundaries', () => {
  it.each(['', '../escape', '2SiteMap', 'bad name'])('rejects invalid spec identifier %j before engine initialization', async name => {
    const h = harness(); await expect(h.run(['create', name])).rejects.toThrow('CLI_EXIT');
    expect(h.engine.init).not.toHaveBeenCalled(); expect(h.engine.registry.saveSpec).not.toHaveBeenCalled();
  });
  it.each(['0', '11', 'not-a-number'])('rejects out-of-range extraction depth %s before bridge execution', async depth => {
    const h = harness(); await expect(h.run(['extract', 'SiteMap', '--depth', depth])).rejects.toThrow('CLI_EXIT');
    expect(h.engine.figma.extractIA).not.toHaveBeenCalled(); expect(h.engine.registry.saveSpec).not.toHaveBeenCalled();
  });
  it('requires a connected bridge before extraction', async () => {
    const h = harness(); h.engine.figma.isConnected = false;
    await expect(h.run(['extract', 'SiteMap'])).rejects.toThrow('CLI_EXIT');
    expect(h.engine.figma.extractIA).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('Not connected to Figma');
  });
  it('rejects malformed bridge output before writing a spec', async () => {
    const h = harness(); h.engine.figma.extractIA.mockResolvedValue({ ...spec(), purpose: 42 });
    await expect(h.run(['extract', 'SiteMap'])).rejects.toThrow('CLI_EXIT');
    expect(h.engine.registry.saveSpec).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('validation failed');
  });
  it.each([1, 10])('persists validated extraction at supported depth %s', async depth => {
    const h = harness(); await h.run(['extract', 'SiteMap', '--depth', String(depth)]);
    expect(h.engine.figma.extractIA).toHaveBeenCalledWith('SiteMap', depth);
    expect(IASpecSchema.safeParse(h.engine.registry.saveSpec.mock.calls[0][0]).success).toBe(true);
  });
  it.each([undefined, 'Describe account navigation'])('creates schema-valid IA with purpose %s', async purpose => {
    const h = harness(); await h.run(['create', 'NewMap', ...(purpose ? ['--purpose', purpose] : [])]);
    const saved = h.engine.registry.saveSpec.mock.calls[0][0];
    expect(saved).toMatchObject({ name: 'NewMap', purpose: purpose ?? 'NewMap information architecture', flows: [], root: { children: [] } });
    expect(IASpecSchema.safeParse(saved).success).toBe(true);
  });
  it.each(['show', 'list', 'validate'])('reports empty %s human state', async action => {
    expect((await harness([]).run([action])).text).toContain('No IA specs');
  });
  it('reports requested missing human tree as a failing CLI action', async () => {
    await expect(harness().run(['show', 'Absent'])).rejects.toThrow('CLI_EXIT');
    expect(logs.join('\n')).toContain('Absent');
  });
  it('renders recursive tree labels, links and conditional navigation', async () => {
    const value = { ...spec(), sourceFileKey: 'file-key', entryPoints: ['root'], root: { ...spec().root, children: [{ id: 'settings', label: 'Settings', type: 'page', linkedPageSpec: 'SettingsPage', notes: 'Authenticated', children: [{ id: 'profile', label: 'Profile', type: 'section', children: [] }] }, { id: 'help', label: 'Help', type: 'page', children: [] }] }, flows: [{ from: 'root', to: 'settings', trigger: 'click', label: 'Open', condition: 'signed in' }, { from: 'root', to: 'help', trigger: 'click' }], globals: [{ id: 'global', type: 'global-nav', label: 'Navigation', linkedPageSpec: 'NavPage', children: [] }, { id: 'footer', type: 'global-nav', label: 'Footer', children: [] }] };
    const result = await harness([value as never]).run(['show']);
    expect(result.text).toContain('4 nodes');
    expect(result.text).toContain('Settings → SettingsPage (Authenticated)');
    expect(result.text).toContain('root → settings "Open" (click) [signed in]');
    expect(result.text).toContain('Navigation → NavPage');
    expect(result.text).toContain('Profile');
  });
  it('renders a simple tree without source, entrypoints or flow metadata', async () => {
    const result = await harness().run(['show']);
    expect(result.text).toContain('Entry points: none');
    expect(result.text).not.toContain('Navigation Flows:');
  });
  it('reports cross-reference warnings for a linked page that does not exist', async () => {
    const value = { ...spec(), root: { ...spec().root, linkedPageSpec: 'MissingPage' } };
    expect((await harness([value]).run(['validate'])).text).toContain('MissingPage');
  });
  it('reports invalid schema entries without losing their errors in JSON', async () => {
    const value = { ...spec(), purpose: 42 };
    const result = await harness([value as never]).run(['validate', '--json']);
    expect(result.payload()).toMatchObject({ summary: { checked: 1, invalid: 1, valid: 0 }, specs: [{ valid: false, errors: [{ path: 'purpose', message: expect.any(String) }] }] });
  });
  it('renders invalid schema errors for human validation', async () => {
    expect((await harness([{ ...spec(), purpose: 42 } as never]).run(['validate'])).text).toContain('INVALID');
  });
  it('keeps inventory counts independent of linked page resolution', async () => {
    expect((await harness().run(['list'])).text).toContain('SiteMap');
  });
});
