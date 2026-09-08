import { lstat } from "node:fs/promises";
import { readContainedSource } from "../security/contained-source.js";
import { writeSourceArtifact } from "../security/source-output.js";
/**
 * Findings Baseline — the accepted-debt ledger (.memoire/baseline.json,
 * committed) that makes gates adoptable on existing codebases: accepted
 * findings stop gating, only NEW findings fail the build.
 *
 * Fingerprints are line-number-independent: ruleId + repo-relative file +
 * normalized evidence excerpt + occurrence index. Two granularities:
 *
 * - File-anchored findings (evidenceLocations present) fingerprint per
 *   location; an issue is suppressed only when ALL its locations are
 *   accepted, and resurfaces the moment any new location appears.
 * - Aggregate rules (whole-tree stats like type.scale-wide, no per-file
 *   anchor) fingerprint on the rule id alone. Accepting one accepts the
 *   rule's presence — worsening aggregate debt is caught by score
 *   regression gates, not per-file blame (fingerprinting the count would
 *   just resurface on every ±1 drift).
 *
 * Suppression is never silent: every consumer receives suppressed counts
 * and must surface them.
 */

import { join } from "node:path";
import { createHash } from "node:crypto";
import type { AppQualityIssue } from "./engine.js";

export interface BaselineEntry {
  fingerprint: string;
  ruleId: string;
  file?: string;
  note?: string;
}

export interface BaselineFile {
  schemaVersion: 1;
  acceptedAt: string;
  /** Policy hash at acceptance time — a different active policy is flagged, not fatal. */
  policyHash?: string;
  entries: BaselineEntry[];
}

export interface BaselineFilterResult {
  /** Issues that still gate (have at least one non-accepted fingerprint). */
  active: AppQualityIssue[];
  /** Issues fully covered by the baseline — excluded from gating, never from visibility. */
  suppressed: AppQualityIssue[];
  /** Accepted fingerprints that no longer occur — candidates for cleanup. */
  staleFingerprints: BaselineEntry[];
}

export const BASELINE_FILE_RELATIVE = join(".memoire", "baseline.json");

export function baselinePath(projectRoot: string): string {
  return join(projectRoot, BASELINE_FILE_RELATIVE);
}

/** Compute the stable fingerprints for one issue (one per evidence location, or one rule-level). */
export function fingerprintIssue(issue: AppQualityIssue): BaselineEntry[] {
  const locations = issue.evidenceLocations ?? [];
  if (locations.length === 0) {
    return [{
      fingerprint: hashParts([issue.id]),
      ruleId: issue.id,
    }];
  }
  const perFileIndex = new Map<string, number>();
  return locations.map((location) => {
    const key = `${location.file}::${normalizeExcerpt(location.excerpt)}`;
    const occurrence = perFileIndex.get(key) ?? 0;
    perFileIndex.set(key, occurrence + 1);
    return {
      fingerprint: hashParts([issue.id, location.file, normalizeExcerpt(location.excerpt), String(occurrence)]),
      ruleId: issue.id,
      file: location.file,
    };
  });
}

/** Whitespace-insensitive excerpt normalization so formatting churn doesn't resurface accepted findings. */
function normalizeExcerpt(excerpt: string | undefined): string {
  return (excerpt ?? "").replace(/\s+/g, " ").trim();
}

function hashParts(parts: string[]): string {
  return createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 20);
}

export async function readBaseline(projectRoot: string): Promise<BaselineFile | null> {
  try {
    await lstat(baselinePath(projectRoot));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error("Cannot safely read .memoire/baseline.json");
  }
  const source = await readContainedSource(projectRoot, ".memoire/baseline.json", 1_048_576);
  if (!source.ok) throw new Error(`Cannot safely read .memoire/baseline.json: ${source.reason}`);
  const raw = source.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`.memoire/baseline.json is not valid JSON: ${(err as Error).message}`);
  }
  const file = parsed as BaselineFile;
  if (file.schemaVersion !== 1 || !Array.isArray(file.entries)) {
    throw new Error(".memoire/baseline.json has an unrecognized shape (expected schemaVersion 1 with an entries array)");
  }
  return file;
}

export async function writeBaseline(projectRoot: string, baseline: BaselineFile): Promise<string> {
  const path = baselinePath(projectRoot);
  await writeSourceArtifact(path, `${JSON.stringify(baseline, null, 2)}\n`);
  return path;
}

/** Build a baseline accepting every current finding. */
export function buildBaseline(issues: AppQualityIssue[], options: { policyHash?: string; acceptedAt?: string; note?: string }): BaselineFile {
  const entries = issues.flatMap((issue) => fingerprintIssue(issue)).map((entry) => ({
    ...entry,
    ...(options.note ? { note: options.note } : {}),
  }));
  return {
    schemaVersion: 1,
    acceptedAt: options.acceptedAt ?? new Date().toISOString(),
    policyHash: options.policyHash,
    entries: dedupeEntries(entries),
  };
}

function dedupeEntries(entries: BaselineEntry[]): BaselineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.fingerprint)) return false;
    seen.add(entry.fingerprint);
    return true;
  });
}

/**
 * Split issues into active (gate) vs suppressed (accepted debt), and report
 * stale accepted fingerprints that no longer occur.
 */
export function filterWithBaseline(issues: AppQualityIssue[], baseline: BaselineFile): BaselineFilterResult {
  const accepted = new Set(baseline.entries.map((entry) => entry.fingerprint));
  const occurring = new Set<string>();
  const active: AppQualityIssue[] = [];
  const suppressed: AppQualityIssue[] = [];

  for (const issue of issues) {
    const fingerprints = fingerprintIssue(issue);
    for (const fp of fingerprints) occurring.add(fp.fingerprint);
    const hasNew = fingerprints.some((fp) => !accepted.has(fp.fingerprint));
    if (hasNew) active.push(issue);
    else suppressed.push(issue);
  }

  const staleFingerprints = baseline.entries.filter((entry) => !occurring.has(entry.fingerprint));
  return { active, suppressed, staleFingerprints };
}
