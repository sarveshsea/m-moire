import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { writeTokenFiles, generateShadcnTokenMapping, exportToStyleDictionary } from "../codegen/tailwind-tokens.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export function registerTokensCommand(program: Command, engine: MemoireEngine) {
  program
    .command("tokens")
    .description("Export design tokens as CSS / Tailwind / JSON")
    .option("-o, --output <dir>", "Output directory", "generated/tokens")
    .option("-f, --format <formats>", "Comma-separated formats: css,tailwind,json,style-dictionary (default: all)")
    .option("--shadcn", "Generate shadcn-compatible token mapping")
    .action(async (opts) => {
      await engine.init();

      const ds = engine.registry.designSystem;
      if (ds.tokens.length === 0) {
        console.log("\n  No design tokens found. Run `memi pull` first.\n");
        return;
      }

      const outputDir = join(engine.config.projectRoot, opts.output);
      const formats: Set<string> = opts.format
        ? new Set((opts.format as string).split(",").map((f: string) => f.trim().toLowerCase()))
        : new Set(["css", "tailwind", "json"]);

      console.log(`\n  Exporting ${ds.tokens.length} tokens (${[...formats].join(", ")})...\n`);

      const files = await writeTokenFiles(ds.tokens, outputDir, formats);
      if (files.css) console.log(`  CSS:              ${files.css}`);
      if (files.tailwind) console.log(`  Tailwind:         ${files.tailwind}`);
      if (files.json) console.log(`  JSON:             ${files.json}`);

      // Style Dictionary v4 W3C DTCG format
      if (formats.has("style-dictionary") || (!opts.format && true)) {
        const sdTokens = exportToStyleDictionary(ds.tokens);
        const sdPath = join(outputDir, "tokens.style-dictionary.json");
        await mkdir(outputDir, { recursive: true });
        await writeFile(sdPath, JSON.stringify(sdTokens, null, 2));
        console.log(`  Style Dictionary: ${sdPath}`);
      }

      if (opts.shadcn) {
        const mapping = generateShadcnTokenMapping(ds.tokens);
        const mappingPath = join(outputDir, "shadcn-tokens.css");
        await writeFile(mappingPath, mapping);
        console.log(`  shadcn:   ${mappingPath}`);
      }

      // Summary by category
      let colorCount = 0;
      let spacingCount = 0;
      let typographyCount = 0;
      let otherCount = 0;
      for (const token of ds.tokens) {
        const nameLower = token.name.toLowerCase();
        const typeLower = (token.type ?? "").toLowerCase();
        if (nameLower.includes("color") || nameLower.includes("bg") || nameLower.includes("text") || typeLower === "color") {
          colorCount++;
        } else if (nameLower.includes("space") || nameLower.includes("gap") || nameLower.includes("pad") || nameLower.includes("margin") || typeLower === "spacing") {
          spacingCount++;
        } else if (nameLower.includes("font") || nameLower.includes("size") || typeLower === "typography" || typeLower === "font") {
          typographyCount++;
        } else {
          otherCount++;
        }
      }
      console.log();
      const parts: string[] = [
        `${colorCount} color token${colorCount !== 1 ? "s" : ""}`,
        `${spacingCount} spacing token${spacingCount !== 1 ? "s" : ""}`,
        `${typographyCount} typography token${typographyCount !== 1 ? "s" : ""}`,
      ];
      if (otherCount > 0) parts.push(`${otherCount} other`);
      console.log(`  ${parts.join(", ")}`);
      console.log();
    });
}
