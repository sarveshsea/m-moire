/**
 * `noche export` — Copies generated components from Noche's `generated/`
 * folder into the user's actual project, respecting their framework paths.
 */

import type { Command } from "commander";
import type { NocheEngine } from "../engine/core.js";
import { readdir, readFile, writeFile, mkdir, access } from "fs/promises";
import { join, relative } from "path";

export function registerExportCommand(program: Command, engine: NocheEngine) {
  program
    .command("export")
    .description("Export generated components into your project's source tree")
    .option("-t, --target <dir>", "Override target directory (default: auto-detected from project)")
    .option("--dry-run", "Show what would be copied without writing files")
    .option("--force", "Overwrite existing files without asking")
    .action(async (opts) => {
      await engine.init();

      const project = engine.project;
      if (!project) {
        console.log("\n  x Could not detect project context. Run `noche init` first.\n");
        return;
      }

      const generatedDir = join(engine.config.projectRoot, "generated");
      const targetBase = opts.target
        ? join(engine.config.projectRoot, opts.target)
        : join(engine.config.projectRoot, project.paths.components);

      // Discover all generated files
      const files = await walkDir(generatedDir);
      if (files.length === 0) {
        console.log("\n  · No generated files found. Run `noche generate` or `noche go` first.\n");
        return;
      }

      console.log(`\n  Exporting ${files.length} files to ${relative(engine.config.projectRoot, targetBase) || targetBase}\n`);

      let written = 0;
      let skipped = 0;

      for (const file of files) {
        const relPath = relative(generatedDir, file);
        const targetPath = join(targetBase, relPath);

        if (opts.dryRun) {
          console.log(`  · ${relPath} → ${relative(engine.config.projectRoot, targetPath)}`);
          written++;
          continue;
        }

        // Check if target exists
        if (!opts.force) {
          try {
            await access(targetPath);
            console.log(`  ! Skipping ${relPath} (exists, use --force to overwrite)`);
            skipped++;
            continue;
          } catch {
            // File doesn't exist, safe to write
          }
        }

        const content = await readFile(file, "utf-8");
        await mkdir(join(targetPath, ".."), { recursive: true });
        await writeFile(targetPath, content);
        console.log(`  + ${relPath}`);
        written++;
      }

      if (opts.dryRun) {
        console.log(`\n  Dry run: would export ${written} files\n`);
      } else {
        console.log(`\n  + Exported ${written} files${skipped > 0 ? `, skipped ${skipped}` : ""}\n`);
      }
    });
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...await walkDir(fullPath));
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }
  return results;
}
