#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// An installed tarball entry can be supplied to exercise the exact consumer bytes.
const entry = resolve(process.argv[2] ?? join(root, "dist", "index.js"));
await access(entry);
const plugin = JSON.parse(await readFile(join(root, "plugins", "memoire", ".mcp.json"), "utf8")).mcpServers.memoire;
assert.equal(plugin.command, "memi");
assert.deepEqual(plugin.args, ["--profile", "locked", "mcp", "start", "--no-figma"], "Bundled config must explicitly select locked startup");
assert(!Object.hasOwn(plugin, "env"), "Locked plugin startup must not request unused credentials");
const scratch = await mkdtemp(join(tmpdir(), "memi-mcp-smoke-"));
const project = join(scratch, "project");
const home = join(scratch, "home");
const sentinel = join(scratch, "sentinel.cjs");
await mkdir(project);
await mkdir(home);
await writeFile(join(project, "App.tsx"), 'export const App = () => <button>Save</button>;');
await writeFile(sentinel, sentinelSource());

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--require", sentinel, entry, ...plugin.args],
  cwd: project,
  env: {
    PATH: process.env.PATH ?? "",
    HOME: home, USERPROFILE: home,
    MEMOIRE_STUDIO_PROJECT_ROOT: project,
    // Exercise log routing at info verbosity; do not hide protocol pollution.
    MEMOIRE_LOG_LEVEL: "info",
    NODE_ENV: "production",
  },
  stderr: "pipe",
});
let stderr = "";
transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
const client = new Client({ name: "memoire-release-smoke", version: "0.0.0" });
const protocolErrors = [];
client.onerror = (error) => protocolErrors.push(error.message);
const timeoutMs = Number.parseInt(process.env.MEMOIRE_MCP_SMOKE_TIMEOUT_MS ?? "30000", 10);
const timer = setTimeout(() => { console.error("MCP stdio smoke timed out"); process.exit(1); }, timeoutMs);
try {
  await client.connect(transport);
  const names = (await client.listTools()).tools.map((tool) => tool.name);
  assert.deepEqual([...names].sort(), ["prepare_design_agent_brief", "prepare_apple_design_brief", "prepare_frontend_brief", "diagnose_app_quality"].sort(),
    "Default plugin must expose exactly the four audited local tools");
  assert(!names.includes("design_doc"), "Unaudited networking tool exposed by default");
  for (const name of ["prepare_design_agent_brief", "diagnose_app_quality"]) {
    const result = await client.callTool({ name, arguments: {} });
    assert(!result.isError, JSON.stringify(result));
    const body = JSON.parse(result.content[0].text);
    assert(name === "diagnose_app_quality" ? Array.isArray(body.issues) : typeof body.mission === "string");
  }
  const frontend = await client.callTool({ name: "prepare_frontend_brief", arguments: { intent: "Improve the Save button" } });
  assert(!frontend.isError, JSON.stringify(frontend));
  assert.equal(JSON.parse(frontend.content[0].text).schemaVersion, "memi.frontend-brief.v1");
  const denied = await client.callTool({ name: "design_doc", arguments: { url: "https://example.com" } });
  assert(denied.isError && JSON.stringify(denied.content).includes("MEMI_CAPABILITY_DENIED"));
  const cancellation = new AbortController();
  const pending = client.callTool({ name: "diagnose_app_quality", arguments: {} }, undefined,
    { signal: cancellation.signal });
  cancellation.abort(new Error("Smoke cancellation"));
  await assert.rejects(pending, /Smoke cancellation/);
  await client.ping();
  await client.close();
  assert.deepEqual(await readdir(project), ["App.tsx"]);
  assert.deepEqual(await readdir(home), []);
  assert(!stderr.includes("MEMI_SMOKE_SIDE_EFFECT"), stderr);
  assert.deepEqual(protocolErrors, [], "Non-protocol stdout or transport error");
  console.log(`mcp stdio smoke: locked initialize/list/brief/diagnosis/denial/cancel/close passed (${names.length} tools); no sentinel side effects`);
} catch (error) {
  console.error(stderr);
  throw error;
} finally {
  clearTimeout(timer);
  await client.close();
  await rm(scratch, { recursive: true, force: true });
}

function sentinelSource() {
  return `
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const cp = require('node:child_process');
const net = require('node:net');
const dgram = require('node:dgram');
const tls = require('node:tls');
const worker = require('node:worker_threads');
const { syncBuiltinESMExports } = require('node:module');
const { resolve, relative } = require('node:path');
function deny(operation) {
  process.stderr.write('MEMI_SMOKE_SIDE_EFFECT: ' + operation + '\\n');
  throw new Error('MEMI_SMOKE_SIDE_EFFECT: ' + operation);
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = () => deny(name);
net.connect = net.createConnection = tls.connect = () => deny('network connect');
net.Socket.prototype.connect = () => deny('socket connect');
net.Server.prototype.listen = () => deny('server listen');
dgram.createSocket = () => deny('datagram socket');
worker.Worker = class { constructor() { deny('worker or optional peer execution'); } };
for (const name of ['writeFile', 'appendFile', 'mkdir', 'mkdtemp', 'rename', 'rm', 'rmdir', 'unlink', 'copyFile', 'cp', 'symlink', 'link', 'truncate', 'chmod', 'chown']) {
  if (fsp[name]) fsp[name] = () => deny(name);
  if (fs[name]) fs[name] = () => deny(name);
  if (fs[name + 'Sync']) fs[name + 'Sync'] = () => deny(name + 'Sync');
}
fs.createWriteStream = () => deny('createWriteStream');
function checkRead(path) {
  if (path instanceof URL) path = require('node:url').fileURLToPath(path);
  if (Buffer.isBuffer(path)) path = path.toString();
  if (typeof path !== 'string') return;
  const child = relative(process.env.HOME, resolve(path));
  if (child === '' || (!child.startsWith('..') && !require('node:path').isAbsolute(child))) deny('home state read');
}
for (const api of [fs, fsp]) {
  for (const name of ['readFile', 'readFileSync', 'readdir', 'readdirSync', 'stat', 'statSync', 'lstat', 'lstatSync', 'access', 'accessSync', 'existsSync', 'realpath', 'realpathSync']) {
    if (!api[name]) continue;
    const original = api[name];
    api[name] = function(path, ...args) { checkRead(path); return original.call(this, path, ...args); };
  }
  for (const name of ['open', 'openSync']) {
    if (!api[name]) continue;
    const original = api[name];
    api[name] = function(path, flags, ...args) {
      checkRead(path);
      if (typeof flags === 'number' ? (flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND)) !== 0 : /[wa+]/.test(flags)) deny('open for write');
      return original.call(this, path, flags, ...args);
    };
  }
}
syncBuiltinESMExports();
`;
}
