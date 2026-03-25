/**
 * `memi go` — Single command that runs the entire pipeline:
 * init → connect → pull → auto-spec → generate → preview
 *
 * Zero friction. One command. Everything happens.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";

export function registerGoCommand(program: Command, engine: MemoireEngine) {
  program
    .command("go")
    .description("Run the full pipeline: connect → pull → generate → preview")
    .option("--no-preview", "Skip starting the preview server")
    .option("--no-generate", "Skip code generation (pull and auto-spec only)")
    .option("-p, --port <port>", "Preview server port", "3333")
    .action(async (opts) => {
      console.log("\n  Mémoire — starting full pipeline\n");

      // 1. Initialize
      await engine.init();
      console.log("");

      // 2. Connect to Figma
      if (!engine.figma.isConnected) {
        const port = await engine.connectFigma();
        console.log(`\n  Waiting for Figma plugin to connect on port ${port}...`);
        console.log("  Open the Mémoire plugin in Figma Desktop.\n");

        // Wait for connection with timeout
        await waitForConnection(engine, 120000);
      }

      // 3. Pull design system (auto-spec happens inside pull)
      console.log("");
      await engine.pullDesignSystem();

      // 4. Generate code from all specs
      if (opts.generate !== false) {
        console.log("");
        const specs = await engine.registry.getAllSpecs();
        let generated = 0;

        for (const spec of specs) {
          if (spec.type === "design" || spec.type === "ia") continue;
          try {
            await engine.generateFromSpec(spec.name);
            generated++;
          } catch (err) {
            console.log(`  ! Could not generate ${spec.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (generated > 0) {
          console.log(`\n  + Generated code for ${generated} specs\n`);
        }
      }

      // 5. Start preview
      if (opts.preview !== false) {
        const { PreviewServer } = await import("../preview/server.js");
        const previewPort = parseInt(opts.port, 10) || 3333;
        const preview = new PreviewServer(engine.config.projectRoot, previewPort);
        await preview.buildGallery(engine.registry);
        preview.start();
        console.log(`\n  Preview running at http://localhost:${previewPort}\n`);
      }

      console.log("  Pipeline complete. Mémoire is live.\n");
    });
}

function waitForConnection(engine: MemoireEngine, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (engine.figma.isConnected) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Figma plugin (2 minutes). Make sure the Mémoire plugin is running."));
    }, timeout);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const cleanup = () => {
      clearTimeout(timer);
      engine.figma.removeListener("plugin-connected", onConnect);
    };

    engine.figma.once("plugin-connected", onConnect);
  });
}
