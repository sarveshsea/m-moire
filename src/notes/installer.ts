/**
 * Note Installer — Install, remove, and scaffold Mémoire Notes.
 *
 * Sources:
 *   - Local path:  memi notes install ./my-note
 *   - GitHub repo: memi notes install github:user/repo
 *   - (Future)     memi notes install note-name  (from registry)
 */

import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile, cp } from "fs/promises";
import { join, basename, resolve } from "path";
import { execSync } from "child_process";
import { createLogger } from "../engine/logger.js";
import { NoteManifestSchema, type NoteCategory, type NoteManifest } from "./types.js";

const log = createLogger("notes-installer");

function notesDir(projectRoot: string): string {
  return join(projectRoot, ".memoire", "notes");
}

function assertSafeName(name: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`Invalid note name "${name}" — must be kebab-case (a-z, 0-9, hyphens)`);
  }
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    throw new Error(`Note name "${name}" contains path traversal characters`);
  }
}

// ── Install ──────────────────────────────────────────────

export async function installNote(
  source: string,
  projectRoot: string,
): Promise<NoteManifest> {
  const dest = notesDir(projectRoot);
  await mkdir(dest, { recursive: true });

  if (source.startsWith("github:")) {
    return installFromGithub(source.slice(7), dest);
  }

  // Treat as local path
  const localPath = resolve(source);
  return installFromLocal(localPath, dest);
}

async function installFromLocal(sourcePath: string, destRoot: string): Promise<NoteManifest> {
  // Validate source has note.json
  const manifestPath = join(sourcePath, "note.json");
  const raw = await readFile(manifestPath, "utf-8");
  const manifest = NoteManifestSchema.parse(JSON.parse(raw));

  assertSafeName(manifest.name);

  const targetDir = join(destRoot, manifest.name);
  await mkdir(targetDir, { recursive: true });

  // Copy all files and directories from source to target
  const entries = await readdir(sourcePath);
  for (const entry of entries) {
    const srcFile = join(sourcePath, entry);
    const dstFile = join(targetDir, entry);
    const fileStat = await stat(srcFile);

    if (fileStat.isDirectory()) {
      await cp(srcFile, dstFile, { recursive: true });
    } else {
      await copyFile(srcFile, dstFile);
    }
  }

  log.info({ name: manifest.name, version: manifest.version }, "Note installed from local path");
  return manifest;
}

async function installFromGithub(repo: string, destRoot: string): Promise<NoteManifest> {
  // Validate git is available
  try {
    execSync("git --version", { stdio: "ignore" });
  } catch {
    throw new Error("Git is not installed. Install git or use local path: memi notes install ./my-note");
  }

  // Clone into a temp directory first
  const tmpDir = join(destRoot, ".tmp-clone-" + Date.now());
  try {
    execSync(`git clone --depth 1 https://github.com/${repo}.git "${tmpDir}"`, {
      stdio: "pipe",
      timeout: 30_000,
    });

    // Read and validate manifest
    const manifestPath = join(tmpDir, "note.json");
    const raw = await readFile(manifestPath, "utf-8");
    const manifest = NoteManifestSchema.parse(JSON.parse(raw));

    assertSafeName(manifest.name);

    // Move to final location
    const targetDir = join(destRoot, manifest.name);
    await rm(targetDir, { recursive: true, force: true });

    // Copy files and directories (skip .git)
    await mkdir(targetDir, { recursive: true });
    const entries = await readdir(tmpDir);
    for (const entry of entries) {
      if (entry === ".git") continue;
      const srcFile = join(tmpDir, entry);
      const dstFile = join(targetDir, entry);
      const fileStat = await stat(srcFile);
      if (fileStat.isDirectory()) {
        await cp(srcFile, dstFile, { recursive: true });
      } else {
        await copyFile(srcFile, dstFile);
      }
    }

    log.info({ name: manifest.name, repo }, "Note installed from GitHub");
    return manifest;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Remove ───────────────────────────────────────────────

export async function removeNote(name: string, projectRoot: string): Promise<void> {
  assertSafeName(name);
  const noteDir = join(notesDir(projectRoot), name);

  try {
    await stat(noteDir);
  } catch {
    throw new Error(`Note "${name}" is not installed`);
  }

  await rm(noteDir, { recursive: true, force: true });
  log.info({ name }, "Note removed");
}

// ── Scaffold ─────────────────────────────────────────────

export async function scaffoldNote(
  name: string,
  category: NoteCategory,
  projectRoot: string,
): Promise<string> {
  assertSafeName(name);

  const noteDir = join(notesDir(projectRoot), name);
  await mkdir(noteDir, { recursive: true });

  const manifest: NoteManifest = {
    name,
    version: "0.1.0",
    description: `${name} — a Mémoire Note`,
    category,
    tags: [],
    skills: [{
      file: `${name}.md`,
      name: name.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" "),
      activateOn: category === "research" ? "research-to-dashboard"
        : category === "connect" ? "always"
        : category === "generate" ? "component-creation"
        : "component-creation",
      freedomLevel: "high",
    }],
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeFile(
    join(noteDir, "note.json"),
    JSON.stringify(manifest, null, 2),
  );

  const skillContent = `# ${manifest.skills[0].name}

> ${manifest.description}

## Freedom Level: ${manifest.skills[0].freedomLevel}

This note activates on: \`${manifest.skills[0].activateOn}\`

## Workflow

1. **OBSERVE** — Gather context from the current design system and project
2. **PLAN** — Decompose the request into actionable steps
3. **EXECUTE** — Apply changes using the appropriate tools
4. **VALIDATE** — Verify the output meets quality standards

## Guidelines

<!-- Add your skill-specific knowledge, decision trees, and best practices here -->

## Anti-Patterns

<!-- Document what NOT to do -->
`;

  await writeFile(join(noteDir, `${name}.md`), skillContent);

  log.info({ name, category }, "Note scaffolded");
  return noteDir;
}

// ── Info ─────────────────────────────────────────────────

export async function getNoteInfo(
  name: string,
  projectRoot: string,
): Promise<NoteManifest | null> {
  assertSafeName(name);
  const manifestPath = join(notesDir(projectRoot), name, "note.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    return NoteManifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
