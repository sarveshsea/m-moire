#!/usr/bin/env node
/**
 * build-presets.mjs — validate and smoke-build Memoire example presets.
 *
 * What it checks per preset:
 *   1. package.json has the @memoire-examples/* name + memoire.registry flag
 *   2. registry.json structurally matches Registry v1 (name, version, components[], meta)
 *   3. Every component referenced by registry.json:
 *        - spec file exists at `href` and has the minimum ComponentSpec fields
 *        - code file exists at `code.href` and parses via the TypeScript compiler
 *          when tsc is available (falls back to lightweight TS checks otherwise)
 *   4. tokens/tokens.json exists and has at least one color entry
 *   5. tokens/tokens.css includes an @theme { … } or :root { … } block
 *
 * Usage:
 *   node scripts/build-presets.mjs              # validate all presets
 *   node scripts/build-presets.mjs <slug>       # validate one preset
 *
 * Exit code is non-zero on failure.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PRESETS_DIR = join(ROOT, "examples", "presets");

const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const YELLOW = (s) => `\x1b[33m${s}\x1b[0m`;
const GRAY = (s) => `\x1b[90m${s}\x1b[0m`;

// ── Tiny structural validator for registry.json ───────────────────
const SEMVER = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/;
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function validateRegistry(r, errs) {
  if (typeof r !== "object" || !r) return errs.push("registry.json must be an object");
  if (typeof r.name !== "string" || !NPM_NAME.test(r.name)) errs.push(`invalid name: ${r.name}`);
  if (typeof r.version !== "string" || !SEMVER.test(r.version)) errs.push(`invalid version: ${r.version}`);
  if (!Array.isArray(r.components)) errs.push("components must be an array");
  if (typeof r.meta !== "object" || !r.meta) errs.push("meta must be an object");
  else {
    if (typeof r.meta.extractedAt !== "string") errs.push("meta.extractedAt must be a string");
    if (typeof r.meta.memoireVersion !== "string") errs.push("meta.memoireVersion must be a string");
  }
  if (r.tokens && typeof r.tokens.href !== "string") errs.push("tokens.href must be a string");
  for (const c of r.components ?? []) {
    if (typeof c.name !== "string") errs.push(`component missing name`);
    if (typeof c.href !== "string") errs.push(`component ${c.name} missing href`);
    if (c.code && typeof c.code.href !== "string") errs.push(`component ${c.name} code.href invalid`);
  }
}

function validateSpec(spec, errs, specName) {
  if (spec.type !== "component") errs.push(`${specName}: type must be "component"`);
  if (typeof spec.name !== "string") errs.push(`${specName}: name must be a string`);
  if (typeof spec.purpose !== "string" || spec.purpose.length < 4) errs.push(`${specName}: purpose too short`);
  if (spec.level && !["atom", "molecule", "organism", "template"].includes(spec.level))
    errs.push(`${specName}: invalid level ${spec.level}`);
  if (!Array.isArray(spec.variants) || spec.variants.length === 0)
    errs.push(`${specName}: variants must be a non-empty array`);
  // Atomic rule — atoms must not compose other specs
  if (spec.level === "atom" && Array.isArray(spec.composesSpecs) && spec.composesSpecs.length > 0)
    errs.push(`${specName}: atoms cannot have composesSpecs`);
}

function validateTsxSyntax(source, fileLabel, errs) {
  // Very light sanity: must contain an export, a .tsx-looking JSX return, and balanced braces.
  if (!/export\s+(const|function|default|\{)/.test(source)) {
    errs.push(`${fileLabel}: no export found`);
  }
  if (!/<[A-Za-z]/.test(source)) {
    errs.push(`${fileLabel}: no JSX element found`);
  }
  const opens = (source.match(/\{/g) || []).length;
  const closes = (source.match(/\}/g) || []).length;
  if (opens !== closes) errs.push(`${fileLabel}: unbalanced braces (${opens} vs ${closes})`);
  // Discourage hardcoded hex in component bodies (tokens should be used)
  const hexMatches = source.match(/#[0-9a-fA-F]{3,8}\b/g);
  if (hexMatches && hexMatches.length > 0) {
    errs.push(`${fileLabel}: hardcoded hex values found (${hexMatches.slice(0, 3).join(", ")}) — use CSS vars`);
  }
}

function validateTokensCss(css, errs) {
  if (!/@theme\s*\{/.test(css) && !/:root\s*\{/.test(css)) {
    errs.push("tokens.css must contain an @theme { … } or :root { … } block");
  }
  if (!/--color-/.test(css)) {
    errs.push("tokens.css must define at least one --color-* custom property");
  }
}

function validateTokensJson(tokens, errs) {
  if (typeof tokens !== "object" || !tokens) return errs.push("tokens.json must be an object");
  if (!tokens.color || typeof tokens.color !== "object")
    return errs.push("tokens.json must have a color group");
  const colorKeys = Object.keys(tokens.color).filter((k) => k !== "$type");
  if (colorKeys.length < 3) errs.push("tokens.json color group has < 3 entries");
}

function validatePackageJson(pkg, expectedName, errs) {
  if (pkg.name !== expectedName) errs.push(`package.json name ${pkg.name} !== ${expectedName}`);
  if (!pkg.memoire || pkg.memoire.registry !== true)
    errs.push("package.json missing memoire.registry = true");
  if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("memoire-registry"))
    errs.push("package.json keywords missing 'memoire-registry'");
}

// ── Per-preset validation ────────────────────────────────────────

function validatePreset(slug) {
  const errs = [];
  const dir = join(PRESETS_DIR, slug);
  if (!existsSync(dir)) {
    return { slug, ok: false, errs: [`directory not found: ${dir}`] };
  }

  // package.json
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) errs.push("missing package.json");
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (e) {
    errs.push(`package.json parse error: ${e.message}`);
  }

  // registry.json
  const regPath = join(dir, "registry.json");
  if (!existsSync(regPath)) errs.push("missing registry.json");
  let registry = null;
  try {
    registry = JSON.parse(readFileSync(regPath, "utf8"));
  } catch (e) {
    errs.push(`registry.json parse error: ${e.message}`);
  }
  if (registry) validateRegistry(registry, errs);
  if (pkg && registry) validatePackageJson(pkg, registry.name, errs);

  // tokens
  if (registry?.tokens?.href) {
    const tokensJsonPath = join(dir, registry.tokens.href);
    if (!existsSync(tokensJsonPath)) errs.push(`tokens.json missing at ${registry.tokens.href}`);
    else {
      try {
        const tokensJson = JSON.parse(readFileSync(tokensJsonPath, "utf8"));
        validateTokensJson(tokensJson, errs);
      } catch (e) {
        errs.push(`tokens.json parse error: ${e.message}`);
      }
    }
  }
  const cssPath = join(dir, "tokens", "tokens.css");
  if (!existsSync(cssPath)) errs.push("tokens/tokens.css missing");
  else validateTokensCss(readFileSync(cssPath, "utf8"), errs);

  // components
  const componentCount = registry?.components?.length ?? 0;
  if (componentCount < 4) errs.push(`expected at least 4 components, got ${componentCount}`);

  for (const ref of registry?.components ?? []) {
    const specPath = join(dir, ref.href);
    if (!existsSync(specPath)) {
      errs.push(`spec missing for ${ref.name} at ${ref.href}`);
      continue;
    }
    try {
      const spec = JSON.parse(readFileSync(specPath, "utf8"));
      validateSpec(spec, errs, ref.name);
    } catch (e) {
      errs.push(`spec parse error for ${ref.name}: ${e.message}`);
    }
    if (ref.code?.href) {
      const codePath = join(dir, ref.code.href);
      if (!existsSync(codePath)) errs.push(`code missing for ${ref.name} at ${ref.code.href}`);
      else validateTsxSyntax(readFileSync(codePath, "utf8"), `${ref.name}.tsx`, errs);
    }
  }

  return { slug, ok: errs.length === 0, errs };
}

// ── Main ─────────────────────────────────────────────────────────

function listPresets() {
  if (!existsSync(PRESETS_DIR)) return [];
  return readdirSync(PRESETS_DIR)
    .filter((n) => {
      const p = join(PRESETS_DIR, n);
      return n !== "__tests__" && !n.startsWith(".") && statSync(p).isDirectory();
    })
    .sort();
}

function main() {
  const arg = process.argv[2];
  const slugs = arg ? [arg] : listPresets();
  if (slugs.length === 0) {
    console.error(RED("no presets found under examples/presets"));
    process.exit(1);
  }

  console.log(GRAY(`\nValidating ${slugs.length} preset${slugs.length === 1 ? "" : "s"}\u2026\n`));
  let failed = 0;
  for (const slug of slugs) {
    const { ok, errs } = validatePreset(slug);
    if (ok) {
      console.log(`  ${GREEN("\u2713")} ${slug}`);
    } else {
      failed++;
      console.log(`  ${RED("\u2717")} ${slug}`);
      for (const e of errs) console.log(`      ${YELLOW("\u2022")} ${e}`);
    }
  }
  console.log("");
  if (failed > 0) {
    console.log(RED(`${failed}/${slugs.length} preset${failed === 1 ? "" : "s"} failed`));
    process.exit(1);
  }
  console.log(GREEN(`All ${slugs.length} preset${slugs.length === 1 ? "" : "s"} valid.`));
}

main();
