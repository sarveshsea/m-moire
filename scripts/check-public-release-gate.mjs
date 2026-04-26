#!/usr/bin/env node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const packageName = process.env.PACKAGE_NAME || pkg.name;
const expectedVersion = process.env.EXPECTED_VERSION || pkg.version;
const expectedPhrase = process.env.EXPECTED_README_PHRASE || "Shadcn-native Design CI for Tailwind apps";
const expectedInstall = process.env.EXPECTED_INSTALL_COMMAND || `npm i -g ${packageName}`;
const skipInstall = process.env.SKIP_INSTALL_SMOKE === "1";

const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/^%40/, "%40")}`;
const metadata = await fetchJson(registryUrl);
const latest = metadata["dist-tags"]?.latest;
const latestReadme = [
  metadata.readme,
  latest ? metadata.versions?.[latest]?.readme : "",
  metadata.versions?.[expectedVersion]?.readme,
].filter(Boolean).join("\n");

const failures = [];
if (latest !== expectedVersion) {
  failures.push(`npm latest is ${latest ?? "(missing)"}, expected ${expectedVersion}`);
}
if (!latestReadme.includes(expectedPhrase)) {
  failures.push(`npm README missing phrase: ${expectedPhrase}`);
}
if (!latestReadme.includes(expectedInstall)) {
  failures.push(`npm README missing install command: ${expectedInstall}`);
}

let installSmoke = null;
if (failures.length === 0 && !skipInstall) {
  installSmoke = await runInstallSmoke(packageName, expectedVersion);
  if (!installSmoke.ok) {
    failures.push(installSmoke.error);
  }
}

const payload = {
  packageName,
  expectedVersion,
  latest,
  expectedPhrase,
  expectedInstall,
  installSmoke,
  status: failures.length === 0 ? "passed" : "failed",
  failures,
};

console.log(JSON.stringify(payload, null, 2));
if (failures.length > 0) process.exit(1);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "memoire-public-release-gate" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
}

async function runInstallSmoke(name, version) {
  const dir = await mkdtemp(join(tmpdir(), "memoire-release-gate-"));
  try {
    const pkgRef = `${name}@${version}`;
    const result = spawnSync("npm", ["exec", "--yes", "--package", pkgRef, "--", "memi", "--version"], {
      cwd: dir,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
    const stdout = result.stdout.trim();
    if (result.status !== 0) {
      return { ok: false, error: `install smoke failed: ${result.stderr.trim() || result.status}` };
    }
    if (stdout !== version) {
      return { ok: false, error: `memi --version returned ${stdout}, expected ${version}` };
    }
    return { ok: true, version: stdout };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
