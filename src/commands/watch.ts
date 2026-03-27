/**
 * Watch Command — Watch specs for changes and auto-regenerate code.
 *
 * Usage:
 *   memi watch              Watch all specs
 *   memi watch --debounce   Debounce interval in ms (default 500)
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { watch } from "fs";
import { readdir, stat } from "fs/promises";
import { join, basename } from "path";

export function registerWatchCommand(program: Command, engine: MemoireEngine) {
  program
    .command("watch")
    .description("Watch specs for changes and auto-regenerate code")
    .option("-d, --debounce <ms>", "Debounce interval in milliseconds", "500")
    .action(async (opts: { debounce: string }) => {
      await engine.init();

      const debounceMs = parseInt(opts.debounce, 10) || 500;
      const specsRoot = join(engine.config.projectRoot, "specs");

      // Verify specs directory exists
      try {
        await stat(specsRoot);
      } catch {
        console.error("\n  x No specs/ directory found. Create specs first with: memi spec <type> <name>\n");
        process.exitCode = 1;
        return;
      }

      console.log("\n  Watching specs/ for changes...");
      console.log(`  Debounce: ${debounceMs}ms\n`);

      // Collect all spec subdirectories
      const specDirs: string[] = [];
      const entries = await readdir(specsRoot);
      for (const entry of entries) {
        const entryPath = join(specsRoot, entry);
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory()) {
          specDirs.push(entryPath);
        }
      }

      if (specDirs.length === 0) {
        console.log("  No spec directories found under specs/.\n");
        return;
      }

      // Track pending regenerations to debounce
      const pending = new Map<string, ReturnType<typeof setTimeout>>();
      let generating = false;

      const regenerate = async (specName: string) => {
        if (generating) return;
        generating = true;

        try {
          console.log(`  ~ Regenerating ${specName}...`);
          const entryFile = await engine.generateFromSpec(specName);
          console.log(`  + ${specName} -> ${entryFile}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  x Failed to regenerate ${specName}: ${msg}`);
        } finally {
          generating = false;
        }
      };

      // Watch each spec subdirectory
      const watchers: ReturnType<typeof watch>[] = [];

      for (const dir of specDirs) {
        const dirName = basename(dir);
        console.log(`  Watching specs/${dirName}/`);

        const watcher = watch(dir, { recursive: false }, (_event, filename) => {
          if (!filename || !filename.endsWith(".json")) return;

          const specName = filename.replace(/\.json$/, "");

          // Debounce: clear previous timer, set a new one
          const existing = pending.get(specName);
          if (existing) clearTimeout(existing);

          pending.set(
            specName,
            setTimeout(() => {
              pending.delete(specName);
              regenerate(specName);
            }, debounceMs),
          );
        });

        watchers.push(watcher);
      }

      console.log(`\n  Watching ${specDirs.length} spec director${specDirs.length === 1 ? "y" : "ies"}. Press Ctrl+C to stop.\n`);

      // Graceful shutdown
      const cleanup = () => {
        console.log("\n  Stopping file watcher...\n");
        for (const w of watchers) w.close();
        for (const t of pending.values()) clearTimeout(t);
        process.exit(0);
      };

      process.once("SIGINT", cleanup);
      process.once("SIGTERM", cleanup);

      // Keep process alive
      setInterval(() => {}, 60_000);
    });
}
