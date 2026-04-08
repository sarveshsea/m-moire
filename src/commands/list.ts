/**
 * List Command — Lists specs, tokens, design system components, or styles.
 *
 * Items are sorted by type then name for readability. A summary line at
 * the bottom reports counts by type (e.g. "3 components, 1 page, 0 dataviz specs").
 *
 * Usage:
 *   memi list              List all specs (default)
 *   memi list tokens       List design tokens sorted by type
 *   memi list components   List design system components
 *   memi list styles       List design system styles
 *   memi list --json       Emit { ok, elapsed, data } JSON payload
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { formatElapsed } from "../utils/format.js";

export interface ListPayload {
  type: string;
  items: Array<{ name: string; type?: string; [key: string]: unknown }>;
  count: number;
}

/**
 * Register the `memi list [type]` command onto the Commander program.
 *
 * Supports listing specs (default), tokens, components, and styles.
 * Results are sorted by type then name. Specs output includes a summary
 * count by type at the bottom.
 *
 * @param program  The root Commander Command instance.
 * @param engine   The initialised MemoireEngine.
 */
export function registerListCommand(program: Command, engine: MemoireEngine) {
  program
    .command("list [type]")
    .description("List specs, tokens, components, or styles (default: specs)")
    .option("--json", "Output as JSON")
    .action(async (type: string | undefined, opts: { json?: boolean }) => {
      const start = Date.now();
      await engine.init();
      const target = type ?? "specs";
      const payload = await collectList(engine, target);

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, elapsed: formatElapsed(Date.now() - start), data: payload }, null, 2));
        return;
      }

      printList(payload);
    });
}

async function collectList(engine: MemoireEngine, type: string): Promise<ListPayload> {
  const ds = engine.registry.designSystem;

  switch (type) {
    case "specs": {
      const specs = await engine.registry.getAllSpecs();
      const sorted = [...specs].sort((a, b) => {
        const typeCmp = (a.type ?? "").localeCompare(b.type ?? "");
        return typeCmp !== 0 ? typeCmp : a.name.localeCompare(b.name);
      });
      return {
        type: "specs",
        items: sorted.map((s) => ({ name: s.name, type: s.type, level: "level" in s ? s.level : undefined })),
        count: sorted.length,
      };
    }
    case "tokens": {
      const sorted = [...ds.tokens].sort((a, b) => {
        const typeCmp = (a.type ?? "").localeCompare(b.type ?? "");
        return typeCmp !== 0 ? typeCmp : a.name.localeCompare(b.name);
      });
      return {
        type: "tokens",
        items: sorted.map((t) => ({ name: t.name, type: t.type })),
        count: sorted.length,
      };
    }
    case "components": {
      const sorted = [...ds.components].sort((a, b) => a.name.localeCompare(b.name));
      return {
        type: "components",
        items: sorted.map((c) => ({ name: c.name, key: c.key })),
        count: sorted.length,
      };
    }
    case "styles": {
      const sorted = [...ds.styles].sort((a, b) => {
        const typeCmp = (a.type ?? "").localeCompare(b.type ?? "");
        return typeCmp !== 0 ? typeCmp : a.name.localeCompare(b.name);
      });
      return {
        type: "styles",
        items: sorted.map((s) => ({ name: s.name, type: s.type })),
        count: sorted.length,
      };
    }
    default:
      return { type, items: [], count: 0 };
  }
}

function printList(payload: ListPayload): void {
  if (payload.count === 0) {
    console.log(`\n  No ${payload.type} found.\n`);
    return;
  }

  console.log(`\n  ${payload.type} (${payload.count})\n`);
  for (const item of payload.items) {
    const suffix = item.type ? ` [${item.type}]` : "";
    console.log(`    ${item.name}${suffix}`);
  }

  // Summary line for specs
  if (payload.type === "specs") {
    const counts: Record<string, number> = {};
    for (const item of payload.items) {
      const t = (item.type as string) ?? "unknown";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const componentCount = counts["component"] ?? 0;
    const pageCount = counts["page"] ?? 0;
    const datavizCount = counts["dataviz"] ?? 0;
    console.log();
    console.log(`  ${componentCount} component${componentCount !== 1 ? "s" : ""}, ${pageCount} page${pageCount !== 1 ? "s" : ""}, ${datavizCount} dataviz spec${datavizCount !== 1 ? "s" : ""}`);
  }
  console.log();
}
