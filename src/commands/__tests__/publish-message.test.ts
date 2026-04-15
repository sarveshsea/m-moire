/**
 * `memi publish` success-message test — verifies the Marketplace URL
 * section is printed in the human-readable success output and embeds
 * the correct package name.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { MemoireEngine } from "../../engine/core.js";
import { registerPublishCommand } from "../publish.js";
import { captureLogs } from "./test-helpers.js";

const tempDirs: string[] = [];

async function createEngine(): Promise<{ engine: MemoireEngine; projectRoot: string }> {
  const projectRoot = join(
    tmpdir(),
    `memoire-publish-msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  tempDirs.push(projectRoot);
  await mkdir(projectRoot, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ name: "publish-msg-test" }, null, 2),
  );
  const engine = new MemoireEngine({ projectRoot });
  await engine.init();
  // Seed a minimal design system so publish doesn't bail out on "no tokens"
  engine.registry.addToken({
    name: "primary",
    collection: "colors",
    type: "color",
    values: { default: "#0066ff" },
    cssVariable: "--color-primary",
  });
  return { engine, projectRoot };
}

afterEach(async () => {
  process.exitCode = 0;
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
  delete process.env.MEMOIRE_MARKETPLACE_URL;
});

describe("memi publish — Marketplace URL success message", () => {
  let engine: MemoireEngine;
  let projectRoot: string;

  beforeEach(async () => {
    const created = await createEngine();
    engine = created.engine;
    projectRoot = created.projectRoot;
  });

  it("prints registry + component Marketplace URLs with the right package name", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerPublishCommand(program, engine);

    const outDir = join(projectRoot, "out-registry");

    await program.parseAsync(
      [
        "publish",
        "--name",
        "@acme/design-system",
        "--version",
        "1.2.0",
        "--dir",
        outDir,
      ],
      { from: "user" },
    );

    const joined = logs.join("\n");
    expect(joined).toContain("View on Memoire:");
    expect(joined).toContain("https://memoire.cv/r/@acme/design-system");
    expect(joined).toContain("https://memoire.cv/components/@acme/design-system/");
    expect(joined).toContain("Visible on the Marketplace within 1 hour");
    // Existing next-step output must still be present
    expect(joined).toContain("npm publish --access public");
  });
});
