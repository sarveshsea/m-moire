/**
 * Preview Command — Builds and serves the Mémoire component preview gallery.
 *
 * HTML generation lives in src/preview/templates/ — this file is just
 * the CLI orchestrator (~80 lines instead of the original 4000+).
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { ResearchStore } from "../research/engine.js";
import { PreviewApiServer } from "../preview/api-server.js";
import { generatePreviewHTML } from "../preview/templates/gallery-page.js";
import { generateResearchDashboard } from "../preview/templates/research-page.js";
import type { PreviewData } from "../preview/templates/types.js";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join, basename } from "path";
import { spawn } from "child_process";

export function registerPreviewCommand(program: Command, engine: MemoireEngine) {
  program
    .command("preview")
    .description("Build and serve the Mémoire component preview gallery")
    .option("-p, --port <port>", "Preview server port", "5173")
    .option("--build-only", "Build the preview without serving")
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        console.error("\n  Invalid port. Must be 1024-65535.\n");
        process.exit(1);
      }

      await engine.init();

      const previewDir = join(engine.config.projectRoot, "preview");
      const generatedDir = join(previewDir, "generated");
      await mkdir(generatedDir, { recursive: true });

      const specs = await engine.registry.getAllSpecs();
      const tokens = engine.registry.designSystem.tokens;

      // Load research data if available
      let research: ResearchStore | null = null;
      try {
        const researchPath = join(engine.config.projectRoot, "research", "insights.json");
        const raw = await readFile(researchPath, "utf-8");
        research = JSON.parse(raw) as ResearchStore;
      } catch {
        // No research data yet
      }

      console.log("\n  Building preview gallery...\n");

      const projectName = basename(engine.config.projectRoot);
      const data: PreviewData = { projectName, specs, tokens, research, generatedAt: new Date().toISOString() };

      // Write generated pages to preview/generated/ — never overwrite hand-crafted preview/ pages
      const html = generatePreviewHTML(data);
      await writeFile(join(generatedDir, "gallery.html"), html);

      if (research && research.insights.length > 0) {
        const researchHtml = generateResearchDashboard(research, data.generatedAt);
        await writeFile(join(generatedDir, "research.html"), researchHtml);
      }

      const components = specs.filter((s) => s.type === "component");
      const pages = specs.filter((s) => s.type === "page");
      const dataviz = specs.filter((s) => s.type === "dataviz");
      const design = specs.filter((s) => s.type === "design");
      const ia = specs.filter((s) => s.type === "ia");

      console.log(`  Preview built:`);
      console.log(`    ${components.length} components`);
      console.log(`    ${pages.length} pages`);
      console.log(`    ${dataviz.length} dataviz`);
      console.log(`    ${design.length} design specs`);
      console.log(`    ${ia.length} IA specs`);
      console.log(`    ${tokens.length} design tokens`);
      if (research) {
        console.log(`    ${research.insights.length} research insights`);
        console.log(`    ${research.themes.length} themes`);
      }

      if (opts.buildOnly) {
        console.log(`\n  Preview built at: ${generatedDir}\n`);
        return;
      }

      // Start the interactive API server
      const apiServer = new PreviewApiServer(engine, previewDir, port);
      try {
        const actualPort = await apiServer.start();
        console.log(`\n  Memoire Preview (interactive) on http://localhost:${actualPort}`);
        console.log(`  API endpoints:        http://localhost:${actualPort}/api/`);
        console.log(`  WebSocket:            ws://localhost:${actualPort}`);
        console.log(`  Generated gallery:    http://localhost:${actualPort}/generated/gallery.html`);
        console.log(`  Figma bridge:         ${engine.figma.isConnected ? "connected" : "not connected"}\n`);

        process.once("SIGINT", () => {
          console.log("\n  Shutting down preview server...");
          apiServer.stop();
          process.exit(0);
        });
      } catch (err) {
        console.error(`\n  Failed to start API server: ${(err as Error).message}`);
        console.log("  Falling back to static server...\n");

        try {
          const child = spawn("npx", ["-y", "serve", previewDir, "-l", String(port), "--no-clipboard"], {
            stdio: "inherit",
            shell: true,
          });
          child.on("error", (serveErr) => {
            console.log(`  npx serve failed (${serveErr.message}), falling back to python3...`);
            const fb = spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
            fb.on("error", (e) => console.error(`  Python server failed: ${e.message}`));
          });
        } catch {
          const fb = spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
          fb.on("error", (e) => console.error(`  Python server failed: ${e.message}`));
        }
      }
    });
}
