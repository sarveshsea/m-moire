import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResearchEngine } from "../engine.js";
const webResearch = vi.hoisted(() => vi.fn());
vi.mock("../web-researcher.js", () => ({ executeWebResearch: webResearch }));
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function restore(value: unknown) {
  const outputDir = await mkdtemp(join(tmpdir(), "memi-research-restore-"));
  dirs.push(outputDir);
  await writeFile(join(outputDir, "store.v2.json"), JSON.stringify(value));
  const engine = new ResearchEngine({ outputDir });
  await engine.load();
  return engine.getStore();
}
const collections = ["sources", "observations", "highlights", "codebook", "findings", "themes", "evidenceLinks", "personas", "quantitativeMetrics", "opportunities", "risks", "contradictions", "reports"] as const;

describe("research store restoration boundary", () => {
  it.each([null, false, 12, {}, { sources: {}, findings: "invalid", quality: false, methods: 2 }])("restores an empty usable store from %j", async (value) => {
    const store = await restore(value);
    expect(store.version).toBe(2);
    for (const key of collections) expect(store[key]).toEqual([]);
    expect(store.quality.sampleSize).toBe(0);
    expect(store.summary).toBeUndefined();
    expect(store.methods.analysisMode).toBe("decision-grade");
  });

  it.each([null, false, 12, {}, { id: 3, text: false, tags: {}, confidence: "certain", method: "unknown" }])("normalizes incomplete collection records %j", async (record) => {
    const store = await restore(Object.fromEntries(collections.map((key) => [key, [record]])));
    for (const key of collections) expect(store[key]).toHaveLength(1);
    expect(store.sources[0]).toMatchObject({ name: "unknown", type: "unknown", notes: [] });
    expect(store.observations[0]).toMatchObject({ text: "", tags: [], numericFields: undefined });
    expect(store.findings[0]).toMatchObject({ statement: "", confidence: "low", method: "qualitative", evidenceObservationIds: [] });
    expect(store.highlights[0]).toMatchObject({ text: "", codeIds: [] });
    expect(store.codebook[0]).toMatchObject({ label: "Code", highlightIds: [] });
    expect(store.evidenceLinks[0]).toMatchObject({ label: "Evidence", sourceId: "source-unknown" });
    expect(store.quantitativeMetrics[0]).toMatchObject({ field: "metric", mean: 0, scaleType: "continuous", confidenceInterval95: undefined, nps: undefined });
    expect(store.personas[0]).toMatchObject({ name: "Persona", role: "participant", goals: [] });
    expect(store.opportunities[0]).toMatchObject({ priority: "low", evidenceFindingIds: [] });
    expect(store.risks[0]).toMatchObject({ severity: "low", evidenceFindingIds: [] });
    expect(store.contradictions[0]).toMatchObject({ positiveFindingIds: [], negativeFindingIds: [] });
    expect(store.reports[0]).toMatchObject({ title: "Research report", kind: "recommendations" });
  });

  it("preserves supported metadata and migrates legacy evidence aliases", async () => {
    const createdAt = "2026-09-01T00:00:00.000Z";
    const store = await restore({
      sources: [{ id: "s", name: "Survey", type: "csv", processedAt: createdAt, itemCount: 2, qualityScore: 90, sampleSize: 2, missingRate: 0, sourceKind: "mixed", notes: ["Cohort A"] }],
      observations: [{ id: "obs-20", sourceId: "s", kind: "survey-response", text: "Clear navigation", actor: "P1", cohort: "A", timestamp: createdAt, numericFields: { score: 4, invalid: "5", absent: null }, tags: ["navigation"], entities: ["menu"], sentiment: "positive", createdAt }],
      findings: [{ id: "finding-9", finding: "Navigation helps", category: "usability", confidence: "high", themeIds: ["t"], evidenceObservationIds: ["obs-20"], evidenceSourceIds: ["s"], sourceTypeCount: 2, method: "mixed", caveats: ["Small sample"], tags: ["nav"], entities: ["menu"], sentiment: "positive", signalTags: ["clarity"], createdAt, source: "Survey", evidence: ["Clear navigation"] }],
      themes: [{ id: "t", name: "Navigation", description: "Findability", insights: ["finding-9"], frequency: 2, sourceCount: 1, sourceTypeCount: 2, confidence: "high", signalTags: ["clarity"], positiveCount: 1, negativeCount: 0 }],
      highlights: [{ id: "h", sourceId: "s", observationId: "obs-20", text: "Clear navigation", note: "Keep labels", tags: ["nav"], codeIds: ["c"], sentiment: "positive", createdAt }],
      codebook: [{ id: "c", label: "Clarity", description: "Easy to find", color: "blue", parentId: "parent", highlightIds: ["h"], createdAt }],
      evidenceLinks: [{ id: "e", sourceId: "s", findingId: "finding-9", highlightId: "h", label: "Source", href: "https://example.test/source", sourcePath: "survey.csv", createdAt }],
      personas: [{ name: "Designer", role: "IC", goals: ["Find settings"], painPoints: ["Hidden menus"], behaviors: ["Search"], source: "Survey", quote: "Clear navigation", confidence: "medium", evidenceInsightIds: ["finding-9"] }],
      opportunities: [{ title: "Labels", summary: "Keep visible", theme: "Navigation", priority: "high", confidence: "medium", evidenceInsightIds: ["finding-9"], sourceCount: 1 }],
      risks: [{ title: "Hidden menu", summary: "Slower navigation", theme: "Navigation", severity: "high", evidenceInsightIds: ["finding-9"], sourceCount: 1 }],
      contradictions: [{ topic: "Navigation", positiveInsightIds: ["finding-9"], negativeInsightIds: ["finding-10"], summary: "Cohorts differ" }],
      reports: [{ id: "r", title: "Evidence", kind: "quote-reel", summary: "Participant quotes", artifactPath: "quotes.md", evidenceFindingIds: ["finding-9"], createdAt }],
      summary: { narrative: "Clear labels help", topThemes: ["Navigation"], topOpportunities: ["Labels"], topRisks: ["Hidden menu"], contradictionCount: 1, nextActions: ["Test"], generatedAt: createdAt, qualityScore: 90, sampleSize: 2, quantitativeMetrics: 0, coverage: { observations: 1, findings: 1, highConfidence: 1, personas: 1, themes: 1, sources: 1, quantitativeMetrics: 0 } },
      quality: { overallScore: 90, sampleSize: 2, completenessScore: 90, sourceDiversityScore: 50, triangulationScore: 20, structureScore: 100, notes: ["Small sample"], generatedAt: createdAt },
      methods: { quantitativeApproach: "descriptive", qualitativeApproach: "coding", limitations: ["Small sample"] },
    });
    expect(store.observations[0].numericFields).toEqual({ score: 4 });
    expect(store.observations[0]).toMatchObject({ actor: "P1", cohort: "A", createdAt });
    expect(store.findings[0]).toMatchObject({ statement: "Navigation helps", sourceTypeCount: 2, method: "mixed" });
    expect(store.themes[0].findingIds).toEqual(["finding-9"]);
    expect(store.personas[0].evidenceFindingIds).toEqual(["finding-9"]);
    expect(store.opportunities[0].evidenceFindingIds).toEqual(["finding-9"]);
    expect(store.risks[0].evidenceFindingIds).toEqual(["finding-9"]);
    expect(store.contradictions[0]).toMatchObject({ positiveFindingIds: ["finding-9"], negativeFindingIds: ["finding-10"] });
    expect(store.summary).toMatchObject({ narrative: "Clear labels help", coverage: { observations: 1, sources: 1 } });
    expect(store.evidenceLinks[0]).toMatchObject({ href: "https://example.test/source", sourcePath: "survey.csv" });
    expect(store.reports[0]).toMatchObject({ kind: "quote-reel", artifactPath: "quotes.md" });
  });

  it.each([
    [null, null, undefined, undefined],
    [{ low: "1", high: 3 }, { promoterPct: "10" }, undefined, undefined],
    [{ low: 1, high: "3" }, { promoterPct: 10, passivePct: "20" }, undefined, undefined],
    [{ low: 1, high: 3 }, { promoterPct: 50, passivePct: 30, detractorPct: 20, score: 30 }, { low: 1, high: 3 }, { promoterPct: 50, passivePct: 30, detractorPct: 20, score: 30 }],
  ])("validates restored metric intervals and NPS %j", async (confidenceInterval95, nps, expectedInterval, expectedNps) => {
    const metric = { id: "m", source: "survey", field: "rating", label: "Rating", sampleSize: 4, missingCount: 1, missingRate: 0.2, min: 1, max: 5, mean: 3, median: 3, stdDev: 1, p25: 2, p75: 4, scaleType: "likert-1-5", outlierCount: 0, confidenceInterval95, nps, buckets: [null, { label: "High", count: 2, percentage: 50 }], cohortComparisons: [null, { cohort: "A", sampleSize: 2, mean: 4, median: 4, deltaFromOverall: 1 }] };
    const store = await restore({ quantitativeMetrics: [metric], summary: {}, quality: {}, methods: {} });
    expect(store.quantitativeMetrics[0]).toMatchObject({ id: "m", mean: 3, scaleType: "likert-1-5" });
    expect(store.quantitativeMetrics[0].confidenceInterval95).toEqual(expectedInterval);
    expect(store.quantitativeMetrics[0].nps).toEqual(expectedNps);
    expect(store.quantitativeMetrics[0].buckets).toEqual([{ label: "Bucket", count: 0, percentage: 0 }, { label: "High", count: 2, percentage: 50 }]);
    expect(store.quantitativeMetrics[0].cohortComparisons[0]).toMatchObject({ cohort: "Unknown", sampleSize: 0 });
    expect(store.summary?.coverage.observations).toBe(0);
  });
});


describe("research evidence compatibility", () => {
  it.each(["qualitative", "quantitative", "mixed", "netnography", "desk"])("preserves supported research method %s", async (method) => {
    const store = await restore({ sources: [{ sourceKind: method }], findings: [{ method }] });
    expect(store.sources[0].sourceKind).toBe(method);
    expect(store.findings[0].method).toBe(method);
  });
  it.each(["survey-response", "transcript-segment", "sticky", "web-finding", "netnography-observation"])("preserves observation provenance %s", async (kind) => {
    expect((await restore({ observations: [{ kind }] })).observations[0].kind).toBe(kind);
  });
  it.each(["opportunity-map", "theme-matrix", "evidence-table", "quote-reel", "journey-map", "recommendations"])("preserves report artifact kind %s", async (kind) => {
    expect((await restore({ reports: [{ kind }] })).reports[0].kind).toBe(kind);
  });
  it.each(["nps-0-10", "likert-1-5", "likert-1-7", "scale-0-10", "continuous"])("preserves measurement scale %s", async (scaleType) => {
    expect((await restore({ quantitativeMetrics: [{ scaleType }] })).quantitativeMetrics[0].scaleType).toBe(scaleType);
  });
  it("keeps web findings tied to known source URLs and replaces reingested evidence", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "memi-web-evidence-"));
    dirs.push(outputDir);
    const engine = new ResearchEngine({ outputDir });
    await engine.load();
    const sources = [{ url: "https://example.test/a", title: "Interview", relevanceScore: 80 }, { url: "https://example.test/b", title: "Survey", relevanceScore: 90 }];
    const finding = { text: "Users need visible navigation labels to find settings.", category: "usability", confidence: "high", entities: ["navigation"], sourceUrls: sources.map((source) => source.url) };
    webResearch.mockResolvedValue({ sources, findings: [finding, { ...finding, text: "Unknown claim", sourceUrls: ["https://unknown.test"] }, { ...finding, text: "Unattributed claim", sourceUrls: [] }], summary: "Reviewed two sources" });
    await engine.fromUrls("Navigation", sources.map((source) => source.url));
    expect(engine.getStore().observations).toHaveLength(1);
    expect(engine.getFindings()).toHaveLength(1);
    expect(engine.getFindings()[0].evidenceSourceIds).toHaveLength(2);
    expect(engine.getFindings()[0].caveats).toEqual([]);
    webResearch.mockResolvedValue({ sources, findings: [{ ...finding, text: "The menu is hidden and hard to find.", sourceUrls: [sources[0].url] }], summary: "Refreshed sources" });
    await engine.fromUrls("Navigation", sources.map((source) => source.url));
    expect(engine.getStore().observations).toHaveLength(1);
    expect(engine.getStore().observations[0].text).toBe("The menu is hidden and hard to find.");
    expect(engine.getFindings()[0].caveats).toEqual(["Single-source web claim."]);
  });
});
