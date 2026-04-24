import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { MemoireEngine } from "../../engine/core.js";
import { registerTokensCommand } from "../tokens.js";
import { captureLogs, lastLog } from "./test-helpers.js";

const THEME_CSS = `
:root {
  --background: #ffffff;
  --foreground: #111827;
  --primary: #2563eb;
  --radius: 0.75rem;
  --space-4: 1rem;
}

.dark {
  --background: #020617;
  --foreground: #f8fafc;
  --primary: #60a5fa;
}

.card {
  color: #2563eb;
  padding: 16px;
}

.button {
  background: #2563eb;
  margin: 16px;
}
`;

let projectRoot = "";
let cssPath = "";

beforeEach(async () => {
  projectRoot = join(tmpdir(), `memoire-tokens-extract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(projectRoot, { recursive: true });
  cssPath = join(projectRoot, "globals.css");
  await writeFile(cssPath, THEME_CSS, "utf-8");
});

afterEach(async () => {
  process.exitCode = 0;
  await rm(projectRoot, { recursive: true, force: true });
});

describe("tokens --from", () => {
  it("emits extraction report JSON for a local CSS file", async () => {
    const logs = captureLogs();
    const engine = new MemoireEngine({ projectRoot });
    const program = new Command();
    registerTokensCommand(program, engine);

    await program.parseAsync(["tokens", "--from", cssPath, "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload.status).toBe("extracted");
    expect(payload.count).toBeGreaterThan(0);
    expect(payload.report.modes).toEqual(["default", "dark"]);
    expect(payload.report.semanticCoverage.present).toContain("background");
    expect(payload.report.summary.inferredTokenCount).toBeGreaterThan(0);
  });

  it("can save extracted tokens into the design system registry", async () => {
    const logs = captureLogs();
    const engine = new MemoireEngine({ projectRoot });
    const program = new Command();
    registerTokensCommand(program, engine);

    await program.parseAsync(["tokens", "--from", cssPath, "--save", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    const registry = JSON.parse(await readFile(join(projectRoot, ".memoire", "design-system.json"), "utf-8"));

    expect(payload.saved).toBe(true);
    expect(registry.tokens.some((token: { cssVariable: string }) => token.cssVariable === "--background")).toBe(true);
    expect(registry.tokens.some((token: { collection: string }) => token.collection.startsWith("inferred-literal:"))).toBe(true);
  });

  it("writes an auditable extraction report", async () => {
    const logs = captureLogs();
    const engine = new MemoireEngine({ projectRoot });
    const program = new Command();
    registerTokensCommand(program, engine);

    await program.parseAsync(
      ["tokens", "--from", cssPath, "--report", "--output", "token-artifacts", "--json"],
      { from: "user" },
    );

    const payload = JSON.parse(lastLog(logs));
    const reportJson = JSON.parse(await readFile(payload.reportFiles.json, "utf-8"));
    const reportMarkdown = await readFile(payload.reportFiles.markdown, "utf-8");

    expect(reportJson.summary.tokenCount).toBeGreaterThan(0);
    expect(reportMarkdown).toContain("Token Extraction Report");
    expect(reportMarkdown).toContain("Mode Coverage");
  });
});
