import { describe, expect, it } from "vitest";
import { analyzeQuantitativeSheet, assessResearchDataQuality } from "../quantitative.js";
import type { ParsedSheet } from "../excel-parser.js";
import type { ResearchStore } from "../engine.js";
const sheet = (headers: string[], rows: unknown[][]): ParsedSheet => ({ sheetName: "Fixture", headers, rows, rowCount: rows.length, columnCount: headers.length } as ParsedSheet);
const store = (patch: Partial<ResearchStore> = {}): ResearchStore => ({ sources: [], findings: [], themes: [], quantitativeMetrics: [], ...patch } as ResearchStore);

describe("quantitative normalization and evidence release behavior", () => {
  it("marks empty or non-numeric sheets as unassessed with high missingness", () => {
    for (const input of [sheet([], []), sheet(["Notes", "Empty"], [["one", null], ["two", undefined], ["three", ""]])]) {
      const result = analyzeQuantitativeSheet(input); expect(result.metrics).toEqual([]); expect(result.quality).toMatchObject({ sampleSize: 0, missingRate: 1 }); expect(result.quality.notes).toContain("0 numeric fields detected");
    }
  });
  it("normalizes currency, percentages and finite numbers while preserving missing counts", () => {
    const input = sheet(["revenue_value"], [["$1,000"], ["25%"], [" 2.5 "], [null], [undefined], [false], [Infinity], ["not numeric"], [" "]]);
    const result = analyzeQuantitativeSheet(input); const metric = result.metrics[0];
    // Header hints require >=40% numeric nonempty cells; blanks never become zeros.
    expect(metric).toMatchObject({ source: "Fixture", field: "revenue_value", label: "Revenue Value", sampleSize: 3, missingCount: 6, min: 2.5, max: 1000, scaleType: "continuous" });
    expect(metric.mean).toBeCloseTo(1027.5 / 3); expect(result.quality.notes).toContain("1 numeric field detected");
    expect(input.rows[0][0]).toBe("$1,000");
  });
  it("uses numeric header hints only when the supported numeric proportion is met", () => {
    const rows = [1, 2, 3, "a", "b", "c", "d"].map(value => [value, value, value]);
    const result = analyzeQuantitativeSheet(sheet(["rating", "Notes", "count"], rows));
    expect(result.metrics.map(m => m.field)).toEqual(["rating", "count"]);
    expect(analyzeQuantitativeSheet(sheet(["score"], [[1], [2], ["a"], ["b"], ["c"]])).metrics).toEqual([]);
  });
  it.each([
    ["Recommend", [0, 7, 9, 10], "nps-0-10"], ["Rating", [1, 3, 5], "likert-1-5"],
    ["Rating", [1, 4, 7], "likert-1-7"], ["Count", [0, 4, 10], "scale-0-10"],
    ["Duration", [-1, 0, 15], "continuous"], ["Duration", [1.1, 2.2, 3.3], "continuous"],
  ] as const)("classifies %s scale %s as %s", (header, values, expected) => {
    const metric = analyzeQuantitativeSheet(sheet([header], values.map(v => [v]))).metrics[0]; expect(metric.scaleType).toBe(expected);
    expect(metric.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(values.length);
    if (expected === "nps-0-10") expect(metric.nps).toMatchObject({ promoterPct: 50, passivePct: 25, detractorPct: 25, score: 25 }); else expect(metric.nps).toBeUndefined();
  });
  it("computes exact small-sample quartiles and flags isolated outliers", () => {
    const metric = analyzeQuantitativeSheet(sheet(["duration"], [0, 1, 2, 3, 100].map(v => [v]))).metrics[0];
    expect(metric).toMatchObject({ median: 2, p25: 1, p75: 3, outlierCount: 1, mean: 21.2 }); expect(metric.confidenceInterval95?.low).toBeLessThan(metric.mean); expect(metric.confidenceInterval95?.high).toBeGreaterThan(metric.mean);
  });
  it.each(["role", "segment", "persona", "plan", "team"])("selects a supported %s cohort and omits rows without values", header => {
    const result = analyzeQuantitativeSheet(sheet([header, "rating"], [["A", 1], ["A", 2], ["B", 4], ["B", 5], [null, 3], ["A", null], ["B", " "]]), { source: "fixture.csv", preferredCohortHeader: "missing" });
    expect(result.metrics[0].cohortComparisons.map(c => [c.cohort, c.sampleSize, c.mean])).toEqual([["B", 2, 4.5], ["A", 2, 1.5]]); expect(result.quality.notes).toContain(`cohort comparisons enabled via ${header}`);
  });
  it.each([
    [["A", 1], ["B", 2], ["A", 3]],
    [["A", 1], ["A", 2], ["A", 3], ["A", 4]],
    [["A", 1], ["A", 2], ["A", 3], ["B", 4]],
    Array.from({ length: 14 }, (_, i) => [String(i % 7), i]),
  ].map(rows => ({ rows })))("rejects cohorts with insufficient repeated categories %#", ({ rows }) => {
    const result = analyzeQuantitativeSheet(sheet(["role", "rating"], rows), { source: "cohorts", preferredCohortHeader: "role" });
    expect(result.metrics.find(m => m.field === "rating")?.cohortComparisons).toEqual([]);
  });
  it("falls back from an invalid preferred cohort and filters singleton numeric groups", () => {
    const result = analyzeQuantitativeSheet(sheet(["preferred", "plan", "rating"], [["same", "A", 1], ["same", "A", 2], ["same", "B", 5], ["same", "B", null]]), { source: "test", preferredCohortHeader: "preferred" });
    expect(result.metrics[0].cohortComparisons).toEqual([expect.objectContaining({ cohort: "A", sampleSize: 2 })]);
  });
  it("labels weak or legacy stores with their missing evidence limits", () => {
    const empty = assessResearchDataQuality(store({ quantitativeMetrics: undefined })); expect(empty.sampleSize).toBe(0); expect(empty.notes.join(" ")).toContain("Low source diversity");
    const weak = assessResearchDataQuality(store({ sources: [{ type: "csv", sourceKind: "qualitative" }] as never, themes: [{}] as never, findings: [{}] as never, quantitativeMetrics: [{ sampleSize: 3, missingRate: 0.5 }] as never }));
    expect(weak.notes.join(" ")).toContain("sample size is still small"); expect(weak.notes.join(" ")).toContain("not yet triangulated");
  });
  it("recognizes diverse, complete, sufficiently sized and triangulated evidence", () => {
    const result = assessResearchDataQuality(store({ sources: ["csv", "excel", "transcript", "text"].map((type, i) => ({ type, sourceKind: i % 2 ? "mixed" : "quantitative" })) as never, findings: [{}] as never, themes: [{ sourceCount: 2 }, { sourceCount: 3 }] as never, quantitativeMetrics: [{ sampleSize: 60, missingRate: 0 }] as never }));
    expect(result).toMatchObject({ sampleSize: 60, completenessScore: 100, sourceDiversityScore: 100, triangulationScore: 100 }); expect(result.notes).toEqual([expect.stringContaining("strong enough")]);
  });
});
