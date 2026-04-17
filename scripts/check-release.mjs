#!/usr/bin/env node

import { readdir, readFile, access } from "node:fs/promises";
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

const lockfile = await readJson(join(root, "package-lock.json"));
if (lockfile.version !== version) {
  fail(`package-lock.json version ${lockfile.version} does not match package.json ${version}`);
}
if (lockfile.packages?.[""]?.version !== version) {
  fail(`package-lock.json root package version ${lockfile.packages?.[""]?.version} does not match package.json ${version}`);
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
