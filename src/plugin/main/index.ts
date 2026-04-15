declare const figma: any;
declare const __html__: string;

import {
  WIDGET_V2_CHANNEL,
  createRunId,
  type WidgetConnectionState,
  type WidgetJob,
  type WidgetJobStatus,
  type WidgetLogEntry,
  type WidgetSelectionComponent,
  type WidgetSelectionLayout,
  type WidgetSelectionNodeSnapshot,
  type WidgetSelectionSnapshot,
  type WidgetUiEnvelope,
  type WidgetCommandName,
} from "../shared/contracts.js";
import { stringIncludes } from "../shared/compat.js";
import {
  createChangeBuffer,
  type ChangeBuffer,
  type ChangeBufferDropEvent,
} from "./state/change-buffer.js";

interface PluginState {
  sessionId: string;
  activeRunId: string | null;
  jobs: Map<string, WidgetJob>;
  selectionListenerActive: boolean;
  lastSelectionUpdate: number;
  selectionThrottleMs: number;
  changeBuffer: ChangeBuffer;
  connection: WidgetConnectionState;
}

/** Race a promise against a timeout — prevents indefinite hangs on font loads etc. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label} after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const FONT_TIMEOUT_MS = 5000;

const BLOCKED_PATTERNS = [/figma\.closePlugin/i, /figma\.root\.remove/i, /while\s*\(\s*true\s*\)/i, /for\s*\(\s*;\s*;\s*\)/i];
const BLOCKED_KEYWORDS = ["closeplugin", "removepage", "__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__"];
const BLOCKED_GLOBALS = [/\bFunction\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /\bglobalThis\b/, /\bself\b/, /\bwindow\b/, /\beval\s*\(/];

const state: PluginState = {
  sessionId: createRunId("widget"),
  activeRunId: null,
  jobs: new Map(),
  selectionListenerActive: true,
  lastSelectionUpdate: 0,
  selectionThrottleMs: 180,
  changeBuffer: createChangeBuffer({
    capacity: 300,
    onDrop: emitChangeBufferDrop,
  }),
  connection: {
    stage: "offline",
    port: null,
    name: "Mémoire Control Plane",
    latencyMs: null,
    fileName: "",
    fileKey: null,
    pageName: "",
    pageId: null,
    editorType: "",
    connectedAt: null,
    reconnectDelayMs: null,
  },
};

function emitChangeBufferDrop(event: ChangeBufferDropEvent): void {
  post({
    channel: WIDGET_V2_CHANNEL,
    source: "main",
    type: "changes-dropped",
    droppedCount: event.droppedCount,
    firstDroppedAt: event.firstDroppedAt,
    lastDroppedAt: event.lastDroppedAt,
    remaining: event.remaining,
    capacity: event.capacity,
    sessionId: state.sessionId,
    updatedAt: Date.now(),
  });
}

/** Emit a granular variable-changed or component-changed event to the UI for bridge relay. */
function emitGranularChange(type: "variable-changed" | "component-changed", change: { id: string; node?: any }, timestamp: number): void {
  if (type === "variable-changed") {
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "granular-change",
      granularType: "variable-changed",
      data: {
        name: change.id,
        collection: "",
        values: {},
        updatedAt: timestamp,
      },
    });
  } else if (type === "component-changed") {
    var node = change.node;
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "granular-change",
      granularType: "component-changed",
      data: {
        name: node ? node.name : "unknown",
        key: node && node.key ? node.key : change.id,
        figmaNodeId: change.id,
        updatedAt: timestamp,
      },
    });
  }
}

figma.showUI(__html__, {
  width: 480,
  height: 600,
  title: "Mémoire Control Plane",
  themeColors: true,
});

void bootstrap();

async function bootstrap(): Promise<void> {
  await figma.loadAllPagesAsync();
  refreshConnectionState();
  post({
    channel: WIDGET_V2_CHANNEL,
    source: "main",
    type: "bootstrap",
    connection: state.connection,
    selection: createSelectionSnapshot(),
    initialJobs: snapshotJobs(),
  });

  figma.on("selectionchange", () => {
    if (!state.selectionListenerActive) return;
    const now = Date.now();
    if (now - state.lastSelectionUpdate < state.selectionThrottleMs) return;
    state.lastSelectionUpdate = now;
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "selection",
      selection: createSelectionSnapshot(),
    });
  });

  figma.on("currentpagechange", () => {
    refreshConnectionState();
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "page",
      pageName: figma.currentPage.name,
      pageId: figma.currentPage.id,
      updatedAt: Date.now(),
    });
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "connection",
      connection: state.connection,
    });
  });

  figma.on("documentchange", (event: { documentChanges: Array<{ type: string; id: string; origin?: string; node?: any; properties?: string[] }> }) => {
    const now = Date.now();
    const changes = event?.documentChanges ?? [];
    const pageId = figma.currentPage?.id ?? null;
    const batch = changes.map((change) => ({
      type: change.type,
      id: change.id,
      origin: change.origin ?? null,
      sessionId: state.sessionId,
      runId: state.activeRunId,
      pageId,
      timestamp: now,
    }));
    state.changeBuffer.pushMany(batch);

    for (const change of changes) {
      if (change.type === "STYLE_CREATE" || change.type === "STYLE_DELETE" || change.type === "STYLE_CHANGE") {
        emitGranularChange("variable-changed", change, now);
      }
      if (change.type === "PROPERTY_CHANGE" && change.node) {
        var nodeType = change.node.type;
        if (nodeType === "COMPONENT" || nodeType === "COMPONENT_SET") {
          emitGranularChange("component-changed", change, now);
        }
      }
    }

    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "changes",
      count: changes.length,
      buffered: state.changeBuffer.size(),
      sessionId: state.sessionId,
      runId: state.activeRunId,
      updatedAt: now,
    });
  });
}

figma.ui.onmessage = async (message: WidgetUiEnvelope) => {
  if (!message || message.channel !== WIDGET_V2_CHANNEL) {
    return;
  }

  if (message.type === "ping") {
    refreshConnectionState();
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "pong",
      connection: state.connection,
    });
    return;
  }

  if (message.type !== "run-command") {
    return;
  }

  const job = message.action ? startJob(message.requestId, message.command, message.action.kind, message.action.label) : null;

  try {
    state.activeRunId = job?.runId ?? null;
    const result = await handleCommand(message.command, message.params ?? {});
    if (job) {
      finishJob(job, "completed", summarizeCommandResult(message.command, result));
    }
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "command-result",
      requestId: message.requestId,
      command: message.command,
      ok: true,
      sessionId: state.sessionId,
      runId: job?.runId ?? null,
      result,
    });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (job) {
      finishJob(job, "failed", undefined, messageText);
    }
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "command-result",
      requestId: message.requestId,
      command: message.command,
      ok: false,
      sessionId: state.sessionId,
      runId: job?.runId ?? null,
      error: messageText,
    });
  } finally {
    state.activeRunId = null;
  }
};

function refreshConnectionState(): void {
  state.connection = {
    ...state.connection,
    stage: "connected",
    fileName: figma.root.name || "",
    fileKey: figma.fileKey || null,
    pageName: figma.currentPage?.name || "",
    pageId: figma.currentPage?.id || null,
    editorType: figma.editorType || "figma",
    connectedAt: state.connection.connectedAt ?? Date.now(),
  };
}

function post(message: unknown): void {
  figma.ui.postMessage(message);
}

function startJob(id: string, command: WidgetCommandName, kind: WidgetJob["kind"], label: string): WidgetJob {
  const now = Date.now();
  const job: WidgetJob = {
    id,
    runId: createRunId("job"),
    kind,
    label,
    command,
    status: "running",
    startedAt: now,
    updatedAt: now,
    progressText: "Running",
  };
  state.jobs.set(job.id, job);
  post({
    channel: WIDGET_V2_CHANNEL,
    source: "main",
    type: "job",
    job,
  });
  return job;
}

function finishJob(job: WidgetJob, status: WidgetJobStatus, summary?: string, error?: string): void {
  const next: WidgetJob = {
    ...job,
    status,
    updatedAt: Date.now(),
    finishedAt: Date.now(),
    progressText: status === "completed" ? "Done" : "Failed",
    summary,
    error,
  };
  state.jobs.set(next.id, next);
  post({
    channel: WIDGET_V2_CHANNEL,
    source: "main",
    type: "job",
    job: next,
  });
}

function snapshotJobs(): WidgetJob[] {
  return Array.from(state.jobs.values()).sort((left, right) => right.updatedAt - left.updatedAt);
}

async function handleCommand(command: WidgetCommandName, params: Record<string, unknown>): Promise<unknown> {
  switch (command) {
    case "execute":
      return executeCode(String(params.code ?? ""));
    case "getSelection":
      return createSelectionSnapshot();
    case "getFileData":
      return getFileData(Number(params.depth ?? 3));
    case "getVariables":
      return getVariables();
    case "getComponents":
      return getComponents();
    case "getStyles":
      return getStyles();
    case "getStickies":
      return getStickies();
    case "getChanges": {
      return state.changeBuffer.drain();
    }
    case "getComponentImage":
      return getComponentImage(String(params.nodeId ?? ""), String(params.format ?? "png"));
    case "createNode":
      return createNode(params);
    case "updateNode":
      return updateNode(params);
    case "deleteNode":
      return deleteNode(String(params.nodeId ?? ""));
    case "setSelection":
      return setSelection(Array.isArray(params.nodeIds) ? params.nodeIds.map(String) : []);
    case "navigateTo":
      return navigateTo(String(params.nodeId ?? ""));
    case "getPageList":
      return figma.root.children.map((page: any) => ({ id: page.id, name: page.name }));
    case "getPageTree":
      return getPageTree(Number(params.depth ?? 2));
    case "captureScreenshot":
      return captureScreenshot(params);
    case "pushTokens":
      return pushTokens(params);
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function summarizeCommandResult(command: WidgetCommandName, result: unknown): string {
  if (command === "getSelection" && result && typeof result === "object" && "count" in (result as Record<string, unknown>)) {
    return `${String((result as Record<string, unknown>).count)} selected`;
  }
  if (command === "getChanges" && Array.isArray(result)) {
    return `${result.length} changes`;
  }
  if (command === "getVariables" && result && typeof result === "object" && "collections" in (result as Record<string, unknown>)) {
    return `${((result as { collections?: unknown[] }).collections || []).length} collections`;
  }
  if (command === "getComponents" && Array.isArray(result)) {
    return `${result.length} components`;
  }
  if (command === "getStyles" && Array.isArray(result)) {
    return `${result.length} styles`;
  }
  return command;
}

function createSelectionSnapshot(): WidgetSelectionSnapshot {
  refreshConnectionState();
  return {
    count: figma.currentPage.selection.length,
    pageName: figma.currentPage.name,
    pageId: figma.currentPage.id,
    sessionId: state.sessionId,
    nodes: figma.currentPage.selection.map((node: any) => serializeSelectionNode(node)),
    updatedAt: Date.now(),
  };
}

function serializeSelectionNode(node: any): WidgetSelectionNodeSnapshot {
  const snapshot: WidgetSelectionNodeSnapshot = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
    pageName: figma.currentPage.name,
  };

  if ("x" in node) snapshot.x = node.x;
  if ("y" in node) snapshot.y = node.y;
  if ("width" in node) snapshot.width = node.width;
  if ("height" in node) snapshot.height = node.height;
  if ("characters" in node) snapshot.characters = node.characters;
  if ("opacity" in node) snapshot.opacity = node.opacity;
  if ("rotation" in node) snapshot.rotation = node.rotation;
  if ("cornerRadius" in node) snapshot.cornerRadius = node.cornerRadius;
  if ("children" in node && Array.isArray(node.children)) snapshot.childCount = node.children.length;
  if ("fillStyleId" in node) snapshot.fillStyleId = node.fillStyleId || null;
  if ("strokeStyleId" in node) snapshot.strokeStyleId = node.strokeStyleId || null;
  if ("textStyleId" in node) snapshot.textStyleId = node.textStyleId || null;
  if ("boundVariables" in node) snapshot.boundVariables = node.boundVariables || {};

  if ("fills" in node && Array.isArray(node.fills)) {
    snapshot.fills = node.fills.map((fill: any) => ({
      type: fill.type,
      color: fill.color
        ? {
            r: fill.color.r,
            g: fill.color.g,
            b: fill.color.b,
            a: fill.opacity !== undefined ? fill.opacity : 1,
          }
        : null,
    }));
  }

  snapshot.layout = readLayout(node);
  snapshot.component = readComponent(node);
  return snapshot;
}

function readLayout(node: any): WidgetSelectionLayout {
  return {
    layoutMode: "layoutMode" in node ? node.layoutMode || null : null,
    itemSpacing: "itemSpacing" in node ? node.itemSpacing ?? null : null,
    paddingLeft: "paddingLeft" in node ? node.paddingLeft ?? null : null,
    paddingRight: "paddingRight" in node ? node.paddingRight ?? null : null,
    paddingTop: "paddingTop" in node ? node.paddingTop ?? null : null,
    paddingBottom: "paddingBottom" in node ? node.paddingBottom ?? null : null,
  };
}

function readComponent(node: any): WidgetSelectionComponent | undefined {
  const isVariant = node.type === "COMPONENT" && node.parent?.type === "COMPONENT_SET";
  const variantProperties: Record<string, string> = {};
  if (typeof node.variantProperties === "object" && node.variantProperties) {
    for (const [key, value] of Object.entries(node.variantProperties)) {
      variantProperties[key] = String((value as { value?: unknown })?.value ?? value);
    }
  }

  const componentProperties = "componentPropertyDefinitions" in node && node.componentPropertyDefinitions
    ? node.componentPropertyDefinitions
    : {};

  if (!("key" in node) && !("description" in node) && !Object.keys(componentProperties).length && !Object.keys(variantProperties).length) {
    return undefined;
  }

  return {
    key: "key" in node ? node.key || null : null,
    description: "description" in node ? node.description || null : null,
    isVariant,
    variantProperties,
    componentProperties,
  };
}

function serializeVariable(variable: any) {
  return {
    id: variable.id,
    name: variable.name,
    key: variable.key,
    resolvedType: variable.resolvedType,
    valuesByMode: variable.valuesByMode,
    variableCollectionId: variable.variableCollectionId,
    scopes: variable.scopes,
    codeSyntax: variable.codeSyntax || {},
    description: variable.description,
    hiddenFromPublishing: variable.hiddenFromPublishing,
  };
}

function serializeCollection(collection: any) {
  return {
    id: collection.id,
    name: collection.name,
    key: collection.key,
    modes: collection.modes,
    defaultModeId: collection.defaultModeId,
    variableIds: collection.variableIds,
  };
}

function isCodeSafe(code: string): { safe: boolean; reason: string | null } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Matches restricted pattern: ${String(pattern)}` };
    }
  }
  const normalized = code.toLowerCase().replace(/[\s'"`+\[\]]/g, "");
  for (const keyword of BLOCKED_KEYWORDS) {
    if (stringIncludes(normalized, keyword)) {
      return { safe: false, reason: `Contains blocked keyword: ${keyword}` };
    }
  }
  for (const pattern of BLOCKED_GLOBALS) {
    if (pattern.test(code)) {
      return { safe: false, reason: `Blocked global access: ${String(pattern)}` };
    }
  }
  return { safe: true, reason: null };
}

async function executeCode(code: string): Promise<unknown> {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Code must be a non-empty string");
  }
  if (code.length > 50_000) {
    throw new Error("Code exceeds maximum length (50KB)");
  }
  const check = isCodeSafe(code);
  if (!check.safe) {
    throw new Error(`Blocked: ${check.reason}`);
  }
  const fn = new Function("figma", `"use strict"; return (async () => { ${code} })()`);
  return await fn(figma);
}

function getPageTree(maxDepth: number): unknown {
  function walkChildren(node: any, depth: number): Record<string, unknown> | null {
    if (depth > maxDepth) return null;
    const data: Record<string, unknown> = { id: node.id, name: node.name, type: node.type, visible: node.visible !== false };
    if ("children" in node && node.children) {
      data.children = node.children.map((child: any) => walkChildren(child, depth + 1)).filter(Boolean);
    }
    return data;
  }

  return {
    fileKey: figma.fileKey,
    fileName: figma.root.name,
    pages: figma.root.children.map((page: any) => ({
      id: page.id,
      name: page.name,
      children: page.children.map((child: any) => walkChildren(child, 1)).filter(Boolean),
    })),
  };
}

function getFileData(maxDepth: number): unknown {
  function walk(node: any, depth: number): Record<string, unknown> {
    if (depth > maxDepth) {
      return { id: node.id, name: node.name, type: node.type };
    }
    const data: Record<string, unknown> = {
      id: node.id,
      name: node.name,
      type: node.type,
      visible: node.visible !== false,
    };
    if ("children" in node && node.children) {
      data.children = node.children.map((child: any) => walk(child, depth + 1));
    }
    return data;
  }

  return walk(figma.currentPage, 0);
}

async function getVariables(): Promise<unknown> {
  if (!figma.variables || figma.editorType === "figjam" || figma.editorType === "slides") {
    return { collections: [] };
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const result = [];

  for (const collection of collections) {
    const variables = [];
    for (const variableId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(variableId);
      if (!variable) continue;
      variables.push(serializeVariable(variable));
    }
    result.push({
      id: collection.id,
      name: collection.name,
      modes: collection.modes,
      variables,
    });
  }

  return { collections: result };
}

function getComponents(): unknown[] {
  const components = figma.root.findAll((node: any) => node.type === "COMPONENT" || node.type === "COMPONENT_SET");
  return components.map((component: any) => ({
    id: component.id,
    name: component.name,
    type: component.type,
    description: component.description || "",
    key: component.type === "COMPONENT" ? component.key : undefined,
    variants: component.type === "COMPONENT_SET" && component.children
      ? component.children.map((variant: any) => ({ id: variant.id, name: variant.name, key: variant.key }))
      : [],
    componentProperties: "componentPropertyDefinitions" in component ? component.componentPropertyDefinitions : {},
  }));
}

function getStyles(): unknown[] {
  const styles = [];
  for (const style of figma.getLocalPaintStyles()) {
    styles.push({
      id: style.id,
      name: style.name,
      type: style.type,
      styleType: "FILL",
      description: style.description,
      value: style.paints,
    });
  }
  for (const style of figma.getLocalTextStyles()) {
    styles.push({
      id: style.id,
      name: style.name,
      type: style.type,
      styleType: "TEXT",
      description: style.description,
      value: {
        fontName: style.fontName,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
      },
    });
  }
  for (const style of figma.getLocalEffectStyles()) {
    styles.push({
      id: style.id,
      name: style.name,
      type: style.type,
      styleType: "EFFECT",
      description: style.description,
      value: style.effects,
    });
  }
  return styles;
}

function getStickies(): unknown[] {
  return figma.currentPage.findAll((node: any) => node.type === "STICKY").map((sticky: any) => ({
    id: sticky.id,
    text: sticky.text ? sticky.text.characters : "",
    authorName: sticky.authorName || null,
    fills: sticky.fills,
    x: sticky.x,
    y: sticky.y,
    width: sticky.width,
    height: sticky.height,
  }));
}

async function getComponentImage(nodeId: string, format: string): Promise<unknown> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  const bytes = await node.exportAsync({
    format: String(format || "PNG").toUpperCase(),
    constraint: { type: "SCALE", value: 2 },
  });
  return {
    base64: figma.base64Encode(bytes),
    format: format || "png",
  };
}

async function createNode(params: Record<string, unknown>): Promise<unknown> {
  const { type, name, x, y, width, height, parentId } = params;
  let node: any;

  switch (type) {
    case "FRAME":
      node = figma.createFrame();
      break;
    case "RECTANGLE":
      node = figma.createRectangle();
      break;
    case "TEXT":
      node = figma.createText();
      await withTimeout(figma.loadFontAsync({ family: "Inter", style: "Regular" }), FONT_TIMEOUT_MS, "loadFont Inter/Regular");
      node.characters = String(params.text || "");
      break;
    case "ELLIPSE":
      node = figma.createEllipse();
      break;
    case "LINE":
      node = figma.createLine();
      break;
    default:
      throw new Error(`Unsupported node type: ${String(type)}`);
  }

  if (name) node.name = String(name);
  if (x !== undefined) node.x = Number(x);
  if (y !== undefined) node.y = Number(y);
  if (width && height && "resize" in node) node.resize(Number(width), Number(height));
  if (params.fills && "fills" in node) node.fills = params.fills;

  if (parentId) {
    const parent = await figma.getNodeByIdAsync(String(parentId));
    if (parent && "appendChild" in parent) {
      parent.appendChild(node);
    }
  }

  return serializeSelectionNode(node);
}

async function updateNode(params: Record<string, unknown>): Promise<unknown> {
  const node = await figma.getNodeByIdAsync(String(params.nodeId || ""));
  if (!node) {
    throw new Error(`Node not found: ${String(params.nodeId)}`);
  }
  const properties = (params.properties || {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(properties)) {
    switch (key) {
      case "name":
        node.name = value;
        break;
      case "x":
        node.x = value;
        break;
      case "y":
        node.y = value;
        break;
      case "width":
        if ("resize" in node) node.resize(Number(value), node.height);
        break;
      case "height":
        if ("resize" in node) node.resize(node.width, Number(value));
        break;
      case "visible":
        node.visible = value;
        break;
      case "opacity":
        node.opacity = value;
        break;
      case "rotation":
        node.rotation = value;
        break;
      case "characters":
        if (node.type === "TEXT") {
          await loadTextNodeFonts(node);
          node.characters = String(value);
        }
        break;
      case "fills":
        if ("fills" in node) node.fills = value;
        break;
      default:
        break;
    }
  }
  return serializeSelectionNode(node);
}

async function loadTextNodeFonts(node: any): Promise<void> {
  if (!node || node.type !== "TEXT") return;
  const characters = node.characters || "";
  if (!characters.length) {
    const fontName = node.fontName;
    if (fontName && fontName !== figma.mixed) {
      await withTimeout(figma.loadFontAsync(fontName), FONT_TIMEOUT_MS, `loadFont ${fontName.family}/${fontName.style}`);
    }
    return;
  }
  const fonts = node.getRangeAllFontNames(0, characters.length);
  const uniqueFonts = new Map<string, { family: string; style: string }>();
  for (const font of fonts) {
    if (!font || font === figma.mixed) continue;
    uniqueFonts.set(`${font.family}::${font.style}`, font);
  }
  await Promise.all(Array.from(uniqueFonts.values()).map((font) => withTimeout(figma.loadFontAsync(font), FONT_TIMEOUT_MS, `loadFont ${font.family}/${font.style}`)));
}

async function deleteNode(nodeId: string): Promise<unknown> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  node.remove();
  return { deleted: nodeId };
}

async function setSelection(nodeIds: string[]): Promise<unknown> {
  const nodes = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && "parent" in node) nodes.push(node);
  }
  figma.currentPage.selection = nodes;
  return { selected: nodes.length };
}

async function navigateTo(nodeId: string): Promise<unknown> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  figma.viewport.scrollAndZoomIntoView([node]);
  return { navigated: nodeId };
}

async function captureScreenshot(params: Record<string, unknown>): Promise<unknown> {
  const node = params.nodeId ? await figma.getNodeByIdAsync(String(params.nodeId)) : figma.currentPage;
  if (!node) {
    throw new Error(`Node not found: ${String(params.nodeId)}`);
  }
  const format = String(params.format || "PNG").toUpperCase();
  const scale = Number(params.scale || 2);
  const bytes = await node.exportAsync({
    format,
    constraint: { type: "SCALE", value: scale },
  });
  return {
    image: {
      base64: figma.base64Encode(bytes),
      format,
      scale,
      byteLength: bytes.length,
      node: {
        id: node.id,
        name: node.name,
        type: node.type,
      },
      bounds: "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null,
    },
  };
}

/**
 * Push token values from the server into Figma variables.
 * Finds matching variables by name and updates their values.
 */
async function pushTokens(params: Record<string, unknown>): Promise<unknown> {
  var tokens = Array.isArray(params.tokens) ? params.tokens : [];
  var updated = 0;
  var notFound: string[] = [];

  var collections = await figma.variables.getLocalVariableCollectionsAsync();

  for (var i = 0; i < tokens.length; i++) {
    var token = tokens[i] as { name: string; values: Record<string, string | number> };
    if (!token || !token.name) continue;

    var found = false;
    for (var ci = 0; ci < collections.length; ci++) {
      var col = collections[ci];
      var varIds = col.variableIds;
      for (var vi = 0; vi < varIds.length; vi++) {
        var v = await figma.variables.getVariableByIdAsync(varIds[vi]);
        if (v && v.name === token.name) {
          var modeId = col.modes[0]?.modeId;
          if (modeId && token.values) {
            var firstValue = Object.values(token.values)[0];
            if (typeof firstValue === "string" && firstValue.startsWith("#")) {
              var hex = firstValue;
              var r = parseInt(hex.slice(1, 3), 16) / 255;
              var g = parseInt(hex.slice(3, 5), 16) / 255;
              var b = parseInt(hex.slice(5, 7), 16) / 255;
              v.setValueForMode(modeId, { r: r, g: g, b: b, a: 1 });
            } else {
              v.setValueForMode(modeId, firstValue);
            }
            updated++;
            found = true;
          }
          break;
        }
      }
      if (found) break;
    }
    if (!found) notFound.push(token.name);
  }

  return { updated: updated, notFound: notFound, total: tokens.length };
}
