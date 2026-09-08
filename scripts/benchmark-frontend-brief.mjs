#!/usr/bin/env node
/** Synthetic local-context benchmark. No connector, model, installation or dollar-cost measurement. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { cleanHarnessEnvironment } from './lib/trust-core-e2e.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = input => createHash('sha256').update(input).digest('hex');
const CONTEXT_LIMIT = 16384;
const TIME_LIMIT_MS = 5000;
const FIXTURE_VERSION = 'memi.frontend-benchmark-fixture.v1';

export async function createBenchmarkFixture(root) {
  await mkdir(join(root, 'src'), { recursive: true });
  const componentFiles = Array.from({ length: 479 }, (_, index) => {
    const name = `Button${String(index).padStart(3, '0')}`;
    return { path: `src/${name}.tsx`, content: `export interface ${name}Props { label: string; variant?: 'primary' | 'quiet'; disabled?: boolean; }\nexport function ${name}(props: ${name}Props) { return <button disabled={props.disabled} className="custom-button">{props.label}</button>; }\n` };
  });
  const stories = Array.from({ length: 20 }, (_, index) => {
    const name = `Button${String(index).padStart(3, '0')}`;
    return { path: `src/${name}.stories.tsx`, content: `import { ${name} } from './${name}';\nexport default { title: 'Controls/${name}', component: ${name} };\nexport const Primary = { args: { label: 'Save', variant: 'primary' } };\n` };
  });
  const colors = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`action${String(index).padStart(3, '0')}`, { $type: 'color', $value: `#${index.toString(16).padStart(6, '0')}` }]));
  const tokenFile = { path: 'src/tokens.json', content: JSON.stringify({ colors }) };
  const files = [...componentFiles, ...stories, tokenFile].sort((a, b) => a.path < b.path ? -1 : 1);
  for (const file of files) await writeFile(join(root, file.path), file.content);
  const evidence = { source: 'figma', documentId: 'synthetic-settings-v1', nodeId: 'button-000', revision: 'fixture-v1', mappings: [{ path: 'src/Button000.tsx', exportName: 'Button000', sourceHash: sha256(componentFiles[0].content), props: { label: 'Save', variant: 'primary' }, tokens: ['colors/action000'] }] };
  return {
    version: FIXTURE_VERSION,
    files: files.map(file => ({ path: file.path, bytes: Buffer.byteLength(file.content), sha256: sha256(file.content) })),
    fingerprint: sha256(files.map(file => `${file.path}:${sha256(file.content)}`).join('\n')),
    evidence,
    rawEligibleSourceBytes: files.reduce((total, file) => total + Buffer.byteLength(file.content), 0),
    selectedMappedInputBytes: [componentFiles[0].content, stories[0].content, tokenFile.content, JSON.stringify(evidence)].reduce((total, content) => total + Buffer.byteLength(content), 0),
    evidenceBytes: Buffer.byteLength(JSON.stringify(evidence)),
  };
}

export async function verifyFixtureIntegrity(root, fixture) {
  try {
    if (JSON.stringify(await readdir(root)) !== '["src"]') return false;
    const sourceDirectory = join(root, 'src');
    const directoryStat = await lstat(sourceDirectory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return false;
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    if (entries.length !== fixture.files.length || entries.some(entry => !entry.isFile())) return false;
    const expected = new Map(fixture.files.map(file => [file.path.slice(4), file]));
    for (const entry of entries) {
      const file = expected.get(entry.name);
      if (!file) return false;
      const path = join(sourceDirectory, entry.name);
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== file.bytes) return false;
      if (sha256(await readFile(path)) !== file.sha256) return false;
    }
    return true;
  } catch { return false; }
}

export function validateBriefResult(text, expectedStatus) {
  assert(Buffer.byteLength(text) <= CONTEXT_LIMIT, 'Brief exceeds 16 KiB.');
  const brief = JSON.parse(text);
  assert.equal(brief.schemaVersion, 'memi.frontend-brief.v1');
  assert.equal(brief.scan.filesRead, 500, 'Fixture discovery must read all 500 eligible source files.');
  assert.equal(brief.scan.complete, true, 'Fixture discovery must be complete.');
  assert.equal(brief.verification.status, 'unassessed', 'Static evidence cannot claim a rendered pass.');
  assert.equal(brief.mappings.length, 1);
  assert.equal(brief.mappings[0].status, expectedStatus);
  if (expectedStatus === 'observed') {
    assert.equal(brief.mappings[0].exportName, 'Button000');
    assert.equal(brief.mappings[0].mustReuse, true);
    assert(brief.mappings[0].storyRefs.includes('src/Button000.stories.tsx#Primary'));
  }
  if (expectedStatus === 'conflict') assert.equal(brief.mappings[0].mustReuse, false);
  return brief;
}

export function summarizeTrials(trials, fixture) {
  assert(trials.length > 0, 'At least one trial is required.');
  const durations = trials.map(trial => trial.durationMs).sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const medianMs = durations.length % 2 ? durations[mid] : (durations[mid - 1] + durations[mid]) / 2;
  const failures = trials.filter(trial => trial.status !== 'passed').length;
  const successfulBytes = trials.filter(trial => trial.status === 'passed').map(trial => trial.payloadBytes);
  return {
    trials: trials.length, failures, medianMs, p95Ms: durations[Math.ceil(durations.length * 0.95) - 1], maxMs: durations.at(-1),
    thresholds: { medianMs: TIME_LIMIT_MS, payloadBytes: CONTEXT_LIMIT },
    passed: failures === 0 && medianMs <= TIME_LIMIT_MS && successfulBytes.every(bytes => bytes <= CONTEXT_LIMIT),
    bytes: { rawEligibleSourceBytes: fixture.rawEligibleSourceBytes, selectedMappedInputBytes: fixture.selectedMappedInputBytes, successfulBriefBytes: successfulBytes },
    modelCost: { status: 'unassessed', reason: 'No model or paid connector is invoked. Source-byte differences do not establish complete-task token or dollar savings.' },
    cpuAndMemory: { status: 'unassessed', reason: 'Portable child-process resource usage is not collected by this stdio harness.' },
  };
}

async function coldTrial(entry, projectRoot, homeRoot, evidence, expectedStatus) {
  const client = new Client({ name: 'memi-frontend-benchmark', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry, 'mcp', 'start', '--no-figma'], cwd: projectRoot,
    env: { ...cleanHarnessEnvironment(process.env), HOME: homeRoot, USERPROFILE: homeRoot, MEMOIRE_STUDIO_PROJECT_ROOT: projectRoot, MEMOIRE_LOG_LEVEL: 'error', NODE_ENV: 'production' }, stderr: 'pipe' });
  let stderrBytes = 0;
  transport.stderr?.on('data', chunk => { stderrBytes += Buffer.byteLength(chunk); });
  const started = performance.now();
  let timer;
  let stage = 'initialize';
  const protocolErrors = [];
  client.onerror = () => protocolErrors.push('protocol-error');
  try {
    const work = async () => {
      await client.connect(transport);
      stage = 'list-tools';
      const names = (await client.listTools()).tools.map(tool => tool.name);
      assert(names.includes('prepare_frontend_brief'));
      stage = 'first-brief';
      const result = await client.callTool({ name: 'prepare_frontend_brief', arguments: { intent: 'Reuse Button000 for a settings Save action', maxBytes: CONTEXT_LIMIT, designEvidence: evidence } });
      assert(!result.isError, 'Frontend tool reported an error.');
      const text = result.content?.find(item => item.type === 'text')?.text;
      assert.equal(typeof text, 'string');
      stage = 'validate';
      validateBriefResult(text, expectedStatus);
      assert.equal(protocolErrors.length, 0, 'Protocol errors occurred.');
      return { status: 'passed', durationMs: performance.now() - started, payloadBytes: Buffer.byteLength(text), payloadSha256: sha256(text), stderrBytes };
    };
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); })]);
  } catch (error) {
    return { status: 'failed', durationMs: performance.now() - started, payloadBytes: 0, stderrBytes, stage, reason: error?.message === 'timeout' ? 'timeout' : 'protocol-or-contract-failure' };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

export async function runFrontendBenchmark({ entry = join(repositoryRoot, 'dist/bin.js'), runs = 10 } = {}) {
  assert(Number.isInteger(runs) && runs >= 1 && runs <= 30, 'runs must be an integer between 1 and 30.');
  entry = resolve(entry);
  const entryBytes = await readFile(entry);
  const runtimeBytes = await readFile(join(dirname(entry), 'index.js')).catch(() => null);
  const scratch = await mkdtemp(join(tmpdir(), 'memi-frontend-benchmark-'));
  const projectRoot = join(scratch, 'project'); const homeRoot = join(scratch, 'home');
  try {
    await mkdir(homeRoot);
    const fixture = await createBenchmarkFixture(projectRoot);
    const trials = [];
    for (let index = 0; index < runs; index++) trials.push({ trial: index + 1, ...await coldTrial(entry, projectRoot, homeRoot, fixture.evidence, 'observed') });
    const staleEvidence = { ...fixture.evidence, source: 'paper', mappings: [{ ...fixture.evidence.mappings[0], sourceHash: '0'.repeat(64) }] };
    const missingEvidence = { ...fixture.evidence, mappings: [{ ...fixture.evidence.mappings[0], exportName: 'RenamedButton' }] };
    const negativeCases = [
      { name: 'stale-mapping', ...await coldTrial(entry, projectRoot, homeRoot, staleEvidence, 'stale') },
      { name: 'missing-export', ...await coldTrial(entry, projectRoot, homeRoot, missingEvidence, 'conflict') },
    ];
    const homeUnchanged = (await readdir(homeRoot)).length === 0;
    const projectUnchanged = await verifyFixtureIntegrity(projectRoot, fixture);
    const summary = summarizeTrials(trials, fixture);
    return {
      schemaVersion: 'memi.frontend-benchmark.v1', generatedAt: new Date().toISOString(),
      environment: { platform: platform(), architecture: arch(), node: process.version, linuxArm64Process: platform() === 'linux' && arch() === 'arm64', runnerArchitecture: process.env.RUNNER_ARCH ?? null, nativeLinuxArm64: platform() === 'linux' && arch() === 'arm64' && process.env.RUNNER_ARCH === 'ARM64' },
      artifact: { entryName: entry.split(/[\\/]/).at(-1), entrySha256: sha256(entryBytes), adjacentRuntimeSha256: runtimeBytes ? sha256(runtimeBytes) : null, qualification: 'Launcher and adjacent runtime digests; attach published package/source provenance separately.' },
      method: 'Fresh stdio server process per trial; initialize, list tools and first useful brief. No warmups. Filesystem caches are not flushed. Negative checks use separate fresh processes.',
      fixture: { version: fixture.version, fingerprint: fixture.fingerprint, eligibleFiles: fixture.files.length, componentFiles: 479, storyFiles: 20, tokenDefinitions: 100, evidenceBytes: fixture.evidenceBytes },
      trials, negativeCases, summary, homeUnchanged, projectUnchanged,
      passed: summary.passed && negativeCases.every(result => result.status === 'passed') && homeUnchanged && projectUnchanged,
      qualification: 'Synthetic offline local-context observation. Native eligibility additionally requires CI-reported ARM64 host architecture; architecture alone cannot exclude emulation. This does not establish live connector support, rendered correctness, complete-task savings, or the native release gate on a different environment.',
    };
  } finally { await rm(scratch, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const known = new Set(['--cli', '--runs', '--require-native-linux-arm64']);
    for (let index = 0; index < args.length; index++) {
      assert(known.has(args[index]), 'Unknown benchmark option.');
      if (args[index] !== '--require-native-linux-arm64') { assert(args[index + 1], 'Option value missing.'); index++; }
    }
    const value = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
    const result = await runFrontendBenchmark({ entry: value('--cli'), runs: value('--runs') ? Number(value('--runs')) : 10 });
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed || (args.includes('--require-native-linux-arm64') && !result.environment.nativeLinuxArm64)) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Frontend benchmark failed.');
    process.exitCode = 1;
  }
}
