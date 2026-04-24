import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerStatusCommand } from "../status.js";
import { registerNotesCommand } from "../notes.js";
import { captureLogs, lastLog } from "./test-helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CLI JSON output", () => {
  it("emits structured JSON for status --json", async () => {
    const logs = captureLogs();
    const engine = makeStatusEngine();
    const program = new Command();

    registerStatusCommand(program, engine as never);
    await program.parseAsync(["status", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload.project.framework).toBe("vite");
    expect(payload.project.tailwind).toBe(true);
    expect(payload.specs.total).toBe(3);
    expect(payload.notes.builtIn).toBe(1);
    expect(payload.research.highConfidence).toBe(1);
    expect(payload.ai.mode).toBe("agent-cli");
  });

  it("emits structured JSON for notes list --json", async () => {
    const logs = captureLogs();
    const engine = makeNotesEngine();
    const program = new Command();

    registerNotesCommand(program, engine as never);
    await program.parseAsync(["notes", "list", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload.summary.total).toBe(2);
    expect(payload.summary.builtIn).toBe(1);
    expect(payload.summary.byCategory.connect).toBe(1);
    expect(payload.notes[0].skills[0].activateOn).toBe("always");
  });

  it("emits structured JSON for notes info --json", async () => {
    const logs = captureLogs();
    const engine = makeNotesEngine();
    const program = new Command();

    registerNotesCommand(program, engine as never);
    await program.parseAsync(["notes", "info", "figma-sync", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload.source).toBe("built-in");
    expect(payload.note.name).toBe("figma-sync");
    expect(payload.note.skills[0].name).toBe("Figma Sync");
  });
});

function makeStatusEngine() {
  return {
    async init() {},
    project: {
      framework: "vite",
      language: "typescript",
      styling: { tailwind: true, tailwindVersion: "4.0.0" },
      shadcn: { installed: true, components: ["button", "card"] },
    },
    figma: { isConnected: false },
    registry: {
      designSystem: {
        tokens: [{ name: "primary" }],
        components: [{ name: "Button" }],
        styles: [{ name: "Heading" }],
        lastSync: "never",
      },
      async getAllSpecs() {
        return [
          { type: "component", name: "Button" },
          { type: "page", name: "Dashboard" },
          { type: "dataviz", name: "ActivityChart" },
        ];
      },
      getGenerationState(name: string) {
        return name === "Button" ? { files: ["generated/components/ui/Button.tsx"] } : null;
      },
    },
    research: {
      async load() {},
      getStore() {
        return {
          findings: [{ confidence: "high" }, { confidence: "low" }],
          themes: [{ name: "navigation" }],
          sources: [{ name: "interviews" }],
          quantitativeMetrics: [{ field: "csat" }],
          quality: {
            overallScore: 82,
            sampleSize: 24,
            completenessScore: 90,
            sourceDiversityScore: 70,
            triangulationScore: 75,
            structureScore: 88,
            notes: [],
          },
        };
      },
    },
    notes: {
      loaded: true,
      notes: [
        {
          builtIn: true,
          enabled: true,
          manifest: {
            name: "figma-sync",
            version: "1.0.0",
            description: "Figma sync",
            category: "connect",
            tags: [],
            dependencies: [],
            skills: [{ file: "figma-sync.md", name: "Figma Sync", activateOn: "always", freedomLevel: "high" }],
          },
        },
      ],
      async loadAll() {},
    },
  };
}

function makeNotesEngine() {
  const notes = [
    {
      builtIn: true,
      enabled: true,
      manifest: {
        name: "figma-sync",
        version: "1.0.0",
        description: "Figma sync",
        category: "connect",
        tags: ["figma"],
        dependencies: [],
        skills: [{ file: "figma-sync.md", name: "Figma Sync", activateOn: "always", freedomLevel: "high" }],
      },
    },
    {
      builtIn: false,
      enabled: true,
      manifest: {
        name: "mobile-craft",
        version: "1.0.0",
        description: "Mobile craft",
        category: "craft",
        tags: ["mobile"],
        dependencies: [],
        skills: [{ file: "mobile-craft.md", name: "Mobile Craft", activateOn: "design-creation", freedomLevel: "high" }],
      },
    },
  ];

  return {
    config: { projectRoot: "/workspace" },
    notes: {
      loaded: true,
      notes,
      async loadAll() {},
      getNote(name: string) {
        return notes.find((note) => note.manifest.name === name);
      },
    },
  };
}
