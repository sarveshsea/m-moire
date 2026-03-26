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
import type { MemoireEngine } from "../engine/core.js";
import {
  installNote,
  removeNote,
  scaffoldNote,
  getNoteInfo,
  NoteLoader,
  type NoteCategory,
} from "../notes/index.js";

export function registerNotesCommand(program: Command, engine: MemoireEngine) {
  const notes = program
    .command("notes")
    .description("Manage Memoire Notes — downloadable skill packs");

  // ── install ────────────────────────────────────────────

  notes
    .command("install <source>")
    .description("Install a note (local path or github:user/repo)")
    .action(async (source: string) => {
      const root = engine.config.projectRoot;
      console.log(`\n  Installing note from ${source}...\n`);

      try {
        const manifest = await installNote(source, root);
        console.log(`  + ${manifest.name}@${manifest.version}`);
        console.log(`    ${manifest.description}`);
        console.log(`    Category: ${manifest.category}`);
        console.log(`    Skills:   ${manifest.skills.length}`);
        console.log(`\n  Note installed. It will activate automatically during agent execution.\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  x Failed to install: ${msg}\n`);
        process.exitCode = 1;
      }
    });

  // ── list ───────────────────────────────────────────────

  notes
    .command("list")
    .description("Show all installed notes with status")
    .action(async () => {
      if (!engine.notes.loaded) await engine.notes.loadAll();
      const allNotes = engine.notes.notes;

      if (allNotes.length === 0) {
        console.log("\n  No notes installed.\n");
        console.log("  Install one with: memi notes install <source>\n");
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
            console.log(`      skill: ${skill.name} (activates on: ${skill.activateOn})`);
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
    .action(async (name: string) => {
      try {
        await removeNote(name, engine.config.projectRoot);
        console.log(`\n  - Removed note "${name}"\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  x ${msg}\n`);
        process.exitCode = 1;
      }
    });

  // ── create ─────────────────────────────────────────────

  notes
    .command("create <name>")
    .description("Scaffold a new note")
    .option("-c, --category <category>", "Note category (craft|research|connect|generate)", "craft")
    .action(async (name: string, opts: { category: string }) => {
      const category = opts.category as NoteCategory;
      const validCategories = ["craft", "research", "connect", "generate"];
      if (!validCategories.includes(category)) {
        console.error(`  x Invalid category "${category}". Use: ${validCategories.join(", ")}\n`);
        process.exitCode = 1;
        return;
      }

      try {
        const noteDir = await scaffoldNote(name, category, engine.config.projectRoot);
        console.log(`\n  + Scaffolded note "${name}" in:`);
        console.log(`    ${noteDir}`);
        console.log(`\n  Files created:`);
        console.log(`    note.json   — manifest`);
        console.log(`    ${name}.md  — skill definition\n`);
        console.log(`  Edit ${name}.md to add your skill knowledge, then it's ready to use.\n`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  x ${msg}\n`);
        process.exitCode = 1;
      }
    });

  // ── info ───────────────────────────────────────────────

  notes
    .command("info <name>")
    .description("Show note details")
    .action(async (name: string) => {
      // Check installed notes first, then built-in
      let manifest = await getNoteInfo(name, engine.config.projectRoot);
      let source = "installed";

      if (!manifest) {
        // Check built-in
        const loader = new NoteLoader(engine.config.projectRoot);
        await loader.loadAll();
        const note = loader.getNote(name);
        if (note) {
          manifest = note.manifest;
          source = "built-in";
        }
      }

      if (!manifest) {
        console.error(`\n  x Note "${name}" not found.\n`);
        process.exitCode = 1;
        return;
      }

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
