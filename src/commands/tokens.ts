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
import { fetchPageAssets } from "../research/css-extractor.js";
import { writeFile, mkdir, readFile, readdir, stat } from "fs/promises";
import { join, resolve, isAbsolute, extname } from "path";

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
      await engine.init();

      if (opts.from) {
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
  if (isUrl(target)) {
    return collectUrlSources(target);
  }

  const resolved = isAbsolute(target) ? target : resolve(projectRoot, target);
  const info = await stat(resolved);
  if (info.isFile()) {
    return [await readSourceFile(resolved, resolved)];
  }
  if (!info.isDirectory()) {
    throw new Error(`Unsupported token source: ${target}`);
  }

  const sources: TokenExtractionSource[] = [];
  await walkSourceDirectory(resolved, resolved, sources);
  return sources;
}

async function walkSourceDirectory(
  root: string,
  dir: string,
  sources: TokenExtractionSource[],
): Promise<void> {
  if (sources.length >= MAX_LOCAL_SOURCE_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (sources.length >= MAX_LOCAL_SOURCE_FILES) return;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walkSourceDirectory(root, fullPath, sources);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SUPPORTED_SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
    sources.push(await readSourceFile(fullPath, root));
  }
}

async function readSourceFile(filePath: string, root: string): Promise<TokenExtractionSource> {
  const content = await readFile(filePath, "utf-8");
  const extension = extname(filePath).toLowerCase();
  const relativeId = filePath.startsWith(root) ? filePath.slice(root.length).replace(/^\/+/, "") : filePath;
  return {
    id: relativeId || filePath,
    content,
    kind: extensionToSourceKind(extension),
  };
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

async function collectUrlSources(url: string): Promise<TokenExtractionSource[]> {
  try {
    const assets = await fetchPageAssets(url, FETCH_TIMEOUT_MS);
    const sources: TokenExtractionSource[] = [
      { id: url, content: assets.html, kind: "html" },
      ...assets.cssBlocks.map((content, index) => ({
        id: `${url}#css-${index + 1}`,
        content,
        kind: "css" as const,
      })),
    ];
    return sources.filter((source) => source.content.trim().length > 0);
  } catch (err) {
    const message = (err as Error).message;
    if (!/private|loopback|reserved|Only http/.test(message)) throw err;
    return collectExplicitUrlSources(url);
  }
}

async function collectExplicitUrlSources(url: string): Promise<TokenExtractionSource[]> {
  const html = await fetchText(url);
  const sources: TokenExtractionSource[] = [{ id: url, content: html, kind: "html" }];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  let inlineIndex = 0;
  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const content = styleMatch[1]?.trim();
    if (content) {
      inlineIndex += 1;
      sources.push({ id: `${url}#inline-${inlineIndex}`, content, kind: "css" });
    }
  }

  const sheetUrls = extractStylesheetUrls(html, url);
  const sheets = await Promise.all(sheetUrls.slice(0, 12).map(async (sheetUrl, index) => {
    const content = await fetchText(sheetUrl).catch(() => "");
    return content ? { id: `${sheetUrl}#sheet-${index + 1}`, content, kind: "css" as const } : null;
  }));
  for (const sheet of sheets) {
    if (sheet) sources.push(sheet);
  }

  return sources;
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "text/html,text/css,*/*",
        "User-Agent": "Memoire-Tokens/1.0",
      },
    });
    if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractStylesheetUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const relFirst = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const hrefFirst = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
  for (const regex of [relFirst, hrefFirst]) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const href = match[1];
      if (!href) continue;
      try {
        urls.add(new URL(href, baseUrl).href);
      } catch {
        continue;
      }
    }
  }
  return Array.from(urls);
}

function isUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
