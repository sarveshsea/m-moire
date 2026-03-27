import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Command } from "commander";
import { registerInitCommand } from "../init.js";

let projectRoot: string;

beforeEach(async () => {
  projectRoot = join(tmpdir(), `memoire-init-idempotent-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(projectRoot, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
});

describe("init idempotence", () => {
  it("does not overwrite starter specs that already exist", async () => {
    const logs = captureLogs();
    const program = new Command();
    const engine = makeInitEngine({
      existingSpecs: new Set(["MetricCard", "ActivityChart", "Dashboard"]),
    });

    registerInitCommand(program, engine as never);
    await program.parseAsync(["init"], { from: "user" });

    expect(engine.registry.saveSpec).not.toHaveBeenCalled();
    expect(engine.generateFromSpec).not.toHaveBeenCalled();
    expect(logs.some((line) => line.includes("Starter specs already present. Skipping regeneration."))).toBe(true);
  });

  it("only generates starter specs created in the current run", async () => {
    const program = new Command();
    const engine = makeInitEngine({
      existingSpecs: new Set(["MetricCard"]),
    });

    registerInitCommand(program, engine as never);
    await program.parseAsync(["init"], { from: "user" });

    expect(engine.registry.saveSpec).toHaveBeenCalledTimes(2);
    expect(engine.generateFromSpec).toHaveBeenCalledTimes(2);
    expect(engine.generateFromSpec).toHaveBeenNthCalledWith(1, "ActivityChart");
    expect(engine.generateFromSpec).toHaveBeenNthCalledWith(2, "Dashboard");
  });
});

function makeInitEngine(input: { existingSpecs: Set<string> }) {
  const existingSpecs = input.existingSpecs;

  return {
    config: { projectRoot },
    project: {
      framework: "vite",
      language: "typescript",
      styling: { tailwind: true },
      shadcn: { installed: true, components: ["button", "card"] },
    },
    init: vi.fn(async () => {}),
    generateFromSpec: vi.fn(async () => "generated.tsx"),
    registry: {
      getSpec: vi.fn(async (name: string) => (existingSpecs.has(name) ? { name } : null)),
      saveSpec: vi.fn(async (spec: { name: string }) => {
        existingSpecs.add(spec.name);
      }),
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
