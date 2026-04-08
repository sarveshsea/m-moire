/**
 * Notes CLI — Manage Mémoire Notes (downloadable skill packs).
 *
 * Commands:
 *   memi notes install <source>   Install from local path or GitHub
 *   memi notes list                Show all installed notes
 *   memi notes remove <name>       Uninstall a note
 *   memi notes create <name>       Scaffold a new note
 *   memi notes info <name>         Show note details
 */

import type { Command } from "commander";
import { join } from "path";
import type { MemoireEngine } from "../engine/core.js";
import {
  installNote,
  removeNote,
  scaffoldNote,
  getNoteInfo,
  type NoteCategory,
} from "../notes/index.js";
import type { InstalledNote, NoteManifest } from "../notes/index.js";
import { ui } from "../tui/format.js";

type NoteMutationAction = "install" | "create" | "remove";
type NoteMutationStatus = "completed" | "failed";

interface NoteMutationPayload {
  action: NoteMutationAction;
  status: NoteMutationStatus;
  options: {
    json: boolean;
  };
  source?: string;
  name?: string;
  category?: NoteCategory;
  installedPath?: string | null;
  noteDir?: string | null;
  removedPath?: string | null;
  filesCreated?: string[];
  note?: ReturnType<typeof serializeManifest> | null;
  error?: {
    message: string;
  };
}

export function registerNotesCommand(program: Command, engine: MemoireEngine) {
  const notes = program
    .command("notes")
    .description("Manage Memoire Notes — downloadable skill packs");

  // ── install ────────────────────────────────────────────

  notes
    .command("install <source>")
    .description("Install a note (local path or github:user/repo)")
    .option("--json", "Output install result as JSON")
    .action(async (source: string, opts: { json?: boolean }) => {
      const root = engine.config.projectRoot;
      const json = Boolean(opts.json);
      if (!json) {
        console.log(`\n  Installing note from ${source}...\n`);
      }

      try {
        const manifest = await installNote(source, root);
        if (json) {
          const payload: NoteMutationPayload = {
            action: "install",
            status: "completed",
            options: { json: true },
            source,
            installedPath: join(root, ".memoire", "notes", manifest.name),
            note: serializeManifest(manifest),
          };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`  + ${manifest.name}@${manifest.version}`);
        console.log(`    ${manifest.description}`);
        console.log(`    Category: ${manifest.category}`);
        console.log(`    Skills:   ${manifest.skills.length}`);
        console.log(`\n  Note installed. It will activate automatically during agent execution.\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (json) {
          const payload: NoteMutationPayload = {
            action: "install",
            status: "failed",
            options: { json: true },
            source,
            installedPath: null,
            note: null,
            error: { message: msg },
          };
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(ui.fail(`Failed to install: ${msg}`));
        process.exitCode = 1;
      }
    });

  // ── list ───────────────────────────────────────────────

  notes
    .command("list")
    .description("Show all installed notes with status")
    .option("--json", "Output notes as JSON")
    .action(async (opts: { json?: boolean }) => {
      if (!engine.notes.loaded) await engine.notes.loadAll();
      const allNotes = engine.notes.notes;

      if (allNotes.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ notes: [], summary: emptyNotesSummary() }, null, 2));
          return;
        }
        console.log("\n  No notes installed.\n");
        console.log("  Install one with: memi notes install <source>\n");
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({
          notes: allNotes.map(serializeInstalledNote),
          summary: buildNotesSummary(allNotes),
        }, null, 2));
        return;
      }

      console.log("\n  ┌─────────────────────────────────────────────┐");
      console.log("  │            Memoire Notes                      │");
      console.log("  └─────────────────────────────────────────────┘\n");

      // Group by category
      const categories = ["craft", "research", "connect", "generate"] as const;
      const categoryLabels: Record<string, string> = {
        craft: "Craft",
        research: "Research",
        connect: "Connect",
        generate: "Generate",
      };

      for (const cat of categories) {
        const catNotes = allNotes.filter((n) => n.manifest.category === cat);
        if (catNotes.length === 0) continue;

        console.log(`  ${categoryLabels[cat]}`);
        for (const note of catNotes) {
          const badge = note.builtIn ? "built-in" : "installed";
          const status = note.enabled ? "active" : "disabled";
          console.log(`    ${note.manifest.name}@${note.manifest.version}  [${badge}] [${status}]`);
          console.log(`      ${note.manifest.description}`);
          for (const skill of note.manifest.skills) {
            const nameCol = skill.name.padEnd(32, " ");
            console.log(`      skill:      ${nameCol}  activateOn: ${skill.activateOn}`);
          }
        }
        console.log();
      }

      const installed = allNotes.filter((n) => !n.builtIn).length;
      const builtIn = allNotes.filter((n) => n.builtIn).length;
      console.log(`  ${builtIn} built-in, ${installed} installed\n`);
    });

  // ── remove ─────────────────────────────────────────────

  notes
    .command("remove <name>")
    .description("Uninstall a note")
    .option("--json", "Output removal result as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      const removedPath = join(engine.config.projectRoot, ".memoire", "notes", name);
      try {
        await removeNote(name, engine.config.projectRoot);
        if (opts.json) {
          const payload: NoteMutationPayload = {
            action: "remove",
            status: "completed",
            options: { json: true },
            name,
            removedPath,
          };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`\n  - Removed note "${name}"\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          const payload: NoteMutationPayload = {
            action: "remove",
            status: "failed",
            options: { json: true },
            name,
            removedPath: null,
            error: { message: msg },
          };
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(ui.fail(msg));
        process.exitCode = 1;
      }
    });

  // ── create ─────────────────────────────────────────────

  notes
    .command("create <name>")
    .description("Scaffold a new note")
    .option("-c, --category <category>", "Note category (craft|research|connect|generate)", "craft")
    .option("--json", "Output scaffold result as JSON")
    .action(async (name: string, opts: { category: string; json?: boolean }) => {
      const category = opts.category as NoteCategory;
      const validCategories = ["craft", "research", "connect", "generate"];
      if (!validCategories.includes(category)) {
        if (opts.json) {
          const payload: NoteMutationPayload = {
            action: "create",
            status: "failed",
            options: { json: true },
            name,
            category,
            noteDir: null,
            note: null,
            error: {
              message: `Invalid category "${category}". Use: ${validCategories.join(", ")}`,
            },
          };
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(ui.fail(`Invalid category "${category}". Use: ${validCategories.join(", ")}`));
        process.exitCode = 1;
        return;
      }

      try {
        const noteDir = await scaffoldNote(name, category, engine.config.projectRoot);
        const manifest = await getNoteInfo(name, engine.config.projectRoot);
        if (opts.json) {
          const payload: NoteMutationPayload = {
            action: "create",
            status: "completed",
            options: { json: true },
            name,
            category,
            noteDir,
            filesCreated: ["note.json", `${name}.md`],
            note: manifest ? serializeManifest(manifest) : null,
          };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }
        console.log(`\n  + Scaffolded note "${name}" in:`);
        console.log(`    ${noteDir}`);
        console.log(`\n  Files created:`);
        console.log(`    note.json   — manifest`);
        console.log(`    ${name}.md  — skill definition\n`);
        console.log(`  Edit ${name}.md to add your skill knowledge, then it's ready to use.\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          const payload: NoteMutationPayload = {
            action: "create",
            status: "failed",
            options: { json: true },
            name,
            category,
            noteDir: null,
            note: null,
            error: { message: msg },
          };
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }
        console.log(ui.fail(msg));
        process.exitCode = 1;
      }
    });

  // ── info ───────────────────────────────────────────────

  notes
    .command("info <name>")
    .description("Show note details")
    .option("--json", "Output note details as JSON")
    .action(async (name: string, opts: { json?: boolean }) => {
      if (!engine.notes.loaded) await engine.notes.loadAll();
      const note = engine.notes.getNote(name);

      if (!note) {
        console.log(ui.fail(`Note "${name}" not found.`));
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify({
          source: note.builtIn ? "built-in" : "installed",
          note: serializeInstalledNote(note),
        }, null, 2));
        return;
      }

      const manifest = note.manifest;
      const source = note.builtIn ? "built-in" : "installed";

      console.log(`\n  ${manifest.name}@${manifest.version}  [${source}]`);
      console.log(`  ${manifest.description}`);
      console.log();
      console.log(`  Category:     ${manifest.category}`);
      console.log(`  Tags:         ${manifest.tags.length > 0 ? manifest.tags.join(", ") : "(none)"}`);
      if (manifest.author) {
        console.log(`  Author:       ${manifest.author}`);
      }
      console.log(`  Dependencies: ${manifest.dependencies.length > 0 ? manifest.dependencies.join(", ") : "(none)"}`);
      console.log();
      console.log(`  Skills (${manifest.skills.length}):`);
      for (const skill of manifest.skills) {
        console.log(`    ${skill.name}`);
        console.log(`      file:       ${skill.file}`);
        console.log(`      activateOn: ${skill.activateOn}`);
        console.log(`      freedom:    ${skill.freedomLevel}`);
      }
      console.log();
    });
}

function serializeInstalledNote(note: InstalledNote) {
  return {
    ...serializeManifest(note.manifest),
    builtIn: note.builtIn,
    enabled: note.enabled,
  };
}

function serializeManifest(manifest: NoteManifest) {
  return {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    category: manifest.category,
    tags: manifest.tags,
    author: manifest.author ?? null,
    dependencies: manifest.dependencies,
    skills: manifest.skills.map((skill) => ({
      file: skill.file,
      name: skill.name,
      activateOn: skill.activateOn,
      freedomLevel: skill.freedomLevel,
    })),
  };
}

function buildNotesSummary(notes: InstalledNote[]) {
  return {
    total: notes.length,
    builtIn: notes.filter((note) => note.builtIn).length,
    installed: notes.filter((note) => !note.builtIn).length,
    active: notes.filter((note) => note.enabled).length,
    byCategory: {
      craft: notes.filter((note) => note.manifest.category === "craft").length,
      research: notes.filter((note) => note.manifest.category === "research").length,
      connect: notes.filter((note) => note.manifest.category === "connect").length,
      generate: notes.filter((note) => note.manifest.category === "generate").length,
    },
  };
}

function emptyNotesSummary() {
  return {
    total: 0,
    builtIn: 0,
    installed: 0,
    active: 0,
    byCategory: {
      craft: 0,
      research: 0,
      connect: 0,
      generate: 0,
    },
  };
}
