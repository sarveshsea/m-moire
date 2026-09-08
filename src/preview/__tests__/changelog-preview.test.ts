import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  applyChangelogData,
  parseChangelogMarkdown,
} from "../../../scripts/build-changelog-preview.mjs";

describe("preview changelog sync", () => {
  it("keeps preview/changelog.html generated from CHANGELOG.md", async () => {
    const root = process.cwd();
    const [markdown, currentHtml, releaseManifest] = await Promise.all([
      readFile(join(root, "CHANGELOG.md"), "utf-8"),
      readFile(join(root, "preview", "changelog.html"), "utf-8"),
      readFile(join(root, "release-manifest.json"), "utf-8").then(JSON.parse),
    ]);

    const releases = parseChangelogMarkdown(markdown);
    const generatedHtml = applyChangelogData(currentHtml, releases, {
      releaseState: releaseManifest.releaseGroups.engine.state,
    });

    const engine = releaseManifest.releaseGroups.engine as {
      version: string;
      state: string;
      previousPublicRelease?: { version: string };
      releaseRecord?: { path: string };
    };
    const changelogVersion = engine.state === "candidate"
      ? engine.previousPublicRelease?.version
      : engine.version;
    expect(changelogVersion).toBeDefined();
    expect(releases[0]).toMatchObject({
      version: `v${changelogVersion}`,
    });
    if (engine.state === "published") {
      expect(engine.releaseRecord?.path).toBeDefined();
      const record = JSON.parse(await readFile(join(root, engine.releaseRecord!.path), "utf8"));
      expect(record.version).toBe(engine.version);
      expect(releases[0].date).toBe(new Date(record.publishedAt).toISOString().slice(0, 10));
    }
    if (changelogVersion === "2.8.0-beta.1") {
      expect(releases[0].commits).not.toContainEqual(["53ef8686", "fix: verify promoted public surfaces"]);
      expect(releases[0].changes.some((change: string) => change.includes("four read tools"))).toBe(true);
    }
    if (engine.state === "candidate") {
      expect(markdown).toContain("## Trust Core 2.8 development — Unreleased");
      expect(markdown).not.toContain(`## v${engine.version} — Published`);
    }
    expect(generatedHtml).toContain(`memoire changelog - synced with CHANGELOG.md through ${releases[0].version}`);
    const expectedKicker = engine.state === "candidate" ? "Candidate release" : "Current release";
    expect(generatedHtml).toContain(`<span class="summary-kicker">${expectedKicker}</span>`);
    expect(currentHtml.replace(/\r\n/g, "\n")).toBe(
      generatedHtml.replace(/\r\n/g, "\n"),
    );
  });
});


describe("full semver published changelog headings", () => {
  const stable = "## v2.7.9 — 2026-08-08 — Published\n\n### Commits\n\n- `53ef8686` — fix: verify promoted public surfaces\n";
  it("keeps a frozen stable heading and its commit contract", () => {
    expect(parseChangelogMarkdown(stable)[0]).toMatchObject({version: "v2.7.9", date: "2026-08-08", commits: [["53ef8686", "fix: verify promoted public surfaces"]]});
  });
  it.each(["2.8.0-beta.1", "2.8.0-beta.1+build.7", "2.8.0+build.7"])("preserves full dated version %s", version => {
    const releases = parseChangelogMarkdown(`## v${version} — 2026-09-08 — Published beta\n\n### Changes\n- Four useful tools\n\n${stable}`);
    expect(releases.map((release: {version: string}) => release.version)).toEqual([`v${version}`, "v2.7.9"]);
    expect(releases[0]).toMatchObject({date: "2026-09-08", changes: ["Four useful tools"]});
  });
});
