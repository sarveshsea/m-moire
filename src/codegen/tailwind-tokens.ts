/**
 * Tailwind Token Generator — Converts Figma design tokens into
 * Tailwind-compatible CSS custom properties and config extensions.
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
  outputDir: string
): Promise<{ css: string; tailwind: string; json: string }> {
  await mkdir(outputDir, { recursive: true });

  // 1. CSS custom properties
  const exported = exportTokens(tokens);
  const cssPath = join(outputDir, "tokens.css");
  await writeFile(cssPath, exported.css);

  // 2. Tailwind config extension
  const tailwindCode = generateTailwindExtend(tokens);
  const tailwindPath = join(outputDir, "ark-tokens.ts");
  await writeFile(tailwindPath, tailwindCode);

  // 3. Raw JSON
  const jsonPath = join(outputDir, "tokens.json");
  await writeFile(jsonPath, JSON.stringify(exported.json, null, 2));

  return { css: cssPath, tailwind: tailwindPath, json: jsonPath };
}

/**
 * Generate a shadcn-compatible globals.css token block
 * that maps Figma tokens to shadcn CSS variables.
 */
export function generateShadcnTokenMapping(tokens: DesignToken[]): string {
  const lines: string[] = [
    "/* Noche Design Tokens — mapped from Figma to shadcn CSS variables */",
    "/* Auto-generated — re-run `ark tokens` to update */",
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
