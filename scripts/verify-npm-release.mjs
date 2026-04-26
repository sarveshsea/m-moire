#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf-8"));

const packageName = process.env.PACKAGE_NAME || pkg.name;
const expectedVersion = process.env.EXPECTED_VERSION || pkg.version;
const expectedPhrase = process.env.EXPECTED_README_PHRASE || "Design CI for shadcn/Tailwind apps";
const expectedInstall = process.env.EXPECTED_INSTALL_COMMAND || `npm i -g ${packageName}`;
const attempts = Number.parseInt(process.env.NPM_VERIFY_ATTEMPTS || "12", 10);
const delayMs = Number.parseInt(process.env.NPM_VERIFY_DELAY_MS || "10000", 10);

const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace(/^%40/, "%40")}`;

let lastError = "";
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const response = await fetch(registryUrl, {
      headers: { "User-Agent": "memoire-release-verifier" },
    });
    if (!response.ok) {
      throw new Error(`registry returned ${response.status}`);
    }

    const metadata = await response.json();
    const latest = metadata["dist-tags"]?.latest;
    const readme = String(metadata.readme || "");
    const versionReadme = String(metadata.versions?.[expectedVersion]?.readme || "");
    const combinedReadme = `${readme}\n${versionReadme}`;

    assert(latest === expectedVersion, `expected latest ${expectedVersion}, got ${latest}`);
    assert(combinedReadme.includes(expectedPhrase), `README missing phrase: ${expectedPhrase}`);
    assert(combinedReadme.includes(expectedInstall), `README missing install command: ${expectedInstall}`);

    console.log(JSON.stringify({
      status: "verified",
      packageName,
      latest,
      expectedPhrase,
      expectedInstall,
      attempts: attempt,
    }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

console.error(JSON.stringify({
  status: "failed",
  packageName,
  expectedVersion,
  expectedPhrase,
  expectedInstall,
  registryUrl,
  attempts,
  error: lastError,
}, null, 2));
process.exit(1);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
