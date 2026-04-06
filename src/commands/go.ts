/**
 * `memi go` — Single command that runs the entire pipeline:
 * init → connect → pull → auto-spec → generate → preview
 *
 * Zero friction. One command. Everything happens.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import ora from "ora";
import { ui } from "../tui/format.js";

export interface GoPayload {
  status: "completed" | "partial" | "failed";
  steps: {
    init: boolean;
    figma: { connected: boolean; skipped: boolean; error?: string };
    pull: { completed: boolean; tokens: number; components: number };
    generate: { completed: boolean; skipped: boolean; generated: number; failed: number };
    preview: { started: boolean; skipped: boolean; port?: number };
  };
  elapsedMs: number;
  error?: string;
}

export function registerGoCommand(program: Command, engine: MemoireEngine) {
  program
    .command("go")
    .description("Run the full pipeline: connect → pull → generate → preview")
    .option("--no-preview", "Skip starting the preview server")
    .option("--no-generate", "Skip code generation (pull and auto-spec only)")
    .option("--no-figma", "Skip Figma connection (offline mode — generate from existing specs)")
    .option("--rest", "Pull via Figma REST API instead of plugin (skips connect step)")
    .option("-p, --port <port>", "Preview server port", "3333")
    .option("--json", "Output pipeline results as JSON")
    .action(async (opts) => {
      const start = Date.now();
      const json = opts.json as boolean | undefined;
      const steps: GoPayload["steps"] = {
        init: false,
        figma: { connected: false, skipped: false },
        pull: { completed: false, tokens: 0, components: 0 },
        generate: { completed: false, skipped: false, generated: 0, failed: 0 },
        preview: { started: false, skipped: false },
      };

      if (!json) console.log(ui.brand("FULL PIPELINE"));

      // 1. Initialize
      const initSpinner = !json ? ora({ text: "Initializing...", indent: 2, color: "cyan" }).start() : null;
      await engine.init();
      steps.init = true;
      initSpinner?.stop();
      if (!json) console.log(ui.ok("Project initialized"));

      // 2. Connect to Figma (skip if --no-figma or --rest)
      if (opts.figma === false) {
        steps.figma.skipped = true;
        if (!json) console.log(ui.skip("Figma connection (offline mode)"));
      } else if (opts.rest) {
        // REST mode — skip WebSocket connection entirely
        steps.figma.skipped = true;
        if (!json) console.log(ui.skip("Figma plugin (REST mode)"));
      } else if (!engine.figma.isConnected) {
        try {
          const port = await engine.connectFigma();
          if (!json) {
            console.log(ui.active(`Waiting for Figma plugin on port ${port}...`));
            console.log("    Open the Memoire plugin in Figma Desktop.");
          }
          await waitForConnection(engine, 120000);
          steps.figma.connected = true;
          if (!json) console.log(ui.ok("Figma connected"));
        } catch (err) {
          steps.figma.error = err instanceof Error ? err.message : String(err);
          if (!json) console.log(ui.warn("Figma: " + steps.figma.error));
        }
      } else {
        steps.figma.connected = true;
        if (!json) console.log(ui.ok("Figma already connected"));
      }

      // 3. Pull design system
      if (opts.rest && opts.figma !== false) {
        // REST pull — no plugin needed
        const pullSpinner = !json ? ora({ text: "Pulling design system via REST API...", indent: 2, color: "cyan" }).start() : null;
        try {
          await engine.pullDesignSystemREST();
          const ds = engine.registry.designSystem;
          steps.pull = { completed: true, tokens: ds.tokens.length, components: ds.components.length };
          pullSpinner?.stop();
          if (!json) console.log(ui.ok(`Pulled ${ds.tokens.length} tokens, ${ds.components.length} components (REST)`));
        } catch (err) {
          pullSpinner?.stop();
          steps.figma.error = err instanceof Error ? err.message : String(err);
          if (!json) console.log(ui.warn("REST pull failed: " + steps.figma.error));
        }
      } else if (opts.figma !== false && engine.figma.isConnected) {
        const pullSpinner = !json ? ora({ text: "Pulling design system...", indent: 2, color: "cyan" }).start() : null;
        await engine.pullDesignSystem();
        const ds = engine.registry.designSystem;
        steps.pull = { completed: true, tokens: ds.tokens.length, components: ds.components.length };
        pullSpinner?.stop();
        if (!json) console.log(ui.ok(`Pulled ${ds.tokens.length} tokens, ${ds.components.length} components`));
      }

      // 4. Generate code from all specs
      if (opts.generate !== false) {
        const specs = await engine.registry.getAllSpecs();
        let generated = 0;
        let failed = 0;

        if (!json) {
          console.log(ui.section("CODEGEN"));
        }

        for (const spec of specs) {
          if (spec.type === "design" || spec.type === "ia") continue;
          try {
            await engine.generateFromSpec(spec.name);
            generated++;
            if (!json) console.log(ui.ok(spec.name));
          } catch (err) {
            failed++;
            if (!json) console.log(ui.warn(spec.name + ui.dim("  " + (err instanceof Error ? err.message : String(err)))));
          }
        }

        steps.generate = { completed: true, skipped: false, generated, failed };
      } else {
        steps.generate.skipped = true;
        if (!json) console.log(ui.skip("Code generation"));
      }

      // 5. Start preview
      if (opts.preview !== false && !json) {
        const { PreviewServer } = await import("../preview/server.js");
        const previewPort = parseInt(opts.port, 10) || 3333;
        const preview = new PreviewServer(engine.config.projectRoot, previewPort);
        await preview.buildGallery(engine.registry);
        preview.start();
        steps.preview = { started: true, skipped: false, port: previewPort };

        console.log();
        console.log(ui.ok(`Preview running at http://localhost:${previewPort}`));

        const cleanup = () => {
          console.log();
          console.log(ui.dim("  Shutting down..."));
          preview.stop();
          if (opts.figma !== false) {
            engine.figma.disconnect();
          }
          process.exit(0);
        };
        process.once("SIGINT", cleanup);
        process.once("SIGTERM", cleanup);
      } else {
        steps.preview.skipped = true;
      }

      const hasError = steps.figma.error || steps.generate.failed > 0;
      const payload: GoPayload = {
        status: hasError ? "partial" : "completed",
        steps,
        elapsedMs: Date.now() - start,
      };

      if (json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log();
      console.log(ui.rule());
      console.log();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(ui.ready("LIVE") + ui.dim(`  ${elapsed}s`));
      console.log();
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
