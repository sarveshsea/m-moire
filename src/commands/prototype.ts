import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { buildScenesFromSpecs, exportPrototype } from "../codegen/prototype-exporter.js";
import { join } from "path";

export function registerPrototypeCommand(program: Command, engine: MemoireEngine) {
  program
    .command("prototype")
    .description("Generate a cinematic prototype with Playwright video + interactive HTML")
    .option("-o, --output <dir>", "Output directory", "prototype")
    .option("-t, --transition <style>", "Transition style: fade, slide-left, slide-up, zoom, morph, cinematic", "cinematic")
    .option("-w, --width <px>", "Viewport width", "1440")
    .option("-h, --height <px>", "Viewport height", "900")
    .option("--no-video", "Skip Playwright video recording")
    .option("--preview-url <url>", "Preview server URL", "http://localhost:5173")
    .action(async (opts) => {
      await engine.init();

      const outputDir = join(engine.config.projectRoot, opts.output);

      console.log("\n  Building cinematic prototype...\n");

      // Build scenes from all specs
      const scenes = await buildScenesFromSpecs(engine.registry, opts.previewUrl);

      if (scenes.length === 0) {
        console.log("  No specs found. Create some with `memi spec` first.\n");
        return;
      }

      const result = await exportPrototype(scenes, {
        outputDir,
        previewUrl: opts.previewUrl,
        viewport: { width: parseInt(opts.width), height: parseInt(opts.height) },
        transitions: opts.transition,
        recordVideo: opts.video !== false,
        captureScreenshots: true,
      });

      console.log(`  Generated ${scenes.length} scenes:\n`);
      for (let i = 0; i < scenes.length; i++) {
        console.log(`    ${i + 1}. ${scenes[i].name} (${scenes[i].duration / 1000}s, ${scenes[i].transition})`);
      }

      console.log(`\n  Files:`);
      console.log(`    Playwright: ${result.playwright}`);
      console.log(`    HTML:       ${result.html}`);
      console.log(`\n  To run the video recording:`);
      console.log(`    npx playwright test ${result.playwright}`);
      console.log(`\n  To view the interactive prototype:`);
      console.log(`    open ${result.html}\n`);
    });
}
