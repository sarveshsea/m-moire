import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";
import { registerNotesCommand } from "../notes.js";

let projectRoot: string;
let sourceDir: string;

beforeEach(async () => {
  projectRoot = join(tmpdir(), `memoire-notes-json-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  sourceDir = join(projectRoot, "source-note");
  await mkdir(sourceDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  await rm(projectRoot, { recursive: true, force: true });
});

describe("notes mutation JSON output", () => {
  it("emits structured JSON for notes install --json", async () => {
    await writeFile(
      join(sourceDir, "SKILL.md"),
      `---
name: capture-workflows
category: connect
activateOn: always
freedomLevel: high
description: Clipboard-first capture workflows for Figma.
tags: [figma, capture]
---

# Capture Workflows

Use clipboard-first capture flows.
`,
      "utf-8",
    );

    const logs = captureLogs();
    const program = new Command();
    registerNotesCommand(program, makeNotesEngine(projectRoot) as never);

    await program.parseAsync(["notes", "install", sourceDir, "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      action: "install",
      status: "completed",
      options: { json: true },
      source: sourceDir,
      installedPath: join(projectRoot, ".memoire", "notes", "capture-workflows"),
      note: {
        name: "capture-workflows",
        category: "connect",
        description: "Clipboard-first capture workflows for Figma.",
        skills: [{
          file: "SKILL.md",
          name: "Capture Workflows",
          activateOn: "always",
          freedomLevel: "high",
        }],
      },
    });
  });

  it("emits structured JSON for notes create --json", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerNotesCommand(program, makeNotesEngine(projectRoot) as never);

    await program.parseAsync(["notes", "create", "clawhub-interop", "--category", "connect", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      action: "create",
      status: "completed",
      options: { json: true },
      name: "clawhub-interop",
      category: "connect",
      noteDir: join(projectRoot, ".memoire", "notes", "clawhub-interop"),
      filesCreated: ["note.json", "clawhub-interop.md"],
      note: {
        name: "clawhub-interop",
        category: "connect",
        skills: [{
          file: "clawhub-interop.md",
          activateOn: "always",
          freedomLevel: "high",
        }],
      },
    });

    const createdStat = await stat(join(projectRoot, ".memoire", "notes", "clawhub-interop", "note.json"));
    expect(createdStat.isFile()).toBe(true);
  });

  it("emits structured JSON for notes remove --json", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerNotesCommand(program, makeNotesEngine(projectRoot) as never);

    await program.parseAsync(["notes", "create", "temporary-note", "--json"], { from: "user" });
    logs.length = 0;

    await program.parseAsync(["notes", "remove", "temporary-note", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      action: "remove",
      status: "completed",
      options: { json: true },
      name: "temporary-note",
      removedPath: join(projectRoot, ".memoire", "notes", "temporary-note"),
    });

    await expect(stat(join(projectRoot, ".memoire", "notes", "temporary-note"))).rejects.toThrow();
  });
});

function makeNotesEngine(projectRootPath: string) {
  return {
    config: { projectRoot: projectRootPath },
    notes: {
      loaded: true,
      notes: [],
      async loadAll() {},
      getNote() {
        return null;
      },
    },
  };
}

function captureLogs(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  return logs;
}

function lastLog(logs: string[]): string {
  const value = logs.at(-1);
  if (!value) throw new Error("Expected a console.log call");
  return value;
}
