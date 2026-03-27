/**
 * Figma Bridge — Dual-mode transport to Figma.
 *
 * Mode 1 (Server): Starts a WebSocket server, waits for the Mémoire
 *   plugin to connect. Supports multiple simultaneous plugin connections
 *   and chat relay between Figma and terminal.
 *
 * Mode 2 (Client): Connects to an existing figma-console-mcp WebSocket
 *   server as a fallback for upstream compatibility.
 *
 * The bridge abstracts both modes behind a single API.
 */

import { EventEmitter } from "events";
import { createLogger } from "../engine/logger.js";
import { MemoireWsServer } from "./ws-server.js";
import type { MemoireEvent } from "../engine/core.js";
import type { DesignSystem, DesignToken, DesignComponent, DesignStyle } from "../engine/registry.js";
import type { IANode, IASpec } from "../specs/types.js";

export interface FigmaBridgeConfig {
  token?: string;
  fileKey?: string;
  port?: number;
  instanceName?: string;
  onEvent?: (event: MemoireEvent) => void;
  onChat?: (text: string, from: string) => void;
}

// ── Raw Figma data shapes from plugin ────────────────────

interface RawVariableCollection {
  id: string;
  name: string;
  modes?: { modeId: string; name: string }[];
  variables?: RawVariable[];
}

interface RawVariable {
  id: string;
  name: string;
  resolvedType?: string;
  valuesByMode?: Record<string, unknown>;
  description?: string;
  scopes?: string[];
}

interface RawComponent {
  id: string;
  name: string;
  key?: string;
  description?: string;
  variants?: { id: string; name: string; key: string }[];
  componentProperties?: Record<string, { type: string; defaultValue?: string }>;
}

interface RawStyle {
  id: string;
  name: string;
  type: string;
  styleType?: string;
  description?: string;
  value?: Record<string, unknown>;
}

interface RawPageTreeNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: RawPageTreeNode[];
}

interface RawPageTree {
  fileKey: string;
  fileName: string;
  pages: {
    id: string;
    name: string;
    children: RawPageTreeNode[];
  }[];
}

interface RawSticky {
  id: string;
  text: string;
  fills?: { color?: { r: number; g: number; b: number; a?: number } }[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export class FigmaBridge extends EventEmitter {
  private log = createLogger("figma-bridge");
  private config: FigmaBridgeConfig;
  private server: MemoireWsServer;

  constructor(config: FigmaBridgeConfig) {
    super();
    this.setMaxListeners(30);
    this.config = config;
    this.server = new MemoireWsServer({
      port: config.port,
      instanceName: config.instanceName,
      onChat: config.onChat,
      onEvent: (evt) => {
        config.onEvent?.(evt);
        this.emit("event", evt);
      },
    });

    // Forward server events
    this.server.on("client-connected", (client) => {
      this.emit("plugin-connected", client);
    });

    this.server.on("client-disconnected", () => {
      if (this.server.connectedClients.length === 0) {
        this.log.warn("All Figma plugins disconnected — waiting for reconnection on same port");
      }
      this.emit("plugin-disconnected");
    });

    this.server.on("chat", (data) => this.emit("chat", data));
    this.server.on("selection", (data) => this.emit("selection", data));
    this.server.on("page-changed", (data) => this.emit("page-changed", data));
    this.server.on("document-changed", (data) => this.emit("document-changed", data));
    this.server.on("action-result", (data) => this.emit("action-result", data));
    this.server.on("sync-data", (data) => this.emit("sync-data", data));
  }

  /** Check connection state directly from server — no stale cache. */
  get isConnected(): boolean {
    return this.server.connectedClients.length > 0;
  }

  get wsServer(): MemoireWsServer {
    return this.server;
  }

  /**
   * Start the bridge server and wait for Figma plugins to connect.
   * Returns the port the server is listening on.
   */
  async connect(preferPort?: number): Promise<number> {
    const port = await this.server.start(preferPort);
    this.emitEvent("info", `Waiting for Figma plugin on port ${port}...`);
    return port;
  }

  async disconnect(): Promise<void> {
    this.server.stop();
  }

  /**
   * Send a command to the connected Figma plugin.
   */
  async execute(code: string, timeout = 30000): Promise<unknown> {
    return this.server.sendCommand("execute", { code }, timeout);
  }

  async getSelection(): Promise<unknown> {
    return this.server.sendCommand("getSelection", {}, 30000);
  }

  async getFileData(depth = 3): Promise<unknown> {
    return this.server.sendCommand("getFileData", { depth }, 60000);
  }

  /**
   * Send a chat message to all connected Figma plugins.
   */
  sendChat(text: string): void {
    this.server.sendChat(text);
  }

  /**
   * Get connection status for all bridges.
   */
  getStatus() {
    return this.server.getStatus();
  }

  /**
   * Capture a screenshot of a Figma node (or current page if no nodeId).
   */
  async captureScreenshot(
    nodeId?: string,
    format: "PNG" | "SVG" = "PNG",
    scale = 2,
  ): Promise<{ base64: string; format: string; scale: number; byteLength: number }> {
    const result = await this.server.sendCommand(
      "captureScreenshot",
      { nodeId, format, scale },
      30000,
    ) as { image: { base64: string; format: string; scale: number; byteLength: number } };
    return result.image;
  }

  async extractDesignSystem(): Promise<DesignSystem> {
    this.emitEvent("info", "Pulling design tokens, components, and styles from Figma...");

    // Extract tokens, components, and styles in parallel
    const [rawTokens, rawComponents, rawStyles] = await Promise.all([
      this.server.sendCommand("getVariables", {}, 60000) as Promise<{ collections?: RawVariableCollection[] } | null>,
      this.server.sendCommand("getComponents", {}, 60000) as Promise<RawComponent[] | null>,
      this.server.sendCommand("getStyles", {}, 30000) as Promise<RawStyle[] | null>,
    ]);

    return {
      tokens: this.parseTokens(rawTokens),
      components: this.parseComponents(rawComponents),
      styles: this.parseStyles(rawStyles),
      lastSync: new Date().toISOString(),
    };
  }

  async extractStickies(): Promise<StickyNote[]> {
    this.emitEvent("info", "Reading sticky notes from FigJam board...");

    const result = await this.server.sendCommand("getStickies", {}, 30000) as RawSticky[] | null;

    return (result || [])
      .filter((s) => s.text?.trim())
      .map((s) => ({
        id: s.id,
        text: s.text,
        color: s.fills?.[0]?.color ? rgbToHex(s.fills[0].color) : undefined,
        position: { x: s.x, y: s.y },
        size: { width: s.width, height: s.height },
      }));
  }

  /**
   * Get the full page tree from Figma — all pages with their top-level frames.
   */
  async getPageTree(depth = 2): Promise<RawPageTree> {
    this.emitEvent("info", "Reading page structure from Figma...");
    const result = await this.server.sendCommand("getPageTree", { depth }, 60000) as RawPageTree;
    return result;
  }

  /**
   * Extract an IASpec from the Figma file's page structure.
   * Converts Figma pages → IA nodes, top-level frames → sections.
   */
  async extractIA(name: string, depth = 2): Promise<IASpec> {
    const tree = await this.getPageTree(depth);

    const convertNode = (raw: RawPageTreeNode, parentType: string): IANode => {
      const nodeType = figmaTypeToIAType(raw.type, parentType);
      return {
        id: raw.id,
        label: raw.name,
        type: nodeType,
        figmaNodeId: raw.id,
        children: (raw.children || []).map((c) => convertNode(c, raw.type)),
      };
    };

    const pageNodes: IANode[] = tree.pages.map((page) => ({
      id: page.id,
      label: page.name,
      type: "page" as const,
      figmaNodeId: page.id,
      children: page.children.map((c) => convertNode(c, "PAGE")),
    }));

    const root: IANode = {
      id: "root",
      label: tree.fileName,
      type: "page" as const,
      children: pageNodes,
    };

    // First page is typically the entry point
    const entryPoints = tree.pages.length > 0 ? [tree.pages[0].id] : [];

    return {
      name,
      type: "ia",
      purpose: `Information architecture for ${tree.fileName}`,
      sourceFileKey: tree.fileKey,
      root,
      flows: [],
      entryPoints,
      globals: [],
      notes: [`Extracted from Figma file "${tree.fileName}" with ${tree.pages.length} pages`],
      tags: ["auto-extracted"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Navigate to a specific page by name or ID.
   * Uses figma.setCurrentPageAsync (required for dynamic-page documentAccess).
   */
  async navigateToPage(pageNameOrId: string): Promise<void> {
    await this.server.sendCommand("execute", {
      code: `
        const doc = figma.root;
        const page = doc.children.find(
          p => p.name === ${JSON.stringify(pageNameOrId)} || p.id === ${JSON.stringify(pageNameOrId)}
        );
        if (!page) throw new Error("Page not found: " + ${JSON.stringify(pageNameOrId)});
        await figma.setCurrentPageAsync(page);
        return { page: page.name, pageId: page.id };
      `,
    }, 10000);
  }

  async getComponentImage(nodeId: string, format: "png" | "svg" = "png"): Promise<Buffer> {
    const result = await this.server.sendCommand(
      "getComponentImage",
      { nodeId, format },
      30000
    ) as { base64: string; format: string };

    return Buffer.from(result.base64, "binary");
  }

  // ── Parsers ──────────────────────────────────────────

  private parseTokens(raw: { collections?: RawVariableCollection[] } | null): DesignToken[] {
    if (!raw?.collections) return [];

    const tokens: DesignToken[] = [];

    for (const collection of raw.collections) {
      for (const variable of collection.variables || []) {
        const type = inferTokenType(variable.resolvedType, variable.name);
        const values: Record<string, string | number> = {};

        for (const [modeId, value] of Object.entries(variable.valuesByMode || {})) {
          const modeName = collection.modes?.find((m) => m.modeId === modeId)?.name ?? modeId;
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

  private parseComponents(raw: RawComponent[] | null): DesignComponent[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((c) => ({
      name: c.name,
      key: c.key || c.id,
      description: c.description || "",
      variants: c.variants?.map((v) => v.name) || [],
      properties: c.componentProperties || {},
      figmaNodeId: c.id,
    }));
  }

  private parseStyles(raw: RawStyle[] | null): DesignStyle[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((s) => ({
      name: s.name,
      type: (s.styleType?.toLowerCase() || "fill") as DesignStyle["type"],
      value: s.value || {},
    }));
  }

  private emitEvent(type: MemoireEvent["type"], message: string): void {
    const event: MemoireEvent = {
      type,
      source: "figma",
      message,
      timestamp: new Date(),
    };
    this.config.onEvent?.(event);
    this.emit("event", event);
  }
}

// ── Types & Helpers ────────────────────────────────────

export interface StickyNote {
  id: string;
  text: string;
  color?: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

function inferTokenType(
  resolvedType: string | undefined,
  name: string
): DesignToken["type"] {
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

/** Map Figma node types to IA node types */
function figmaTypeToIAType(figmaType: string, _parentType: string): IANode["type"] {
  switch (figmaType) {
    case "PAGE": return "page";
    case "SECTION": return "section";
    case "FRAME": return "frame";
    case "GROUP": return "group";
    case "COMPONENT":
    case "COMPONENT_SET":
    case "INSTANCE": return "frame";
    default: return "frame";
  }
}

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
