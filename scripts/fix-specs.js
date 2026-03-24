#!/usr/bin/env node
/**
 * fix-specs.js — Migrates spec files to the canonical ComponentSpec schema.
 *
 * Fixes:
 *   atomicLevel  → level
 *   shadcnComponents → shadcnBase
 *   description  → purpose
 *   props[x] = { type, required } → props[x] = "string" | "string?"
 *   Adds missing: variants, researchBacking, designTokens, accessibility, dataviz
 */

import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const specsDir = join(__dir, "..", "specs", "components");

const files = (await readdir(specsDir)).filter(f => f.endsWith(".json"));
let fixed = 0;

for (const file of files) {
  const raw = JSON.parse(await readFile(join(specsDir, file), "utf-8"));

  // Convert props: { name: { type, required } } → { name: "type" | "type?" }
  const props = {};
  if (raw.props) {
    for (const [k, v] of Object.entries(raw.props)) {
      if (typeof v === "object" && v !== null && "type" in v) {
        props[k] = v.required === false ? `${v.type}?` : v.type;
      } else if (typeof v === "string") {
        props[k] = v; // already correct
      }
    }
  }

  const out = {
    name:             raw.name,
    type:             "component",
    level:            raw.atomicLevel || raw.level || "atom",
    purpose:          raw.purpose || raw.description || raw.name,
    researchBacking:  raw.researchBacking || [],
    designTokens:     raw.designTokens || { source: "figma", mapped: true },
    variants:         raw.variants || ["default"],
    props,
    shadcnBase:       raw.shadcnBase || raw.shadcnComponents || [],
    composesSpecs:    raw.composesSpecs || [],
    codeConnect:      raw.codeConnect || {},
    accessibility:    raw.accessibility || { ariaLabel: "optional", keyboardNav: false },
    dataviz:          raw.dataviz ?? null,
    tags:             raw.tags || [],
    createdAt:        raw.createdAt || new Date().toISOString(),
    updatedAt:        new Date().toISOString(),
  };

  await writeFile(join(specsDir, file), JSON.stringify(out, null, 2));
  console.log(`  ✓ ${file}  [${out.level}]`);
  fixed++;
}

console.log(`\nFixed ${fixed} specs.`);
