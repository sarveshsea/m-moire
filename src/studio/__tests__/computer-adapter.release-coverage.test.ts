import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioComputerAdapter } from '../computer-adapter.js';
import { defaultStudioConfig } from '../config.js';
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memi-computer-release-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
function harness(platform: NodeJS.Platform = 'darwin') {
  const config = defaultStudioConfig(root);
  const enabled = { ...config, computer: { ...config.computer, enabled: true, requireApproval: true, allowedApps: ['Figma', 'Safari'] } };
  const execFile = vi.fn(async (_file: string, args: string[]) => { await writeFile(args[1], Buffer.from([1, 2, 3])); });
  const adapter = new StudioComputerAdapter({ projectRoot: root, platform, execFile, now: () => new Date('2026-09-01T12:30:00.000Z') });
  return { adapter, config: enabled, execFile };
}
describe('computer adapter approval and platform boundaries', () => {
  it.each(['linux', 'win32'] as const)('reports native execution unavailable on %s without invoking commands', async platform => {
    const h = harness(platform); expect(h.adapter.status(h.config)).toMatchObject({ enabled: true, available: false, platform });
    expect(await h.adapter.action({ action: 'captureScreen', approved: true }, h.config)).toMatchObject({ status: 'unavailable', executed: false });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it('keeps a disabled native adapter unavailable even on macOS', async () => {
    const h = harness(); const config = { ...h.config, computer: { ...h.config.computer, enabled: false } };
    expect(await h.adapter.action({ action: 'openUrl', url: 'https://example.test' }, config)).toMatchObject({ status: 'unavailable', executed: false });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it.each(['captureScreen', 'openApp', 'focusApp'] as const)('requires approval for direct %s', async action => {
    const h = harness();
    expect(await h.adapter.action({ action, app: 'Figma' }, h.config)).toMatchObject({ status: 'approval_required', requiresApproval: true, executed: false });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it.each(['openApp', 'focusApp'] as const)('rejects non-allowlisted app even with %s approval', async action => {
    const h = harness();
    expect(await h.adapter.action({ action, app: 'UnknownApp', approved: true }, h.config)).toMatchObject({ status: 'failed', executed: false, message: expect.stringContaining('not allowlisted') });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it.each(['openApp', 'focusApp'] as const)('reports approved %s as prepared rather than executed', async action => {
    const h = harness();
    expect(await h.adapter.action({ action, value: 'Figma', approved: true }, h.config)).toMatchObject({ status: 'completed', executed: false, message: expect.stringContaining('Figma') });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it.each([['app', 'Figma', 'openApp'], ['file', 'file', 'revealPath'], ['figma', 'https://figma.com/file/test', 'openFigma'], ['browser', 'https://example.test', 'openBrowser'], ['url', 'https://example.test', 'openUrl']] as const)('maps explicit open target %s to a prepared action', async (target, value, action) => {
    const h = harness();
    const result = await h.adapter.open({ target, value: target === 'file' ? join(root, value) : value }, h.config);
    expect(result).toMatchObject({ action, status: 'completed', requiresApproval: false, executed: false });
    expect(h.execFile).not.toHaveBeenCalled();
  });
  it('rejects revealing an unrelated path', async () => {
    const h = harness();
    expect(await h.adapter.action({ action: 'revealPath', path: join(tmpdir(), 'unrelated') }, h.config)).toMatchObject({ status: 'failed', executed: false });
  });
  it.each(['openUrl', 'openBrowser', 'openFigma'] as const)('prepares %s with its explicit value or fallback target', async action => {
    const h = harness();
    expect(await h.adapter.action({ action, value: 'https://example.test' }, h.config)).toMatchObject({ message: expect.stringContaining('https://example.test'), executed: false });
    expect(await h.adapter.action({ action }, h.config)).toMatchObject({ message: expect.stringContaining('target'), executed: false });
  });
  it('writes screenshot bytes only through the injected approved native runner', async () => {
    const h = harness();
    const result = await h.adapter.action({ action: 'captureScreen', approved: true }, h.config);
    expect(result).toMatchObject({ status: 'completed', requiresApproval: true, executed: true });
    expect(h.execFile).toHaveBeenCalledWith('screencapture', ['-x', join(root, '.memoire', 'studio', 'artifacts', 'computer', '2026-09-01T12-30-00-000Z-screen.png')]);
    expect(await readFile(result.artifactPath!)).toEqual(Buffer.from([1, 2, 3]));
  });
  it.each([new Error('permission denied'), 'native runner failed'])('reports native screenshot failure without claiming an artifact %#', async error => {
    const h = harness(); h.execFile.mockRejectedValue(error);
    expect(await h.adapter.action({ action: 'captureScreen', approved: true }, h.config)).toMatchObject({ status: 'failed', executed: true, artifactPath: null, message: expect.stringContaining(error instanceof Error ? error.message : error) });
  });
  it('reports configured unrestricted approval mode accurately', async () => {
    const h = harness(); const config = { ...h.config, computer: { ...h.config.computer, requireApproval: false } };
    expect(h.adapter.status(config)).toMatchObject({ available: true, mode: 'full-access-native', allowedApps: ['Figma', 'Safari'] });
    expect(await h.adapter.action({ action: 'focusApp', app: 'Safari' }, config)).toMatchObject({ status: 'completed', requiresApproval: false, executed: false });
  });
});
