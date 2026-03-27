import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { join } from "path";
import { spawn } from "child_process";
import { existsSync } from "fs";

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

      try {
        const child = spawn("npx", ["-y", "serve", previewDir, "-l", String(port), "-s", "--no-clipboard"], {
          stdio: "inherit",
          shell: true,
        });

        child.on("error", (err) => {
          console.log(`  npx serve failed (${err.message}), falling back to python3...`);
          const fallback = spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
          fallback.on("error", (e) => console.error(`  Python server also failed: ${e.message}`));
        });
      } catch {
        const fallback = spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
        fallback.on("error", (e) => console.error(`  Python server failed: ${e.message}`));
      }
    });
}
