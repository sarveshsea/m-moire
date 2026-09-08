import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { MemoireEngine } from "../../engine/core.js";
import { registerThemeCommand } from "../theme.js";
import { captureLogs } from "./test-helpers.js";

const FULL_THEME = `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 222.2 47.4% 21.2%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.75rem;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --secondary: 217.2 32.6% 17.5%;
  --secondary-foreground: 210 40% 98%;
  --accent: 217.2 32.6% 17.5%;
  --accent-foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --muted-foreground: 210 40% 78%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --popover: 222.2 84% 4.9%;
  --popover-foreground: 210 40% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 210 40% 98%;
  --border: 217.2 32.6% 17.5%;
  --input: 217.2 32.6% 17.5%;
  --ring: 224.3 76.3% 48%;
}
`;

const tempDirs: string[] = [];

async function createEngine(): Promise<{ engine: MemoireEngine; projectRoot: string; themePath: string }> {
  const projectRoot = join(tmpdir(), `memoire-theme-command-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tempDirs.push(projectRoot);
  configureExecutionPolicy({ projectRoot, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, "package.json"), JSON.stringify({ name: "theme-command-test" }, null, 2));
  const themePath = join(projectRoot, "acme-theme.css");
  await writeFile(themePath, FULL_THEME, "utf-8");
  const engine = new MemoireEngine({ projectRoot });
  await engine.init();
  return { engine, projectRoot, themePath };
}

afterEach(async () => {
  resetExecutionPolicyForTests();
  process.exitCode = 0;
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("memi theme", () => {
  let engine: MemoireEngine;
  let projectRoot: string;
  let themePath: string;

  beforeEach(async () => {
    const created = await createEngine();
    engine = created.engine;
    projectRoot = created.projectRoot;
    themePath = created.themePath;
  });

  it("imports a theme and returns JSON metadata", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerThemeCommand(program, engine);

    await program.parseAsync(
      ["theme", "import", themePath, "--name", "Acme Theme", "--json"],
      { from: "user" },
    );

    const payload = JSON.parse(logs.join("\n"));
    expect(payload.status).toBe("imported");
    expect(payload.theme.slug).toBe("acme-theme");
    expect(payload.theme.tokens).toBeGreaterThan(10);
  });

  it("applies the latest imported theme and writes preview output", async () => {
    const importProgram = new Command();
    registerThemeCommand(importProgram, engine);
    await importProgram.parseAsync(
      ["theme", "import", themePath, "--name", "Acme Theme", "--json"],
      { from: "user" },
    );

    const logs = captureLogs();
    const program = new Command();
    registerThemeCommand(program, engine);

    await program.parseAsync(
      ["theme", "apply", "Acme Theme", "--json"],
      { from: "user" },
    );

    const payload = JSON.parse(logs.join("\n"));
    expect(payload.status).toBe("applied");
    expect(payload.registryUpdated).toBe(true);
    expect(payload.previewFile).toContain("theme-preview.html");
  });

  it("creates variants and builds a publishable theme package", async () => {
    const importProgram = new Command();
    registerThemeCommand(importProgram, engine);
    await importProgram.parseAsync(
      ["theme", "import", themePath, "--name", "Acme Theme", "--json"],
      { from: "user" },
    );

    const variantLogs = captureLogs();
    const variantsProgram = new Command();
    registerThemeCommand(variantsProgram, engine);
    await variantsProgram.parseAsync(
      ["theme", "variants", "Acme Theme", "--recipe", "warm", "high-contrast", "--json"],
      { from: "user" },
    );
    const variants = JSON.parse(variantLogs.join("\n"));
    expect(variants.status).toBe("variants-created");
    expect(variants.variants).toHaveLength(2);

    const publishLogs = captureLogs();
    const publishProgram = new Command();
    registerThemeCommand(publishProgram, engine);
    await publishProgram.parseAsync(
      ["theme", "publish", "Acme Theme", "--package", "@acme/theme", "--json"],
      { from: "user" },
    );
    const payload = JSON.parse(publishLogs.join("\n"));
    expect(payload.status).toBe("published");
    expect(payload.packageName).toBe("@acme/theme");
    expect(payload.previewArtifact).toContain("theme-preview.html");
  });
});
