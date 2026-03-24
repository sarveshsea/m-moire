import type { Command } from "commander";
import type { NocheEngine } from "../engine/core.js";

export function registerPullCommand(program: Command, engine: NocheEngine) {
  program
    .command("pull")
    .description("Pull design system from Figma (REST API or plugin)")
    .action(async () => {
      await engine.init();

      // If we have a token + file key, REST pull doesn't need the plugin
      const token = engine.config.figmaToken || process.env.FIGMA_TOKEN;
      const fileKey = engine.config.figmaFileKey || process.env.FIGMA_FILE_KEY;

      if (!token || !fileKey) {
        if (!engine.figma.isConnected) {
          console.log("\n  No FIGMA_TOKEN/FIGMA_FILE_KEY — falling back to plugin.\n");
          console.log("  Tip: run `noche connect` first, or add FIGMA_TOKEN + FIGMA_FILE_KEY to .env.local\n");
          process.exit(1);
        }
      }

      console.log("\n  Pulling design system from Figma…\n");
      await engine.pullDesignSystem();

      const specs = await engine.registry.getAllSpecs();
      const autoSpecs = specs.filter((s) => s.type === "component" && s.tags?.includes("auto-generated"));
      console.log(`\n  Done. Design system saved to .noche/design-system.json`);
      if (autoSpecs.length > 0) {
        console.log(`  Auto-generated ${autoSpecs.length} component specs — run \`noche generate\` to create code`);
      }
      console.log("");
    });
}
