/**
 * Figma REST Client — Pulls design system data using the Figma REST API.
 *
 * This module is the headless alternative to FigmaBridge (ws-server.ts). Use it
 * when Figma Desktop is not running — CI pipelines, headless machines, or any
 * environment where the plugin cannot connect over WebSocket. The only
 * prerequisites are a personal access token (FIGMA_TOKEN) and a file key
 * (FIGMA_FILE_KEY); no plugin, no local server, no open browser tab.
 *
 * The returned DesignSystem shape is identical to what FigmaBridge.extractDesignSystem()
 * returns, so all downstream consumers — registry, auto-spec, code-gen — are
 * agnostic to which transport was used.
 *
 * Error taxonomy:
 *   FigmaConfigError — permanent failures that require user action (bad token,
 *     wrong file key). Never retry automatically; surface immediately.
 *   FigmaPlanError (extends FigmaConfigError) — the token is valid but the
 *     endpoint is gated behind a paid Figma plan. Absorbed gracefully so a
 *     partial design system is still returned.
 *   Error — transient network failures. Absorbed per-endpoint so the pull
 *     continues with the data that did arrive.
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

/**
 * Convert a Figma RGBA color object (channels in 0–1 range) to a CSS hex string.
 * Appends the alpha byte only when the color is not fully opaque, keeping most
 * hex values the shorter 6-character form that CSS and Tailwind both expect.
 */
function rgbToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const red = Math.round(color.r * 255);
  const green = Math.round(color.g * 255);
  const blue = Math.round(color.b * 255);
  const hex = `#${red.toString(16).padStart(2, "0")}${green.toString(16).padStart(2, "0")}${blue.toString(16).padStart(2, "0")}`;
  if (color.a !== undefined && color.a < 1) {
    const alpha = Math.round(color.a * 255);
    return hex + alpha.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Map a Figma variable's resolvedType + name to a semantic DesignToken type.
 *
 * Figma only exposes COLOR / FLOAT / STRING at the API level, so for FLOAT and
 * STRING variables we fall back to name-based heuristics (e.g. a FLOAT variable
 * named "spacing/md" is almost certainly a spacing token, not a shadow). This
 * keeps generated CSS variable names and token groupings meaningful without
 * requiring the designer to annotate every variable manually.
 */
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

/**
 * Normalise a raw Figma variable value into a string or number that downstream
 * code (CSS variable emitters, token diff engine) can handle uniformly.
 *
 * Color objects are converted to hex strings so the rest of the codebase never
 * has to deal with RGB tuples. All other scalars are passed through as-is.
 * Non-scalar values (e.g. alias references, complex objects) are serialised to
 * JSON as a last resort — they should rarely appear in practice.
 */
function formatTokenValue(value: unknown, type: string): string | number {
  if (type === "color" && typeof value === "object" && value !== null && "r" in value) {
    return rgbToHex(value as { r: number; g: number; b: number; a?: number });
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// ── Config errors (not retried, always propagated) ───────

/**
 * Thrown when the request cannot succeed without user intervention — invalid or
 * expired token, wrong file key, or insufficient file permissions. Callers must
 * surface this error rather than retrying; the root cause is always a
 * misconfiguration, not a transient failure.
 */
export class FigmaConfigError extends Error {
  readonly status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.name = "FigmaConfigError";
    this.status = status;
  }
}

/**
 * Thrown when a 403 is received on a plan-gated endpoint such as
 * `/files/{key}/variables/local`. The Figma variables API requires a
 * Professional plan or higher; Free and Starter plans return 403 even for
 * files the token can otherwise access.
 *
 * Unlike a generic FigmaConfigError, FigmaPlanError is absorbed by
 * extractDesignSystemREST — the pull continues without tokens and logs a
 * warning instead of failing.
 */
export class FigmaPlanError extends FigmaConfigError {
  constructor(endpoint: string) {
    super(`Figma plan limitation: ${endpoint} requires a paid Figma plan (variables need Professional+)`, 403);
    this.name = "FigmaPlanError";
  }
}

// ── Core fetch helper ─────────────────────────────────────

/**
 * Authenticated GET request to the Figma REST API.
 *
 * Wraps `fetch` with the `X-Figma-Token` header and converts HTTP error
 * statuses into typed errors so callers can distinguish config problems from
 * plan limitations from genuine network failures.
 *
 * @param path   API path relative to `https://api.figma.com/v1` (must start with `/`)
 * @param token  Figma personal access token
 * @returns      Parsed JSON response body cast to `T`
 *
 * @throws {FigmaConfigError} status 401 — token is invalid or expired
 * @throws {FigmaPlanError}   status 403 on `/variables/` paths — plan limitation, not a token error
 * @throws {FigmaConfigError} status 403 on other paths — token lacks file access
 * @throws {FigmaConfigError} status 404 — file key not found or file is private
 * @throws {FigmaConfigError} any other non-OK status — unexpected API error
 * @throws {Error}            network-level failures (DNS, TLS, timeout)
 */
async function figmaGet<T>(path: string, token: string): Promise<T> {
  const url = `${FIGMA_API}${path}`;
  const response = await fetch(url, {
    headers: {
      "X-Figma-Token": token,
      "Accept": "application/json",
    },
  });

  if (response.status === 401) {
    throw new FigmaConfigError("Invalid or expired Figma token. Generate a new one at figma.com/settings", 401);
  }
  if (response.status === 403) {
    // The variables endpoint returns 403 specifically on Free/Starter plans even
    // when the token is valid. We distinguish it by path so the caller can absorb
    // the error gracefully and continue with partial data instead of failing hard.
    // All other 403s mean the token genuinely cannot access the file.
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

// ── Token + File Validation ───────────────────────────────

export interface FigmaUserInfo {
  id: string;
  email: string;
  handle: string;
  img_url?: string;
}

/**
 * Verify a Figma personal access token by calling `GET /v1/me`.
 *
 * Use this immediately after the user pastes a token — catching the error here
 * gives a clear "token is wrong" message rather than a cryptic failure buried
 * inside a design system pull.
 *
 * @param token  Figma personal access token to validate
 * @returns      Basic user info (id, email, handle) confirming the token is valid
 * @throws {FigmaConfigError} status 401 — token is invalid or expired
 */
export async function validateFigmaToken(token: string): Promise<FigmaUserInfo> {
  return figmaGet<FigmaUserInfo>("/me", token);
}

export interface FigmaFileInfo {
  name: string;
  /**
   * Number of published components in the file. Used as a proxy for file
   * health — a count of zero is valid (new files) but useful for surfacing
   * "did you mean a different file key?" warnings in the CLI.
   */
  componentCount: number;
}

/**
 * Confirm a file key is accessible by fetching its published component list.
 *
 * A successful response means the token can read the file. The component count
 * is returned as a lightweight health indicator — the caller can warn the user
 * when zero components are found without treating it as a hard error.
 *
 * FigmaPlanError is absorbed here: an inaccessible variables endpoint still
 * proves the file exists and the token is valid.
 *
 * @param fileKey  Figma file key (the alphanumeric segment of the file URL)
 * @param token    Figma personal access token
 * @returns        File name (falls back to fileKey) and published component count
 * @throws {FigmaConfigError} status 404 — file key is wrong or file is deleted
 * @throws {FigmaConfigError} status 403 — token lacks access to this file
 */
export async function validateFigmaFile(fileKey: string, token: string): Promise<FigmaFileInfo> {
  const data = await figmaGet<RestComponentsResponse>(`/files/${fileKey}/components`, token)
    .catch((err) => {
      // A plan-gated 403 still confirms the file and token are valid — absorb it
      // and return zero components rather than bubbling up an error.
      if (err instanceof FigmaPlanError) return null;
      throw err;
    });

  return {
    name: fileKey,
    componentCount: data?.meta?.components?.length ?? 0,
  };
}

// ── Parsers ───────────────────────────────────────────────

/**
 * Convert the raw `/variables/local` REST response into the canonical
 * DesignToken array. Iterates collections first, then variable IDs within each
 * collection, so token grouping in the registry mirrors Figma's own organisation.
 * Mode names are resolved from the collection's modes array — falling back to the
 * raw modeId string only when the mode cannot be matched, which keeps output
 * readable even if Figma returns an unexpected payload shape.
 */
function parseTokensFromREST(data: RestVariablesResponse): DesignToken[] {
  const meta = data.meta;
  if (!meta?.variables || !meta?.variableCollections) return [];

  const tokens: DesignToken[] = [];

  for (const collection of Object.values(meta.variableCollections)) {
    for (const variableId of collection.variableIds) {
      const variable = meta.variables[variableId];
      if (!variable) continue;

      const type = inferTokenType(variable.resolvedType, variable.name);
      const valuesByModeName: Record<string, string | number> = {};

      for (const [modeId, rawValue] of Object.entries(variable.valuesByMode)) {
        const modeName = collection.modes.find((mode) => mode.modeId === modeId)?.name ?? modeId;
        valuesByModeName[modeName] = formatTokenValue(rawValue, type);
      }

      tokens.push({
        name: variable.name,
        collection: collection.name,
        type,
        values: valuesByModeName,
        cssVariable: `--${variable.name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()}`,
      });
    }
  }

  return tokens;
}

/**
 * Convert the raw `/components` REST response into the canonical DesignComponent
 * array. The REST API reports components at file scope (not page scope), so there
 * is no tree traversal — just a flat map over the `meta.components` array.
 */
function parseComponentsFromREST(data: RestComponentsResponse): DesignComponent[] {
  const components = data.meta?.components;
  if (!Array.isArray(components)) return [];

  return components.map((component) => ({
    name: component.name,
    key: component.key,
    description: component.description || "",
    variants: [],
    properties: {},
    figmaNodeId: component.node_id,
  }));
}

/**
 * Convert the raw `/styles` REST response into the canonical DesignStyle array.
 * Maps Figma's uppercase style_type strings (FILL, TEXT, EFFECT, GRID) to the
 * lowercase enum values expected by the registry. Unknown types default to "fill"
 * rather than crashing, because the Figma API occasionally adds new style types
 * ahead of this client.
 */
function parseStylesFromREST(data: RestStylesResponse): DesignStyle[] {
  const styles = data.meta?.styles;
  if (!Array.isArray(styles)) return [];

  const typeMap: Record<string, DesignStyle["type"]> = {
    FILL: "fill",
    TEXT: "text",
    EFFECT: "effect",
    GRID: "grid",
  };

  return styles.map((style) => ({
    name: style.name,
    type: typeMap[style.style_type] ?? "fill",
    value: {},
  }));
}

// ── Main export ───────────────────────────────────────────

/**
 * Pull a complete design system from Figma using only the REST API.
 *
 * Fires three requests in parallel — variables (tokens), components, and styles —
 * and merges the results into the same {@link DesignSystem} shape that
 * `FigmaBridge.extractDesignSystem()` returns. All downstream code (registry,
 * auto-spec, code-gen, token-differ) works without knowing which transport was
 * used.
 *
 * **Partial-failure semantics:**
 * Each endpoint is wrapped in its own catch handler. A {@link FigmaPlanError} on
 * the variables endpoint (Free plan restriction) is absorbed silently — the pull
 * continues without tokens. A {@link FigmaConfigError} on any endpoint (bad token,
 * missing file key) is re-thrown immediately because the user must fix the
 * configuration before any data can be retrieved. Generic network errors are
 * absorbed per-endpoint so a flaky connection on one call doesn't discard the
 * data that the other two calls already returned.
 *
 * @param token    Figma personal access token with read access to the file
 * @param fileKey  Figma file key from the file's URL
 * @returns        DesignSystem containing tokens, components, and styles
 * @throws {FigmaConfigError} when the token is invalid or the file is inaccessible
 */
export async function extractDesignSystemREST(
  fileKey: string,
  token: string,
): Promise<DesignSystem> {
  log.info({ fileKey }, "Pulling design system via Figma REST API");

  const [variablesData, componentsData, stylesData] = await Promise.all([
    figmaGet<RestVariablesResponse>(`/files/${fileKey}/variables/local`, token)
      .catch((err) => {
        // FigmaPlanError means the file is reachable but variables are gated behind a paid
        // plan — absorb and continue without tokens rather than aborting the whole pull.
        if (err instanceof FigmaPlanError) {
          log.warn("Variables endpoint unavailable (Free plan — upgrade to Figma Professional for token sync)");
          return null;
        }
        // Any other FigmaConfigError (bad token, wrong file key) must surface to the user.
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

  const failedEndpoints = [
    !variablesData && "variables",
    !componentsData && "components",
    !stylesData && "styles",
  ].filter(Boolean);

  if (failedEndpoints.length > 0) {
    log.warn(
      { tokens: tokens.length, components: components.length, styles: styles.length, failed: failedEndpoints },
      `REST pull partial — ${failedEndpoints.join(", ")} endpoint${failedEndpoints.length > 1 ? "s" : ""} failed, recovered remaining data`,
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
