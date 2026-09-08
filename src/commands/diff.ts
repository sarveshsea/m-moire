/**
 * `memi diff` — Show what changed since the last design system pull.
 *
 * Compares the current registry state against the saved pull snapshot
 * and reports: new tokens, removed tokens, changed values, new/removed components.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { ui } from "../tui/format.js";
import type { DesignToken, DesignComponent, DesignSystem } from "../engine/registry.js";

export interface DiffPayload {
  tokens: {
    added: string[];
    removed: string[];
    changed: Array<{ name: string; field: string; from: string; to: string }>;
  };
  components: {
    added: string[];
    removed: string[];
  };
  lastSync: string | null;
  previousSync: string | null;
}

export function registerDiffCommand(program: Command, engine: MemoireEngine) {
  program
    .command("diff")
    .description("Show what changed since the last design system pull")
    .option("--json", "Output diff as JSON")
    .action(async (opts: { json?: boolean }) => {
      await engine.initReadOnly();

      const current = engine.registry.designSystem;
      const arkDir = join(engine.config.projectRoot, ".memoire");

      // Load previous snapshot
      let previous: DesignSystem | null = null;
      try {
        const snapPath = join(arkDir, "design-system.prev.json");
        const raw = await readFile(snapPath, "utf-8");
        previous = JSON.parse(raw);
      } catch {
        // No previous snapshot — first pull
      }

      if (!previous) {
        if (opts.json) {
          console.log(JSON.stringify({ error: "No previous pull snapshot found. Run `memi pull` first." }));
        } else {
          console.log();
          console.log(ui.pending("No previous pull snapshot. Run `memi pull` to establish a baseline."));
          console.log();
        }
        return;
      }

      const diff = computeDiff(previous, current);

      if (opts.json) {
        console.log(JSON.stringify(diff, null, 2));
        return;
      }

      const totalChanges = diff.tokens.added.length + diff.tokens.removed.length +
        diff.tokens.changed.length + diff.components.added.length + diff.components.removed.length;

      if (totalChanges === 0) {
        console.log();
        console.log(ui.ok("No changes since last pull"));
        if (diff.lastSync) console.log(ui.dim(`  Last sync: ${diff.lastSync}`));
        console.log();
        return;
      }

      console.log();
      console.log(ui.section("DESIGN SYSTEM DIFF"));
      console.log();

      if (diff.tokens.added.length > 0) {
        console.log(ui.ok(`${diff.tokens.added.length} new token${diff.tokens.added.length > 1 ? "s" : ""}`));
        for (const name of diff.tokens.added) {
          console.log(`    ${ui.green("+")} ${name}`);
        }
        console.log();
      }

      if (diff.tokens.removed.length > 0) {
        console.log(ui.warn(`${diff.tokens.removed.length} removed token${diff.tokens.removed.length > 1 ? "s" : ""}`));
        for (const name of diff.tokens.removed) {
          console.log(`    ${ui.red("-")} ${name}`);
        }
        console.log();
      }

      if (diff.tokens.changed.length > 0) {
        console.log(ui.active(`${diff.tokens.changed.length} changed token${diff.tokens.changed.length > 1 ? "s" : ""}`));
        for (const change of diff.tokens.changed) {
          console.log(`    ${ui.dim("~")} ${change.name}: ${change.from} → ${change.to}`);
        }
        console.log();
      }

      if (diff.components.added.length > 0) {
        console.log(ui.ok(`${diff.components.added.length} new component${diff.components.added.length > 1 ? "s" : ""}`));
        for (const name of diff.components.added) {
          console.log(`    ${ui.green("+")} ${name}`);
        }
        console.log();
      }

      if (diff.components.removed.length > 0) {
        console.log(ui.warn(`${diff.components.removed.length} removed component${diff.components.removed.length > 1 ? "s" : ""}`));
        for (const name of diff.components.removed) {
          console.log(`    ${ui.red("-")} ${name}`);
        }
        console.log();
      }

      console.log(ui.dim(`  Previous sync: ${diff.previousSync ?? "unknown"}`));
      console.log(ui.dim(`  Current sync:  ${diff.lastSync ?? "unknown"}`));
      console.log();
    });
}

function computeDiff(previous: DesignSystem, current: DesignSystem): DiffPayload {
  const prevTokenMap = new Map(previous.tokens.map(t => [t.name, t]));
  const currTokenMap = new Map(current.tokens.map(t => [t.name, t]));

  const addedTokens: string[] = [];
  const removedTokens: string[] = [];
  const changedTokens: DiffPayload["tokens"]["changed"] = [];

  // Find added and changed tokens
  for (const [name, token] of currTokenMap) {
    const prev = prevTokenMap.get(name);
    if (!prev) {
      addedTokens.push(name);
      continue;
    }
    // Check if values changed
    const prevVal = JSON.stringify(prev.values);
    const currVal = JSON.stringify(token.values);
    if (prevVal !== currVal) {
      const prevDefault = Object.values(prev.values)[0] ?? "";
      const currDefault = Object.values(token.values)[0] ?? "";
      changedTokens.push({
        name,
        field: "values",
        from: String(prevDefault),
        to: String(currDefault),
      });
    }
  }

  // Find removed tokens
  for (const name of prevTokenMap.keys()) {
    if (!currTokenMap.has(name)) {
      removedTokens.push(name);
    }
  }

  // Components diff
  const prevCompNames = new Set(previous.components.map(c => c.name));
  const currCompNames = new Set(current.components.map(c => c.name));

  const addedComponents = [...currCompNames].filter(n => !prevCompNames.has(n));
  const removedComponents = [...prevCompNames].filter(n => !currCompNames.has(n));

  return {
    tokens: { added: addedTokens, removed: removedTokens, changed: changedTokens },
    components: { added: addedComponents, removed: removedComponents },
    lastSync: current.lastSync,
    previousSync: previous.lastSync,
  };
}
