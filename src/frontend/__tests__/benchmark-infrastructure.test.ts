import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Release scripts are JavaScript modules.
import { createBenchmarkFixture, summarizeTrials, validateBriefResult } from '../../../scripts/benchmark-frontend-brief.mjs';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe('offline frontend benchmark contract', () => {
 it('freezes exactly500 eligible sourcefiles including20stories and100tokens', async () => {
  const root = await mkdtemp(join(tmpdir(), 'memi-bench-contract-')); roots.push(root);
  const first = await createBenchmarkFixture(join(root, 'first'));
  const second = await createBenchmarkFixture(join(root, 'second'));
  expect(first.fingerprint).toBe(second.fingerprint);
  expect(first.files).toHaveLength(500);
  expect(first.files.filter((file: { path: string }) => file.path.includes('.stories.'))).toHaveLength(20);
  expect(Object.keys(JSON.parse(await readFile(join(root, 'first/src/tokens.json'), 'utf8')).colors)).toHaveLength(100);
  expect(first.rawEligibleSourceBytes).toBeGreaterThan(first.selectedMappedInputBytes);
  expect(await readdir(join(root, 'first'))).toEqual(['src']);
 });
 it('retains failures and compares byte observations without inventing model cost savings', () => {
  const result = summarizeTrials([{ durationMs: 100, payloadBytes: 2048, status: 'passed' }, { durationMs: 9000, payloadBytes: 0, status: 'failed', reason: 'timeout' }], { rawEligibleSourceBytes: 20000, selectedMappedInputBytes: 1000 });
  expect(result.failures).toBe(1);
  expect(result.passed).toBe(false);
  expect(result.maxMs).toBe(9000);
  expect(result.modelCost.status).toBe('unassessed');
  expect(result.bytes.selectedMappedInputBytes).toBe(1000);
 });
 it('validates actual mapping outcomes and refuses claimed rendered passes or oversized payloads', () => {
  const body = { schemaVersion: 'memi.frontend-brief.v1', scan: { filesRead: 500, complete: true }, mappings: [{ exportName: 'Button000', status: 'observed', mustReuse: true, storyRefs: ['src/Button000.stories.tsx#Primary'] }], verification: { status: 'unassessed' } };
  expect(() => validateBriefResult(JSON.stringify(body), 'observed')).not.toThrow();
  expect(() => validateBriefResult(JSON.stringify({ ...body, verification: { status: 'passed' } }), 'observed')).toThrow();
  expect(() => validateBriefResult(JSON.stringify(body), 'stale')).toThrow();
  expect(() => validateBriefResult('x'.repeat(16385), 'observed')).toThrow();
 });
});
