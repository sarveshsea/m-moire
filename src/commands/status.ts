import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";

export function registerStatusCommand(program: Command, engine: ArkEngine) {
  program
    .command("status")
    .description("Show project status")
    .action(async () => {
      await engine.init();
      await engine.research.load();

      const project = engine.project;
      const specs = await engine.registry.getAllSpecs();
      const ds = engine.registry.designSystem;
      const research = engine.research.getStore();

      console.log("\n  ┌─────────────────────────────────────────┐");
      console.log("  │            Noche Project Status            │");
      console.log("  └─────────────────────────────────────────┘\n");

      // Project
      console.log("  Project");
      console.log(`    Framework:    ${project?.framework ?? "not detected"}`);
      console.log(`    Language:     ${project?.language ?? "unknown"}`);
      console.log(`    Tailwind:     ${project?.styling.tailwind ? "yes" : "no"}`);
      console.log(`    shadcn:       ${project?.shadcn.installed ? `yes (${project.shadcn.components.length} components)` : "no"}`);

      // Figma
      console.log("\n  Figma");
      console.log(`    Connected:    ${engine.figma.isConnected ? "yes" : "no"}`);
      console.log(`    Tokens:       ${ds.tokens.length}`);
      console.log(`    Components:   ${ds.components.length}`);
      console.log(`    Styles:       ${ds.styles.length}`);
      console.log(`    Last sync:    ${ds.lastSync}`);

      // Specs
      const components = specs.filter((s) => s.type === "component");
      const pages = specs.filter((s) => s.type === "page");
      const dataviz = specs.filter((s) => s.type === "dataviz");
      const generated = specs.filter((s) => engine.registry.getGenerationState(s.name));

      console.log("\n  Specs");
      console.log(`    Components:   ${components.length}`);
      console.log(`    Pages:        ${pages.length}`);
      console.log(`    DataViz:      ${dataviz.length}`);
      console.log(`    Generated:    ${generated.length}/${specs.length}`);

      // Research
      console.log("\n  Research");
      console.log(`    Insights:     ${research.insights.length}`);
      console.log(`    Themes:       ${research.themes.length}`);
      console.log(`    Sources:      ${research.sources.length}`);

      const highConf = research.insights.filter((i) => i.confidence === "high").length;
      if (highConf > 0) {
        console.log(`    High conf:    ${highConf}`);
      }

      console.log();
    });
}
