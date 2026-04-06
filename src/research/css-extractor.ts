/**
 * CSS Extractor — Fetches a URL's HTML and stylesheets, then parses
 * them into raw design tokens (colors, typography, spacing, radii, shadows).
 *
 * Used by `memi design-doc` to build a DESIGN.md from any public URL
 * without requiring a headless browser.
 */

import { createLogger } from "../engine/logger.js";

const log = createLogger("css-extractor");

const FETCH_TIMEOUT_MS = 15000;
const MAX_STYLESHEETS = 10;

// ── Types ─────────────────────────────────────────────────

export interface RawDesignTokens {
  colors: string[];
  fonts: string[];
  fontSizes: string[];
  spacing: string[];
  radii: string[];
  shadows: string[];
  cssVars: Record<string, string>;
}

export interface PageAssets {
  url: string;
  title: string;
  html: string;
  cssBlocks: string[];
}

// ── Fetch ─────────────────────────────────────────────────

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Memoire-DesignDoc/1.0",
        "Accept": "text/html,text/css,*/*",
      },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Resolve a potentially relative URL against a base URL.
 */
function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/**
 * Fetch a page's HTML and all linked/inline CSS blocks.
 * Follows up to MAX_STYLESHEETS <link rel="stylesheet"> hrefs.
 */
export async function fetchPageAssets(url: string): Promise<PageAssets> {
  log.info({ url }, "Fetching page assets");

  const html = await fetchText(url);
  if (!html) {
    return { url, title: "", html: "", cssBlocks: [] };
  }

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;

  const cssBlocks: string[] = [];

  // 1. Inline <style> blocks
  const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleTagRegex.exec(html)) !== null) {
    const content = styleMatch[1].trim();
    if (content) cssBlocks.push(content);
  }

  // 2. Linked stylesheets — <link rel="stylesheet" href="...">
  const linkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  const sheetUrls: string[] = [];
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const resolved = resolveUrl(linkMatch[1], url);
    if (resolved) sheetUrls.push(resolved);
  }

  // Also catch href-first variant: <link href="..." rel="stylesheet">
  const linkRegex2 = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*>/gi;
  while ((linkMatch = linkRegex2.exec(html)) !== null) {
    const resolved = resolveUrl(linkMatch[1], url);
    if (resolved && !sheetUrls.includes(resolved)) sheetUrls.push(resolved);
  }

  // Fetch stylesheets in parallel (capped at MAX_STYLESHEETS)
  const sheetFetches = sheetUrls.slice(0, MAX_STYLESHEETS).map((sheetUrl) =>
    fetchText(sheetUrl).then((css) => {
      if (css) cssBlocks.push(css);
    }).catch(() => null)
  );
  await Promise.all(sheetFetches);

  log.info(
    { url, inlineBlocks: cssBlocks.length - sheetUrls.length, sheets: sheetFetches.length },
    "CSS assets fetched",
  );

  return { url, title, html, cssBlocks };
}

// ── Parsers ───────────────────────────────────────────────

const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+)?\s*\)/g,
  /hsla?\(\s*[\d.]+(?:deg|turn|rad)?\s*,\s*[\d.]+%\s*,\s*[\d.]+%(?:\s*,\s*[\d.]+)?\s*\)/g,
  /oklch\(\s*[\d.]+%?\s+[\d.]+\s+[\d.]+(?:\s*\/\s*[\d.]+)?\s*\)/g,
  /color-mix\([^)]+\)/g,
];

// Colors we don't want: pure black, white, transparent, common reset values
const IGNORE_COLORS = new Set([
  "#000", "#000000", "#fff", "#ffffff",
  "rgba(0,0,0,0)", "rgba(255,255,255,0)", "transparent",
  "#0000", "#ffff",
]);

function normalizeColor(c: string): string {
  return c.replace(/\s+/g, "").toLowerCase();
}

function extractColors(css: string): string[] {
  const found = new Set<string>();
  for (const pattern of COLOR_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(css)) !== null) {
      const normalized = normalizeColor(m[0]);
      if (!IGNORE_COLORS.has(normalized)) found.add(m[0].trim());
    }
  }
  return Array.from(found);
}

function extractFontFamilies(css: string): string[] {
  const found = new Set<string>();
  const re = /font-family\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const val = m[1].trim().replace(/!important/i, "").trim();
    if (val && !val.startsWith("var(")) found.add(val);
  }
  return Array.from(found);
}

function extractFontSizes(css: string): string[] {
  const found = new Set<string>();
  const re = /font-size\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const val = m[1].trim().replace(/!important/i, "").trim();
    if (val && !val.startsWith("var(")) found.add(val);
  }
  return Array.from(found);
}

function extractSpacing(css: string): string[] {
  const found = new Set<string>();
  // Only concrete values — skip var() and calc()
  const re = /(?:^|[\s;{])(?:padding|margin|gap|row-gap|column-gap)\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const val = m[1].trim().replace(/!important/i, "").trim();
    if (!val.startsWith("var(") && !val.startsWith("calc(")) {
      // Split shorthand values
      for (const part of val.split(/\s+/)) {
        if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(part) && part !== "0px") {
          found.add(part);
        }
      }
    }
  }
  return Array.from(found).sort((a, b) => parseFloat(a) - parseFloat(b));
}

function extractRadii(css: string): string[] {
  const found = new Set<string>();
  const re = /border-radius\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const val = m[1].trim().replace(/!important/i, "").trim();
    if (val && !val.startsWith("var(") && val !== "0") found.add(val);
  }
  return Array.from(found);
}

function extractShadows(css: string): string[] {
  const found = new Set<string>();
  const re = /box-shadow\s*:\s*([^;}{]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const val = m[1].trim().replace(/!important/i, "").trim();
    if (val && val !== "none" && !val.startsWith("var(")) found.add(val);
  }
  return Array.from(found);
}

function extractCssVars(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  const re = /--([\w-]+)\s*:\s*([^;}{]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const key = `--${m[1].trim()}`;
    const val = m[2].trim().replace(/!important/i, "").trim();
    if (val) vars[key] = val;
  }
  return vars;
}

/**
 * Parse CSS blocks into raw design tokens.
 */
export function parseCSSTokens(cssBlocks: string[]): RawDesignTokens {
  const combined = cssBlocks.join("\n");

  const cssVars = extractCssVars(combined);
  const colors = extractColors(combined);
  const fonts = extractFontFamilies(combined);
  const fontSizes = extractFontSizes(combined);
  const spacing = extractSpacing(combined);
  const radii = extractRadii(combined);
  const shadows = extractShadows(combined);

  log.info(
    { colors: colors.length, fonts: fonts.length, fontSizes: fontSizes.length, cssVars: Object.keys(cssVars).length },
    "CSS tokens parsed",
  );

  return { colors, fonts, fontSizes, spacing, radii, shadows, cssVars };
}
