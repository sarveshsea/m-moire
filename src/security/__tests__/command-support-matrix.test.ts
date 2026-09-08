import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { MEMI_CAPABILITIES, createExecutionPolicy } from "../execution-policy.js";
import { preflightCommand } from "../command-preflight.js";

async function commandTree(): Promise<Command> {
  const program = new Command();
  for (const file of await readdir(join(import.meta.dirname, "../../commands"))) {
    if (!file.endsWith(".ts")) continue;
    const module = await import(/* @vite-ignore */ `../../commands/${file}`);
    for (const [name, register] of Object.entries(module)) {
      if (/^register.+Command$/.test(name)) (register as Function)(program, { config: { projectRoot: process.cwd() } });
    }
  }
  return program;
}

function actionPaths(command: Command, parent: string[] = []): string[][] {
  return command.commands.flatMap(child => {
    const path = [...parent, child.name()];
    return [...((child as unknown as { _actionHandler?: unknown })._actionHandler ? [path] : []), ...actionPaths(child, path)];
  });
}

describe("complete Commander support matrix", () => {
  it("classifies every registered action as admitted or deliberately unavailable with replacement guidance", async () => {
    const paths = [...actionPaths(await commandTree()), ["uninstall"]];
    expect(paths.length).toBeGreaterThan(150);
    const policy = createExecutionPolicy({ projectRoot: process.cwd(), profile: "connected", allow: MEMI_CAPABILITIES });
    const unclassified: string[] = [];
    for (const commandPath of paths) {
      try { await preflightCommand(policy, { commandPath, options: {}, args: [] }); }
      catch (error) {
        const denial = error as { capability?: string; operation?: string };
        if (denial.capability === "command-mapping" && !denial.operation?.includes("unavailable")) unclassified.push(commandPath.join("."));
      }
    }
    expect(unclassified).toEqual([]);
  });
  it("keeps aliases canonical and denies unknown future command paths", async () => {
    const tree = await commandTree();
    expect(tree.commands.find(command => command.aliases().includes("extract"))?.name()).toBe("design-doc");
    expect(tree.commands.find(command => command.aliases().includes("dash"))?.name()).toBe("dashboard");
    await expect(preflightCommand(createExecutionPolicy({ projectRoot: process.cwd(), profile: "connected", allow: MEMI_CAPABILITIES }), { commandPath: ["future-command"], options: {}, args: [] })).rejects.toMatchObject({ capability: "command-mapping", operation: 'execute unmapped command "future-command"' });
  });
});
