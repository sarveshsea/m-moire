import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerResearchCommand } from "../research.js";
import { captureLogs, lastLog } from "./test-helpers.js";

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, existsSync: vi.fn(() => true) };
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

describe("research --json", () => {
  it("emits a single structured payload for from-file --json", async () => {
    const logs = captureLogs();
    const program = new Command();

    registerResearchCommand(program, makeResearchEngine() as never);
    await program.parseAsync(["research", "from-file", "fixtures/interviews.csv", "--json"], { from: "user" });

    expect(logs).toHaveLength(1);
    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      action: "from-file",
      status: "completed",
      options: { json: true },
      source: {
        type: "file",
        path: "fixtures/interviews.csv",
      },
      summary: {
        observations: 6,
        findings: 3,
        themes: 2,
        personas: 1,
        sources: 2,
        quantitativeMetrics: 2,
      },
      artifacts: {
        researchDir: "/workspace/research",
        storePath: "/workspace/research/store.v2.json",
        notesDir: "/workspace/research/notes",
        reportMarkdownPath: "/workspace/research/reports/report.md",
        reportJsonPath: "/workspace/research/reports/report.json",
      },
    });
  });

  it("emits sticky metadata without preamble logs for from-stickies --json", async () => {
    const logs = captureLogs();
    const program = new Command();

    registerResearchCommand(program, makeResearchEngine({ figmaConnected: false }) as never);
    await program.parseAsync(["research", "from-stickies", "--json"], { from: "user" });

    expect(logs).toHaveLength(1);
    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      action: "from-stickies",
      status: "completed",
      stickies: {
        total: 5,
        clusters: 2,
        unclustered: 1,
        summary: "Processed 5 sticky notes",
        autoConnected: true,
      },
    });
  });

  it("emits synthesis, quality, and report metadata for JSON modes", async () => {
    const synthLogs = captureLogs();
    const synthProgram = new Command();
    registerResearchCommand(synthProgram, makeResearchEngine() as never);

    await synthProgram.parseAsync(["research", "synthesize", "--json"], { from: "user" });

    expect(synthLogs).toHaveLength(1);
    const synthPayload = JSON.parse(lastLog(synthLogs));
    expect(synthPayload).toMatchObject({
      action: "synthesize",
      status: "completed",
      synthesis: {
        summary: "Synthesized 2 themes",
        themes: 2,
        topTheme: "Navigation",
        personas: 1,
        opportunities: 2,
        topOpportunity: "Invest in Navigation",
        risks: 1,
        topRisk: "Navigation is a product risk",
        contradictions: 1,
        quantitativeMetrics: 2,
        qualityScore: 84,
        sampleSize: 42,
      },
    });

    vi.restoreAllMocks();

    const qualityLogs = captureLogs();
    const qualityProgram = new Command();
    registerResearchCommand(qualityProgram, makeResearchEngine() as never);

    await qualityProgram.parseAsync(["research", "quality", "--json"], { from: "user" });

    expect(qualityLogs).toHaveLength(1);
    const qualityPayload = JSON.parse(lastLog(qualityLogs));
    expect(qualityPayload).toMatchObject({
      action: "quality",
      status: "completed",
      quality: {
        overallScore: 84,
        sampleSize: 42,
        completenessScore: 92,
        sourceDiversityScore: 75,
        triangulationScore: 80,
        structureScore: 88,
      },
    });

    vi.restoreAllMocks();

    const reportLogs = captureLogs();
    const reportProgram = new Command();
    registerResearchCommand(reportProgram, makeResearchEngine() as never);

    await reportProgram.parseAsync(["research", "report", "--json"], { from: "user" });

    expect(reportLogs).toHaveLength(1);
    const reportPayload = JSON.parse(lastLog(reportLogs));
    expect(reportPayload).toMatchObject({
      action: "report",
      status: "completed",
      report: {
        markdownPath: "/workspace/research/reports/report.md",
        jsonPath: "/workspace/research/reports/report.json",
        markdownBytes: Buffer.byteLength("# Report\nOne finding\n", "utf-8"),
        markdownLines: 3,
      },
    });
  });
});

function makeResearchEngine(input?: { figmaConnected?: boolean }) {
  return {
    config: { projectRoot: "/workspace" },
    async init() {},
    async connectFigma() {},
    figma: {
      isConnected: input?.figmaConnected ?? true,
      async extractStickies() {
        return [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }, { text: "E" }];
      },
    },
    research: {
      async load() {},
      async fromFile() {},
      async fromStickies() {
        return {
          totalStickies: 5,
          clusters: [{}, {}],
          unclustered: [{}],
          summary: "Processed 5 sticky notes",
        };
      },
      async synthesize() {
        return {
          summary: "Synthesized 2 themes",
          themes: [{ name: "Navigation" }, { name: "Trust" }],
        };
      },
      async generateReport() {
        return "# Report\nOne finding\n";
      },
      assessQuality() {
        return {
          overallScore: 84,
          sampleSize: 42,
          completenessScore: 92,
          sourceDiversityScore: 75,
          triangulationScore: 80,
          structureScore: 88,
          notes: ["Coverage is strong."],
          generatedAt: "2026-04-17T00:00:00.000Z",
        };
      },
      getStore() {
        return {
          observations: [{}, {}, {}, {}, {}, {}],
          findings: [{ confidence: "high" }, { confidence: "low" }, { confidence: "medium" }],
          themes: [{ name: "Navigation" }, { name: "Trust" }],
          personas: [{ name: "PM" }],
          sources: [{ name: "CSV" }, { name: "FigJam" }],
          opportunities: [{ title: "Invest in Navigation" }, { title: "Invest in Trust" }],
          risks: [{ title: "Navigation is a product risk" }],
          contradictions: [{ topic: "Navigation" }],
          quantitativeMetrics: [{ field: "CSAT" }, { field: "NPS" }],
          quality: {
            overallScore: 84,
            sampleSize: 42,
            completenessScore: 92,
            sourceDiversityScore: 75,
            triangulationScore: 80,
            structureScore: 88,
          },
        };
      },
    },
  };
}
