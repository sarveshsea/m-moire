/**
 * End-to-end pipeline test — init → auto-spec → generate → verify output.
 *
 * Uses a mock design system (no Figma connection required) to exercise
 * the full spec-to-code pipeline.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { MemoireEngine } from "../core.js";
import type { DesignSystem } from "../registry.js";
import type { MemoireEvent } from "../core.js";

let testDir: string;
let engine: MemoireEngine;
let events: MemoireEvent[];

// pino-pretty transports spawn workers that add process "exit" listeners —
// one per MemoireEngine logger.  Five tests × several loggers → warning.
const originalMax = process.getMaxListeners();
beforeAll(() => process.setMaxListeners(50));
afterAll(() => process.setMaxListeners(originalMax));

beforeEach(async () => {
  testDir = join(tmpdir(), `memoire-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });

  engine = new MemoireEngine({ projectRoot: testDir });
  events = [];
  engine.on("event", (evt: MemoireEvent) => events.push(evt));
});

afterEach(async () => {
  engine.removeAllListeners();
  await rm(testDir, { recursive: true, force: true });
});

/** Inject a fake design system into the registry without Figma */
async function injectDesignSystem(ds: DesignSystem): Promise<void> {
  await engine.registry.updateDesignSystem(ds);
}

const MOCK_DESIGN_SYSTEM: DesignSystem = {
  tokens: [
    { name: "primary", collection: "colors", type: "color", values: { light: "#3b82f6", dark: "#60a5fa" }, cssVariable: "--primary" },
    { name: "radius-md", collection: "radii", type: "radius", values: { default: 8 }, cssVariable: "--radius-md" },
    { name: "space-4", collection: "spacing", type: "spacing", values: { default: 16 }, cssVariable: "--space-4" },
  ],
  components: [
    {
      name: "StatusBadge",
      key: "badge-001",
      description: "A status badge showing online/offline state",
      variants: ["online", "offline", "away"],
      properties: { label: { type: "TEXT", defaultValue: "Online" } },
      figmaNodeId: "1:100",
    },
    {
      name: "UserCard",
      key: "card-001",
      description: "A card displaying user profile info",
      variants: ["default", "compact"],
      properties: {
        name: { type: "TEXT" },
        avatar: { type: "TEXT" },
        role: { type: "TEXT" },
      },
      figmaNodeId: "1:200",
    },
    {
      name: "AppHeader",
      key: "header-001",
      description: "Main application header with navigation",
      variants: ["default"],
      properties: {
        logo: { type: "TEXT" },
        title: { type: "TEXT" },
        showSearch: { type: "BOOLEAN" },
        showNav: { type: "BOOLEAN" },
        userMenu: { type: "INSTANCE_SWAP" },
        navItems: { type: "TEXT" },
      },
      figmaNodeId: "1:300",
    },
  ],
  styles: [
    { name: "heading-lg", type: "text", value: { fontSize: 32, fontWeight: 700 } },
  ],
  lastSync: new Date().toISOString(),
};

describe("E2E Pipeline", () => {
  it("init → auto-spec → generate → verify (full pipeline)", async () => {
    // Step 1: Initialize engine
    await engine.init();
    expect(events.some((e) => e.type === "success" && e.source === "engine")).toBe(true);

    // Verify .memoire directory was created
    const memoireDir = join(testDir, ".memoire");
    const dirStat = await stat(memoireDir);
    expect(dirStat.isDirectory()).toBe(true);

    // Step 2: Inject mock design system
    await injectDesignSystem(MOCK_DESIGN_SYSTEM);
    const ds = engine.registry.designSystem;
    expect(ds.tokens).toHaveLength(3);
    expect(ds.components).toHaveLength(3);

    // Step 3: Auto-generate specs from design system
    const specCount = await engine.autoSpec();
    expect(specCount).toBe(3);

    // Verify specs were created on disk
    const allSpecs = await engine.registry.getAllSpecs();
    expect(allSpecs).toHaveLength(3);

    const specNames = allSpecs.map((s) => s.name).sort();
    expect(specNames).toEqual(["Appheader", "Statusbadge", "Usercard"]);

    // Verify atomic levels were inferred correctly
    const badge = allSpecs.find((s) => s.name === "Statusbadge");
    const card = allSpecs.find((s) => s.name === "Usercard");
    const header = allSpecs.find((s) => s.name === "Appheader");

    expect(badge?.type).toBe("component");
    expect(card?.type).toBe("component");
    expect(header?.type).toBe("component");

    // Step 4: Generate code for each spec
    for (const spec of allSpecs) {
      const entryFile = await engine.generateFromSpec(spec.name);
      expect(entryFile).toBeTruthy();
      expect(entryFile.endsWith(".tsx")).toBe(true);
    }

    // Step 5: Verify generated files exist
    const generatedDir = join(testDir, "generated");
    const genDirStat = await stat(generatedDir);
    expect(genDirStat.isDirectory()).toBe(true);

    // Check that component subdirectories were created (atomic folders)
    const genEntries = await readdir(join(generatedDir, "components"));
    expect(genEntries.length).toBeGreaterThanOrEqual(1);

    // Step 6: Verify generated code is valid TypeScript-ish
    for (const spec of allSpecs) {
      if (spec.type !== "component") continue;

      // Find the generated file
      const possibleDirs = ["ui", "molecules", "organisms", "templates"];
      let found = false;

      for (const sub of possibleDirs) {
        try {
          const subDir = join(generatedDir, "components", sub, spec.name);
          const files = await readdir(subDir);
          const tsxFile = files.find((f) => f.endsWith(".tsx") && !f.endsWith(".stories.tsx"));

          if (tsxFile) {
            const content = await readFile(join(subDir, tsxFile), "utf8");
            expect(content).toContain('"use client"');
            expect(content).toContain("export");
            expect(content).toContain("interface");
            found = true;
            break;
          }
        } catch {
          // Directory doesn't exist for this atomic level, try next
        }
      }

      expect(found).toBe(true);
    }

    // Step 7: Verify codegen events were emitted
    const codegenEvents = events.filter((e) => e.source === "codegen" && e.type === "success");
    expect(codegenEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("auto-spec skips existing specs", async () => {
    await engine.init();
    await injectDesignSystem(MOCK_DESIGN_SYSTEM);

    // First run creates 3 specs
    const first = await engine.autoSpec();
    expect(first).toBe(3);

    // Second run creates 0 — all already exist
    const second = await engine.autoSpec();
    expect(second).toBe(0);
  });

  it("generateFromSpec throws for unknown spec", async () => {
    await engine.init();
    await expect(engine.generateFromSpec("NonexistentSpec")).rejects.toThrow("not found");
  });

  it("design system round-trips through registry", async () => {
    await engine.init();
    await injectDesignSystem(MOCK_DESIGN_SYSTEM);

    // Reload registry from disk
    const freshRegistry = new (await import("../registry.js")).Registry(join(testDir, ".memoire"));
    await freshRegistry.load();

    expect(freshRegistry.designSystem.tokens).toHaveLength(3);
    expect(freshRegistry.designSystem.components).toHaveLength(3);
    expect(freshRegistry.designSystem.styles).toHaveLength(1);
  });

  it("event stream captures full pipeline lifecycle", async () => {
    await engine.init();
    await injectDesignSystem(MOCK_DESIGN_SYSTEM);
    await engine.autoSpec();

    const allSpecs = await engine.registry.getAllSpecs();
    for (const spec of allSpecs) {
      await engine.generateFromSpec(spec.name);
    }

    // Verify event sources cover all stages
    const sources = new Set(events.map((e) => e.source));
    expect(sources.has("engine")).toBe(true);
    expect(sources.has("codegen")).toBe(true);
  });
});
