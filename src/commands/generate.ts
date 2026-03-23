import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";

export function registerGenerateCommand(program: Command, engine: ArkEngine) {
  program
    .command("generate [specName]")
    .description("Generate code from a spec (or all specs if no name given)")
    .option("-a, --all", "Generate all specs")
    .action(async (specName: string | undefined, opts) => {
      await engine.init();

      if (opts.all || !specName) {
        const specs = await engine.registry.getAllSpecs();
        if (specs.length === 0) {
          console.log("\n  No specs found. Create one first.\n");
          return;
        }

        console.log(`\n  Generating ${specs.length} specs...\n`);
        let errors = 0;
        for (const spec of specs) {
          try {
            await engine.generateFromSpec(spec.name);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`  ✖ ${spec.name}: ${msg}`);
            errors++;
          }
        }
        console.log(`\n  Done. Generated files in generated/${errors > 0 ? ` (${errors} errors)` : ""}\n`);
      } else {
        try {
          const entryFile = await engine.generateFromSpec(specName);
          console.log(`\n  Generated: ${entryFile}\n`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`\n  ✖ ${msg}\n`);
          process.exit(1);
        }
      }
    });
}
