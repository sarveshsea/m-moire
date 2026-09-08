#!/usr/bin/env node
// Diagnostic only: the following standalone smoke remains the release gate.
import assert from 'node:assert/strict';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cleanHarnessEnvironment } from './lib/trust-core-e2e.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.platform, 'win32', 'This probe captures native Windows Bun behavior');
const output = join(root, '.dist', 'compiled-module-url-probe');
await mkdir(output, { recursive: true });
const source = join(output, 'probe.ts');
const executable = join(output, 'probe.exe');
await copyFile(join(root, 'package.json'), join(output, 'package.json'));
await writeFile(source, `
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {packageRoot, isCompiledModuleUrl} from ${JSON.stringify(join(root, 'src/utils/asset-path.ts'))};
import {getMemoirePackageVersion} from ${JSON.stringify(join(root, 'src/utils/package-version.ts'))};
let resolvedRoot = null;
let resolutionError = null;
try { resolvedRoot = packageRoot(); } catch (error) { resolutionError = error instanceof Error ? error.message : String(error); }
console.log(JSON.stringify({
  moduleUrl: import.meta.url,
  recognizedCompiledUrl: isCompiledModuleUrl(import.meta.url),
  executable: process.execPath,
  resolvedRoot,
  resolutionError,
  executableSidecarExists: existsSync(join(dirname(process.execPath), 'package.json')),
  resolvedSidecarExists: resolvedRoot ? existsSync(join(resolvedRoot, 'package.json')) : false,
  version: getMemoirePackageVersion(),
}, null, 2));
`);
const compilation = spawnSync('bun', ['build', '--compile', '--target=bun-windows-x64', '--minify', `--outfile=${executable}`, source], {cwd:root, stdio:'inherit'});
assert.equal(compilation.status, 0, 'Diagnostic compilation failed');
const home = join(output, 'home');
const project = join(output, 'project');
await Promise.all([mkdir(home, { recursive: true }), mkdir(project, { recursive: true })]);
const runs = [
  ['inherited', process.env],
  ['clean', { ...cleanHarnessEnvironment(process.env), HOME: home, USERPROFILE: home, PATH: '' }],
];
const results = [];
for (const [label, env] of runs) {
  const result = spawnSync(executable, [], {cwd:project, env, encoding:'utf8', timeout:30000, maxBuffer:1024*1024});
  await writeFile(join(output, `${label}.stdout.json`), result.stdout ?? '');
  await writeFile(join(output, `${label}.stderr.txt`), result.stderr ?? '');
  console.log(JSON.stringify({ diagnosticRun: label }));
  console.log(result.stdout ?? '');
  if (result.stderr) console.error(result.stderr);
  results.push({label, status:result.status, error:result.error?.message ?? result.signal ?? null});
}
for (const result of results) assert.equal(result.status, 0, `Diagnostic ${result.label} process failed: ${result.error}`);
// Do not assert version here: the unchanged full standalone smoke does that next.
