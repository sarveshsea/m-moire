/**
 * Tests for `memi view <component>` — Marketplace URL resolution.
 *
 * Every test uses --print or --json so the command never attempts to
 * actually spawn a system browser.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerViewCommand, parseComponentRef } from "../view.js";
import { captureLogs, lastLog } from "./test-helpers.js";

/**
 * Minimal fake engine — only surfaces `init` and `registry.getSpec` used by the
 * command.
 */
function makeFakeEngine(spec: unknown = null) {
  return {
    init: vi.fn(async () => {}),
    registry: {
      getSpec: vi.fn(async () => spec),
    },
  } as unknown as import("../../engine/core.js").MemoireEngine;
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
  delete process.env.MEMOIRE_MARKETPLACE_URL;
});

describe("parseComponentRef", () => {
  it("parses bare component names", () => {
    expect(parseComponentRef("Button")).toEqual({ component: "Button" });
  });
  it("parses @scope/name/Component refs", () => {
    expect(parseComponentRef("@acme/ds/Button")).toEqual({
      registry: "@acme/ds",
      component: "Button",
    });
  });
  it("parses unscoped registry/Component refs", () => {
    expect(parseComponentRef("acme-ds/Card")).toEqual({
      registry: "acme-ds",
      component: "Card",
    });
  });
});

describe("memi view", () => {
  it("assembles the URL from a fully-qualified @scope/name/Component ref", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerViewCommand(program, makeFakeEngine());

    await program.parseAsync(["view", "@acme/ds/Button", "--print"], { from: "user" });

    expect(lastLog(logs)).toBe("https://memoire.cv/components/@acme/ds/Button");
  });

  it("uses --from when a bare component name is given", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerViewCommand(program, makeFakeEngine());

    await program.parseAsync(
      ["view", "Button", "--from", "@acme/ds", "--print"],
      { from: "user" },
    );

    expect(lastLog(logs)).toBe("https://memoire.cv/components/@acme/ds/Button");
  });

  it("errors out when no --from and no matching local spec", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerViewCommand(program, makeFakeEngine(null));

    await program.parseAsync(["view", "Button", "--json"], { from: "user" });

    const payload = JSON.parse(lastLog(logs));
    expect(payload.status).toBe("failed");
    expect(payload.error).toMatch(/Cannot resolve source registry/);
    expect(process.exitCode).toBe(1);
  });

  it("reads registry from the local spec's __memoireSource when no --from given", async () => {
    const logs = captureLogs();
    const program = new Command();
    const spec = {
      name: "Button",
      type: "component",
      __memoireSource: { registry: "@acme/ds", version: "1.2.0" },
    };
    registerViewCommand(program, makeFakeEngine(spec));

    await program.parseAsync(["view", "Button", "--print"], { from: "user" });

    expect(lastLog(logs)).toBe("https://memoire.cv/components/@acme/ds/Button");
  });

  it("--json emits structured payload", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerViewCommand(program, makeFakeEngine());

    await program.parseAsync(
      ["view", "@acme/ds/Button", "--json"],
      { from: "user" },
    );

    const payload = JSON.parse(lastLog(logs));
    expect(payload).toEqual({
      status: "printed",
      url: "https://memoire.cv/components/@acme/ds/Button",
      component: "Button",
      registry: "@acme/ds",
    });
  });
});
