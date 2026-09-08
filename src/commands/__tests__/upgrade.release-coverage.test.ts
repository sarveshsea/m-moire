import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { create as createTar } from 'tar';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { registerUpgradeCommand } from '../upgrade.js';
const fx = vi.hoisted(() => ({ root: '', standalone: true, chmodFailure: false, spawn: vi.fn(), fetch: vi.fn() }));
vi.mock('../../utils/runtime.js', () => ({ isStandaloneBinary: () => fx.standalone }));
vi.mock('../../utils/asset-path.js', () => ({ packageRoot: () => fx.root }));
vi.mock('node:child_process', () => ({ spawnSync: fx.spawn }));
vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, chmodSync: (...args: Parameters<typeof fs.chmodSync>) => { if (fx.chmodFailure) throw new Error('chmod denied'); return fs.chmodSync(...args); } };
});
let root: string, bytes: Buffer, logs: string[];
const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')!;
function platform(os: string, arch: string) { Object.defineProperty(process, 'platform', { value: os, configurable: true }); Object.defineProperty(process, 'arch', { value: arch, configurable: true }); }
async function run(...args: string[]) { const p = new Command(); registerUpgradeCommand(p, {} as never); await p.parseAsync(['upgrade', ...args], { from: 'user' }); }
function response(body: string | Buffer, status = 200) { return new Response(body as BodyInit, { status }); }
function checksum() { return `${createHash('sha256').update(bytes).digest('hex')}  memi-linux-x64.tar.gz\n`; }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memi-upgrade-handler-')); fx.root = join(root, 'installed'); fx.standalone = true; fx.chmodFailure = false; logs = [];
  await mkdir(fx.root); await writeFile(join(fx.root, 'memi'), 'old binary');
  await mkdir(join(root, 'memi-linux-x64')); await writeFile(join(root, 'memi-linux-x64/memi'), 'new binary');
  await createTar({ file: join(root, 'release.tar.gz'), gzip: true, cwd: root }, ['memi-linux-x64']); bytes = await readFile(join(root, 'release.tar.gz'));
  platform('linux', 'x64');
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation((...args) => { logs.push(args.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...args) => { logs.push(args.join(' ')); });
  fx.fetch.mockReset().mockImplementation(async (url: string) => response(url.endsWith('.tar.gz') ? bytes : checksum())); vi.stubGlobal('fetch', fx.fetch);
  fx.spawn.mockReset().mockImplementation((_command, args: string[]) => {
    const dest = args.at(-1)!; mkdirSync(join(dest, 'memi-linux-x64'), { recursive: true }); writeFileSync(join(dest, 'memi-linux-x64/memi'), 'new binary'); return { status: 0 };
  });
});
afterEach(async () => { Object.defineProperty(process, 'platform', originalPlatform); Object.defineProperty(process, 'arch', originalArch); vi.restoreAllMocks(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });
describe('upgrade command download and replacement contract', () => {
  it('directs npm installations to npm without downloading or extracting', async () => {
    fx.standalone = false; await run(); expect(logs.join('\n')).toContain('npm i -g'); expect(fx.fetch).not.toHaveBeenCalled(); expect(fx.spawn).not.toHaveBeenCalled();
  });
  it.each([['darwin', 'arm64', 'darwin-arm64.tar.gz'], ['darwin', 'x64', 'darwin-x64.tar.gz'], ['linux', 'x64', 'linux-x64.tar.gz'], ['win32', 'x64', 'win-x64.zip']])('checks %s/%s release availability without replacing files', async (os, arch, asset) => {
    platform(os, arch); fx.fetch.mockResolvedValueOnce(response('', 200)); await run('--check', '--version', 'v2.7.9');
    expect(fx.fetch).toHaveBeenCalledWith(`https://github.com/memi-design/memi/releases/download/v2.7.9/memi-${asset}`, { method: 'HEAD', redirect: 'follow' });
    expect(logs.join('\n')).toContain('Available'); expect(fx.spawn).not.toHaveBeenCalled(); expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('old binary');
  });
  it('reports missing releases and unsupported architectures explicitly', async () => {
    fx.fetch.mockResolvedValueOnce(response('', 404)); await run('--check'); expect(logs.join('\n')).toContain('Not found');
    platform('linux', 'arm64'); vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('exit'); }) as never);
    await expect(run()).rejects.toThrow('exit'); expect(process.exit).toHaveBeenCalledWith(1); expect(logs.join('\n')).toContain('Unsupported platform');
  });
  it('verifies the archive before atomically replacing the install', async () => {
    await run(); expect(logs.join('\n')).toContain('SHA256 verified (SHA256SUMS.txt)');
    expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('new binary'); expect((await readdir(root)).some(name => name.includes('backup'))).toBe(false);
    expect(fx.spawn).toHaveBeenCalledWith('tar', expect.arrayContaining(['-xzf', '-C']), { stdio: 'inherit' });
  });
  it('falls back to the per-archive checksum sidecar', async () => {
    fx.fetch.mockImplementation(async (url: string) => url.endsWith('SHA256SUMS.txt') ? response('', 404) : response(url.endsWith('.tar.gz') ? bytes : checksum()));
    await run(); expect(logs.join('\n')).toContain('verified (memi-linux-x64.tar.gz.sha256)');
  });
  it('rejects absent checksum metadata before extraction', async () => {
    fx.fetch.mockImplementation(async (url: string) => url.endsWith('.tar.gz') ? response(bytes) : response('', 404));
    await expect(run()).rejects.toThrow('SHA256 metadata unavailable'); expect(fx.spawn).not.toHaveBeenCalled();
    expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('old binary');
  });
  it('requires the explicit unverified opt-in for absent metadata', async () => {
    fx.fetch.mockImplementation(async (url: string) => url.endsWith('.tar.gz') ? response(bytes) : response('', 404));
    await run('--allow-unverified'); expect(logs.join('\n')).toContain('continuing because --allow-unverified'); expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('new binary');
  });
  it('warns when opt-in permits a missing archive entry but never permits a mismatch', async () => {
    fx.fetch.mockImplementation(async (url: string) => response(url.endsWith('.tar.gz') ? bytes : 'unrelated archive\n'));
    await run('--allow-unverified'); expect(logs.join('\n')).toContain('No SHA256 for memi-linux-x64');
    fx.fetch.mockImplementation(async (url: string) => response(url.endsWith('.tar.gz') ? bytes : '0'.repeat(64) + '  memi-linux-x64.tar.gz\n'));
    fx.spawn.mockClear(); await expect(run('--allow-unverified')).rejects.toThrow('SHA256 mismatch'); expect(fx.spawn).not.toHaveBeenCalled();
  });
  it.each(['http', 'empty'])('rejects a failed archive download (%s) without mutation', async kind => {
    fx.fetch.mockResolvedValueOnce(kind === 'http' ? response('', 503) : new Response(null));
    await expect(run()).rejects.toThrow(kind === 'http' ? 'download failed' : 'empty response body');
    expect(fx.spawn).not.toHaveBeenCalled(); expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('old binary');
  });
  it('rejects invalid extraction and restores the old install after replacement failure', async () => {
    fx.spawn.mockReturnValueOnce({ status: 1 }); await expect(run()).rejects.toThrow('extract failed');
    expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('old binary');
    fx.spawn.mockReturnValueOnce({ status: 0 }); await expect(run()).rejects.toThrow('extracted root not found');
    fx.chmodFailure = true; await expect(run()).rejects.toThrow('chmod denied');
    expect(await readFile(join(fx.root, 'memi'), 'utf8')).toBe('old binary'); expect((await readdir(root)).some(name => name.includes('backup'))).toBe(false);
  });
  it('does not extract a checksum-valid archive with an unexpected root', async () => {
    await createTar({ file: join(root, 'wrong.tar.gz'), gzip: true, cwd: root }, ['installed']); bytes = await readFile(join(root, 'wrong.tar.gz'));
    await expect(run()).rejects.toThrow('unexpected top-level'); expect(fx.spawn).not.toHaveBeenCalled();
  });
});
