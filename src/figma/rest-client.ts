/**
 * Figma REST Client — Pulls design system data using the Figma REST API.
 *
 * Alternative to the WebSocket bridge for environments without Figma Desktop
 * (CI, headless machines, no plugin). Requires only FIGMA_TOKEN + FIGMA_FILE_KEY.
 *
 * Returns the same DesignSystem shape as FigmaBridge.extractDesignSystem(),
 * so all downstream code (registry, autoSpec, codegen) works unchanged.
 */

import { createLogger } from "../engine/logger.js";
import type { DesignSystem, DesignToken, DesignComponent, DesignStyle } from "../engine/registry.js";

const log = createLogger("figma-rest");

const FIGMA_API = "https://api.figma.com/v1";

// ── REST response shapes ──────────────────────────────────

interface RestVariableValue {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
  [key: string]: unknown;
}

interface RestVariable {
  id: string;
  name: string;
  resolvedType: string;
  valuesByMode: Record<string, RestVariableValue | number | string | boolean>;
  description?: string;
  hiddenFromPublishing?: boolean;
}

interface RestVariableCollection {
  id: string;
  name: string;
  defaultModeId: string;
  modes: { modeId: string; name: string }[];
  variableIds: string[];
}

interface RestVariablesResponse {
  status?: number;
  error?: boolean;
  meta?: {
    variables: Record<string, RestVariable>;
    variableCollections: Record<string, RestVariableCollection>;
  };
}

interface RestComponent {
  key: string;
  name: string;
  node_id: string;
  description?: string;
  containing_frame?: { name?: string };
}

interface RestComponentsResponse {
  status?: number;
  error?: boolean;
  meta?: {
    components: RestComponent[];
  };
}

interface RestStyle {
  key: string;
  name: string;
  node_id: string;
  description?: string;
  style_type: string;
}

interface RestStylesResponse {
  status?: number;
  error?: boolean;
  meta?: {
    styles: RestStyle[];
  };
}

// ── Helpers (mirrored from bridge.ts) ────────────────────

function rgbToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  if (color.a !== undefined && color.a < 1) {
    const a = Math.round(color.a * 255);
    return hex + a.toString(16).padStart(2, "0");
  }
  return hex;
}

function inferTokenType(resolvedType: string, name: string): DesignToken["type"] {
  if (resolvedType === "COLOR") return "color";
  if (resolvedType === "FLOAT") {
    const lower = name.toLowerCase();
    if (lower.includes("radius") || lower.includes("round")) return "radius";
    if (lower.includes("space") || lower.includes("gap") || lower.includes("padding") || lower.includes("margin")) return "spacing";
    if (lower.includes("shadow") || lower.includes("elevation")) return "shadow";
    if (lower.includes("font") || lower.includes("text") || lower.includes("line")) return "typography";
    return "spacing";
  }
  if (resolvedType === "STRING") {
    const lower = name.toLowerCase();
    if (lower.includes("font") || lower.includes("text")) return "typography";
    return "other";
  }
  return "other";
}

function formatTokenValue(value: unknown, type: string): string | number {
  if (type === "color" && typeof value === "object" && value !== null && "r" in value) {
    return rgbToHex(value as { r: number; g: number; b: number; a?: number });
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// ── Config errors (not retried, always propagated) ───────

export class FigmaConfigError extends Error {
  readonly status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.name = "FigmaConfigError";
    this.status = status;
  }
}

/** 403 on plan-gated endpoints (e.g. variables on Free plan) — absorbed, not fatal. */
export class FigmaPlanError extends FigmaConfigError {
  constructor(endpoint: string) {
    super(`Figma plan limitation: ${endpoint} requires a paid Figma plan (variables need Professional+)`, 403);
    this.name = "FigmaPlanError";
  }
}

// ── Fetch helpers ─────────────────────────────────────────

async function figmaGet<T>(path: string, token: string): Promise<T> {
  const url = `${FIGMA_API}${path}`;
  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token,
      "Accept": "application/json",
    },
  });

  if (response.status === 403) {
    // Variables endpoint returns 403 on Free/Starter plans — not a token error.
    // Components/styles on a file you can't access also return 403 — that IS a token error.
    // We tag by path so callers can decide how to handle it.
    const isVariables = path.includes("/variables/");
    if (isVariables) {
      throw new FigmaPlanError(path);
    }
    throw new FigmaConfigError("Invalid FIGMA_TOKEN or insufficient file permissions", 403);
  }
  if (response.status === 404) {
    throw new FigmaConfigError("File not found. Check FIGMA_FILE_KEY", 404);
  }
  if (!response.ok) {
    throw new FigmaConfigError(`Figma API error ${response.status}: ${response.statusText}`, response.status);
  }

  return response.json() as Promise<T>;
}

// ── Parsers ───────────────────────────────────────────────

function parseTokensFromREST(data: RestVariablesResponse): DesignToken[] {
  const meta = data.meta;
  if (!meta?.variables || !meta?.variableCollections) return [];

  const tokens: DesignToken[] = [];

  for (const collection of Object.values(meta.variableCollections)) {
    for (const variableId of collection.variableIds) {
      const variable = meta.variables[variableId];
      if (!variable) continue;

      const type = inferTokenType(variable.resolvedType, variable.name);
      const values: Record<string, string | number> = {};

      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        const modeName = collection.modes.find((m) => m.modeId === modeId)?.name ?? modeId;
        values[modeName] = formatTokenValue(value, type);
      }

      tokens.push({
        name: variable.name,
        collection: collection.name,
        type,
        values,
        cssVariable: `--${variable.name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()}`,
      });
    }
  }

  return tokens;
}

function parseComponentsFromREST(data: RestComponentsResponse): DesignComponent[] {
  const components = data.meta?.components;
  if (!Array.isArray(components)) return [];

  return components.map((c) => ({
    name: c.name,
    key: c.key,
    description: c.description || "",
    variants: [],
    properties: {},
    figmaNodeId: c.node_id,
  }));
}

function parseStylesFromREST(data: RestStylesResponse): DesignStyle[] {
  const styles = data.meta?.styles;
  if (!Array.isArray(styles)) return [];

  const typeMap: Record<string, DesignStyle["type"]> = {
    FILL: "fill",
    TEXT: "text",
    EFFECT: "effect",
    GRID: "grid",
  };

  return styles.map((s) => ({
    name: s.name,
    type: typeMap[s.style_type] ?? "fill",
    value: {},
  }));
}

// ── Main export ───────────────────────────────────────────

/**
 * Pull design system from Figma REST API.
 * Same return type as FigmaBridge.extractDesignSystem().
 */
export async function extractDesignSystemREST(
  fileKey: string,
  token: string,
): Promise<DesignSystem> {
  log.info({ fileKey }, "Pulling design system via Figma REST API");

  // Fetch all three in parallel.
  // FigmaConfigError (403/404/5xx) always propagates — it signals a config problem.
  // Network/transient errors are absorbed per-endpoint so partial data is still returned.
  const [variablesData, componentsData, stylesData] = await Promise.all([
    figmaGet<RestVariablesResponse>(`/files/${fileKey}/variables/local`, token)
      .catch((err) => {
        // FigmaPlanError = Free plan limitation — absorb, continue without tokens
        if (err instanceof FigmaPlanError) {
          log.warn("Variables endpoint unavailable (Free plan — upgrade to Figma Professional for token sync)");
          return null;
        }
        // Real auth error — propagate to surface to user
        if (err instanceof FigmaConfigError) throw err;
        log.warn({ err: err.message }, "Variables fetch failed");
        return null;
      }),
    figmaGet<RestComponentsResponse>(`/files/${fileKey}/components`, token)
      .catch((err) => {
        if (err instanceof FigmaConfigError) throw err;
        log.warn({ err: err.message }, "Components fetch failed");
        return null;
      }),
    figmaGet<RestStylesResponse>(`/files/${fileKey}/styles`, token)
      .catch((err) => {
        if (err instanceof FigmaConfigError) throw err;
        log.warn({ err: err.message }, "Styles fetch failed");
        return null;
      }),
  ]);

  const tokens = variablesData ? parseTokensFromREST(variablesData) : [];
  const components = componentsData ? parseComponentsFromREST(componentsData) : [];
  const styles = stylesData ? parseStylesFromREST(stylesData) : [];

  const failed = [
    !variablesData && "variables",
    !componentsData && "components",
    !stylesData && "styles",
  ].filter(Boolean);

  if (failed.length > 0) {
    log.warn(
      { tokens: tokens.length, components: components.length, styles: styles.length, failed },
      `REST pull partial — ${failed.join(", ")} endpoint${failed.length > 1 ? "s" : ""} failed, recovered remaining data`,
    );
  } else {
    log.info(
      { tokens: tokens.length, components: components.length, styles: styles.length },
      "REST pull complete",
    );
  }

  return {
    tokens,
    components,
    styles,
    lastSync: new Date().toISOString(),
  };
}
