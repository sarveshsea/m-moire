import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { writeTokenFiles, generateShadcnTokenMapping } from "../codegen/tailwind-tokens.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export function registerTokensCommand(program: Command, engine: MemoireEngine) {
  program
    .command("tokens")
    .description("Export design tokens as CSS / Tailwind / JSON")
    .option("-o, --output <dir>", "Output directory", "generated/tokens")
    .option("--shadcn", "Generate shadcn-compatible token mapping")
    .action(async (opts) => {
      await engine.init();

      const ds = engine.registry.designSystem;
      if (ds.tokens.length === 0) {
        console.log("\n  No design tokens found. Run `memi pull` first.\n");
        return;
      }

      const outputDir = join(engine.config.projectRoot, opts.output);
      console.log(`\n  Exporting ${ds.tokens.length} tokens...\n`);

      const files = await writeTokenFiles(ds.tokens, outputDir);
      console.log(`  CSS:      ${files.css}`);
      console.log(`  Tailwind: ${files.tailwind}`);
      console.log(`  JSON:     ${files.json}`);

      if (opts.shadcn) {
        const mapping = generateShadcnTokenMapping(ds.tokens);
        const mappingPath = join(outputDir, "shadcn-tokens.css");
        await writeFile(mappingPath, mapping);
        console.log(`  shadcn:   ${mappingPath}`);
      }

      console.log();
    });
}
