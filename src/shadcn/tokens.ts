import type { DesignToken } from "../engine/registry.js";
import type { ShadcnCssVars } from "./schema.js";

const LIGHT_MODE_ALIASES = new Set(["default", "light", "base", "root", ":root"]);

export function designTokensToShadcnCssVars(tokens: DesignToken[]): ShadcnCssVars {
  const cssVars: ShadcnCssVars = { theme: {}, light: {}, dark: {} };

  for (const token of tokens) {
    const slot = shadcnSlotName(token);
    if (!slot) continue;

    for (const [mode, rawValue] of Object.entries(token.values)) {
      const value = normalizeTokenValue(rawValue);
      if (!value) continue;

      const modeName = mode.trim().toLowerCase();
      if (token.type === "color") {
        if (modeName.includes("dark")) {
          cssVars.dark![slot] = value;
        } else if (LIGHT_MODE_ALIASES.has(modeName) || !modeName) {
          cssVars.light![slot] = value;
        } else {
          cssVars.light![`${slot}-${modeName}`] = value;
        }
        cssVars.theme![tailwindThemeName(token, slot)] = value;
        continue;
      }

      cssVars.theme![tailwindThemeName(token, slot)] = value;
    }
  }

  return pruneEmptyCssVars(cssVars);
}

export function shadcnSlotName(token: Pick<DesignToken, "name" | "cssVariable" | "type">): string {
  const raw = token.cssVariable || token.name;
  const normalized = raw
    .replace(/^--/, "")
    .replace(/^(color|spacing|space|radius|shadow|font|text)-/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (!normalized) return "";
  if (token.type === "spacing" && normalized.startsWith("space-")) return normalized.replace(/^space-/, "");
  return normalized;
}

function tailwindThemeName(token: DesignToken, slot: string): string {
  const raw = (token.cssVariable || token.name).replace(/^--/, "").toLowerCase();
  if (raw.startsWith("color-") || raw.startsWith("spacing-") || raw.startsWith("radius-") || raw.startsWith("shadow-") || raw.startsWith("font-") || raw.startsWith("text-")) {
    return raw;
  }

  if (token.type === "color") return `color-${slot}`;
  if (token.type === "spacing") return `spacing-${slot}`;
  if (token.type === "radius") return `radius-${slot}`;
  if (token.type === "shadow") return `shadow-${slot}`;
  if (token.type === "typography") return String(Object.values(token.values)[0] ?? "").match(/\d/)
    ? `text-${slot}`
    : `font-${slot}`;
  return slot;
}

function normalizeTokenValue(value: string | number): string {
  if (typeof value === "number") return `${value}px`;
  return value.trim();
}

function pruneEmptyCssVars(cssVars: ShadcnCssVars): ShadcnCssVars {
  const next: ShadcnCssVars = {};
  if (cssVars.theme && Object.keys(cssVars.theme).length > 0) next.theme = sortRecord(cssVars.theme);
  if (cssVars.light && Object.keys(cssVars.light).length > 0) next.light = sortRecord(cssVars.light);
  if (cssVars.dark && Object.keys(cssVars.dark).length > 0) next.dark = sortRecord(cssVars.dark);
  return next;
}

function sortRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}
