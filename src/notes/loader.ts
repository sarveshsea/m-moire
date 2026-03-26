/**
 * Note Loader — Discovers and loads Mémoire Notes from two sources:
 *   1. Built-in notes: existing skills/ directory (shipped with npm package)
 *   2. Installed notes: .memoire/notes/ in the project workspace
 */

import { readFile, readdir, stat } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createLogger } from "../engine/logger.js";
import {
  NoteManifestSchema,
  type InstalledNote,
  type NoteManifest,
  type NoteCategory,
} from "./types.js";

const log = createLogger("notes-loader");

// Resolve the package root (two levels up from src/notes/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, "..", "..");

// ── Built-in Skill → Note Adapter ───────────────────────

interface SkillRegistryEntry {
  id: string;
  name: string;
  file: string;
  description: string;
  activateOn: string;
  freedomLevel: string;
  prerequisite?: string | null;
  chains?: string[];
}

interface SkillRegistry {
  version: string;
  skills: SkillRegistryEntry[];
}

function inferCategory(skill: SkillRegistryEntry): NoteCategory {
  if (skill.id.startsWith("figma-") || skill.id === "multi-agent" || skill.id === "atomic-design") return "craft";
  if (skill.id === "superpower") return "craft";
  if (skill.id === "dashboard-from-research") return "research";
  if (skill.id === "motion-video") return "craft";
  return "craft";
}

function skillToManifest(skill: SkillRegistryEntry, registryVersion: string): NoteManifest {
  return {
    name: skill.id,
    version: registryVersion,
    description: skill.description,
    category: inferCategory(skill),
    tags: [],
    skills: [{
      file: skill.file,
      name: skill.name,
      activateOn: skill.activateOn,
      freedomLevel: (skill.freedomLevel as "maximum" | "high" | "read-only" | "reference") || "high",
    }],
    dependencies: skill.prerequisite ? [skill.prerequisite] : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Note Loader ──────────────────────────────────────────

export class NoteLoader {
  private projectRoot: string;
  private _notes: InstalledNote[] = [];
  private _loaded = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  get notes(): InstalledNote[] {
    return this._notes;
  }

  get loaded(): boolean {
    return this._loaded;
  }

  /**
   * Load all notes from three sources:
   * 1. Legacy skills (skills/registry.json, adapted to Note format)
   * 2. Built-in Note packages (notes/{name}/note.json in npm package)
   * 3. User-installed Notes (.memoire/notes/)
   */
  async loadAll(): Promise<InstalledNote[]> {
    const [builtIn, builtInPackages, installed] = await Promise.all([
      this.loadBuiltInNotes(),
      this.loadBuiltInNotePackages(),
      this.loadInstalledNotes(),
    ]);

    // User-installed notes override built-in ones with the same name
    const noteMap = new Map<string, InstalledNote>();
    for (const note of builtIn) noteMap.set(note.manifest.name, note);
    for (const note of builtInPackages) noteMap.set(note.manifest.name, note);
    for (const note of installed) noteMap.set(note.manifest.name, note);

    this._notes = Array.from(noteMap.values());
    this._loaded = true;

    const totalBuiltIn = builtIn.length + builtInPackages.length;
    log.info({ builtIn: totalBuiltIn, installed: installed.length, total: this._notes.length }, "Notes loaded");
    return this._notes;
  }

  /**
   * Load built-in notes from skills/registry.json.
   * Adapts the legacy skill format into the Note manifest format.
   */
  async loadBuiltInNotes(): Promise<InstalledNote[]> {
    const registryPath = join(PACKAGE_ROOT, "skills", "registry.json");
    try {
      const raw = await readFile(registryPath, "utf-8");
      const registry: SkillRegistry = JSON.parse(raw);

      return registry.skills.map((skill) => ({
        manifest: skillToManifest(skill, registry.version),
        path: PACKAGE_ROOT,
        builtIn: true,
        enabled: true,
      }));
    } catch (err) {
      log.warn({ err }, "Could not load built-in skills registry");
      return [];
    }
  }

  /**
   * Load built-in Note packages from notes/ directory in the npm package.
   * These are full Note directories with note.json manifests.
   */
  async loadBuiltInNotePackages(): Promise<InstalledNote[]> {
    const notesDir = join(PACKAGE_ROOT, "notes");
    const notes: InstalledNote[] = [];

    try {
      const entries = await readdir(notesDir);

      for (const entry of entries) {
        const noteDir = join(notesDir, entry);
        const noteJsonPath = join(noteDir, "note.json");

        try {
          const dirStat = await stat(noteDir);
          if (!dirStat.isDirectory()) continue;

          const raw = await readFile(noteJsonPath, "utf-8");
          const parsed = JSON.parse(raw);
          const manifest = NoteManifestSchema.parse(parsed);

          notes.push({
            manifest,
            path: noteDir,
            builtIn: true,
            enabled: true,
          });
        } catch {
          // Skip directories without valid note.json
        }
      }
    } catch {
      // notes/ directory doesn't exist — that's fine
    }

    return notes;
  }

  /**
   * Load user-installed notes from .memoire/notes/
   */
  async loadInstalledNotes(): Promise<InstalledNote[]> {
    const notesDir = join(this.projectRoot, ".memoire", "notes");
    const notes: InstalledNote[] = [];

    try {
      const entries = await readdir(notesDir);

      for (const entry of entries) {
        const noteDir = join(notesDir, entry);
        const noteJsonPath = join(noteDir, "note.json");

        try {
          const dirStat = await stat(noteDir);
          if (!dirStat.isDirectory()) continue;

          const raw = await readFile(noteJsonPath, "utf-8");
          const parsed = JSON.parse(raw);
          const manifest = NoteManifestSchema.parse(parsed);

          notes.push({
            manifest,
            path: noteDir,
            builtIn: false,
            enabled: true,
          });
        } catch (err) {
          log.warn({ entry, err }, "Skipping invalid note");
        }
      }
    } catch {
      // .memoire/notes/ doesn't exist yet — that's fine
    }

    return notes;
  }

  /**
   * Get a specific note by name.
   */
  getNote(name: string): InstalledNote | undefined {
    return this._notes.find((n) => n.manifest.name === name);
  }

  /**
   * Get notes filtered by category.
   */
  getNotesByCategory(category: NoteCategory): InstalledNote[] {
    return this._notes.filter((n) => n.manifest.category === category);
  }

  /**
   * Reload all notes (useful after install/remove).
   */
  async reload(): Promise<InstalledNote[]> {
    this._loaded = false;
    return this.loadAll();
  }
}
