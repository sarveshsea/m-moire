import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { join } from "path";
import { existsSync } from "fs";

type ResearchAction = "from-file" | "from-stickies" | "from-transcript" | "web" | "synthesize" | "report";

interface ResearchArtifacts {
  researchDir: string;
  insightsPath: string;
  notesDir: string;
  reportPath: string;
}

interface ResearchSummary {
  insights: number;
  themes: number;
  personas: number;
  sources: number;
}

interface ResearchCommandPayload {
  action: ResearchAction;
  status: "completed";
  options: {
    json: boolean;
  };
  summary: ResearchSummary;
  artifacts: ResearchArtifacts;
  source?: {
    type: "file";
    path: string;
  };
  stickies?: {
    total: number;
    clusters: number;
    unclustered: number;
    summary: string;
    autoConnected: boolean;
  };
  synthesis?: {
    summary: string;
    themes: number;
    topTheme: string | null;
  };
  report?: {
    path: string;
    bytes: number;
    lines: number;
  };
}

export function registerResearchCommand(program: Command, engine: MemoireEngine) {
  const research = program
    .command("research")
    .description("Research pipeline — process data from multiple sources");

  research
    .command("from-file <path>")
    .description("Parse Excel/CSV research data")
    .option("--json", "Output file import result as JSON")
    .action(async (filePath: string, opts: { json?: boolean }) => {
      const json = Boolean(opts.json);
      if (!existsSync(filePath)) {
        console.error(`\n  File not found: ${filePath}\n`);
        process.exitCode = 1;
        return;
      }
      await engine.init();
      await engine.research.load();
      if (!json) {
        console.log(`\n  Processing: ${filePath}\n`);
      }
      await engine.research.fromFile(filePath);

      const fileSummary = buildResearchSummary(engine);

      if (json) {
        console.log(JSON.stringify({
          action: "from-file",
          status: "completed",
          options: { json: true },
          source: {
            type: "file",
            path: filePath,
          },
          summary: fileSummary,
          artifacts: buildResearchArtifacts(engine),
        } satisfies ResearchCommandPayload, null, 2));
        return;
      }

      if (fileSummary.insights === 0) {
        console.log("\n  Warning: No insights extracted — check your file format");
        console.log("  Supported formats: Excel (.xlsx), CSV (.csv)");
        console.log("  Expected columns: response/answer/feedback, rating/score, user/participant\n");
      } else {
        console.log(`\n  Extracted ${fileSummary.insights} insight${fileSummary.insights === 1 ? "" : "s"}, ${fileSummary.themes} theme${fileSummary.themes === 1 ? "" : "s"}, ${fileSummary.personas} persona${fileSummary.personas === 1 ? "" : "s"}`);
        console.log("  Insights saved to research/insights.json");
        console.log("  Markdown notes written to research/notes/");
        console.log("  Run `memi preview` to view the research dashboard\n");
      }
    });

  research
    .command("from-stickies")
    .description("Convert FigJam stickies from connected Figma file to research")
    .option("--json", "Output sticky import result as JSON")
    .action(async (opts: { json?: boolean }) => {
      const json = Boolean(opts.json);
      await engine.init();
      await engine.research.load();

      let autoConnected = false;
      if (!engine.figma.isConnected) {
        autoConnected = true;
        if (!json) {
          console.log("\n  Connecting to Figma...\n");
        }
        await engine.connectFigma();
      }

      if (!json) {
        console.log("\n  Reading FigJam stickies...\n");
      }
      const stickies = await engine.figma.extractStickies();
      const result = await engine.research.fromStickies(stickies);

      const stickiesSummary = buildResearchSummary(engine);

      if (json) {
        console.log(JSON.stringify({
          action: "from-stickies",
          status: "completed",
          options: { json: true },
          summary: stickiesSummary,
          artifacts: buildResearchArtifacts(engine),
          stickies: {
            total: result.totalStickies,
            clusters: result.clusters.length,
            unclustered: result.unclustered.length,
            summary: result.summary,
            autoConnected,
          },
        } satisfies ResearchCommandPayload, null, 2));
        return;
      }

      console.log(`\n  ${result.summary}`);
      if (stickiesSummary.insights === 0) {
        console.log("  Warning: No insights extracted — check your file format");
      } else {
        console.log(`  Extracted ${stickiesSummary.insights} insight${stickiesSummary.insights === 1 ? "" : "s"}, ${stickiesSummary.themes} theme${stickiesSummary.themes === 1 ? "" : "s"}, ${stickiesSummary.personas} persona${stickiesSummary.personas === 1 ? "" : "s"}`);
        console.log("  Insights saved to research/insights.json");
        console.log("  Markdown notes written to research/notes/");
        console.log("  Run `memi preview` to view the research dashboard\n");
      }
    });

  research
    .command("from-transcript <path>")
    .description("Parse interview transcripts, user testing sessions, or meeting notes")
    .option("--label <label>", "Label for the transcript source")
    .option("--json", "Output transcript analysis as JSON")
    .action(async (filePath: string, opts: { label?: string; json?: boolean }) => {
      const json = Boolean(opts.json);
      if (!existsSync(filePath)) {
        console.error(`\n  File not found: ${filePath}\n`);
        process.exitCode = 1;
        return;
      }
      await engine.init();
      await engine.research.load();

      if (!json) {
        console.log(`\n  Processing transcript: ${filePath}\n`);
      }

      const analysis = await engine.research.fromTranscript(filePath, opts.label);

      if (json) {
        console.log(JSON.stringify({
          action: "from-transcript" as const,
          status: "completed" as const,
          options: { json: true },
          summary: buildResearchSummary(engine),
          artifacts: buildResearchArtifacts(engine),
          transcript: {
            segments: analysis.segments.length,
            insights: analysis.insights.length,
            speakers: analysis.speakers.map(s => s.name),
            sentiment: analysis.sentiment,
            summary: analysis.summary,
          },
        }, null, 2));
        return;
      }

      console.log(`  ${analysis.summary}`);
      console.log(`\n  Speakers: ${analysis.speakers.map(s => `${s.name} (${s.wordCount} words)`).join(", ")}`);
      console.log(`  Insights: ${analysis.insights.length}`);
      console.log(`  Sentiment: +${analysis.sentiment.positive} -${analysis.sentiment.negative} ~${analysis.sentiment.mixed}`);
      console.log("\n  Insights saved to research/insights.json");
      console.log("  Markdown notes written to research/notes/\n");
    });

  research
    .command("web <topic>")
    .description("Research a topic from web URLs — fetches pages, extracts findings, cross-validates")
    .option("--urls <urls>", "Comma-separated URLs to research from")
    .option("--depth <depth>", "Research depth: quick, standard, deep", "standard")
    .option("--plan-only", "Show the research plan without executing")
    .option("--json", "Output web research result as JSON")
    .action(async (topic: string, opts: { urls?: string; depth?: string; planOnly?: boolean; json?: boolean }) => {
      const json = Boolean(opts.json);
      await engine.init();
      await engine.research.load();

      const { buildResearchPlan } = await import("../research/web-researcher.js");
      const depth = (opts.depth ?? "standard") as "quick" | "standard" | "deep";

      if (opts.planOnly) {
        const plan = buildResearchPlan(topic, { depth });
        if (json) {
          console.log(JSON.stringify({ action: "web", mode: "plan-only", plan }, null, 2));
        } else {
          console.log(`\n${plan.strategy}\n`);
        }
        return;
      }

      const urls = opts.urls?.split(",").map(u => u.trim()).filter(Boolean) ?? [];
      if (urls.length === 0) {
        // No URLs provided — show plan and suggest how to provide URLs
        const plan = buildResearchPlan(topic, { depth });
        if (json) {
          console.log(JSON.stringify({
            action: "web",
            mode: "plan-only",
            plan,
            hint: "Provide --urls to fetch and analyze. Or use the plan queries with a web search tool.",
          }, null, 2));
          return;
        }
        console.log(`\n${plan.strategy}`);
        console.log("\n  No URLs provided. Use --urls to specify pages to research:");
        console.log(`  memi research web "${topic}" --urls https://example.com/article1,https://example.com/article2`);
        console.log("\n  Or use the plan queries above with a web search tool, then pass the result URLs.\n");
        return;
      }

      if (!json) {
        console.log(`\n  Researching "${topic}" from ${urls.length} URLs...\n`);
      }

      const result = await engine.research.fromUrls(topic, urls);

      if (json) {
        console.log(JSON.stringify({
          action: "web" as const,
          status: "completed" as const,
          options: { json: true },
          summary: buildResearchSummary(engine),
          artifacts: buildResearchArtifacts(engine),
          web: {
            topic: result.topic,
            sources: result.sources.length,
            findings: result.findings.length,
            crossValidated: result.crossValidated.length,
            gaps: result.gaps,
            summary: result.summary,
          },
        }, null, 2));
        return;
      }

      console.log(`  ${result.summary}`);
      if (result.crossValidated.length > 0) {
        console.log(`\n  Cross-validated findings (${result.crossValidated.length}):`);
        for (const f of result.crossValidated.slice(0, 5)) {
          console.log(`    [${f.confidence}] ${f.text.slice(0, 100)}...`);
        }
      }
      if (result.gaps.length > 0) {
        console.log(`\n  Research gaps:`);
        for (const gap of result.gaps) {
          console.log(`    ! ${gap}`);
        }
      }
      console.log("\n  Insights saved to research/insights.json");
      console.log("  Markdown notes written to research/notes/\n");
    });

  research
    .command("synthesize")
    .description("Combine all research into unified insights")
    .option("--json", "Output synthesis result as JSON")
    .action(async (opts: { json?: boolean }) => {
      const json = Boolean(opts.json);
      await engine.init();
      await engine.research.load();

      if (!json) {
        console.log("\n  Synthesizing research...\n");
      }
      const { themes, summary } = await engine.research.synthesize();

      if (json) {
        console.log(JSON.stringify({
          action: "synthesize",
          status: "completed",
          options: { json: true },
          summary: buildResearchSummary(engine),
          artifacts: buildResearchArtifacts(engine),
          synthesis: {
            summary,
            themes: themes.length,
            topTheme: themes[0]?.name ?? null,
          },
        } satisfies ResearchCommandPayload, null, 2));
        return;
      }

      console.log(`\n  ${summary}\n`);
    });

  research
    .command("report")
    .description("Generate formatted research report")
    .option("--json", "Output report generation result as JSON")
    .action(async (opts: { json?: boolean }) => {
      const json = Boolean(opts.json);
      await engine.init();
      await engine.research.load();

      if (!json) {
        console.log("\n  Generating report...\n");
      }
      const report = await engine.research.generateReport();

      if (json) {
        const artifacts = buildResearchArtifacts(engine);
        console.log(JSON.stringify({
          action: "report",
          status: "completed",
          options: { json: true },
          summary: buildResearchSummary(engine),
          artifacts,
          report: {
            path: artifacts.reportPath,
            bytes: Buffer.byteLength(report, "utf-8"),
            lines: report.split(/\r?\n/).length,
          },
        } satisfies ResearchCommandPayload, null, 2));
        return;
      }

      console.log("  Report saved to research/reports/report.md");
      console.log("  Run `memi preview` to view the research dashboard\n");
    });
}

function buildResearchArtifacts(engine: MemoireEngine): ResearchArtifacts {
  const researchDir = join(engine.config.projectRoot, "research");
  return {
    researchDir,
    insightsPath: join(researchDir, "insights.json"),
    notesDir: join(researchDir, "notes"),
    reportPath: join(researchDir, "reports", "report.md"),
  };
}

function buildResearchSummary(engine: MemoireEngine): ResearchSummary {
  const store = engine.research.getStore();
  return {
    insights: store.insights.length,
    themes: store.themes.length,
    personas: store.personas.length,
    sources: store.sources.length,
  };
}
