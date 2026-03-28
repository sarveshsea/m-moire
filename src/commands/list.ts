import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";

export interface ListPayload {
  type: string;
  items: Array<{ name: string; type?: string; [key: string]: unknown }>;
  count: number;
}

export function registerListCommand(program: Command, engine: MemoireEngine) {
  program
    .command("list [type]")
    .description("List specs, tokens, components, or styles (default: specs)")
    .option("--json", "Output as JSON")
    .action(async (type: string | undefined, opts: { json?: boolean }) => {
      await engine.init();
      const target = type ?? "specs";
      const payload = await collectList(engine, target);

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
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
      return {
        type: "specs",
        items: specs.map((s) => ({ name: s.name, type: s.type, level: "level" in s ? s.level : undefined })),
        count: specs.length,
      };
    }
    case "tokens":
      return {
        type: "tokens",
        items: ds.tokens.map((t) => ({ name: t.name, type: t.type })),
        count: ds.tokens.length,
      };
    case "components":
      return {
        type: "components",
        items: ds.components.map((c) => ({ name: c.name, type: c.type })),
        count: ds.components.length,
      };
    case "styles":
      return {
        type: "styles",
        items: ds.styles.map((s) => ({ name: s.name, type: s.styleType })),
        count: ds.styles.length,
      };
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
  console.log();
}
