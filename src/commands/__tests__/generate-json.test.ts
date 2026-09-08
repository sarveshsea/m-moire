import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerGenerateCommand } from "../generate.js";
import { captureLogs, lastLog } from "./test-helpers.js";
import type { CodegenResult } from "../../codegen/generator.js";

afterEach(() => {
  resetExecutionPolicyForTests();
  vi.restoreAllMocks();
  process.exitCode = 0;
});

function okResult(entryFile: string): CodegenResult {
  return {
    entryFile,
    files: [{ path: entryFile, content: "" }],
    spec: { name: entryFile, type: "page" } as never,
    findings: [],
    blocked: false,
  };
}

describe("generate --json", () => {
  it("emits a structured success payload for a single spec", async () => {
    const logs = captureLogs();
    const engine = makeGenerateEngine({
      generateFromSpec: vi.fn(async (name: string) => okResult(`generated/pages/${name}.tsx`)),
    });
    const program = new Command();

    registerGenerateCommand(program, engine as never);
    await program.parseAsync(["generate", "LoginPage", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      mode: "single",
      status: "completed",
      target: "LoginPage",
      options: {
        all: false,
        json: true,
      },
      summary: {
        totalSpecs: 1,
        attempted: 1,
        generated: 1,
        failed: 0,
        blocked: 0,
      },
      generatedFiles: ["generated/pages/LoginPage.tsx"],
    });
    expect(payload.results).toEqual([
      {
        name: "LoginPage",
        status: "generated",
        entryFile: "generated/pages/LoginPage.tsx",
        error: null,
        findings: [],
      },
    ]);
  });

  it("emits a partial payload when generating all specs with mixed results", async () => {
    const logs = captureLogs();
    const engine = makeGenerateEngine({
      specs: [{ name: "Button" }, { name: "Dashboard" }, { name: "BrokenSpec" }],
      generateFromSpec: vi.fn(async (name: string) => {
        if (name === "BrokenSpec") {
          throw new Error("missing purpose");
        }
        return okResult(`generated/${name}.tsx`);
      }),
    });
    const program = new Command();

    registerGenerateCommand(program, engine as never);
    await program.parseAsync(["generate", "--all", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      mode: "all",
      status: "partial",
      target: null,
      options: {
        all: true,
        json: true,
      },
      summary: {
        totalSpecs: 3,
        attempted: 3,
        generated: 2,
        failed: 1,
        blocked: 0,
      },
      generatedFiles: ["generated/Button.tsx", "generated/Dashboard.tsx"],
    });
    expect(payload.results).toEqual([
      {
        name: "Button",
        status: "generated",
        entryFile: "generated/Button.tsx",
        error: null,
        findings: [],
      },
      {
        name: "Dashboard",
        status: "generated",
        entryFile: "generated/Dashboard.tsx",
        error: null,
        findings: [],
      },
      {
        name: "BrokenSpec",
        status: "failed",
        entryFile: null,
        error: "missing purpose",
        findings: [],
      },
    ]);
  });

  it("returns a failure payload and exit code for JSON generation errors", async () => {
    const logs = captureLogs();
    const engine = makeGenerateEngine({
      generateFromSpec: vi.fn(async () => {
        throw new Error("spec not found");
      }),
    });
    const program = new Command();

    registerGenerateCommand(program, engine as never);
    await program.parseAsync(["generate", "MissingSpec", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toMatchObject({
      mode: "single",
      status: "failed",
      target: "MissingSpec",
      summary: {
        totalSpecs: 1,
        attempted: 1,
        generated: 0,
        failed: 1,
        blocked: 0,
      },
      error: {
        message: "spec not found",
      },
    });
    expect(payload.results).toEqual([
      {
        name: "MissingSpec",
        status: "failed",
        entryFile: null,
        error: "spec not found",
        findings: [],
      },
    ]);
    expect(process.exitCode).toBe(1);
  });
});

function makeGenerateEngine(input?: {
  specs?: Array<{ name: string }>;
  generateFromSpec?: (name: string) => Promise<CodegenResult>;
}) {
  configureExecutionPolicy({ projectRoot: process.cwd(), profile: "connected", allow: ["project-write", "source-content-persistence"] });
  return {
    async initReadOnly() {},
    // loadPolicy(projectRoot) falls back to the default policy when no
    // memoire.policy.json exists at this path.
    config: { projectRoot: process.cwd() },
    codegen: {
      setOptions() {},
    },
    registry: {
      async getAllSpecs() {
        return input?.specs ?? [{ name: "LoginPage" }];
      },
    },
    async generateFromSpec(name: string) {
      if (input?.generateFromSpec) {
        return input.generateFromSpec(name);
      }
      return okResult(`generated/${name}.tsx`);
    },
  };
}
