import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";

export function registerResearchCommand(program: Command, engine: MemoireEngine) {
  const research = program
    .command("research")
    .description("Research pipeline — process data from multiple sources");

  research
    .command("from-file <path>")
    .description("Parse Excel/CSV research data")
    .action(async (filePath: string) => {
      await engine.init();
      await engine.research.load();
      console.log(`\n  Processing: ${filePath}\n`);
      await engine.research.fromFile(filePath);
      console.log("\n  Done. Insights saved to research/insights.json");
      console.log("  Markdown notes written to research/notes/");
      console.log("  Run `memi preview` to view the research dashboard\n");
    });

  research
    .command("from-stickies")
    .description("Convert FigJam stickies from connected Figma file to research")
    .action(async () => {
      await engine.init();
      await engine.research.load();

      if (!engine.figma.isConnected) {
        console.log("\n  Connecting to Figma...\n");
        await engine.connectFigma();
      }

      console.log("\n  Reading FigJam stickies...\n");
      const stickies = await engine.figma.extractStickies();
      const result = await engine.research.fromStickies(stickies);

      console.log(`\n  ${result.summary}`);
      console.log("  Insights saved to research/insights.json");
      console.log("  Markdown notes written to research/notes/");
      console.log("  Run `memi preview` to view the research dashboard\n");
    });

  research
    .command("synthesize")
    .description("Combine all research into unified insights")
    .action(async () => {
      await engine.init();
      await engine.research.load();

      console.log("\n  Synthesizing research...\n");
      const { summary } = await engine.research.synthesize();
      console.log(`\n  ${summary}\n`);
    });

  research
    .command("report")
    .description("Generate formatted research report")
    .action(async () => {
      await engine.init();
      await engine.research.load();

      console.log("\n  Generating report...\n");
      await engine.research.generateReport();
      console.log("  Report saved to research/reports/report.md");
      console.log("  Run `memi preview` to view the research dashboard\n");
    });
}
