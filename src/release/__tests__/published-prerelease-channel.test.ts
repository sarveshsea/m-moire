import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { stagePublishedEngineManifest, serializeJson, validateReleaseManifest } from "../../../scripts/lib/release-manifest.mjs";

describe("published prerelease channel handoff", () => {
  it("retains stable identity through real staging so the tag resolver still selects next", async () => {
    const candidate = JSON.parse(await readFile("release-manifest.json", "utf8"));
    const engine = candidate.releaseGroups.engine;
    const previous = engine.previousPublicRelease;
    const historical = JSON.parse(await readFile(previous.releaseRecord.path, "utf8"));
    // Synthetic unit record only. No registry observation or publication is claimed.
    const record = { ...historical, version: engine.version, sourceCommit: "a".repeat(40), attestation: { ...historical.attestation, subject: `pkg:npm/%40memi-design/cli@${engine.version}` } };
    const staged = stagePublishedEngineManifest({ manifest: candidate, releaseRecord: record, releaseRecordPath: `release-artifacts/npm/${engine.version}.release.json`, releaseRecordBytes: serializeJson(record), updatedAt: "2026-09-08" });
    expect(validateReleaseManifest(staged)).toEqual([]);
    const root = await mkdtemp(join(tmpdir(), "memi-published-channel-"));
    try {
      await writeFile(join(root, "release-manifest.json"), serializeJson(staged));
      const result = spawnSync(process.execPath, [join(process.cwd(), "scripts/resolve-release-channel.mjs"), "--tag", `v${engine.version}`], { cwd: root, encoding: "utf8", timeout: 10000 });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ release_version: engine.version, npm_dist_tag: "next", expected_latest: previous.version, is_prerelease: true, github_make_latest: "false", promote_stable_channels: false });
      expect(staged.releaseGroups.engine.previousPublicRelease).toEqual(previous);
      expect(candidate.releaseGroups.engine).toEqual(engine);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
