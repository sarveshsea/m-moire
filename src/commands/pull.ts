import type { Command } from "commander";
import type { NocheEngine } from "../engine/core.js";

export function registerPullCommand(program: Command, engine: NocheEngine) {
  program
    .command("pull")
    .description("Pull design system from connected Figma file")
    .action(async () => {
      await engine.init();

      if (!engine.figma.isConnected) {
        console.log("\n  Not connected to Figma. Connecting...\n");
        await engine.connectFigma();
      }

      console.log("\n  Pulling design system...\n");
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
