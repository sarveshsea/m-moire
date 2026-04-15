// figma is ambient via @figma/plugin-typings (see src/plugin/env.d.ts).
// The previous `declare const figma: any` shadowed those types and erased
// static checking on every plugin API call (#38).
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
import { createJobsStore, type JobsStore } from "./state/jobs.js";
import {
  optionalFiniteNumber,
  parseColorValue,
  validateScreenshotParams,
} from "./exec/figma-validators.js";
import { makeError } from "../shared/errors.js";
import { guardExecCode, withExecTimeout } from "./exec/sandbox.js";
import { createMetricsRegistry, type MetricsRegistry } from "./telemetry/metrics.js";
import type { WidgetOperatorSnapshot } from "../shared/contracts.js";

interface PluginState {
  sessionId: string;
  bootedAt: number;
  jobs: JobsStore;
  selectionListenerActive: boolean;
  lastSelectionUpdate: number;
  selectionThrottleMs: number;
  changeBuffer: ChangeBuffer;
  connection: WidgetConnectionState;
  metrics: MetricsRegistry;
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

/**
 * Wraps a font load so a timeout or figma-side failure surfaces as a
 * structured WidgetError (#35). Callers that batch-load multiple fonts
 * can pass swallow=true to log-and-continue instead of aborting the
 * whole command.
 */
async function safeLoadFont(
  fontName: { family: string; style: string },
  options: { swallow?: boolean } = {},
): Promise<void> {
  try {
    await withTimeout(
      figma.loadFontAsync(fontName),
      FONT_TIMEOUT_MS,
      `loadFont ${fontName.family}/${fontName.style}`,
    );
  } catch (cause) {
    const err = makeError(
      "E_FIGMA_FONT_FAILED",
      `Failed to load font ${fontName.family}/${fontName.style}`,
      { detail: { family: fontName.family, style: fontName.style }, cause },
    );
    if (options.swallow) return;
    throw new Error(JSON.stringify({ code: err.code, message: err.message, detail: err.detail }));
  }
}

const FONT_TIMEOUT_MS = 5000;

const BLOCKED_PATTERNS = [/figma\.closePlugin/i, /figma\.root\.remove/i, /while\s*\(\s*true\s*\)/i, /for\s*\(\s*;\s*;\s*\)/i];
const BLOCKED_KEYWORDS = ["closeplugin", "removepage", "__proto__", "constructor", "prototype", "__defineGetter__", "__defineSetter__"];
const BLOCKED_GLOBALS = [/\bFunction\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /\bglobalThis\b/, /\bself\b/, /\bwindow\b/, /\beval\s*\(/];

const state: PluginState = {
  sessionId: createRunId("widget"),
  bootedAt: Date.now(),
  metrics: createMetricsRegistry(),
  jobs: createJobsStore({
    onEmit: (job) =>
      post({
        channel: WIDGET_V2_CHANNEL,
        source: "main",
        type: "job",
        job,
      }),
  }),
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
  state.metrics.inc("change_buffer_drops", undefined, event.droppedCount);
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

function buildOperatorSnapshot(): WidgetOperatorSnapshot {
  return {
    protocol: WIDGET_V2_CHANNEL,
    system: {
      sessionId: state.sessionId,
      connection: state.connection,
      metrics: state.metrics.snapshot(),
      changeBuffer: {
        size: state.changeBuffer.size(),
        capacity: state.changeBuffer.capacity(),
      },
      bootedAt: state.bootedAt,
    },
    selection: createSelectionSnapshot(),
    jobs: snapshotJobs(),
    logs: [],
  };
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

  // Coalescing throttle: emit the first change immediately, then schedule a
  // trailing emit so the final selection is never silently dropped (#25).
  let pendingTrailingEmit: ReturnType<typeof setTimeout> | null = null;
  const emitSelection = (): void => {
    state.lastSelectionUpdate = Date.now();
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "selection",
      selection: createSelectionSnapshot(),
    });
  };

  figma.on("selectionchange", () => {
    if (!state.selectionListenerActive) return;
    const now = Date.now();
    const elapsed = now - state.lastSelectionUpdate;
    if (elapsed >= state.selectionThrottleMs) {
      if (pendingTrailingEmit) {
        clearTimeout(pendingTrailingEmit);
        pendingTrailingEmit = null;
      }
      emitSelection();
      return;
    }
    if (pendingTrailingEmit) return;
    pendingTrailingEmit = setTimeout(() => {
      pendingTrailingEmit = null;
      emitSelection();
    }, state.selectionThrottleMs - elapsed);
    return;
  });

  figma.on("currentpagechange", () => {
    refreshConnectionState();
    const page = figma.currentPage;
    post({
      channel: WIDGET_V2_CHANNEL,
      source: "main",
      type: "page",
      pageName: page ? page.name : "",
      pageId: page ? page.id : null,
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
      runId: state.jobs.activeRunId(),
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
      runId: state.jobs.activeRunId(),
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

  const job = message.action
    ? state.jobs.start({
        id: message.requestId,
        command: message.command,
        kind: message.action.kind,
        label: message.action.label,
      })
    : null;

  try {
    const result = await handleCommand(message.command, message.params ?? {});
    if (job) {
      state.jobs.finishCompleted(job.id, summarizeCommandResult(message.command, result));
    }
    state.metrics.inc("cmd_total", "ok:" + message.command);
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
      state.jobs.finishFailed(job.id, messageText);
    }
    state.metrics.inc("cmd_total", "err:" + message.command);
    // Classify E_EXEC_* rejections so operators can see what tripped.
    if (message.command === "execute" && messageText.charAt(0) === "{") {
      try {
        const parsed = JSON.parse(messageText) as { code?: string };
        if (parsed.code && parsed.code.indexOf("E_EXEC_") === 0) {
          state.metrics.inc("exec_rejects", parsed.code);
        }
      } catch { /* ignore */ }
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

function snapshotJobs(): WidgetJob[] {
  return state.jobs.all().sort((left, right) => right.updatedAt - left.updatedAt);
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
    case "widgetSnapshot":
      return buildOperatorSnapshot();
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
    throw new Error(
      JSON.stringify({ code: "E_PARAM_INVALID", message: "Code must be a non-empty string", retryable: false }),
    );
  }
  // Phase 5a sandbox: normalize-strip-scan denylist + loop-shape checks +
  // length/token gates. See main/exec/sandbox.ts. This is layered on top of
  // the legacy isCodeSafe regex pass as defense-in-depth.
  const guard = guardExecCode(code);
  if (!guard.ok && guard.error) {
    const e = guard.error;
    throw new Error(
      JSON.stringify({ code: e.code, message: e.message, detail: e.detail, retryable: e.retryable }),
    );
  }
  const legacy = isCodeSafe(code);
  if (!legacy.safe) {
    throw new Error(
      JSON.stringify({ code: "E_EXEC_REJECTED", message: "Blocked: " + legacy.reason, retryable: false }),
    );
  }
  const fn = new Function("figma", `"use strict"; return (async () => { ${code} })()`);
  return await withExecTimeout(fn(figma) as Promise<unknown>);
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
  const validated = validateScreenshotParams({ format, scale: 2 });
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }
  if (!("exportAsync" in node)) {
    throw new Error(`Node ${nodeId} does not support export`);
  }
  const bytes = await (node as ExportMixin).exportAsync({
    format: validated.value.format,
    constraint: { type: "SCALE", value: validated.value.scale },
  });
  return {
    base64: figma.base64Encode(bytes),
    format: validated.value.format,
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
      await safeLoadFont({ family: "Inter", style: "Regular" });
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
  const xNum = optionalFiniteNumber(x);
  const yNum = optionalFiniteNumber(y);
  if (xNum !== null) node.x = xNum;
  if (yNum !== null) node.y = yNum;
  const wNum = optionalFiniteNumber(width);
  const hNum = optionalFiniteNumber(height);
  if (wNum !== null && hNum !== null && "resize" in node) node.resize(wNum, hNum);
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
  // Property-dispatched writes use `in` guards to satisfy the typed
  // Figma node unions (#40). DocumentNode does not carry x/y/visible etc.;
  // only SceneNode-family subtypes do, so each property is gated.
  for (const [key, value] of Object.entries(properties)) {
    switch (key) {
      case "name":
        node.name = String(value);
        break;
      case "x": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "x" in node) (node as LayoutMixin).x = n;
        break;
      }
      case "y": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "y" in node) (node as LayoutMixin).y = n;
        break;
      }
      case "width": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "resize" in node) {
          const lm = node as LayoutMixin;
          lm.resize(n, lm.height);
        }
        break;
      }
      case "height": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "resize" in node) {
          const lm = node as LayoutMixin;
          lm.resize(lm.width, n);
        }
        break;
      }
      case "visible":
        if ("visible" in node) (node as SceneNodeMixin).visible = Boolean(value);
        break;
      case "opacity": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "opacity" in node) (node as BlendMixin).opacity = n;
        break;
      }
      case "rotation": {
        const n = optionalFiniteNumber(value);
        if (n !== null && "rotation" in node) (node as LayoutMixin).rotation = n;
        break;
      }
      case "characters":
        if (node.type === "TEXT") {
          await loadTextNodeFonts(node);
          (node as TextNode).characters = String(value);
        }
        break;
      case "fills":
        if ("fills" in node) (node as GeometryMixin).fills = value as Paint[];
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
    if (fontName && fontName !== figma.mixed && typeof fontName === "object") {
      const fn = fontName as { family?: unknown; style?: unknown };
      if (typeof fn.family === "string" && typeof fn.style === "string") {
        await safeLoadFont({ family: fn.family, style: fn.style });
      }
    }
    return;
  }
  const fonts = node.getRangeAllFontNames(0, characters.length);
  const uniqueFonts = new Map<string, { family: string; style: string }>();
  for (const font of fonts) {
    if (!font || font === figma.mixed) continue;
    if (typeof font !== "object") continue;
    const fn = font as { family?: unknown; style?: unknown };
    if (typeof fn.family !== "string" || typeof fn.style !== "string") continue;
    uniqueFonts.set(`${fn.family}::${fn.style}`, { family: fn.family, style: fn.style });
  }
  // Batch load; if one font fails, the whole createNode/updateNode still
  // fails (preserving previous semantics) but with a structured error.
  await Promise.all(Array.from(uniqueFonts.values()).map((font) => safeLoadFont(font)));
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
  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    // `parent` on a non-root node implies the node is in the scene tree;
    // DocumentNode and PageNode are filtered out so the selection
    // assignment satisfies readonly SceneNode[].
    if (node && "parent" in node && node.type !== "DOCUMENT" && node.type !== "PAGE") {
      nodes.push(node as SceneNode);
    }
  }
  figma.currentPage.selection = nodes;
  return { selected: nodes.length };
}

async function navigateTo(nodeId: string): Promise<unknown> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  if (node.type === "DOCUMENT" || node.type === "PAGE") {
    throw new Error(`Cannot navigate into document/page root: ${nodeId}`);
  }
  figma.viewport.scrollAndZoomIntoView([node as SceneNode]);
  return { navigated: nodeId };
}

async function captureScreenshot(params: Record<string, unknown>): Promise<unknown> {
  const node = params.nodeId ? await figma.getNodeByIdAsync(String(params.nodeId)) : figma.currentPage;
  if (!node) {
    throw new Error(`Node not found: ${String(params.nodeId)}`);
  }
  const validated = validateScreenshotParams({ format: params.format, scale: params.scale });
  if (!validated.ok) {
    throw new Error(validated.error.message);
  }
  const { format, scale } = validated.value;
  if (!("exportAsync" in node)) {
    throw new Error(`Node ${String(params.nodeId)} does not support export`);
  }
  const bytes = await (node as ExportMixin).exportAsync({
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
 *
 * Fetches all local variables in parallel, builds a name→variable index,
 * then applies each token in O(1) instead of the previous O(T·C·V) nested
 * sequential awaits which stalled for O(seconds) on real design systems (#27).
 */
async function pushTokens(params: Record<string, unknown>): Promise<unknown> {
  const tokens = Array.isArray(params.tokens) ? params.tokens : [];
  let updated = 0;
  const notFound: string[] = [];

  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  type Entry = { variable: any; modeId: string };
  const index = new Map<string, Entry>();

  // Fetch every variable in every collection in parallel.
  const fetchPromises: Array<Promise<Entry | null>> = [];
  for (let ci = 0; ci < collections.length; ci += 1) {
    const col = collections[ci];
    const modeId = col.modes[0] ? col.modes[0].modeId : null;
    if (!modeId) continue;
    const varIds = col.variableIds;
    for (let vi = 0; vi < varIds.length; vi += 1) {
      const varId = varIds[vi];
      fetchPromises.push(
        figma.variables.getVariableByIdAsync(varId).then((v: any) => (v ? { variable: v, modeId } : null)),
      );
    }
  }
  const fetched = await Promise.all(fetchPromises);
  for (let i = 0; i < fetched.length; i += 1) {
    const entry = fetched[i];
    if (entry && entry.variable && typeof entry.variable.name === "string") {
      // First occurrence wins — matches the original break-on-first semantics.
      if (!index.has(entry.variable.name)) index.set(entry.variable.name, entry);
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as { name: string; values: Record<string, string | number> };
    if (!token || !token.name) continue;
    const entry = index.get(token.name);
    if (!entry || !token.values) {
      notFound.push(token.name);
      continue;
    }
    const firstValue = Object.values(token.values)[0];
    const parsedColor = parseColorValue(firstValue);
    if (parsedColor) {
      entry.variable.setValueForMode(entry.modeId, parsedColor);
    } else {
      entry.variable.setValueForMode(entry.modeId, firstValue);
    }
    updated += 1;
  }

  return { updated: updated, notFound: notFound, total: tokens.length };
}
