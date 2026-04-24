import { describe, expect, it } from "vitest";
import { generateResearchReportMarkdown, synthesizeResearch } from "../synthesis.js";
import type { ResearchFinding, ResearchStore } from "../engine.js";

function makeFinding(overrides: Partial<ResearchFinding> = {}): ResearchFinding {
  return {
    id: `finding-${Math.random().toString(36).slice(2, 8)}`,
    statement: "Pain point: Navigation is confusing for new admins",
    category: "pain-point",
    confidence: "high",
    themeIds: [],
    evidenceObservationIds: ["obs-1"],
    evidenceSourceIds: ["source-interview-1"],
    sourceTypeCount: 1,
    method: "qualitative",
    caveats: [],
    tags: ["interview", "pain-point", "navigation"],
    entities: [],
    sentiment: "negative",
    signalTags: ["navigation"],
    createdAt: new Date().toISOString(),
    source: "interview-1",
    evidence: ["Users said they got lost in navigation"],
    ...overrides,
  };
}

function makeStore(): ResearchStore {
  return {
    version: 2,
    sources: [
      { id: "source-interview-1", name: "interview-1", type: "transcript", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "qualitative", qualityScore: 72 },
      { id: "source-survey", name: "survey.csv", type: "csv", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "mixed", qualityScore: 88, sampleSize: 42, missingRate: 0.05 },
      { id: "source-stickies", name: "figjam-stickies", type: "figjam-stickies", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "qualitative", qualityScore: 64 },
      { id: "source-web", name: "https://example.com/report", type: "web", processedAt: "2026-04-17T00:00:00.000Z", sourceKind: "qualitative", qualityScore: 70 },
    ],
    observations: [
      { id: "obs-1", sourceId: "source-interview-1", kind: "transcript-segment", text: "Navigation is confusing for new admins", actor: "Admin Olivia", cohort: "Admin", tags: ["navigation"], entities: [], sentiment: "negative", createdAt: "2026-04-17T00:00:00.000Z" },
      { id: "obs-2", sourceId: "source-survey", kind: "survey-response", text: "Admins want faster setup for navigation defaults", actor: "Admin Olivia", cohort: "Admin", tags: ["navigation", "setup"], entities: [], sentiment: "neutral", createdAt: "2026-04-17T00:00:00.000Z" },
      { id: "obs-3", sourceId: "source-stickies", kind: "sticky", text: "Designers want reusable dashboard sections", actor: "Designer Maya", cohort: "Designer", tags: ["dashboard", "section"], entities: [], sentiment: "positive", createdAt: "2026-04-17T00:00:00.000Z" },
      { id: "obs-4", sourceId: "source-web", kind: "web-finding", text: "Dashboard performance feels slow on first load", actor: "Engineer Kai", cohort: "Engineer", tags: ["dashboard", "performance"], entities: [], sentiment: "negative", createdAt: "2026-04-17T00:00:00.000Z" },
      { id: "obs-5", sourceId: "source-interview-1", kind: "transcript-segment", text: "The dashboard feels polished and easy to scan", actor: "Designer Maya", cohort: "Designer", tags: ["dashboard"], entities: [], sentiment: "positive", createdAt: "2026-04-17T00:00:00.000Z" },
    ],
    findings: [
      makeFinding({
        id: "f-1",
        statement: "Pain point: Navigation is confusing for new admins",
        evidenceObservationIds: ["obs-1"],
        evidenceSourceIds: ["source-interview-1"],
        source: "interview-1",
      }),
      makeFinding({
        id: "f-2",
        statement: "User goal: Admins want faster setup for navigation defaults",
        category: "goal",
        confidence: "medium",
        evidenceObservationIds: ["obs-2"],
        evidenceSourceIds: ["source-survey"],
        source: "survey.csv",
        sentiment: "neutral",
        signalTags: ["navigation", "setup"],
      }),
      makeFinding({
        id: "f-3",
        statement: "Feature request: Designers want reusable dashboard sections",
        category: "feature-request",
        confidence: "medium",
        evidenceObservationIds: ["obs-3"],
        evidenceSourceIds: ["source-stickies"],
        source: "figjam-stickies",
        sentiment: "positive",
        signalTags: ["dashboard", "section"],
      }),
      makeFinding({
        id: "f-4",
        statement: "User opinion: The dashboard feels polished and easy to scan",
        category: "opinion",
        confidence: "medium",
        evidenceObservationIds: ["obs-5"],
        evidenceSourceIds: ["source-interview-1"],
        source: "interview-1",
        sentiment: "positive",
        signalTags: ["dashboard", "navigation"],
      }),
      makeFinding({
        id: "f-5",
        statement: "Pain point: Dashboard performance feels slow on first load",
        category: "technical-constraint",
        confidence: "high",
        evidenceObservationIds: ["obs-4"],
        evidenceSourceIds: ["source-web"],
        source: "https://example.com/report",
        sentiment: "negative",
        signalTags: ["dashboard", "performance"],
      }),
    ],
    themes: [],
    personas: [],
    quantitativeMetrics: [
      {
        id: "metric-csat",
        source: "survey.csv",
        field: "csat",
        label: "CSAT",
        sampleSize: 42,
        missingCount: 2,
        missingRate: 0.05,
        min: 1,
        max: 5,
        mean: 3.9,
        median: 4,
        stdDev: 0.8,
        p25: 3,
        p75: 4.5,
        confidenceInterval95: { low: 3.66, high: 4.14 },
        scaleType: "likert-1-5",
        buckets: [],
        outlierCount: 1,
        cohortComparisons: [{ cohort: "Admin", sampleSize: 10, mean: 3.2, median: 3, deltaFromOverall: -0.7 }],
      },
    ],
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
}

describe("research synthesis", () => {
  it("builds themes, opportunities, risks, contradictions, and personas", () => {
    const store = makeStore();
    const result = synthesizeResearch(store);

    expect(result.findings[0]?.themeIds.length).toBeGreaterThan(0);
    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.themes[0]?.name).toBeTruthy();
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.risks.length).toBeGreaterThan(0);
    expect(result.contradictions.some((item) => item.topic === "Dashboard" || item.topic === "Navigation")).toBe(true);
    expect(result.personas.some((persona) => persona.name === "Admin Olivia")).toBe(true);
    expect(result.summary.qualityScore).toBeGreaterThan(0);
    expect(result.summary.quantitativeMetrics).toBe(1);
    expect(result.summary.nextActions.length).toBeGreaterThan(0);
  });

  it("generates a decision-ready markdown report", () => {
    const report = generateResearchReportMarkdown(makeStore());

    expect(report).toContain("## Executive Summary");
    expect(report).toContain("## Methods & Data Quality");
    expect(report).toContain("## Quantitative Findings");
    expect(report).toContain("## Opportunities");
    expect(report).toContain("## Risks");
    expect(report).toContain("## Contradictions");
    expect(report).toContain("## Recommended Next Moves");
    expect(report).toContain("## Source Appendix");
  });
});
