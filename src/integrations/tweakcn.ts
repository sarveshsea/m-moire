/**
 * tweakcn integration — parse themes exported from tweakcn.com
 * (Apache-2.0, https://github.com/jnsahaj/tweakcn) into Memoire DesignTokens.
 *
 * tweakcn produces CSS blocks like:
 *
 *   :root {
 *     --background: 0 0% 100%;
 *     --primary: 221.2 83.2% 53.3%;
 *     --radius: 0.5rem;
 *   }
 *   .dark { --background: 222.2 84% 4.9%; ... }
 *
 * or Tailwind v4 @theme syntax:
 *
 *   @theme {
 *     --color-primary: oklch(0.6 0.18 250);
 *     --radius-md: 0.5rem;
 *   }
 *
 * We accept both. Output is a `DesignToken[]` that plugs straight into
 * the publisher and `generateTailwindV4Theme()`.
 */

import type { DesignToken } from "../engine/registry.js";

const FETCH_TIMEOUT_MS = 15000;

// ── SSRF guard (same pattern as resolver.ts) ─────────────────

function assertSafePublicUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`URL must be http(s): ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  const PRIVATE_IPV4 = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.0\.0\.0)/;
  if (host === "localhost" || host === "::1" || PRIVATE_IPV4.test(host)) {
    throw new Error(`URL cannot point to a private/loopback address: ${url}`);
  }
}

// ── Token classification ─────────────────────────────────────

/** Infer the DesignToken type from a CSS variable name. */
export function inferTokenType(name: string): DesignToken["type"] {
  const n = name.toLowerCase();
  if (/(^--color-|^--(background|foreground|primary|secondary|muted|accent|destructive|border|input|ring|card|popover|sidebar|chart)(-|$))/.test(n)) {
    return "color";
  }
  if (/^--radius/.test(n)) return "radius";
  if (/^--shadow/.test(n)) return "shadow";
  if (/^--spacing|^--(gap|padding|margin)/.test(n)) return "spacing";
  if (/^--(font|text|leading|tracking)/.test(n)) return "typography";
  return "other";
}

/**
 * Detect whether a raw value looks like a color (hex, rgb(), hsl(), oklch(), or
 * the shadcn shorthand "0 0% 100%").
 */
function isColorValue(raw: string): boolean {
  const v = raw.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
  if (/^(rgb|rgba|hsl|hsla|oklch|oklab|color)\s*\(/i.test(v)) return true;
  // shadcn shorthand: "H S% L%" (three space-separated numbers, last two %)
  if (/^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%$/.test(v)) return true;
  return false;
}

/** Wrap shadcn-shorthand color values in hsl(...) so they work without the shim. */
function normalizeColorValue(raw: string): string {
  const v = raw.trim();
  if (/^-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?%\s+-?\d+(?:\.\d+)?%$/.test(v)) {
    return `hsl(${v})`;
  }
  return v;
}

// ── Parser ────────────────────────────────────────────────────

export interface ParsedTweakcnTheme {
  tokens: DesignToken[];
  /** Per-mode value maps (e.g. "default", "dark") for tokens that appeared in both :root and .dark */
  hasDarkMode: boolean;
}

/**
 * Parse a tweakcn-exported CSS block into Memoire DesignTokens.
 *
 * Handles both v3 (`:root { ... } .dark { ... }`) and v4 (`@theme { ... }`) syntax.
 * Tokens appearing in both `:root` and `.dark` become multi-mode tokens
 * (values = { default, dark }).
 */
export function parseTweakcnCss(css: string): ParsedTweakcnTheme {
  const rootVars = extractVariableBlock(css, [
    /:root\s*\{([\s\S]*?)\}/,
    /@theme(?:\s+inline)?\s*\{([\s\S]*?)\}/,
    /@theme(?:\s+inline)?\s+static\s*\{([\s\S]*?)\}/,
  ]);
  const darkVars = extractVariableBlock(css, [
    /\.dark\s*\{([\s\S]*?)\}/,
    /:root\.dark\s*\{([\s\S]*?)\}/,
    /\[data-theme=["']dark["']\]\s*\{([\s\S]*?)\}/,
  ]);

  // Collect the union of variable names seen in either block
  const allNames = new Set<string>([...rootVars.keys(), ...darkVars.keys()]);
  const tokens: DesignToken[] = [];

  for (const cssVar of allNames) {
    const rootVal = rootVars.get(cssVar);
    const darkVal = darkVars.get(cssVar);
    const type = inferTokenType(cssVar);

    const values: Record<string, string> = {};
    if (rootVal !== undefined) {
      values.default = type === "color" && isColorValue(rootVal) ? normalizeColorValue(rootVal) : rootVal;
    }
    if (darkVal !== undefined) {
      values.dark = type === "color" && isColorValue(darkVal) ? normalizeColorValue(darkVal) : darkVal;
    }

    if (Object.keys(values).length === 0) continue;

    const name = cssVar.replace(/^--/, "");
    tokens.push({
      name,
      collection: "tweakcn",
      type,
      values,
      cssVariable: cssVar,
    });
  }

  return { tokens, hasDarkMode: darkVars.size > 0 };
}

/** Extract `--name: value;` pairs from the first matching block in a list of regexes. */
function extractVariableBlock(css: string, blockPatterns: RegExp[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const pattern of blockPatterns) {
    const match = css.match(pattern);
    if (!match?.[1]) continue;
    for (const decl of match[1].split(/;|\n/)) {
      const m = decl.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*$/i);
      if (m) out.set(m[1], m[2]);
    }
  }
  return out;
}

// ── Fetch ─────────────────────────────────────────────────────

/**
 * Fetch a tweakcn theme from a URL (share link, raw CSS, or any public
 * HTTPS URL). Returns the raw CSS text.
 */
export async function fetchTweakcnTheme(url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<string> {
  assertSafePublicUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "text/css, text/plain, */*" },
    });
    if (!res.ok) throw new Error(`tweakcn fetch failed (${res.status}): ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
