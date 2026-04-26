import type { Command } from "commander";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadMarketplaceCatalog, resolveMarketplaceAlias } from "../marketplace/catalog-loader.js";
import type { MarketplaceCatalogEntry } from "../marketplace/catalog.js";
import { packagePath } from "../utils/asset-path.js";
import { readRegistryFile, resolveRegistry } from "../registry/resolver.js";
import { installComponent } from "../registry/installer.js";
import type { MemoireEngine } from "../engine/core.js";

export interface RegistryDiscoveryEntry {
  slug: string;
  title: string;
  packageName: string;
  description: string;
  category: string;
  tags: string[];
  featured: boolean;
  installCommand: string;
  componentCount: number;
  components: Array<{ name: string; level?: string; category?: string }>;
  screenshotUrl: string;
  sourceUrl: string;
}

export interface RegistryDoctorCheck {
  name: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
}

export interface RegistryDoctorPayload {
  status: "passed" | "failed";
  ref: string;
  resolvedRef?: string;
  registry?: string;
  version?: string;
  checks: RegistryDoctorCheck[];
  errors: string[];
}

export function toRegistryDiscoveryEntry(entry: MarketplaceCatalogEntry): RegistryDiscoveryEntry {
  return {
    slug: entry.slug,
    title: entry.title,
    packageName: entry.packageName,
    description: entry.description,
    category: entry.category,
    tags: [...entry.tags],
    featured: entry.featured,
    installCommand: entry.installCommand,
    componentCount: entry.componentCount,
    components: entry.components.map((component) => ({ ...component })),
    screenshotUrl: entry.screenshotUrl,
    sourceUrl: entry.sourceUrl,
  };
}

export function searchRegistryEntries(
  entries: MarketplaceCatalogEntry[],
  query: string,
): MarketplaceCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;

  return entries.filter((entry) => {
    const haystack = [
      entry.slug,
      entry.title,
      entry.packageName,
      entry.description,
      entry.category,
      ...entry.tags,
      ...entry.components.map((component) => component.name),
      ...entry.components.map((component) => component.category ?? ""),
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export function findRegistryDiscoveryEntry(
  entries: MarketplaceCatalogEntry[],
  ref: string,
): MarketplaceCatalogEntry | undefined {
  const needle = ref.trim().toLowerCase();
  return entries.find((entry) => {
    return (
      entry.slug === needle ||
      entry.packageName.toLowerCase() === needle ||
      entry.title.toLowerCase() === needle
    );
  });
}

export function registerRegistryCommand(program: Command, engine?: MemoireEngine) {
  const registry = program
    .command("registry")
    .description("Discover installable Memoire registries")
    .addHelpText("after", [
      "",
      "Examples:",
      "  memi registry list",
      "  memi registry search chat --json",
      "  memi registry info ai-chat",
    ].join("\n"));

  registry
    .command("install")
    .argument("<component>", "Component or shadcn registry item name")
    .requiredOption("--from <ref>", "Registry alias, package, URL, GitHub ref, or local path")
    .option("--tokens", "Also install tokens.css from a Memoire V1 registry")
    .option("--regenerate", "Run local codegen instead of using bundled Memoire V1 code")
    .option("--target <dir>", "Target directory for installed code")
    .option("--refresh", "Refresh cached npm registry packages before resolving")
    .option("--json", "Output stable JSON")
    .description("Install from Memoire V1 or shadcn-native registry items")
    .action(async (component: string, opts: {
      from: string;
      tokens?: boolean;
      regenerate?: boolean;
      target?: string;
      refresh?: boolean;
      json?: boolean;
    }) => {
      if (!engine) {
        throw new Error("registry install requires a Memoire engine");
      }
      await engine.init();
      const result = await installComponent(engine, {
        from: opts.from,
        name: component,
        withTokens: opts.tokens,
        regenerate: opts.regenerate,
        targetDir: opts.target,
        refresh: opts.refresh,
      });
      const payload = {
        status: "installed",
        component,
        from: opts.from,
        source: result.source,
        specPath: result.specPath,
        codePath: result.codePath,
        generated: result.generatedFiles,
      };
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      console.log();
      console.log(`  Installed ${component} from ${result.source}`);
      if (result.codePath) console.log(`  Code: ${result.codePath}`);
      console.log(`  Spec: ${result.specPath}`);
      console.log();
    });

  registry
    .command("list")
    .description("List featured and first-party marketplace registries")
    .option("--json", "Output stable JSON")
    .action(async (opts: { json?: boolean }) => {
      const catalog = await loadMarketplaceCatalog();
      const entries = catalog.entries.map(toRegistryDiscoveryEntry);
      if (opts.json) {
        console.log(JSON.stringify({ count: entries.length, registries: entries }, null, 2));
        return;
      }
      printRegistryTable(entries);
    });

  registry
    .command("search")
    .argument("<query>", "Search term, tag, category, component, or package name")
    .description("Search marketplace registries")
    .option("--json", "Output stable JSON")
    .action(async (query: string, opts: { json?: boolean }) => {
      const catalog = await loadMarketplaceCatalog();
      const results = searchRegistryEntries(catalog.entries, query).map(toRegistryDiscoveryEntry);
      if (opts.json) {
        console.log(JSON.stringify({ query, count: results.length, registries: results }, null, 2));
        return;
      }
      if (results.length === 0) {
        console.log(`\n  No registries found for "${query}". Try: ai-chat, auth, ecommerce, dashboard, tweakcn.\n`);
        return;
      }
      printRegistryTable(results);
    });

  registry
    .command("info")
    .argument("<slug>", "Registry slug, package name, or title")
    .description("Show install and metadata for one registry")
    .option("--json", "Output stable JSON")
    .action(async (slug: string, opts: { json?: boolean }) => {
      const catalog = await loadMarketplaceCatalog();
      const entry = findRegistryDiscoveryEntry(catalog.entries, slug);
      if (!entry) {
        const suggestions = catalog.entries.slice(0, 6).map((candidate) => candidate.slug);
        if (opts.json) {
          console.log(JSON.stringify({ error: "registry_not_found", query: slug, suggestions }, null, 2));
          process.exitCode = 1;
          return;
        }
        console.error(`\n  Registry not found: ${slug}`);
        console.error(`  Try: ${suggestions.join(", ")}\n`);
        process.exitCode = 1;
        return;
      }

      const payload = toRegistryDiscoveryEntry(entry);
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      printRegistryInfo(payload);
    });

  registry
    .command("doctor")
    .argument("<ref>", "Registry slug, package name, local path, GitHub ref, or registry URL")
    .description("Validate registry package files and marketplace metadata")
    .option("--refresh", "Refresh cached npm registry packages before validating")
    .option("--json", "Output CI-friendly JSON")
    .action(async (ref: string, opts: { refresh?: boolean; json?: boolean }) => {
      const payload = await doctorRegistryRef(ref, process.cwd(), { refresh: opts.refresh });
      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        printDoctorPayload(payload);
      }
      if (payload.status === "failed") {
        process.exitCode = 1;
      }
    });
}

export async function doctorRegistryRef(ref: string, cwd: string = process.cwd(), options: { refresh?: boolean } = {}): Promise<RegistryDoctorPayload> {
  const checks: RegistryDoctorCheck[] = [];
  const errors: string[] = [];
  const catalogEntry = await resolveMarketplaceAlias(ref).catch(() => undefined);

  let resolvedRef = ref;
  try {
    if (catalogEntry) {
      const localSource = join(cwd, catalogEntry.sourcePath);
      if (await fileExists(localSource)) {
        resolvedRef = localSource;
      } else {
        const packagedSource = packagePath(catalogEntry.sourcePath);
        resolvedRef = await fileExists(packagedSource) ? packagedSource : catalogEntry.packageName;
      }
    }

    const resolved = await resolveRegistry(resolvedRef, cwd, { refresh: options.refresh });
    checks.push({ name: "registry.json", status: "passed", message: `${resolved.registry.name}@${resolved.registry.version}` });

    if (resolved.registry.tokens?.href) {
      try {
        const tokenRaw = await readRegistryFile(resolved, resolved.registry.tokens.href);
        if (resolved.registry.tokens.href.endsWith(".json")) JSON.parse(tokenRaw);
        checks.push({ name: "tokens", status: "passed", message: resolved.registry.tokens.href });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({ name: "tokens", status: "failed", message });
        errors.push(message);
      }
    } else {
      checks.push({ name: "tokens", status: "skipped", message: "registry has no tokens ref" });
    }

    for (const component of resolved.registry.components) {
      try {
        JSON.parse(await readRegistryFile(resolved, component.href));
        checks.push({ name: `component:${component.name}`, status: "passed", message: component.href });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({ name: `component:${component.name}`, status: "failed", message });
        errors.push(message);
      }

      if (component.code?.href) {
        try {
          await readRegistryFile(resolved, component.code.href);
          checks.push({ name: `code:${component.name}`, status: "passed", message: component.code.href });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          checks.push({ name: `code:${component.name}`, status: "failed", message });
          errors.push(message);
        }
      }
    }

    if (/^https?:\/\//.test(resolved.baseUrl)) {
      checks.push({ name: "package.json", status: "skipped", message: "remote registry package metadata not fetched" });
    } else {
      try {
        const pkg = JSON.parse(await readFile(join(resolved.baseUrl, "package.json"), "utf8"));
        if (pkg.name !== resolved.registry.name) {
          throw new Error(`package name ${pkg.name} does not match registry name ${resolved.registry.name}`);
        }
        if (pkg.memoire?.registry !== true) {
          throw new Error("package.json missing memoire.registry = true");
        }
        checks.push({ name: "package.json", status: "passed", message: pkg.name });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({ name: "package.json", status: "failed", message });
        errors.push(message);
      }
    }

    if (catalogEntry) {
      const installComponent = catalogEntry.installCommand.match(/memi add ([^\s]+)/)?.[1];
      const hasInstallComponent = resolved.registry.components.some((component) => component.name === installComponent);
      if (catalogEntry.installCommand.includes(catalogEntry.packageName) && hasInstallComponent) {
        checks.push({ name: "install-command", status: "passed", message: catalogEntry.installCommand });
      } else {
        const message = `catalog install command is not viable: ${catalogEntry.installCommand}`;
        checks.push({ name: "install-command", status: "failed", message });
        errors.push(message);
      }
    } else {
      checks.push({ name: "install-command", status: "skipped", message: "not a catalog registry" });
    }

    return {
      status: errors.length === 0 ? "passed" : "failed",
      ref,
      resolvedRef,
      registry: resolved.registry.name,
      version: resolved.registry.version,
      checks,
      errors,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: "resolve", status: "failed", message });
    return {
      status: "failed",
      ref,
      resolvedRef,
      checks,
      errors: [message],
    };
  }
}

function printRegistryTable(entries: RegistryDiscoveryEntry[]): void {
  console.log();
  for (const entry of entries) {
    const tags = entry.tags.slice(0, 5).join(", ");
    console.log(`  ${entry.slug}  ${entry.packageName}`);
    console.log(`    ${entry.description}`);
    console.log(`    install: ${entry.installCommand}`);
    console.log(`    tags: ${tags}`);
    console.log();
  }
}

function printRegistryInfo(entry: RegistryDiscoveryEntry): void {
  console.log();
  console.log(`  ${entry.title} (${entry.slug})`);
  console.log(`  ${entry.description}`);
  console.log();
  console.log(`  Package:     ${entry.packageName}`);
  console.log(`  Category:    ${entry.category}`);
  console.log(`  Install:     ${entry.installCommand}`);
  console.log(`  Screenshot:  ${entry.screenshotUrl}`);
  console.log(`  Source:      ${entry.sourceUrl}`);
  console.log(`  Components:  ${entry.components.map((component) => component.name).join(", ")}`);
  console.log(`  Tags:        ${entry.tags.join(", ")}`);
  console.log();
}

function printDoctorPayload(payload: RegistryDoctorPayload): void {
  console.log();
  console.log(`  Registry doctor: ${payload.ref}`);
  if (payload.registry) console.log(`  Registry: ${payload.registry}@${payload.version}`);
  console.log();
  for (const check of payload.checks) {
    const marker = check.status === "passed" ? "+" : check.status === "failed" ? "x" : "-";
    console.log(`  ${marker} ${check.name}${check.message ? ` - ${check.message}` : ""}`);
  }
  console.log();
  console.log(`  Result: ${payload.status}`);
  console.log();
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
