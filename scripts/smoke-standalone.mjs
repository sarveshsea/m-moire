#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cleanHarnessEnvironment, runProcess } from "./lib/trust-core-e2e.mjs";

if (process.argv.length !== 3) throw new Error("Usage: smoke-standalone.mjs <binary-stage-directory>");
const stage = resolve(process.argv[2]);
const binary = join(stage, process.platform === "win32" ? "memi.exe" : "memi");
const expectedVersion = JSON.parse(await readFile(join(stage, "package.json"), "utf8")).version;
const fixture = await mkdtemp(join(tmpdir(), "memi-standalone-smoke-"));
const project = join(fixture, "project"), home = join(fixture, "home");
const source = 'export function App(){return <button>Open</button>}\n';

try {
  await Promise.all([mkdir(project), mkdir(home)]);
  await writeFile(join(project, "App.tsx"), source);
  const env = { ...cleanHarnessEnvironment(process.env), HOME: home, USERPROFILE: home, PATH: "" };
  const invoke = (args) => runProcess(binary, args, { cwd: project, env, timeoutMs: 30_000 });
  const version = await invoke(["--version"]);
  assert.equal(version.exitCode, 0, "Standalone version invocation failed");
  assert.equal(version.stdout.trim(), expectedVersion);
  // Prefix placement loads all command modules, including their required sidecars.
  const diagnosis = await invoke(["--profile", "locked", "diagnose", ".", "--json", "--no-write", "--fail-on", "none"]);
  assert.equal(diagnosis.exitCode, 0, "Standalone locked diagnosis failed");
  const report = JSON.parse(diagnosis.stdout);
  assert.equal(report.summary.scannedFiles, 1);
  assert.equal(report.summary.scannedBytes, Buffer.byteLength(source));
  assert.equal(report.summary.components, 1);
  assert.deepEqual(await readdir(project), ["App.tsx"]);
  assert.equal(await readFile(join(project, "App.tsx"), "utf8"), source);
  assert.deepEqual(await readdir(home), []);
  console.log(JSON.stringify({ version: expectedVersion, scannedFiles: 1, scannedBytes: Buffer.byteLength(source), components: 1, projectAndHomeUnchanged: true, profile: "locked" }));
} finally {
  await rm(fixture, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
