import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { DesignToken } from "../engine/registry.js";
import { writeTokenFiles, generateShadcnTokenMapping, exportToStyleDictionary } from "../codegen/tailwind-tokens.js";
import {
  extractDesignTokensFromSources,
  renderTokenExtractionMarkdown,
  renderTokenExtractionSummary,
  type TokenExtractionReport,
  type TokenExtractionSource,
} from "../tokens/extractor.js";
import { scanSources } from "../utils/source-scanner.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".vue",
  ".svelte",
  ".mdx",
]);

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".memoire",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "build",
  "node_modules",
]);

const MAX_LOCAL_SOURCE_FILES = 350;
const FETCH_TIMEOUT_MS = 15000;

export function registerTokensCommand(program: Command, engine: MemoireEngine) {
  program
    .command("tokens")
    .description("Extract and export design tokens from Figma, CSS, code, or a URL")
    .option("-o, --output <dir>", "Output directory", "generated/tokens")
    .option("-f, --format <formats>", "Comma-separated formats: css,tailwind,json,style-dictionary (default: all)")
    .option("--from <path-or-url>", "Extract tokens from a local file, directory, or URL before exporting")
    .option("--save", "Merge extracted tokens into .memoire/design-system.json")
    .option("--no-inferred", "Do not promote repeated literal values into inferred tokens")
    .option("--report", "Write token-extraction.report.md and token-extraction.report.json")
    .option("--shadcn", "Generate shadcn-compatible token mapping")
    .option("--json", "Output token manifest as JSON")
    .action(async (opts: {
      output: string;
      format?: string;
      from?: string;
      save?: boolean;
      inferred?: boolean;
      report?: boolean;
      shadcn?: boolean;
      json?: boolean;
    }) => {
      if (opts.from) {
        if (opts.save) {
          await engine.init("registry");
        }

        const sources = await collectTokenSources(opts.from, engine.config.projectRoot);
        const report = extractDesignTokensFromSources(sources, {
          sourceName: opts.from,
          includeInferredLiterals: opts.inferred !== false,
        });

        if (opts.save && report.tokens.length > 0) {
          await saveExtractedTokens(engine, report.tokens);
        }

        const reportFiles = opts.report
          ? await writeExtractionReport(engine, report, opts.output, opts.from)
          : null;

        if (opts.json) {
          console.log(JSON.stringify({
            status: "extracted",
            source: opts.from,
            saved: !!opts.save,
            count: report.tokens.length,
            sources: sources.map((source) => ({ id: source.id, kind: source.kind ?? "unknown" })),
            reportFiles,
            report,
          }, null, 2));
          return;
        }

        if (report.tokens.length === 0) {
          console.log(`\n  No design tokens found in ${opts.from}.\n`);
          if (report.literalCandidates.length > 0 || report.utilityCandidates.length > 0) {
            console.log(`  Found ${report.literalCandidates.length} literal value candidates and ${report.utilityCandidates.length} Tailwind utility patterns for manual review.\n`);
          }
          return;
        }

        console.log(`\n  Extracted tokens from ${sources.length} source${sources.length === 1 ? "" : "s"}.\n`);
        for (const line of renderTokenExtractionSummary(report)) {
          console.log(`  · ${line}`);
        }
        console.log();

        await exportTokens(engine, report.tokens, opts);

        if (reportFiles) {
          console.log(`  Report JSON:      ${reportFiles.json}`);
          console.log(`  Report Markdown:  ${reportFiles.markdown}`);
        }

        if (opts.save) {
          console.log("  Saved extracted tokens to .memoire/design-system.json");
          console.log();
        }
        return;
      }

      await engine.init("registry");
      const ds = engine.registry.designSystem;
      if (ds.tokens.length === 0) {
        if (opts.json) {
          console.log(JSON.stringify({ tokens: [], count: 0 }));
          return;
        }
        console.log("\n  No design tokens found. Run `memi pull`, `memi theme import`, or `memi tokens --from <file|dir|url>` first.\n");
        return;
      }

      if (opts.json) {
        const manifest = {
          count: ds.tokens.length,
          tokens: ds.tokens,
          lastSync: ds.lastSync,
        };
        console.log(JSON.stringify(manifest, null, 2));
        return;
      }

      await exportTokens(engine, ds.tokens, opts);
    });
}

async function writeExtractionReport(
  engine: MemoireEngine,
  report: TokenExtractionReport,
  output: string,
  sourceLabel: string,
): Promise<{ json: string; markdown: string }> {
  const outputDir = join(engine.config.projectRoot, output);
  await mkdir(outputDir, { recursive: true });
  const jsonPath = join(outputDir, "token-extraction.report.json");
  const markdownPath = join(outputDir, "token-extraction.report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(markdownPath, renderTokenExtractionMarkdown(report, sourceLabel));
  return { json: jsonPath, markdown: markdownPath };
}

async function exportTokens(
  engine: MemoireEngine,
  tokens: DesignToken[],
  opts: { output: string; format?: string; shadcn?: boolean },
): Promise<void> {
  const outputDir = join(engine.config.projectRoot, opts.output);
  const formats: Set<string> = opts.format
    ? new Set(opts.format.split(",").map((format) => format.trim().toLowerCase()).filter(Boolean))
    : new Set(["css", "tailwind", "json", "style-dictionary"]);

  console.log(`  Exporting ${tokens.length} tokens (${[...formats].join(", ")})...\n`);

  const files = await writeTokenFiles(tokens, outputDir, formats);
  if (files.css) console.log(`  CSS:              ${files.css}`);
  if (files.tailwind) console.log(`  Tailwind:         ${files.tailwind}`);
  if (files.json) console.log(`  JSON:             ${files.json}`);

  if (formats.has("style-dictionary")) {
    const sdTokens = exportToStyleDictionary(tokens);
    const sdPath = join(outputDir, "tokens.style-dictionary.json");
    await mkdir(outputDir, { recursive: true });
    await writeFile(sdPath, JSON.stringify(sdTokens, null, 2));
    console.log(`  Style Dictionary: ${sdPath}`);
  }

  if (opts.shadcn) {
    const mapping = generateShadcnTokenMapping(tokens);
    const mappingPath = join(outputDir, "shadcn-tokens.css");
    await writeFile(mappingPath, mapping);
    console.log(`  shadcn:           ${mappingPath}`);
  }

  printTokenCategorySummary(tokens);
}

function printTokenCategorySummary(tokens: DesignToken[]): void {
  const counts = {
    color: 0,
    spacing: 0,
    typography: 0,
    radius: 0,
    shadow: 0,
    other: 0,
  };

  for (const token of tokens) {
    counts[token.type] += 1;
  }

  const parts = [
    `${counts.color} color token${counts.color !== 1 ? "s" : ""}`,
    `${counts.spacing} spacing token${counts.spacing !== 1 ? "s" : ""}`,
    `${counts.typography} typography token${counts.typography !== 1 ? "s" : ""}`,
    `${counts.radius} radius token${counts.radius !== 1 ? "s" : ""}`,
    `${counts.shadow} shadow token${counts.shadow !== 1 ? "s" : ""}`,
  ];
  if (counts.other > 0) parts.push(`${counts.other} other`);

  console.log();
  console.log(`  ${parts.join(", ")}`);
  console.log();
}

async function saveExtractedTokens(engine: MemoireEngine, tokens: DesignToken[]): Promise<void> {
  const designSystem = engine.registry.designSystem;
  const mergedTokens = mergeDesignTokens(designSystem.tokens, tokens);
  await engine.registry.updateDesignSystem({
    ...designSystem,
    tokens: mergedTokens,
    lastSync: new Date().toISOString(),
  });
}

function mergeDesignTokens(existing: DesignToken[], incoming: DesignToken[]): DesignToken[] {
  const byKey = new Map<string, DesignToken>();
  for (const token of existing) {
    byKey.set(tokenKey(token), token);
  }
  for (const token of incoming) {
    const key = tokenKey(token);
    const previous = byKey.get(key);
    byKey.set(key, previous ? {
      ...previous,
      ...token,
      values: { ...previous.values, ...token.values },
      collection: token.collection || previous.collection,
    } : token);
  }
  return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function tokenKey(token: DesignToken): string {
  return (token.cssVariable || token.name).toLowerCase();
}

async function collectTokenSources(target: string, projectRoot: string): Promise<TokenExtractionSource[]> {
  const sources = await scanSources({
    projectRoot,
    target,
    extensions: SUPPORTED_SOURCE_EXTENSIONS,
    ignoreDirs: SKIP_DIRECTORIES,
    maxFiles: MAX_LOCAL_SOURCE_FILES,
    concurrency: 16,
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    includeInlineStyles: true,
    includeLinkedStyles: true,
    userAgent: "Memoire-Tokens/1.0",
  });
  return sources.map((source) => ({
    id: source.id,
    content: source.content,
    kind: extensionToSourceKind(source.extension),
  }));
}

function extensionToSourceKind(extension: string): TokenExtractionSource["kind"] {
  switch (extension) {
    case ".css":
    case ".scss":
    case ".sass":
    case ".less":
      return "css";
    case ".html":
    case ".htm":
      return "html";
    case ".tsx":
      return "tsx";
    case ".jsx":
      return "jsx";
    case ".ts":
      return "ts";
    case ".js":
      return "js";
    case ".vue":
      return "vue";
    case ".svelte":
      return "svelte";
    default:
      return "unknown";
  }
}
