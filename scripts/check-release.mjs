#!/usr/bin/env node

import { readdir, readFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyChangelogData, parseChangelogMarkdown } from "./build-changelog-preview.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

const failures = [];

function fail(message) {
  failures.push(message);
}

const packageJson = await readJson(join(root, "package.json"));
const version = packageJson.version;
const expectedMcpName = "io.github.sarveshsea/memoire";
if (packageJson.mcpName !== expectedMcpName) {
  fail(`package.json mcpName ${packageJson.mcpName} does not match ${expectedMcpName}`);
}

const readme = await readFile(join(root, "README.md"), "utf-8");
const readmeTopFold = readme.slice(0, 3000);
const requiredReadmeTerms = [
  "Shadcn-native Design CI for Tailwind apps",
  "npm i -g @sarveshsea/memoire",
  "memi shadcn export",
  "memi registry install",
  "https://ui.shadcn.com/docs/registry/getting-started",
  "https://ui.shadcn.com/docs/registry/registry-item-json",
  "https://ui.shadcn.com/docs/components-json",
  "https://v0.app/docs/design-systems",
];
for (const term of requiredReadmeTerms) {
  if (!readmeTopFold.includes(term)) {
    fail(`README top fold is missing required conversion term: ${term}`);
  }
}

const cliEntry = await readFile(join(root, "src", "index.ts"), "utf-8");
for (const command of ["diagnose [target]", "tokens", "publish", "shadcn <subcommand>", "fix <subcommand>", "add <component>", "registry <subcommand>"]) {
  if (!cliEntry.includes(command)) {
    fail(`fast CLI help is missing command: ${command}`);
  }
}

const lockfile = await readJson(join(root, "package-lock.json"));
if (lockfile.version !== version) {
  fail(`package-lock.json version ${lockfile.version} does not match package.json ${version}`);
}
if (lockfile.packages?.[""]?.version !== version) {
  fail(`package-lock.json root package version ${lockfile.packages?.[""]?.version} does not match package.json ${version}`);
}

const mcpServerJson = await readJson(join(root, "server.json"));
if (mcpServerJson.name !== packageJson.mcpName) {
  fail(`server.json name ${mcpServerJson.name} does not match package.json mcpName ${packageJson.mcpName}`);
}
if (mcpServerJson.version !== version) {
  fail(`server.json version ${mcpServerJson.version} does not match package.json ${version}`);
}
if (mcpServerJson.description?.length > 100) {
  fail("server.json description must be 100 characters or fewer for the MCP Registry");
}
const npmPackageEntry = mcpServerJson.packages?.find((entry) => entry.registryType === "npm");
if (!npmPackageEntry) {
  fail("server.json must include an npm package entry");
} else {
  if (npmPackageEntry.identifier !== packageJson.name) {
    fail(`server.json npm identifier ${npmPackageEntry.identifier} does not match package.json name ${packageJson.name}`);
  }
  if (npmPackageEntry.version !== version) {
    fail(`server.json npm version ${npmPackageEntry.version} does not match package.json ${version}`);
  }
  if (npmPackageEntry.registryBaseUrl !== "https://registry.npmjs.org") {
    fail("server.json npm package must use https://registry.npmjs.org");
  }
  if (npmPackageEntry.transport?.type !== "stdio") {
    fail("server.json npm package transport must be stdio");
  }
  const packageArgs = npmPackageEntry.packageArguments ?? [];
  if (!packageArgs.some((arg) => arg.type === "positional" && arg.value === "mcp")) {
    fail("server.json npm package must pass the memi mcp positional argument");
  }
}

const changelog = await readFile(join(root, "CHANGELOG.md"), "utf-8");
const changelogMatch = changelog.match(/^## v([0-9]+\.[0-9]+\.[0-9]+)\b/m);
if (!changelogMatch) {
  fail("CHANGELOG.md does not contain a version heading");
} else if (changelogMatch[1] !== version) {
  fail(`CHANGELOG.md starts at v${changelogMatch[1]} but package.json is ${version}`);
}

const previewPath = join(root, "preview", "changelog.html");
const currentPreview = await readFile(previewPath, "utf-8");
const releases = parseChangelogMarkdown(changelog);
const generatedPreview = applyChangelogData(currentPreview, releases);
if (generatedPreview !== currentPreview) {
  fail("preview/changelog.html is not synced with CHANGELOG.md");
}

const widgetMetaPath = join(root, "plugin", "widget-meta.json");
const widgetMeta = await readJson(widgetMetaPath);
if (widgetMeta.packageVersion !== version) {
  fail(`plugin/widget-meta.json packageVersion ${widgetMeta.packageVersion} does not match package.json ${version}`);
}

for (const registryPath of await findRegistryFiles(join(root, "examples"))) {
  const registry = await readJson(registryPath);
  const registryVersion = registry.meta?.memoireVersion;
  if (registryVersion !== version) {
    fail(`${registryPath} meta.memoireVersion is ${registryVersion} but package.json is ${version}`);
  }
}

const starterReadmePath = join(root, "examples", "presets", "starter", "README.md");
const starterReadme = await readFile(starterReadmePath, "utf-8");
const starterReadmeMatch = starterReadme.match(/Generated for Memoire v([0-9]+\.[0-9]+\.[0-9]+)\./);
if (!starterReadmeMatch) {
  fail("examples/presets/starter/README.md is missing its generated version marker");
} else if (starterReadmeMatch[1] !== version) {
  fail(`examples/presets/starter/README.md says v${starterReadmeMatch[1]} but package.json is ${version}`);
}

const featuredCatalogPath = join(root, "examples", "featured-registries.json");
const featuredCatalog = await readJson(featuredCatalogPath);
if (!Array.isArray(featuredCatalog) || featuredCatalog.length < 3) {
  fail("examples/featured-registries.json must contain at least three featured registries");
} else {
  for (const entry of featuredCatalog) {
    if (!entry.slug || !entry.packageName || !entry.installCommand || !entry.sourcePath || !entry.screenshotPath) {
      fail(`featured registry entry is missing required fields: ${JSON.stringify(entry)}`);
      continue;
    }

    if (!entry.installCommand.includes(entry.packageName)) {
      fail(`featured registry ${entry.slug} installCommand does not reference ${entry.packageName}`);
    }

    const sourceDir = join(root, entry.sourcePath);
    const screenshotPath = join(root, entry.screenshotPath);

    try {
      await access(sourceDir);
    } catch {
      fail(`featured registry ${entry.slug} sourcePath does not exist: ${entry.sourcePath}`);
    }

    try {
      await access(screenshotPath);
    } catch {
      fail(`featured registry ${entry.slug} screenshotPath does not exist: ${entry.screenshotPath}`);
    }
  }
}

const marketplaceCatalog = await readJson(join(root, "examples", "marketplace-catalog.v1.json"));
const packagedMarketplaceCatalog = await readJson(join(root, "assets", "marketplace-catalog.v1.json"));
if (JSON.stringify(marketplaceCatalog) !== JSON.stringify(packagedMarketplaceCatalog)) {
  fail("examples/marketplace-catalog.v1.json and assets/marketplace-catalog.v1.json are not synced");
}
if (marketplaceCatalog.version !== 1) {
  fail(`marketplace catalog version is ${marketplaceCatalog.version}, expected 1`);
}
if (!Array.isArray(marketplaceCatalog.entries) || marketplaceCatalog.entries.length < 7) {
  fail("marketplace catalog must contain at least seven registry entries");
} else {
  const seen = new Set();
  for (const entry of marketplaceCatalog.entries) {
    if (!entry.slug || seen.has(entry.slug)) {
      fail(`marketplace catalog has a missing or duplicate slug: ${entry.slug}`);
    }
    seen.add(entry.slug);
    for (const field of ["packageName", "installCommand", "sourcePath", "sourceUrl", "screenshotPath", "screenshotUrl", "registryItemUrl", "openInV0Url", "description", "category"]) {
      if (!entry[field]) fail(`marketplace catalog ${entry.slug} is missing ${field}`);
    }
    if (!entry.openInV0Url.includes(encodeURIComponent(entry.registryItemUrl))) {
      fail(`marketplace catalog ${entry.slug} openInV0Url does not encode registryItemUrl`);
    }
    if (!Array.isArray(entry.tags) || entry.tags.length < 3) {
      fail(`marketplace catalog ${entry.slug} must include at least three SEO tags`);
    }
    if (!entry.installCommand?.includes(entry.packageName)) {
      fail(`marketplace catalog ${entry.slug} installCommand does not reference ${entry.packageName}`);
    }
  }
}

if (process.env.SKIP_PACK_GATE !== "1") {
  const pack = spawnSync(process.execPath, [join(root, "scripts", "pack-dry-run.mjs")], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  if (pack.status !== 0) {
    fail(`package size gate failed: ${pack.stderr.trim() || pack.stdout.trim() || pack.status}`);
  }
}

if (failures.length > 0) {
  console.error("\nRelease consistency check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error("");
  process.exit(1);
}

console.log(`Release consistency check passed for v${version}.`);

async function findRegistryFiles(dir) {
  const registryFiles = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      registryFiles.push(...await findRegistryFiles(path));
      continue;
    }
    if (entry.isFile() && entry.name === "registry.json") {
      registryFiles.push(path);
    }
  }

  return registryFiles;
}
