/**
 * `memi publish` — Take the current design system and write a publishable
 * registry package to disk. The user then runs `npm publish` themselves.
 *
 * Examples:
 *   memi publish --name @acme/design-system
 *   memi publish --name @acme/ds --version 1.0.0 --dir ./dist-registry
 *   memi publish --figma <url> --name @acme/ds   (pulls first)
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { resolve as resolvePath } from "path";
import ora from "ora";
import { ui } from "../tui/format.js";
import { publishRegistry } from "../registry/publisher.js";
import { marketplaceRegistryUrl, marketplaceComponentUrl } from "../registry/constants.js";
import type { ComponentSpec } from "../specs/types.js";
import { formatElapsed } from "../utils/format.js";

export interface PublishPayload {
  status: "published" | "failed";
  name: string;
  version: string;
  outDir: string;
  tokens: number;
  components: number;
  filesWritten: string[];
  elapsedMs: number;
  error?: string;
}

export function registerPublishCommand(program: Command, engine: MemoireEngine) {
  program
    .command("publish")
    .description("Build a distributable design system registry package (ready for `npm publish`)")
    .requiredOption("--name <name>", "npm package name (e.g. @acme/design-system)")
    .option("--version <version>", "Package version", "0.1.0")
    .option("--dir <dir>", "Output directory (default: ./<name-slug>)")
    .option("--description <text>", "Package description")
    .option("--homepage <url>", "Homepage URL (often your Figma file URL)")
    .option("--license <spdx>", "License identifier", "MIT")
    .option("--figma <url>", "Figma file URL (triggers REST pull before publish)")
    .option("--theme <path-or-url>", "tweakcn theme (CSS file path or share URL) — load tokens from it")
    .option("--framework <fw...>", "Bundle code for frameworks: react, vue, svelte (default: react)")
    .option("--specs-only", "Publish specs only — do not bundle generated code")
    .option("--push", "Run `npm publish --access public` after building the package")
    .option("--json", "Output results as JSON")
    .action(async (opts: {
      name: string;
      version: string;
      dir?: string;
      description?: string;
      homepage?: string;
      license?: string;
      figma?: string;
      theme?: string;
      framework?: string[];
      specsOnly?: boolean;
      push?: boolean;
      json?: boolean;
    }) => {
      const start = Date.now();
      await engine.init();

      // Optional pre-pull from Figma REST
      if (opts.figma) {
        const m = opts.figma.match(/figma\.com\/design\/([a-zA-Z0-9]+)/);
        if (m && m[1]) process.env.FIGMA_FILE_KEY = m[1];
        if (!opts.json) console.log(ui.dots("Pulling", "Figma REST → registry"));
        try {
          await engine.pullDesignSystemREST();
        } catch (err) {
          handleFail(opts, start, `Figma pull failed: ${(err as Error).message}`);
          return;
        }
      }

      // Optional: load tokens from a tweakcn theme (file or URL)
      if (opts.theme) {
        try {
          const { parseTweakcnCss, fetchTweakcnTheme } = await import("../integrations/tweakcn.js");
          const isUrl = /^https?:\/\//.test(opts.theme);
          if (!opts.json) console.log(ui.dots("Loading", `tweakcn theme (${isUrl ? "url" : "file"})`));
          const css = isUrl
            ? await fetchTweakcnTheme(opts.theme)
            : await (await import("node:fs/promises")).readFile(opts.theme, "utf-8");
          const { tokens, hasDarkMode } = parseTweakcnCss(css);
          if (tokens.length === 0) {
            handleFail(opts, start, `No tokens found in theme: ${opts.theme}`);
            return;
          }
          // Merge into the current design system (theme tokens win)
          const ds = engine.registry.designSystem;
          const byVar = new Map(ds.tokens.map(t => [t.cssVariable, t] as const));
          for (const t of tokens) byVar.set(t.cssVariable, t);
          await engine.registry.updateDesignSystem({
            tokens: [...byVar.values()],
            components: ds.components,
            styles: ds.styles,
            lastSync: new Date().toISOString(),
          });
          if (!opts.json) console.log(ui.ok(`Loaded ${tokens.length} tokens from tweakcn${hasDarkMode ? " (with dark mode)" : ""}`));
        } catch (err) {
          handleFail(opts, start, `Theme load failed: ${(err as Error).message}`);
          return;
        }
      }

      const ds = engine.registry.designSystem;
      if (ds.tokens.length === 0 && (await engine.registry.getAllSpecs()).length === 0) {
        handleFail(opts, start, "No tokens or specs to publish. Run `memi pull` or pass --theme first.");
        return;
      }

      const baseName = opts.name.replace(/^@[^/]+\//, "");
      const outDir = opts.dir ? resolvePath(opts.dir) : resolvePath(engine.config.projectRoot, baseName);
      const pkgVersion = (await import("../../package.json", { with: { type: "json" } })).default.version;

      const spinner = opts.json ? null : ora({ text: "Building registry...", indent: 2, color: "cyan" }).start();

      try {
        const componentSpecs = (await engine.registry.getAllSpecs())
          .filter((s): s is ComponentSpec => s.type === "component");

        const result = await publishRegistry({
          name: opts.name,
          version: opts.version,
          description: opts.description,
          homepage: opts.homepage ?? opts.figma,
          license: opts.license,
          outDir,
          designSystem: ds,
          specs: componentSpecs,
          memoireVersion: pkgVersion,
          sourceFigmaUrl: opts.figma,
          frameworks: (opts.framework as Array<"react" | "vue" | "svelte">) ?? ["react"],
          specsOnly: opts.specsOnly,
        });
        spinner?.stop();

        const payload: PublishPayload = {
          status: "published",
          name: opts.name,
          version: opts.version,
          outDir: result.outDir,
          tokens: ds.tokens.length,
          components: componentSpecs.length,
          filesWritten: result.filesWritten,
          elapsedMs: Date.now() - start,
        };

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log();
        console.log(ui.brand("REGISTRY PUBLISHED"));
        console.log(ui.ok(`${opts.name}@${opts.version}`));
        console.log(ui.dots("Output", result.outDir));
        console.log(ui.dots("Files", `${result.filesWritten.length}`));
        console.log(ui.dots("Tokens", `${ds.tokens.length}`));
        console.log(ui.dots("Components", `${componentSpecs.length}`));
        console.log(ui.dim(`  (${formatElapsed(Date.now() - start)})`));
        console.log();

        // Marketplace URLs — only active once `npm publish` has run
        const registryUrl = marketplaceRegistryUrl(opts.name);
        const sampleComponent = componentSpecs[0]?.name ?? "<Component>";
        const componentUrl = marketplaceComponentUrl(opts.name, sampleComponent);
        console.log(ui.dim("  View on Memoire:"));
        console.log(`    ${registryUrl}`);
        console.log(`    ${componentUrl}`);
        console.log(ui.dim("  Visible on the Marketplace within 1 hour of `npm publish`."));
        console.log();

        // Optional: run `npm publish --access public`
        if (opts.push) {
          const { spawnSync } = await import("node:child_process");
          console.log(ui.dots("npm publish", "running..."));
          const pub = spawnSync("npm", ["publish", "--access", "public"], {
            cwd: result.outDir,
            stdio: "inherit",
          });
          if (pub.status !== 0) {
            console.log(ui.fail(`npm publish exited ${pub.status}. Package built at ${result.outDir}`));
            process.exitCode = pub.status ?? 1;
            return;
          }
          console.log(ui.ok(`Published ${opts.name}@${opts.version} to npm`));
          console.log();
          console.log(ui.dim("  From any project:"));
          console.log(`    memi add <Component> --from ${opts.name}`);
        } else {
          console.log(ui.dim("  Next steps:"));
          console.log(`    cd ${result.outDir}`);
          console.log("    npm publish --access public");
          console.log(ui.dim("  Or:  memi publish --name " + opts.name + " --push"));
          console.log();
          console.log(ui.dim("  Then from any project:"));
          console.log(`    memi add <Component> --from ${opts.name}`);
        }
        console.log();
      } catch (err) {
        spinner?.stop();
        handleFail(opts, start, err instanceof Error ? err.message : String(err));
      }
    });
}

function handleFail(opts: { json?: boolean; name?: string; version?: string }, start: number, msg: string): void {
  const payload = {
    status: "failed" as const,
    name: opts.name ?? "",
    version: opts.version ?? "",
    outDir: "",
    tokens: 0,
    components: 0,
    filesWritten: [],
    elapsedMs: Date.now() - start,
    error: msg,
  };
  if (opts.json) console.log(JSON.stringify(payload, null, 2));
  else console.log(`\n  ${ui.fail(msg)}\n`);
  process.exitCode = 1;
}
