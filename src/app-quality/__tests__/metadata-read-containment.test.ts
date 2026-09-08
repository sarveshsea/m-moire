import { link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadPolicy } from "../policy.js";
import { readBaseline } from "../baseline.js";
import { readHistory } from "../history.js";
import { buildAppGraph } from "../app-graph.js";
import { diagnoseAppQuality } from "../engine.js";
import { composeReport } from "../../reporters/report-html.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(path: string, content: string, mode: "symlink" | "hardlink") {
  const base = await mkdtemp(join(tmpdir(), "memi-metadata-containment-")); roots.push(base);
  const projectRoot = join(base, "repo"); const outside = join(base, "outside.json");
  const target = join(projectRoot, path); await mkdir(dirname(target), { recursive: true }); await writeFile(outside, content);
  if (mode === "symlink") await symlink(outside, target); else await link(outside, target);
  return projectRoot;
}

describe.each(["symlink", "hardlink"] as const)("metadata source authority: %s", mode => {
  it("rejects an unsafe existing policy rather than silently disabling team gates", async () => {
    const root = await fixture("memoire.policy.json", JSON.stringify({ schemaVersion: 1, thresholds: { maxColorUtilities: 999 } }), mode);
    await expect(loadPolicy(root)).rejects.toThrow(/read|contained|safe/i);
  });
  it("rejects an unsafe existing baseline", async () => {
    const root = await fixture(".memoire/baseline.json", JSON.stringify({ schemaVersion: 1, acceptedAt: "OUTSIDE_SENTINEL", entries: [] }), mode);
    await expect(readBaseline(root)).rejects.toThrow(/read|contained|safe/i);
  });
  it("omits outside history records", async () => {
    const root = await fixture(".memoire/app-quality/history.jsonl", JSON.stringify({ at: "OUTSIDE_SENTINEL" }) + "\n", mode);
    expect(await readHistory(root)).toEqual([]);
  });
  it("does not import outside package metadata into the graph", async () => {
    const root = await fixture("package.json", JSON.stringify({ name: "OUTSIDE_SENTINEL" }), mode);
    expect(JSON.stringify(await buildAppGraph({ projectRoot: root, sources: [] }))).not.toContain("OUTSIDE_SENTINEL");
  });
  it("omits outside persisted report content", async () => {
    const clean = await mkdtemp(join(tmpdir(), "memi-report-fixture-")); roots.push(clean);
    const diagnosis = await diagnoseAppQuality({ projectRoot: clean, write: false });
    const content = JSON.stringify({ ...diagnosis, summary: { ...diagnosis.summary, verdict: "OUTSIDE_SENTINEL" } });
    const root = await fixture(".memoire/app-quality/diagnosis.json", content, mode);
    const report = await composeReport({ projectRoot: root });
    expect(report.html + report.markdown).not.toContain("OUTSIDE_SENTINEL");
    expect(report.missing).toContain("diagnosis (run `memi diagnose` first)");
  });
});

it("keeps absent policy and baseline fallbacks", async () => {
  const root = await mkdtemp(join(tmpdir(), "memi-absent-metadata-")); roots.push(root);
  expect((await loadPolicy(root)).source).toBe("default");
  expect(await readBaseline(root)).toBeNull();
  expect(await readHistory(root)).toEqual([]);
});
