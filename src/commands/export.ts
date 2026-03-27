/**
 * `memi export` — Copies generated components from Mémoire's `generated/`
 * folder into the user's actual project, respecting their framework paths.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { readdir, readFile, writeFile, mkdir, access } from "fs/promises";
import { join, relative } from "path";

type ExportKind = "components" | "pages" | "dataviz" | "other";

export function registerExportCommand(program: Command, engine: MemoireEngine) {
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
        console.log("\n  x Could not detect project context. Run `memi init` first.\n");
        return;
      }

      const generatedDir = join(engine.config.projectRoot, "generated");

      // Discover all generated files
      const files = await walkDir(generatedDir);
      if (files.length === 0) {
        console.log("\n  · No generated files found. Run `memi generate` or `memi go` first.\n");
        return;
      }

      console.log(`\n  Exporting ${files.length} files to project destinations\n`);

      let written = 0;
      let skipped = 0;

      for (const file of files) {
        const relPath = relative(generatedDir, file);
        const kind = getExportKind(relPath);
        const targetBase = getTargetBase(engine.config.projectRoot, project, opts.target, kind);
        const mappedRelPath = stripGeneratedPrefix(relPath);
        const targetPath = join(targetBase, mappedRelPath);

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

function getExportKind(relPath: string): ExportKind {
  const [firstSegment] = relPath.split(/[\\/]/);
  if (firstSegment === "components" || firstSegment === "pages" || firstSegment === "dataviz") {
    return firstSegment;
  }
  return "other";
}

function stripGeneratedPrefix(relPath: string): string {
  const segments = relPath.split(/[\\/]/);
  if (segments.length <= 1) return relPath;

  const [firstSegment, ...rest] = segments;
  if (firstSegment === "components" || firstSegment === "pages" || firstSegment === "dataviz") {
    return rest.join("/");
  }

  return relPath;
}

function getTargetBase(
  projectRoot: string,
  project: { paths: { components: string; pages?: string } },
  customTarget: string | undefined,
  kind: ExportKind,
): string {
  if (customTarget) {
    return join(projectRoot, customTarget);
  }

  switch (kind) {
    case "pages":
      return join(projectRoot, project.paths.pages ?? "src/pages");
    case "dataviz":
      return join(projectRoot, project.paths.components, "dataviz");
    case "components":
    default:
      return join(projectRoot, project.paths.components);
  }
}
