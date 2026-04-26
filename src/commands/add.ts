/**
 * `memi add <component> --from <registry>` — install a component from
 * a Memoire registry (the shadcn pattern, for design systems).
 *
 * Examples:
 *   memi add Button --from @acme/design-system
 *   memi add Card --from github:acme/ds
 *   memi add Badge --from ./path/to/registry
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import ora from "ora";
import { ui } from "../tui/format.js";
import { installComponent, listRegistryComponents } from "../registry/installer.js";
import { npmPackageUrl } from "../registry/constants.js";
import { resolveMarketplaceAlias } from "../marketplace/catalog-loader.js";
import { formatElapsed } from "../utils/format.js";

export interface AddPayload {
  status: "installed" | "failed" | "listed";
  component?: string;
  from: string;
  specPath?: string;
  tokensPath?: string;
  generated: string[];
  available?: string[];
  suggestions?: string[];
  usageSnippet?: string;
  tokenInstallCommand?: string;
  packageUrl?: string;
  sourceUrl?: string;
  elapsedMs: number;
  error?: string;
}

export function registerAddCommand(program: Command, engine: MemoireEngine) {
  program
    .command("add [component]")
    .description("Install a component from a Memoire registry (npm / github / https / local)")
    .option("--from <registry>", "Registry reference (e.g. @acme/ds, github:user/repo, ./local/path)")
    .option("--tokens", "Also install tokens.css from the registry")
    .option("--regenerate", "Run local codegen instead of using bundled code")
    .option("--target <dir>", "Target directory (default: src/components/memoire)")
    .option("--refresh", "Refresh cached npm registry packages before resolving")
    .option("--list", "List components in the registry without installing")
    .option("--json", "Output as JSON")
    .action(async (component: string | undefined, opts: {
      from?: string;
      tokens?: boolean;
      regenerate?: boolean;
      target?: string;
      refresh?: boolean;
      list?: boolean;
      json?: boolean;
    }) => {
      const start = Date.now();
      if (!opts.from) {
        const err = "Missing --from <registry>. Example: memi add Button --from @acme/design-system";
        if (opts.json) console.log(JSON.stringify({ status: "failed", error: err }));
        else console.error(`\n  ${err}\n`);
        process.exitCode = 1;
        return;
      }

      await engine.init();

      if (opts.list || !component) {
        await handleList(opts.from, opts.json, start, opts.refresh);
        return;
      }

      const spinner = opts.json ? null : ora({
        text: `Installing ${component} from ${opts.from}...`, indent: 2, color: "cyan",
      }).start();

      try {
        const result = await installComponent(engine, {
          from: opts.from,
          name: component,
          withTokens: opts.tokens,
          regenerate: opts.regenerate,
          targetDir: opts.target,
          refresh: opts.refresh,
        });
        spinner?.stop();

        const payload: AddPayload = {
          status: "installed",
          component,
          from: opts.from,
          specPath: result.specPath,
          tokensPath: result.tokensPath,
          generated: result.generatedFiles,
          elapsedMs: Date.now() - start,
        };
        const hints = await buildMarketplaceAddHints(opts.from, component, opts.tokens === true);
        Object.assign(payload, hints);

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log();
        console.log(ui.ok(`Installed ${component} from ${result.source}`));
        if (result.codePath) console.log(ui.dim(`  Code:   ${result.codePath}`));
        console.log(ui.dim(`  Spec:   ${result.specPath}`));
        if (result.tokensPath) console.log(ui.dim(`  Tokens: ${result.tokensPath}`));
        if (hints.usageSnippet) {
          console.log();
          console.log(ui.section("USAGE"));
          console.log(hints.usageSnippet.split("\n").map((line) => `  ${line}`).join("\n"));
        }
        if (hints.tokenInstallCommand && !result.tokensPath) {
          console.log();
          console.log(ui.dim(`  Tokens: ${hints.tokenInstallCommand}`));
        }
        if (hints.packageUrl || hints.sourceUrl) {
          console.log();
          if (hints.packageUrl) console.log(ui.dim(`  npm:    ${hints.packageUrl}`));
          if (hints.sourceUrl) console.log(ui.dim(`  Source: ${hints.sourceUrl}`));
        }
        console.log(ui.dim(`  (${formatElapsed(Date.now() - start)})`));
        console.log();
      } catch (err) {
        spinner?.stop();
        const msg = err instanceof Error ? err.message : String(err);
        const suggestions = await suggestRegistryComponents(opts.from, component).catch(() => []);
        const payload: AddPayload = {
          status: "failed",
          component,
          from: opts.from,
          generated: [],
          elapsedMs: Date.now() - start,
          error: msg,
          suggestions,
        };
        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          console.log();
          console.log(ui.fail(`Install failed: ${msg}`));
          if (suggestions.length > 0) {
            console.log();
            console.log(ui.dim(`  Available: ${suggestions.join(", ")}`));
            console.log(ui.dim(`  Try:       memi add ${suggestions[0]} --from ${opts.from}`));
          }
          console.log();
        }
        process.exitCode = 1;
      }
    });
}

export async function buildMarketplaceAddHints(
  from: string,
  component: string,
  tokensAlreadyRequested: boolean,
): Promise<Pick<AddPayload, "usageSnippet" | "tokenInstallCommand" | "packageUrl" | "sourceUrl">> {
  const entry = await resolveMarketplaceAlias(from).catch(() => undefined);
  const packageName = entry?.packageName ?? (from.startsWith("@") ? from : undefined);
  return {
    usageSnippet: buildUsageSnippet(component),
    tokenInstallCommand: tokensAlreadyRequested
      ? undefined
      : `memi add ${component} --from ${entry?.slug ?? packageName ?? from} --tokens`,
    packageUrl: packageName ? npmPackageUrl(packageName) : undefined,
    sourceUrl: entry?.sourceUrl,
  };
}

export function buildUsageSnippet(component: string): string {
  const examples: Record<string, string> = {
    AuthCard: `<AuthCard title="Welcome back" description="Sign in to continue" primaryCta="Sign in" />`,
    Button: `<Button label="Continue" variant="primary" />`,
    ChatComposer: `<ChatComposer placeholder="Ask the assistant..." sendLabel="Send" />`,
    ChatMessage: `<ChatMessage role="assistant" content="Here is the next step." />`,
    HeroSection: `<HeroSection eyebrow="Launch ready" headline="Ship a better product page" description="Install a tokenized landing section into your shadcn app." primaryCta="Start now" />`,
    ProductCard: `<ProductCard name="Pro plan" price="$29" cta="Add to cart" />`,
  };
  const jsx = examples[component] ?? `<${component} />`;
  return [
    `import { ${component} } from "@/components/memoire/${component}"`,
    "",
    jsx,
  ].join("\n");
}

export async function suggestRegistryComponents(from: string, requested: string): Promise<string[]> {
  const { components } = await listRegistryComponents(from);
  return rankComponentSuggestions(
    components.map((component) => component.name),
    requested,
  );
}

export function rankComponentSuggestions(available: string[], requested: string): string[] {
  const needle = requested.toLowerCase();
  const ranked = available
    .map((name) => ({
      name,
      score:
        name.toLowerCase() === needle ? 0 :
        name.toLowerCase().includes(needle) || needle.includes(name.toLowerCase()) ? 1 :
        levenshtein(name.toLowerCase(), needle),
    }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  return ranked.slice(0, 5).map((entry) => entry.name);
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[a.length][b.length];
}

async function handleList(from: string, json: boolean | undefined, start: number, refresh?: boolean): Promise<void> {
  try {
    const { registry, components } = await listRegistryComponents(from, process.cwd(), { refresh });
    if (json) {
      const payload: AddPayload = {
        status: "listed",
        from,
        generated: [],
        available: components.map(c => c.name),
        elapsedMs: Date.now() - start,
      };
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    console.log();
    console.log(ui.brand(registry.name) + ui.dim(`  v${registry.version}`));
    if (registry.description) console.log(ui.dim(`  ${registry.description}`));
    console.log();
    console.log(ui.section(`COMPONENTS (${components.length})`));
    for (const c of components) {
      const level = c.level ? ui.dim(`  ${c.level}`) : "";
      console.log(ui.ok(c.name + level));
    }
    console.log();
    console.log(ui.dim(`  Install one:  memi add ${components[0]?.name ?? "<Name>"} --from ${from}`));
    console.log();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify({ status: "failed", from, error: msg, elapsedMs: Date.now() - start }));
    else console.log(`\n  ${ui.fail(msg)}\n`);
    process.exitCode = 1;
  }
}
