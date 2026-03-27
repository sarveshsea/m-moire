import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";

export function registerPullCommand(program: Command, engine: MemoireEngine) {
  program
    .command("pull")
    .description("Pull design system from connected Figma file")
    .action(async () => {
      await engine.init();

      try {
        await engine.ensureFigmaConnected();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`\n  ${msg}\n`);
        process.exit(1);
      }

      console.log("\n  Pulling design system...\n");
      await engine.pullDesignSystem();

      const specs = await engine.registry.getAllSpecs();
      const autoSpecs = specs.filter((s) => s.type === "component" && s.tags?.includes("auto-generated"));
      console.log(`\n  Done. Design system saved to .memoire/design-system.json`);
      if (autoSpecs.length > 0) {
        console.log(`  Auto-generated ${autoSpecs.length} component specs — run \`memi generate\` to create code`);
      }
      console.log("");
    });
}
