/**
 * Figma REST API Client — direct extraction without the plugin.
 * Uses the Figma REST API v1 with a personal access token.
 */

import type { DesignToken, DesignComponent, DesignStyle, DesignSystem } from "../engine/registry.js";

const BASE = "https://api.figma.com/v1";

interface FigmaRequestOptions {
  token: string;
  timeout?: number;
}

async function figmaFetch(path: string, opts: FigmaRequestOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeout ?? 30_000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "X-Figma-Token": opts.token },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Figma API ${res.status}: ${text}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Raw Figma API shapes ────────────────────────────────

interface FigmaFileResponse {
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  document: FigmaNode;
  components: Record<string, FigmaComponentMeta>;
  styles: Record<string, FigmaStyleMeta>;
}

interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  fills?: FigmaFill[];
  strokes?: FigmaPaint[];
  effects?: FigmaEffect[];
  characters?: string;
  style?: FigmaTypeStyle;
  componentId?: string;
  visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
}

interface FigmaFill {
  type: string;
  color?: { r: number; g: number; b: number; a?: number };
  opacity?: number;
}

interface FigmaPaint {
  type: string;
  color?: { r: number; g: number; b: number };
}

interface FigmaEffect {
  type: string;
  radius?: number;
  color?: { r: number; g: number; b: number; a?: number };
}

interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  letterSpacing?: number;
}

interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
  componentSetId?: string;
}

interface FigmaStyleMeta {
  key: string;
  name: string;
  description: string;
  styleType: "FILL" | "TEXT" | "EFFECT" | "GRID";
}

interface FigmaVariablesResponse {
  meta: {
    variables: Record<string, FigmaVariable>;
    variableCollections: Record<string, FigmaVariableCollection>;
  };
}

interface FigmaVariable {
  id: string;
  name: string;
  key: string;
  variableCollectionId: string;
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR";
  valuesByMode: Record<string, unknown>;
  description?: string;
  scopes?: string[];
}

interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: { modeId: string; name: string }[];
  defaultModeId: string;
}

interface FigmaComponentsResponse {
  meta: {
    components: FigmaComponentEntry[];
  };
}

interface FigmaComponentEntry {
  key: string;
  name: string;
  description: string;
  component_set_id?: string;
  node_id: string;
  thumbnail_url?: string;
}

interface FigmaStylesResponse {
  meta: {
    styles: FigmaStyleEntry[];
  };
}

interface FigmaStyleEntry {
  key: string;
  name: string;
  description: string;
  style_type: string;
  node_id: string;
}

// ── Exported extraction functions ───────────────────────

export interface FigmaExtractResult {
  fileName: string;
  fileKey: string;
  designSystem: DesignSystem;
  targetNode?: FigmaNodeSummary;
  pageTree: FigmaPageSummary[];
}

export interface FigmaNodeSummary {
  id: string;
  name: string;
  type: string;
  children: FigmaNodeSummary[];
  fills?: string[];
  bounds?: { width: number; height: number };
}

export interface FigmaPageSummary {
  id: string;
  name: string;
  frames: { id: string; name: string; type: string }[];
}

/**
 * Extract full design system + target node from Figma via REST API.
 */
export async function extractFromREST(
  token: string,
  fileKey: string,
  targetNodeId?: string
): Promise<FigmaExtractResult> {
  // Fetch in parallel — variables, components, styles, and file metadata
  const [variablesRaw, componentsRaw, stylesRaw, fileRaw] = await Promise.all([
    figmaFetch(`/files/${fileKey}/variables/local`, { token, timeout: 30_000 })
      .catch(() => null),
    figmaFetch(`/files/${fileKey}/components`, { token, timeout: 30_000 })
      .catch(() => null),
    figmaFetch(`/files/${fileKey}/styles`, { token, timeout: 30_000 })
      .catch(() => null),
    figmaFetch(`/files/${fileKey}?depth=2`, { token, timeout: 60_000 })
      .catch(() => null),
  ]);

  const fileName = (fileRaw as FigmaFileResponse | null)?.name ?? fileKey;

  // Parse tokens from variables
  const tokens = parseVariables(variablesRaw as FigmaVariablesResponse | null);

  // Parse components
  const components = parseComponents(componentsRaw as FigmaComponentsResponse | null);

  // Parse styles
  const styles = parseStyles(stylesRaw as FigmaStylesResponse | null);

  // Parse page tree
  const pageTree = parsePageTree(fileRaw as FigmaFileResponse | null);

  // Fetch specific target node if requested
  let targetNode: FigmaNodeSummary | undefined;
  if (targetNodeId) {
    const nodeId = targetNodeId.replace(":", "-");
    const nodeRaw = await figmaFetch(
      `/files/${fileKey}/nodes?ids=${nodeId}&depth=3`,
      { token, timeout: 30_000 }
    ).catch(() => null) as { nodes?: Record<string, { document: FigmaNode }> } | null;

    if (nodeRaw?.nodes) {
      const key = Object.keys(nodeRaw.nodes)[0];
      if (key) targetNode = summarizeNode(nodeRaw.nodes[key].document);
    }
  }

  return {
    fileName,
    fileKey,
    designSystem: {
      tokens,
      components,
      styles,
      lastSync: new Date().toISOString(),
    },
    targetNode,
    pageTree,
  };
}

// ── Parsers ─────────────────────────────────────────────

function parseVariables(raw: FigmaVariablesResponse | null): DesignToken[] {
  if (!raw?.meta?.variables) return [];

  const tokens: DesignToken[] = [];
  const collections = raw.meta.variableCollections ?? {};

  for (const v of Object.values(raw.meta.variables)) {
    const collection = collections[v.variableCollectionId];
    const type = inferType(v.resolvedType, v.name);

    const values: Record<string, string | number> = {};
    const modes = collection?.modes ?? [];

    for (const [modeId, value] of Object.entries(v.valuesByMode)) {
      const modeName = modes.find((m) => m.modeId === modeId)?.name ?? modeId;
      values[modeName] = formatValue(value, type);
    }

    tokens.push({
      name: v.name,
      collection: collection?.name ?? "default",
      type,
      values,
      cssVariable: `--${v.name.replace(/[\s/]/g, "-").toLowerCase()}`,
    });
  }

  return tokens;
}

function parseComponents(raw: FigmaComponentsResponse | null): DesignComponent[] {
  if (!raw?.meta?.components) return [];

  const bySet: Record<string, DesignComponent> = {};
  const standalone: DesignComponent[] = [];

  for (const c of raw.meta.components) {
    if (c.component_set_id) {
      if (!bySet[c.component_set_id]) {
        bySet[c.component_set_id] = {
          name: c.name.split("=")[0]?.split(",")[0]?.trim() ?? c.name,
          key: c.component_set_id,
          description: c.description,
          variants: [],
          properties: {},
          figmaNodeId: c.node_id,
        };
      }
      bySet[c.component_set_id].variants.push(c.name);
    } else {
      standalone.push({
        name: c.name,
        key: c.key,
        description: c.description,
        variants: [],
        properties: {},
        figmaNodeId: c.node_id,
      });
    }
  }

  return [...Object.values(bySet), ...standalone];
}

function parseStyles(raw: FigmaStylesResponse | null): DesignStyle[] {
  if (!raw?.meta?.styles) return [];

  return raw.meta.styles.map((s) => ({
    name: s.name,
    type: (s.style_type?.toLowerCase() || "fill") as DesignStyle["type"],
    value: { key: s.key, description: s.description },
  }));
}

function parsePageTree(raw: FigmaFileResponse | null): FigmaPageSummary[] {
  if (!raw?.document?.children) return [];

  return raw.document.children.map((page) => ({
    id: page.id,
    name: page.name,
    frames: (page.children ?? [])
      .filter((c) => c.type === "FRAME" || c.type === "COMPONENT" || c.type === "SECTION")
      .map((c) => ({ id: c.id, name: c.name, type: c.type })),
  }));
}

function summarizeNode(node: FigmaNode, depth = 0): FigmaNodeSummary {
  const fills = (node.fills ?? [])
    .filter((f) => f.color)
    .map((f) => rgbToHex(f.color!));

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    fills,
    bounds: node.absoluteBoundingBox
      ? { width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height }
      : undefined,
    children: depth < 3
      ? (node.children ?? []).map((c) => summarizeNode(c, depth + 1))
      : [],
  };
}

// ── Helpers ─────────────────────────────────────────────

function inferType(resolvedType: string, name: string): DesignToken["type"] {
  if (resolvedType === "COLOR") return "color";
  if (resolvedType === "FLOAT") {
    const n = name.toLowerCase();
    if (n.includes("radius") || n.includes("round")) return "radius";
    if (n.includes("space") || n.includes("gap") || n.includes("padding") || n.includes("margin")) return "spacing";
    if (n.includes("shadow") || n.includes("elevation")) return "shadow";
    if (n.includes("font") || n.includes("text") || n.includes("line")) return "typography";
    return "spacing";
  }
  if (resolvedType === "STRING") {
    const n = name.toLowerCase();
    if (n.includes("font") || n.includes("text")) return "typography";
    return "other";
  }
  return "other";
}

function formatValue(value: unknown, type: string): string | number {
  if (type === "color" && typeof value === "object" && value !== null && "r" in value) {
    return rgbToHex(value as { r: number; g: number; b: number; a?: number });
  }
  if (typeof value === "number") return value;
  if (typeof value === "string") return value;
  // Handle aliased variable refs
  if (typeof value === "object" && value !== null && "type" in value) {
    const v = value as { type: string; id?: string };
    if (v.type === "VARIABLE_ALIAS") return `var(${v.id})`;
  }
  return JSON.stringify(value);
}

function rgbToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(c.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(c.b * 255).toString(16).padStart(2, "0");
  const hex = `#${r}${g}${b}`;
  if (c.a !== undefined && c.a < 1) {
    return hex + Math.round(c.a * 255).toString(16).padStart(2, "0");
  }
  return hex;
}
