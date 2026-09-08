import { createHash } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { stagePublishedEngineManifest, serializeJson, validateReleaseManifest, validateEngineReleaseTransition } from "../../../scripts/lib/release-manifest.mjs";

// Freeze candidate identity independently of the checkout's publication state.
async function candidateFixture() {
  const template = JSON.parse(await readFile("release-manifest.json", "utf8"));
  const path = "release-artifacts/npm/2.7.9.release.json";
  const bytes = await readFile(path, "utf8");
  const historical = JSON.parse(bytes);
  const version = "2.8.0-beta.1";
  return {...template, releaseGroups: {...template.releaseGroups, engine: {
    version, state: "candidate", sourceCommit: null, releaseRecord: null,
    previousPublicRelease: {version: historical.version, sourceCommit: historical.sourceCommit, releaseRecord: {path, sha256: createHash("sha256").update(bytes).digest("hex")}},
    verification: {eligibleForParity: false, reason: "Synthetic candidate transition fixture"},
  }}, surfaces: {...template.surfaces, githubRelease: {...template.surfaces.githubRelease, url: `https://github.com/memi-design/memi/releases/tag/v${version}`}}};
}

describe("published prerelease channel handoff", () => {
  it("retains stable identity through real staging so the tag resolver still selects next", async () => {
    const candidate = await candidateFixture();
    const engine = candidate.releaseGroups.engine;
    const previous = engine.previousPublicRelease;
    const original = serializeJson(candidate);
    const historical = JSON.parse(await readFile(previous.releaseRecord.path, "utf8"));
    // Synthetic unit record only. No registry observation or publication is claimed.
    const record = { ...historical, version: engine.version, sourceCommit: "a".repeat(40), attestation: { ...historical.attestation, subject: `pkg:npm/%40memi-design/cli@${engine.version}` } };
    const staged = stagePublishedEngineManifest({ manifest: candidate, releaseRecord: record, releaseRecordPath: `release-artifacts/npm/${engine.version}.release.json`, releaseRecordBytes: serializeJson(record), updatedAt: "2026-09-08" });
    expect(validateReleaseManifest(staged)).toEqual([]);
    const transition = {previousManifest: candidate, currentManifest: staged, releaseRecord: record, releaseRecordBytes: serializeJson(record), currentCommit: "b".repeat(40), sourceIsAncestor: true};
    expect(validateEngineReleaseTransition(transition)).toEqual([]);
    const changed = {...staged, releaseGroups: {...staged.releaseGroups, engine: {...staged.releaseGroups.engine, previousPublicRelease: {...previous, sourceCommit: "c".repeat(40)}}}};
    expect(validateEngineReleaseTransition({...transition, currentManifest: changed})).toContain("published prerelease must preserve the previous stable release identity");
    const root = await mkdtemp(join(tmpdir(), "memi-published-channel-"));
    try {
      await writeFile(join(root, "release-manifest.json"), serializeJson(staged));
      const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/resolve-release-channel.mjs"), "--tag", `v${engine.version}`], { cwd: root, encoding: "utf8", timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ release_version: engine.version, npm_dist_tag: "next", expected_latest: previous.version, is_prerelease: true, github_make_latest: "false", promote_stable_channels: false });
      expect(staged.releaseGroups.engine.previousPublicRelease).toEqual(previous);
      expect(serializeJson(candidate)).toBe(original);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

// State validation examples are synthetic; real publication evidence stays external.
describe("previous stable identity validation", () => {
  it.each([undefined, {}, {version: "2.7.9-beta.1", sourceCommit: "a".repeat(40)}, {version: "2.7.9", sourceCommit: "invalid"}])("rejects missing or invalid published prerelease history %j", async previous => {
    const manifest = await candidateFixture();
    const engine = {...manifest.releaseGroups.engine, state: "published", sourceCommit: "a".repeat(40), previousPublicRelease: previous, releaseRecord: {path: `release-artifacts/npm/${manifest.releaseGroups.engine.version}.release.json`, sha256: "b".repeat(64)}};
    expect(validateReleaseManifest({...manifest, releaseGroups: {...manifest.releaseGroups, engine}}).some((error: string) => error.includes("previousPublicRelease"))).toBe(true);
  });
  it("rejects a changed stable record pointer and preserves ordinary stable staging", async () => {
    const manifest = await candidateFixture();
    const previous = manifest.releaseGroups.engine.previousPublicRelease;
    const record = JSON.parse(await readFile(previous.releaseRecord.path, "utf8"));
    const candidate = {...manifest, releaseGroups: {...manifest.releaseGroups, engine: {...manifest.releaseGroups.engine, version: previous.version}}};
    const staged = stagePublishedEngineManifest({manifest: candidate, releaseRecord: record, releaseRecordPath: previous.releaseRecord.path, releaseRecordBytes: serializeJson(record), updatedAt: "2026-09-08"});
    expect(staged.releaseGroups.engine).not.toHaveProperty("previousPublicRelease");
    const beta = {...staged, releaseGroups: {...staged.releaseGroups, engine: {...staged.releaseGroups.engine, version: manifest.releaseGroups.engine.version, previousPublicRelease: {...previous, releaseRecord: {...previous.releaseRecord, sha256: "bad"}}}}};
    expect(validateReleaseManifest(beta)).toContain("published prerelease previousPublicRelease release record must include its SHA-256");
  });
});
