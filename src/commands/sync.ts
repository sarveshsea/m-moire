import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";

export function registerSyncCommand(program: Command, engine: MemoireEngine) {
  program
    .command("sync")
    .description("Full sync: Figma → design system → regenerate all specs → preview")
    .action(async () => {
      await engine.init();

      console.log("\n  Starting full sync...\n");

      // Step 1: Connect to Figma if not connected
      try {
        await engine.ensureFigmaConnected(15000);
      } catch {
        console.log("  Figma not available — syncing from cached design system.\n");
      }

      // Step 2: Pull design system (if connected)
      if (engine.figma.isConnected) {
        await engine.pullDesignSystem();
      }

      // Step 3: Regenerate all specs
      await engine.fullSync();

      console.log("\n  Full sync complete.\n");
    });
}
