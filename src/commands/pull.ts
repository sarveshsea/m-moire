import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";

export function registerPullCommand(program: Command, engine: ArkEngine) {
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
      console.log("\n  Done. Design system saved to .ark/design-system.json\n");
    });
}
