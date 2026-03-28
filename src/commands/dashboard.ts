import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { join } from "path";
import { existsSync } from "fs";
import { PreviewApiServer } from "../preview/api-server.js";

export function registerDashboardCommand(program: Command, engine: MemoireEngine) {
  program
    .command("dashboard")
    .description("Launch the Mémoire dashboard (serves preview/ directory)")
    .alias("dash")
    .option("-p, --port <port>", "Dashboard port", "3333")
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        console.error("\n  Invalid port. Must be 1024-65535.\n");
        process.exit(1);
      }

      await engine.init();

      const previewDir = join(engine.config.projectRoot, "preview");
      if (!existsSync(previewDir)) {
        console.error("\n  No preview/ directory found. Run `memi init` first.\n");
        process.exit(1);
      }

      console.log(`\n  Starting Mémoire Dashboard on http://localhost:${port}\n`);

      const server = new PreviewApiServer(engine, previewDir, port);
      const actualPort = await server.start();

      console.log(`  Dashboard running at http://localhost:${actualPort}`);
      console.log(`  API endpoints:       http://localhost:${actualPort}/api/`);
      console.log(`  WebSocket:           ws://localhost:${actualPort}\n`);

      const cleanup = () => {
        console.log("\n  Shutting down dashboard...");
        server.stop();
        process.exit(0);
      };

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);
    });
}
