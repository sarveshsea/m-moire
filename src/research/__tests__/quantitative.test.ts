import { describe, expect, it } from "vitest";
import { analyzeQuantitativeSheet, assessResearchDataQuality } from "../quantitative.js";
import type { ParsedSheet } from "../excel-parser.js";
import type { ResearchStore } from "../engine.js";

function makeSheet(): ParsedSheet {
  return {
    sheetName: "Survey",
    headers: ["role", "csat", "nps", "time_to_value"],
    rows: [
      ["Admin", 3, 6, 18],
      ["Admin", 4, 7, 16],
      ["Admin", 3, 5, 20],
      ["Designer", 5, 9, 8],
      ["Designer", 4, 8, 10],
      ["Designer", 5, 10, 7],
      ["Engineer", 4, 8, 11],
      ["Engineer", 4, 9, 12],
    ],
    rowCount: 8,
    columnCount: 4,
  };
}

describe("quantitative research analysis", () => {
  it("computes descriptive stats, confidence intervals, and cohort deltas", () => {
    const result = analyzeQuantitativeSheet(makeSheet(), {
      source: "survey.csv",
      preferredCohortHeader: "role",
    });

    expect(result.metrics.length).toBe(3);
    const csat = result.metrics.find((metric) => metric.field === "csat");
    expect(csat?.mean).toBeGreaterThan(3.5);
    expect(csat?.confidenceInterval95).toBeDefined();
    expect(csat?.cohortComparisons.length).toBeGreaterThan(0);

    const nps = result.metrics.find((metric) => metric.field === "nps");
    expect(nps?.scaleType).toBe("nps-0-10");
    expect(nps?.nps).toBeDefined();
    expect(result.quality.sourceQualityScore).toBeGreaterThan(0);
  });

  it("scores overall research quality from store coverage and triangulation", () => {
    const store: ResearchStore = {
      version: 2,
      sources: [
        { id: "source-survey", name: "survey.csv", type: "csv", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "mixed", qualityScore: 88, sampleSize: 40, missingRate: 0.05 },
        { id: "source-interview", name: "interview.txt", type: "transcript", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "qualitative", qualityScore: 70 },
      ],
      observations: [],
      findings: [{
        id: "finding-1",
        statement: "Navigation is still confusing for admins",
        category: "pain-point",
        confidence: "high",
        themeIds: ["theme-1"],
        evidenceObservationIds: [],
        evidenceSourceIds: ["source-survey", "source-interview"],
        sourceTypeCount: 2,
        method: "mixed",
        caveats: [],
        tags: ["navigation"],
        entities: [],
        sentiment: "negative",
        signalTags: ["navigation"],
        createdAt: "2026-04-17T00:00:00.000Z",
      }],
      themes: [{ id: "theme-1", name: "Navigation", description: "", findingIds: ["finding-1"], frequency: 2, sourceCount: 2, sourceTypeCount: 2, confidence: "high", signalTags: ["navigation"], positiveCount: 0, negativeCount: 2 }],
      personas: [],
      quantitativeMetrics: analyzeQuantitativeSheet(makeSheet(), { source: "survey.csv", preferredCohortHeader: "role" }).metrics,
      opportunities: [],
      risks: [],
      contradictions: [],
      quality: {
        overallScore: 0,
        sampleSize: 0,
        completenessScore: 0,
        sourceDiversityScore: 0,
        triangulationScore: 0,
        structureScore: 0,
        notes: [],
        generatedAt: "2026-04-17T00:00:00.000Z",
      },
      methods: {
        analysisMode: "decision-grade",
        quantitativeApproach: "descriptive statistics + confidence intervals + cohort deltas",
        qualitativeApproach: "coded observations + evidence-backed theme synthesis",
        limitations: [],
      },
    };

    const quality = assessResearchDataQuality(store);
    expect(quality.overallScore).toBeGreaterThan(50);
    expect(quality.sourceDiversityScore).toBeGreaterThan(0);
    expect(quality.notes.length).toBeGreaterThan(0);
  });
});
