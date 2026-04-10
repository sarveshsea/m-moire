/**
 * Tailwind Token Generator — Converts Figma design tokens into
 * Tailwind-compatible CSS custom properties and config extensions.
 *
 * Also exports Style Dictionary v4 W3C DTCG format for compatibility
 * with the broader design token ecosystem (200K+ weekly SD users).
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { DesignToken } from "../engine/registry.js";
import { exportTokens, generateTailwindExtend } from "../figma/tokens.js";

/**
 * Write all token output files to disk.
 */
export async function writeTokenFiles(
  tokens: DesignToken[],
  outputDir: string,
  formats: Set<string> = new Set(["css", "tailwind", "json"])
): Promise<{ css: string; tailwind: string; json: string }> {
  await mkdir(outputDir, { recursive: true });

  let cssPath = "";
  let tailwindPath = "";
  let jsonPath = "";

  if (formats.has("css")) {
    const exported = exportTokens(tokens);
    cssPath = join(outputDir, "tokens.css");
    await writeFile(cssPath, exported.css);
  }

  if (formats.has("tailwind")) {
    const tailwindCode = generateTailwindExtend(tokens);
    tailwindPath = join(outputDir, "memoire-tokens.ts");
    await writeFile(tailwindPath, tailwindCode);
  }

  if (formats.has("json")) {
    const exported = exportTokens(tokens);
    jsonPath = join(outputDir, "tokens.json");
    await writeFile(jsonPath, JSON.stringify(exported.json, null, 2));
  }

  return { css: cssPath, tailwind: tailwindPath, json: jsonPath };
}

/**
 * Generate a shadcn-compatible globals.css token block
 * that maps Figma tokens to shadcn CSS variables.
 */
export function generateShadcnTokenMapping(tokens: DesignToken[]): string {
  const lines: string[] = [
    "/* Mémoire Design Tokens — mapped from Figma to shadcn CSS variables */",
    "/* Auto-generated — re-run `memi tokens` to update */",
    "",
    "@layer base {",
    "  :root {",
  ];

  // Map color tokens to shadcn color slots
  const colorTokens = tokens.filter((t) => t.type === "color");
  for (const token of colorTokens) {
    const name = token.name.toLowerCase();
    const value = Object.values(token.values)[0];
    if (!value) continue;

    // Try to map to shadcn semantic slots
    const shadcnVar = mapToShadcnVariable(name);
    if (shadcnVar) {
      lines.push(`    ${shadcnVar}: ${toHslValues(String(value))};`);
    }
    // Always emit the raw token
    lines.push(`    ${token.cssVariable}: ${value};`);
  }

  // Spacing and radius tokens
  const spacingTokens = tokens.filter((t) => t.type === "spacing" || t.type === "radius");
  for (const token of spacingTokens) {
    const value = Object.values(token.values)[0];
    if (value === undefined) continue;
    lines.push(`    ${token.cssVariable}: ${typeof value === "number" ? value + "px" : value};`);
  }

  lines.push("  }");

  // Dark mode overrides
  const hasDark = tokens.some((t) =>
    Object.keys(t.values).some((k) => k.toLowerCase().includes("dark"))
  );

  if (hasDark) {
    lines.push("");
    lines.push("  .dark {");
    for (const token of colorTokens) {
      const darkKey = Object.keys(token.values).find((k) => k.toLowerCase().includes("dark"));
      if (darkKey) {
        const name = token.name.toLowerCase();
        const value = token.values[darkKey];
        const shadcnVar = mapToShadcnVariable(name);
        if (shadcnVar) {
          lines.push(`    ${shadcnVar}: ${toHslValues(String(value))};`);
        }
        lines.push(`    ${token.cssVariable}: ${value};`);
      }
    }
    lines.push("  }");
  }

  lines.push("}");
  return lines.join("\n");
}

// ── Style Dictionary v4 (W3C DTCG) export ────────────────────

/**
 * Export tokens as Style Dictionary v4 W3C DTCG format.
 * Compatible with `style-dictionary`, `@tokens-studio/sd-transforms`, and any
 * W3C Design Token Community Group-compliant tool.
 *
 * Output structure:
 * {
 *   "color": { "$type": "color", "primary": { "$value": "#..." } },
 *   "spacing": { "$type": "dimension", "md": { "$value": "16px" } },
 *   ...
 * }
 */
export function exportToStyleDictionary(tokens: DesignToken[]): Record<string, unknown> {
  const dtcg: Record<string, Record<string, unknown>> = {
    color: { $type: "color" },
    spacing: { $type: "dimension" },
    radius: { $type: "dimension" },
    typography: { $type: "typography" },
    shadow: { $type: "shadow" },
    other: {},
  };

  for (const token of tokens) {
    const category = token.type === "other" ? "other" : token.type;
    const group = dtcg[category] ?? (dtcg[category] = {});

    // Use default mode value first, fall back to first available value
    const value =
      token.values["default"] ??
      token.values["Default"] ??
      token.values["Value"] ??
      Object.values(token.values)[0];

    if (value === undefined) continue;

    // Sanitize name: strip leading "--", replace invalid chars with "-"
    const key = token.name
      .replace(/^--/, "")
      .replace(/[^a-zA-Z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const dtcgValue = formatDTCGValue(token.type, value);

    const entry: Record<string, unknown> = { $value: dtcgValue };
    if (token.collection) entry.$description = `From: ${token.collection}`;

    // Multi-mode tokens: emit each mode as a separate token under key-mode
    const modes = Object.keys(token.values);
    if (modes.length > 1) {
      for (const mode of modes) {
        const modeKey = `${key}-${mode.toLowerCase().replace(/\s+/g, "-")}`;
        const modeVal = token.values[mode];
        (group as Record<string, unknown>)[modeKey] = {
          $value: formatDTCGValue(token.type, modeVal),
          $description: `${token.collection} / ${mode}`,
        };
      }
    } else {
      (group as Record<string, unknown>)[key] = entry;
    }
  }

  // Remove empty groups
  for (const key of Object.keys(dtcg)) {
    const group = dtcg[key] as Record<string, unknown>;
    const nonMeta = Object.keys(group).filter((k) => !k.startsWith("$"));
    if (nonMeta.length === 0) delete dtcg[key];
  }

  return dtcg;
}

function formatDTCGValue(
  type: DesignToken["type"],
  raw: string | number
): unknown {
  const val = String(raw);
  switch (type) {
    case "color":
      return val.startsWith("#") || val.startsWith("rgb") ? val : val;
    case "spacing":
    case "radius":
      // Ensure unit
      if (typeof raw === "number") return `${raw}px`;
      return /^\d+(\.\d+)?$/.test(val) ? `${val}px` : val;
    case "shadow": {
      // Try to parse "offset-x offset-y blur spread color" CSS shadow
      const parts = val.split(/\s+/);
      if (parts.length >= 4) {
        return {
          offsetX: parts[0],
          offsetY: parts[1],
          blur: parts[2],
          spread: parts[3] ?? "0px",
          color: parts.slice(4).join(" ") || "#00000040",
        };
      }
      return val;
    }
    default:
      return val;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function mapToShadcnVariable(tokenName: string): string | null {
  const mappings: [RegExp, string][] = [
    [/^(primary|brand)[\s/-]*(color)?$/i, "--primary"],
    [/^(secondary)[\s/-]*(color)?$/i, "--secondary"],
    [/^(accent)[\s/-]*(color)?$/i, "--accent"],
    [/^(background|bg)[\s/-]*(color|default)?$/i, "--background"],
    [/^(foreground|text)[\s/-]*(color|default)?$/i, "--foreground"],
    [/^(muted)[\s/-]*/i, "--muted"],
    [/^(destructive|error|danger)[\s/-]*/i, "--destructive"],
    [/^(border)[\s/-]*(color)?$/i, "--border"],
    [/^(ring|focus)[\s/-]*/i, "--ring"],
    [/^(card)[\s/-]*(bg|background)?$/i, "--card"],
    [/^(popover)[\s/-]*/i, "--popover"],
    [/^(input)[\s/-]*(border)?$/i, "--input"],
  ];

  for (const [pattern, variable] of mappings) {
    if (pattern.test(tokenName)) return variable;
  }

  return null;
}

function toHslValues(hex: string): string {
  // Convert hex to HSL values (without hsl() wrapper) for shadcn compatibility
  if (!hex.startsWith("#")) return hex;

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return `0 0% ${Math.round(l * 100)}%`;

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
