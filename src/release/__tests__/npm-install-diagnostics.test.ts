// @ts-nocheck
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import * as harness from '../../../scripts/lib/trust-core-e2e.mjs';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });
async function npmFixture(body: string) {
  const root = await mkdtemp(join(tmpdir(), 'npm-progress-fixture-')); roots.push(root);
  const entry = join(root, 'npm.mjs'); await writeFile(entry, body); return { root, entry };
}
const secretLines = [
  'npm timing idealTree Completed in 24ms',
  'npm timing reifyNode:node_modules/private-package Completed in 12ms',
  'npm http fetch GET 200 https://user:token-canary@registry.invalid/private-package 14ms (cache hit)',
  'npm http fetch GET 503 https://registry.invalid/private-package 30ms (cache miss)',
  'npm error code ENOTFOUND',
  'npm error code PRIVATE_SECRET',
  'npm error private-config-canary /Users/private-source-canary',
].join('\n') + '\n';
function assertSafe(error: Error) {
  for (const canary of ['token-canary', 'private-package', 'private-config-canary', 'private-source-canary', 'https://', '/Users/', 'PRIVATE_SECRET']) expect(error.message).not.toContain(canary);
  expect(error.message.length).toBeLessThan(2000);
}
describe('bounded npm install progress diagnostics', () => {
  it('reports allowlisted timing/cache/status metadata for nonzero npm without raw output', async () => {
    const { root, entry } = await npmFixture(`process.stderr.write(${JSON.stringify(secretLines)}); process.exitCode = 1;`);
    const error = await harness.runNpmInstall(process.execPath, [entry], { cwd: root, phase: 'baseline', timeoutMs: 2000 }).catch((e: Error) => e);
    assertSafe(error);
    expect(error.diagnostics).toMatchObject({ phase: 'baseline', outcome: 'exit', exitCode: 1, timingsMs: { idealTree: 24, reifyNode: 12 }, httpStatusCounts: { '200': 1, '503': 1 }, cache: { hit: 1, miss: 1, revalidated: 0 } });
    expect(error.diagnostics.elapsedMs).toBeGreaterThanOrEqual(0);
  });
  it('collects actual npm timing and a safe error code from a failed local install', async () => {
    const { root } = await npmFixture('');
    const npm = harness.resolveNpmInvocation();
    const error = await harness.runNpmInstall(npm.command, [...npm.prefix, 'install', join(root, 'private-package-missing.tgz'), '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: root, phase: 'packed', timeoutMs: 10000, env: harness.cleanHarnessEnvironment(process.env),
    }).catch((e: Error) => e);
    assertSafe(error);
    expect(error.diagnostics.outcome).toBe('exit');
    expect(error.diagnostics.errorCodes).toContain('ENOENT');
    expect(Object.keys(error.diagnostics.timingsMs).length).toBeGreaterThan(0);
    expect(error.diagnostics.lastCompletedPhase).toBeTruthy();
  });
  it('retains parsed progress when the npm process times out', async () => {
    // Emit before timers run: child startup speed must not affect timeout metadata.
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(),
      kill() { queueMicrotask(() => child.emit('close', null, 'SIGKILL')); return true; },
    });
    const error = await harness.runNpmInstall('unused', [], {
      phase: 'candidate', timeoutMs: 10,
      spawnProcess() { queueMicrotask(() => child.stderr.write(secretLines)); return child; },
    }).catch((e: Error) => e);
    assertSafe(error);
    expect(error.diagnostics).toMatchObject({ phase: 'candidate', outcome: 'timeout', timingsMs: { idealTree: 24 }, cache: { hit: 1 } });
  });
  it('terminates and closes the child when a stderr observer throws without exposing its error', async () => {
    const { root, entry } = await npmFixture("process.stderr.write('ready'); setInterval(() => {}, 1000);");
    await expect(harness.runProcess(process.execPath, [entry], { cwd: root, timeoutMs: 2000, onStderr() { throw new Error('private-credential-canary'); } })).rejects.toThrow('subprocess stderr observer failed');
  });
  it('bounds hostile oversized progress lines and rejects untrusted phase identifiers', async () => {
    const { root, entry } = await npmFixture(`process.stderr.write(${JSON.stringify('private-config-canary'.repeat(1000) + '\n' + secretLines)}); process.exitCode = 2;`);
    const error = await harness.runNpmInstall(process.execPath, [entry], { cwd: root, phase: 'packed', timeoutMs: 2000 }).catch((e: Error) => e);
    assertSafe(error); expect(error.diagnostics.droppedLines).toBe(1);
    expect(error.diagnostics.httpStatusCounts).toEqual({ '200': 1, '503': 1 });
    await expect(harness.runNpmInstall(process.execPath, [entry], { phase: 'private-config-canary' })).rejects.toThrow('invalid npm install phase');
  });
});
