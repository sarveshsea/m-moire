import { createHash } from "node:crypto";
import { validateEngineReleaseRecord, validateReleaseManifest, verifyPublishedEngineTransitionFromGit } from "../../../scripts/lib/release-manifest.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const candidateVersion = "2.8.0-beta.2";
const publicVersion = "2.7.9";
const publicSourceCommit = "5fcbf39e1255af0c14c5a17ba6bde8cf1206e525";
const publicReleaseRecord = {
  path: "release-artifacts/npm/2.7.9.release.json",
  sha256: "a04c63335fae7c7a1a2ac57d387a8647471742024c42e486159db4c0f1e78d0c",
};

async function readJson(path: string) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

describe("current Trust Core release surfaces", () => {
  it("validates the declared release identity and retained stable evidence", async () => {
    const manifest = await readJson("release-manifest.json");
    const engine = manifest.releaseGroups.engine;
    expect(engine.version).toBe(candidateVersion);
    expect(["candidate", "published"]).toContain(engine.state);
    expect(engine.previousPublicRelease).toEqual({ version: publicVersion, sourceCommit: publicSourceCommit, releaseRecord: publicReleaseRecord });
    expect(engine).not.toHaveProperty("supersededPartialReleases");
    expect(manifest.surfaces.githubRelease.url.endsWith(`/v${candidateVersion}`)).toBe(true);
    if (engine.state === "candidate") {
      expect(engine.sourceCommit).toBeNull();
      expect(engine.releaseRecord).toBeNull();
    } else {
      expect(engine.releaseRecord.path).toBe(`release-artifacts/npm/${candidateVersion}.release.json`);
      const bytes = await readFile(join(root, engine.releaseRecord.path), "utf8");
      expectPublishedIdentity(engine, bytes);
      expect(await verifyPublishedEngineTransitionFromGit(root, manifest)).toEqual([]);
    }
  });

  it("aligns every executable and packaged version surface", async () => {
    const [
      packageJson,
      packageLock,
      productionLock,
      server,
      mcpb,
      codexPlugin,
      claudePlugin,
      widget,
    ] = await Promise.all([
      readJson("package.json"),
      readJson("npm-shrinkwrap.json"),
      readJson("release/npm-shrinkwrap.production.json"),
      readJson("server.json"),
      readJson("mcpb/manifest.json"),
      readJson("plugins/memoire/.codex-plugin/plugin.json"),
      readJson("plugins/memi-claude/.claude-plugin/plugin.json"),
      readJson("plugin/widget-meta.json"),
    ]);

    expect([
      packageJson.version,
      packageLock.version,
      packageLock.packages[""].version,
      productionLock.version,
      productionLock.packages[""].version,
      server.version,
      ...server.packages.map((entry: { version: string }) => entry.version),
      server._meta["io.modelcontextprotocol.registry/publisher-provided"].version,
      mcpb.version,
      codexPlugin.version,
      claudePlugin.version,
      widget.packageVersion,
    ]).toEqual(Array(12).fill(candidateVersion));
    expect(packageJson.scripts["build:mcpb"]).toContain(`memi-${candidateVersion}.mcpb`);
    expect(packageJson.scripts["publish:smithery"]).toContain(`memi-${candidateVersion}.mcpb`);
    expect(packageJson.mcpName).toBe("io.github.memi-design/memi");
    expect(server.name).toBe("io.github.memi-design/memi");
    expect(await readFile(join(root, "mcpb/server/index.cjs"), "utf8"))
      .toContain(`@memi-design/cli@${candidateVersion}`);
    const action = await readFile(join(root, "action.yml"), "utf8");
    const engine = (await readJson("release-manifest.json")).releaseGroups.engine;
    const availableVersion = engine.state === "candidate" ? publicVersion : candidateVersion;
    expect(action).toContain(`default: "${availableVersion}"`);
    expect(action).toContain(`reviewed ${availableVersion} pin`);
  });

  it("keeps actual documentation consistent with the declared release", async () => {
    const engine = (await readJson("release-manifest.json")).releaseGroups.engine;
    const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
    const currentRelease = await readFile(join(root, "docs/CURRENT_RELEASE.md"), "utf8");
    const publicationDate = engine.state === "published"
      ? new Date((await readJson(engine.releaseRecord.path)).publishedAt).toISOString().slice(0, 10)
      : undefined;
    expectDocumentation(engine, changelog, currentRelease, publicationDate, engine.version);
  });
});

function expectPublishedIdentity(engine: { version: string; sourceCommit: string; releaseRecord: { sha256: string } }, bytes: string) {
  const record = JSON.parse(bytes);
  expect(engine.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
  expect(record.version).toBe(engine.version);
  expect(record.sourceCommit).toBe(engine.sourceCommit);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(engine.releaseRecord.sha256);
  expect(validateEngineReleaseRecord(record)).toEqual([]);
}

function expectDocumentation(engine: { state: string; sourceCommit: string | null }, changelog: string, currentRelease: string, publicationDate?: string, version = "2.8.0-beta.1") {
  expect(["candidate", "published"]).toContain(engine.state);
  expect(currentRelease).toContain(`Release state: \`${engine.state}\``);
  if (engine.state === "candidate") {
    expect(changelog).toContain(version === "2.8.0-beta.1" ? "## Trust Core 2.8 development — Unreleased" : `## Unreleased — ${version} candidate`);
    expect(changelog).not.toContain(`## v${version} —`);
    expect(currentRelease).toContain(`Engine candidate (unreleased) | \`${version}\``);
    expect(currentRelease).toContain("Source commit: Not assigned.");
    expect(currentRelease).toContain(`releases/tag/v${publicVersion}`);
    expect(currentRelease).toContain(`npx -y @memi-design/cli@${publicVersion}`);
    expect(currentRelease).not.toContain(`npx -y @memi-design/cli@${version}`);
  } else {
    expect(publicationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(changelog).toContain(`## v${version} — ${publicationDate} — Published beta`);
    expect(changelog).not.toContain("## Trust Core 2.8 development — Unreleased");
    expect(changelog).not.toContain(`## Unreleased — ${version} candidate`);
    expect(currentRelease).toContain(`Source commit: \`${engine.sourceCommit}\``);
    expect(currentRelease).toContain(`releases/tag/v${version}`);
    expect(currentRelease).toContain(`npx -y @memi-design/cli@${version}`);
    expect(currentRelease).not.toContain("Engine candidate (unreleased)");
  }
  expect(currentRelease).toContain("Do not announce parity until npm, GitHub, MCP, the Action, Studio, and the deployed website match their release groups.");
}

const parityRule = "Do not announce parity until npm, GitHub, MCP, the Action, Studio, and the deployed website match their release groups.";
const candidateDocs = "Release state: `candidate`\nEngine candidate (unreleased) | `2.8.0-beta.1`\nSource commit: Not assigned.\nreleases/tag/v2.7.9\nnpx -y @memi-design/cli@2.7.9\n" + parityRule;
const publishedDocs = "Release state: `published`\nSource commit: `" + "a".repeat(40) + "`\nreleases/tag/v2.8.0-beta.1\nnpx -y @memi-design/cli@2.8.0-beta.1\n" + parityRule;

describe("immutable candidate and synthetic published transition examples", () => {
  it("retains the immutable candidate identity independently of live release state", async () => {
    const candidate = { version: "2.8.0-beta.1", state: "candidate", sourceCommit: null, releaseRecord: null, previousPublicRelease: {version: "2.7.9", sourceCommit: "5fcbf39e1255af0c14c5a17ba6bde8cf1206e525", releaseRecord: {path: "release-artifacts/npm/2.7.9.release.json", sha256: "a04c63335fae7c7a1a2ac57d387a8647471742024c42e486159db4c0f1e78d0c"}} };
    expect(candidate).toMatchObject({ version: "2.8.0-beta.1", state: "candidate", sourceCommit: null, releaseRecord: null, previousPublicRelease: {version: publicVersion, sourceCommit: publicSourceCommit, releaseRecord: publicReleaseRecord} });
    expect(candidate).not.toHaveProperty("supersededPartialReleases");
    const current = await readJson("release-manifest.json");
    const fixture = {...current, releaseGroups: {...current.releaseGroups, engine: candidate}, surfaces: {...current.surfaces, githubRelease: {...current.surfaces.githubRelease, url: "https://github.com/memi-design/memi/releases/tag/v2.8.0-beta.1"}}};
    expect(validateReleaseManifest(fixture)).toEqual([]);
    expect(validateReleaseManifest({...fixture, releaseGroups: {...fixture.releaseGroups, engine: {...candidate, sourceCommit: "a".repeat(40)}}})).toContain("candidate engine release sourceCommit must be null");
  });
  it("preserves the strict candidate documentation contract", () => {
    expectDocumentation({state: "candidate", sourceCommit: null}, "## Trust Core 2.8 development — Unreleased", candidateDocs);
    expect(() => expectDocumentation({state: "candidate", sourceCommit: null}, "## v2.8.0-beta.1 — 2026-09-08 — Published beta", publishedDocs, "2026-09-08")).toThrow();
  });
  it("accepts published beta documentation and rejects candidate leftovers", () => {
    expectDocumentation({state: "published", sourceCommit: "a".repeat(40)}, "## v2.8.0-beta.1 — 2026-09-08 — Published beta", publishedDocs, "2026-09-08");
    expect(() => expectDocumentation({state: "published", sourceCommit: "a".repeat(40)}, "## Trust Core 2.8 development — Unreleased", candidateDocs, "2026-09-08")).toThrow();
  });
  it("rejects a published heading with a different date from its record", () => {
    expect(() => expectDocumentation({state: "published", sourceCommit: "a".repeat(40)}, "## v2.8.0-beta.1 — 2026-09-07 — Published beta", publishedDocs, "2026-09-08")).toThrow();
  });
  it("binds a synthetic published identity to validated record bytes", async () => {
    // Synthetic unit input only; the actual checkout must pass Git transition verification above.
    const old = await readJson(publicReleaseRecord.path);
    const record = { ...old, version: candidateVersion, sourceCommit: "a".repeat(40), attestation: {...old.attestation, subject: `pkg:npm/%40memi-design/cli@${candidateVersion}`} };
    const bytes = JSON.stringify(record);
    const engine = { version: candidateVersion, sourceCommit: record.sourceCommit, releaseRecord: {sha256: createHash("sha256").update(bytes).digest("hex")} };
    expectPublishedIdentity(engine, bytes);
    expect(() => expectPublishedIdentity({...engine, sourceCommit: "b".repeat(40)}, bytes)).toThrow();
    const unsignedBytes = JSON.stringify({...record, signature: {...record.signature, npmAuditSignaturesVerified: false}});
    expect(() => expectPublishedIdentity({...engine, releaseRecord: {sha256: createHash("sha256").update(unsignedBytes).digest("hex")}}, unsignedBytes)).toThrow();
    expect(() => expectPublishedIdentity({...engine, releaseRecord: {sha256: "0".repeat(64)}}, bytes)).toThrow();
  });
});
