/**
 * WA-105 — design-doc command contrast tests: --wcag flag, failure summary,
 * contrastFailCount in JSON payload, and DESIGN.md Contrast section.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { Command } from "commander";

// Mocks must be declared before imports of the mocked modules
vi.mock("../../research/css-extractor.js", () => ({
  fetchPageAssets: vi.fn(),
  parseCSSTokens: vi.fn(),
}));

vi.mock("../../ai/client.js", () => ({
  getAI: vi.fn(),
  hasAI: vi.fn(),
}));

import { fetchPageAssets, parseCSSTokens } from "../../research/css-extractor.js";
import { getAI, hasAI } from "../../ai/client.js";
import { registerDesignDocCommand } from "../design-doc.js";
import { captureLogs } from "./test-helpers.js";

const mockFetchAssets = vi.mocked(fetchPageAssets);
const mockParseTokens = vi.mocked(parseCSSTokens);
const mockHasAI = vi.mocked(hasAI);
const mockGetAI = vi.mocked(getAI);

let testDir: string;

const MOCK_TOKENS_WITH_FAILURES = {
  colors: ["#e0e0e0", "#5b5bd6"],
  fonts: [],
  fontSizes: [],
  spacing: [],
  radii: [],
  shadows: [],
  cssVars: {},
  contrastPairs: [
    { fg: "#e0e0e0", bg: "#ffffff", ratio: 1.20, level: "fail" as const },
    { fg: "#e0e0e0", bg: "#000000", ratio: 17.50, level: "AAA" as const },
    { fg: "#5b5bd6", bg: "#ffffff", ratio: 4.56, level: "AA" as const },
    { fg: "#5b5bd6", bg: "#000000", ratio: 4.60, level: "AA" as const },
  ],
};

const MOCK_TOKENS_NO_FAILURES = {
  colors: ["#5b5bd6"],
  fonts: [],
  fontSizes: [],
  spacing: [],
  radii: [],
  shadows: [],
  cssVars: {},
  contrastPairs: [
    { fg: "#5b5bd6", bg: "#ffffff", ratio: 4.56, level: "AA" as const },
    { fg: "#5b5bd6", bg: "#000000", ratio: 4.60, level: "AA" as const },
  ],
};

beforeEach(async () => {
  testDir = join(tmpdir(), `design-doc-contrast-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });

  mockFetchAssets.mockResolvedValue({
    url: "https://example.com",
    title: "Example Site",
    html: "<html></html>",
    cssBlocks: [".btn { color: #e0e0e0; }"],
  });

  mockParseTokens.mockReturnValue(MOCK_TOKENS_WITH_FAILURES);
  mockHasAI.mockReturnValue(false);
  mockGetAI.mockReturnValue(null);
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  await rm(testDir, { recursive: true, force: true });
});

function makeEngine(projectRoot = testDir) {
  return {
    async init() {},
    config: { projectRoot },
    registry: { designSystem: { tokens: [], components: [], styles: [], lastSync: "" } },
  };
}

// WA-103: Contrast section in DESIGN.md (without --wcag)

describe("design-doc — contrast section in DESIGN.md (WA-103)", () => {
  it("DESIGN.md contains ## Contrast section header", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("## Contrast");
  });

  it("DESIGN.md contrast section includes summary line with counts", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("FAIL");
    expect(content).toContain("AAA");
    expect(content).toContain("AA");
  });

  it("DESIGN.md failure entry shows fg/bg hex and ratio", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("#e0e0e0");
    expect(content).toContain("1.20");
  });

  it("console prints contrast summary with FAIL count", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const allLogs = logs.join("\n");
    expect(allLogs).toContain("contrast");
    expect(allLogs).toContain("FAIL");
  });

  it("console prints [FAIL] detail line for each failing pair", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const allLogs = logs.join("\n");
    expect(allLogs).toContain("[FAIL]");
    expect(allLogs).toContain("needs 4.5 for AA");
  });

  it("console does not print [AA] or [AAA] detail lines without --wcag", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const allLogs = logs.join("\n");
    // Detail lines for passing levels should not appear (only failures shown)
    expect(allLogs).not.toContain("[AA]");
    expect(allLogs).not.toContain("[AAA]");
  });
});

// WA-104: --wcag flag

describe("design-doc --wcag flag (WA-104)", () => {
  it("--wcag writes markdown table to DESIGN.md with header row", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--wcag"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("| Foreground | Background | Ratio | Level |");
  });

  it("--wcag table includes all pairs (AA and AAA rows present)", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--wcag"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("AA");
    expect(content).toContain("AAA");
  });

  it("--wcag table includes failing pair", async () => {
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--wcag"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    expect(content).toContain("fail");
  });

  it("--wcag prints all pair detail lines to console (including [AA])", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--wcag"], { from: "user" });
    const allLogs = logs.join("\n");
    expect(allLogs).toContain("[AA]");
  });

  it("--wcag prints [AAA] detail line to console", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--wcag"], { from: "user" });
    const allLogs = logs.join("\n");
    expect(allLogs).toContain("[AAA]");
  });
});

// WA-103/104: JSON mode

describe("design-doc --json — contrastFailCount (WA-103/104)", () => {
  it("--json payload includes contrastFailCount field", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--json"], { from: "user" });
    const payload = JSON.parse(logs.at(-1)!);
    expect(typeof payload.contrastFailCount).toBe("number");
  });

  it("--json contrastFailCount reflects actual failing pairs", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--json"], { from: "user" });
    const payload = JSON.parse(logs.at(-1)!);
    // MOCK_TOKENS_WITH_FAILURES has 1 fail
    expect(payload.contrastFailCount).toBe(1);
  });

  it("--json contrastFailCount is 0 when no failures", async () => {
    mockParseTokens.mockReturnValue(MOCK_TOKENS_NO_FAILURES);
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com", "--json"], { from: "user" });
    const payload = JSON.parse(logs.at(-1)!);
    expect(payload.contrastFailCount).toBe(0);
  });

  it("failed --json payload has contrastFailCount of 0", async () => {
    mockFetchAssets.mockRejectedValue(new Error("Network error"));
    const logs = captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://bad.example.com", "--json"], { from: "user" });
    const payload = JSON.parse(logs.at(-1)!);
    expect(payload.contrastFailCount).toBe(0);
  });

  it("DESIGN.md contrast section is empty when no contrastPairs", async () => {
    mockParseTokens.mockReturnValue({
      ...MOCK_TOKENS_NO_FAILURES,
      contrastPairs: [],
    });
    captureLogs();
    const program = new Command();
    registerDesignDocCommand(program, makeEngine() as never);
    await program.parseAsync(["design-doc", "https://example.com"], { from: "user" });
    const content = await readFile(join(testDir, "DESIGN.md"), "utf-8");
    // No contrast section should appear when pairs is empty
    expect(content).not.toContain("## Contrast");
  });
});
