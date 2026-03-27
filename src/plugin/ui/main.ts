import {
  WIDGET_V2_CHANNEL,
  createRunId,
  isWidgetV2Envelope,
  isWidgetCommandName,
  type WidgetCommandName,
  type WidgetConnectionState,
  type WidgetHealSummary,
  type WidgetJob,
  type WidgetLogEntry,
  type WidgetSelectionNodeSnapshot,
  type WidgetSelectionSnapshot,
  type WidgetSyncSummary,
  type WidgetUiEnvelope,
  type WidgetMainEnvelope,
} from "../shared/contracts.js";
import {
  createBridgeResponseEnvelope,
  normalizeBridgeMessage,
  serializeBridgeEnvelope,
  type BridgeCommandEnvelope,
} from "../shared/bridge.js";
import {
  createBridgeCommandDispatch,
  createBridgeConnectionStateMessage,
  createBridgeDocumentChangedMessage,
  createBridgeJobStatusMessage,
  createBridgePageChangedMessage,
  createBridgeSelectionMessage,
  createBridgeSyncResultMessage,
  resolveBridgeResponse,
  trackBridgeRequest,
  type PendingBridgeRequest,
} from "./bridge-adapter.js";
import { buildJobsOverview, describeSelectionNode, formatElapsedTime } from "./presenters.js";
import { disconnectActiveJobs, mergeSyncSummaries, reduceHealEvent, upsertJobState } from "./job-state.js";

interface UiState {
  activeTab: "jobs" | "selection" | "system";
  connection: WidgetConnectionState;
  jobs: WidgetJob[];
  selection: WidgetSelectionSnapshot;
  logs: WidgetLogEntry[];
  changeCount: number;
  bufferedChanges: number;
  lastPageUpdate: number | null;
  pageTree: unknown | null;
  lastCapture: { nodeId: string; dataUrl: string; format: string } | null;
  syncSummary: WidgetSyncSummary | null;
  lastSyncAt: number | null;
  healSummary: WidgetHealSummary | null;
  bridge: {
    ws: WebSocket | null;
    port: number | null;
    portsTried: number[];
    stage: "offline" | "scanning" | "connected" | "reconnecting";
    name: string;
    reconnectDelayMs: number;
    latencyMs: number | null;
    lastPingSentAt: number;
    scanTimer: number | null;
  };
}

const PORT_START = 9223;
const PORT_END = 9232;
const LOG_LIMIT = 80;
const MAX_JOBS = 24;
const pendingBridgeRequests = new Map<string, PendingBridgeRequest>();

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("Plugin root element not found");
}
const app = appRoot as HTMLDivElement;

const emptyConnection: WidgetConnectionState = {
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
};

const emptySelection: WidgetSelectionSnapshot = {
  count: 0,
  pageName: "",
  pageId: null,
  nodes: [],
  updatedAt: 0,
};

const state: UiState = {
  activeTab: "jobs",
  connection: emptyConnection,
  jobs: [],
  selection: emptySelection,
  logs: [],
  changeCount: 0,
  bufferedChanges: 0,
  lastPageUpdate: null,
  pageTree: null,
  lastCapture: null,
  syncSummary: null,
  lastSyncAt: null,
  healSummary: null,
  bridge: {
    ws: null,
    port: null,
    portsTried: [],
    stage: "offline",
    name: "",
    reconnectDelayMs: 1000,
    latencyMs: null,
    lastPingSentAt: 0,
    scanTimer: null,
  },
};

render();
bindPluginMessages();
sendToMain({ channel: WIDGET_V2_CHANNEL, source: "ui", type: "ping" });
window.setTimeout(scanBridge, 120);
window.setInterval(() => {
  sendToMain({ channel: WIDGET_V2_CHANNEL, source: "ui", type: "ping" });
  if (state.bridge.ws && state.bridge.ws.readyState === WebSocket.OPEN) {
    state.bridge.lastPingSentAt = Date.now();
    state.bridge.ws.send(JSON.stringify({ type: "ping" }));
  }
}, 10000);

function bindPluginMessages(): void {
  window.onmessage = (event: MessageEvent<{ pluginMessage?: WidgetMainEnvelope }>) => {
    const message = event.data?.pluginMessage;
    if (!message || !isWidgetV2Envelope(message)) {
      return;
    }
    if (message.source !== "main") {
      return;
    }

    switch (message.type) {
      case "bootstrap":
        state.connection = message.connection;
        state.selection = message.selection;
        state.jobs = message.initialJobs;
        addLog("success", "Plugin bootstrap complete", {
          file: message.connection.fileName,
          page: message.connection.pageName,
        });
        render();
        break;
      case "pong":
        state.connection = message.connection;
        render();
        break;
      case "connection":
        state.connection = message.connection;
        forwardToBridge(serializeBridgeEnvelope(createBridgeConnectionStateMessage(message.connection)));
        render();
        break;
      case "selection":
        state.selection = message.selection;
        forwardToBridge(serializeBridgeEnvelope(createBridgeSelectionMessage(message.selection)));
        render();
        break;
      case "page":
        state.connection = {
          ...state.connection,
          pageName: message.pageName,
          pageId: message.pageId,
        };
        state.lastPageUpdate = message.updatedAt;
        forwardToBridge(serializeBridgeEnvelope(createBridgePageChangedMessage(
          message.pageName,
          message.pageId,
          message.updatedAt,
        )));
        render();
        break;
      case "changes":
        state.changeCount = message.count;
        state.bufferedChanges = message.buffered;
        forwardToBridge(serializeBridgeEnvelope(createBridgeDocumentChangedMessage(
          message.count,
          message.buffered,
          message.sessionId,
          message.runId ?? null,
          message.updatedAt,
        )));
        render();
        break;
      case "job":
        upsertJob(message.job);
        forwardToBridge(serializeBridgeEnvelope(createBridgeJobStatusMessage(message.job)));
        render();
        break;
      case "command-result":
        handleCommandResult(message);
        render();
        break;
      case "log":
        addLog(message.entry.level, message.entry.message, message.entry.detail);
        render();
        break;
      default:
        break;
    }
  };
}

function scanBridge(): void {
  if (state.bridge.stage === "scanning") {
    return;
  }
  setBridgeStage("scanning");
  state.bridge.portsTried = [];
  render();
  tryNextPort(PORT_START);
}

function tryNextPort(port: number): void {
  if (port > PORT_END) {
    setBridgeStage("offline");
    scheduleReconnect();
    return;
  }

  state.bridge.portsTried.push(port);
  const ws = new WebSocket(`ws://localhost:${port}`);
  let settled = false;

  const timeout = window.setTimeout(() => {
    if (settled) return;
    settled = true;
    try {
      ws.close();
    } catch {
      // ignore
    }
    tryNextPort(port + 1);
  }, 1200);

  ws.onopen = () => {
    render();
  };

  ws.onmessage = (event) => {
    let payload: any;
    try {
      payload = JSON.parse(event.data as string);
    } catch {
      return;
    }

    if (payload.type === "pong" && state.bridge.lastPingSentAt > 0) {
      state.bridge.latencyMs = Date.now() - state.bridge.lastPingSentAt;
    }

    if (!settled) {
      if (payload.type === "identify" || payload.type === "pong" || payload.name) {
        settled = true;
        window.clearTimeout(timeout);
        adoptBridge(ws, port, payload);
        return;
      }
    }

    handleBridgeMessage(payload);
  };

  ws.onerror = () => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    tryNextPort(port + 1);
  };

  ws.onclose = () => {
    if (!settled) {
      settled = true;
      window.clearTimeout(timeout);
      tryNextPort(port + 1);
      return;
    }
    if (state.bridge.ws === ws) {
      state.bridge.ws = null;
      state.bridge.port = null;
      state.jobs = disconnectActiveJobs(state.jobs);
      setBridgeStage("reconnecting");
      addLog("warn", "Bridge disconnected");
      render();
      scheduleReconnect();
    }
  };
}

function adoptBridge(ws: WebSocket, port: number, payload: { name?: string }): void {
  state.bridge.ws = ws;
  state.bridge.port = port;
  state.bridge.name = payload.name || "Mémoire";
  state.bridge.reconnectDelayMs = 1000;
  setBridgeStage("connected");
  addLog("success", `Bridge connected on :${port}`);
  forwardToBridge({
    type: "bridge-hello",
    file: state.connection.fileName || "unknown",
    fileKey: state.connection.fileKey || "",
    editor: state.connection.editorType || "figma",
  });
  render();
}

function scheduleReconnect(): void {
  if (state.bridge.scanTimer) {
    return;
  }
  const delay = state.bridge.reconnectDelayMs;
  state.bridge.scanTimer = window.setTimeout(() => {
    state.bridge.scanTimer = null;
    scanBridge();
  }, delay);
  state.bridge.reconnectDelayMs = Math.min(delay * 2, 16000);
}

function setBridgeStage(stage: UiState["bridge"]["stage"]): void {
  state.bridge.stage = stage;
  state.connection = {
    ...state.connection,
    stage: stage === "connected" ? "connected" : stage === "scanning" ? "scanning" : stage === "reconnecting" ? "reconnecting" : "offline",
    port: state.bridge.port,
    name: state.bridge.name || state.connection.name,
    latencyMs: state.bridge.latencyMs,
    reconnectDelayMs: stage === "reconnecting" ? state.bridge.reconnectDelayMs : null,
  };
}

function forwardToBridge(payload: Record<string, unknown>): boolean {
  if (!state.bridge.ws || state.bridge.ws.readyState !== WebSocket.OPEN) {
    return false;
  }
  state.bridge.ws.send(JSON.stringify(payload));
  return true;
}

function handleBridgeMessage(payload: any): void {
  const message = normalizeBridgeMessage(payload);
  if (!message) {
    return;
  }

  switch (message.type) {
    case "command":
      handleBridgeCommand(message);
      break;
    case "identify":
      state.bridge.name = message.name || state.bridge.name;
      break;
    case "event": {
      addLog(message.level, message.message || "Bridge event", message.data || null);
      state.healSummary = reduceHealEvent(
        state.healSummary,
        message.message || "",
        typeof message.data === "object" && message.data && "source" in (message.data as Record<string, unknown>)
          ? String((message.data as Record<string, unknown>).source)
          : undefined,
      );
      break;
    }
    case "chat":
      addLog("info", `Bridge chat from ${message.from}`, message.text);
      break;
    case "error":
      addLog("error", message.message || "Bridge error", message.details || null);
      break;
    default:
      break;
  }
}

function handleBridgeCommand(message: BridgeCommandEnvelope): void {
  if (!isWidgetCommandName(message.method)) {
    forwardToBridge(serializeBridgeEnvelope(
      createBridgeResponseEnvelope(message.id, undefined, `Unknown bridge command: ${message.method}`),
    ));
    return;
  }

  const dispatch = createBridgeCommandDispatch(message);
  trackBridgeRequest(pendingBridgeRequests, dispatch.requestId, message);
  sendToMain({
    channel: WIDGET_V2_CHANNEL,
    source: "ui",
    type: "run-command",
    requestId: dispatch.requestId,
    command: dispatch.command,
    params: dispatch.params,
  });
}

function handleCommandResult(message: Extract<WidgetMainEnvelope, { type: "command-result" }>): void {
  const bridgeResponse = resolveBridgeResponse(pendingBridgeRequests, message);
  if (bridgeResponse) {
    forwardToBridge(serializeBridgeEnvelope(bridgeResponse));
  }

  if (message.error) {
    if (message.command === "getVariables") {
      recordSyncSummary("tokens", null, message.error);
    }
    if (message.command === "getComponents") {
      recordSyncSummary("components", null, message.error);
    }
    if (message.command === "getStyles") {
      recordSyncSummary("styles", null, message.error);
    }
    addLog("error", `${message.command} failed`, message.error);
    return;
  }

  if (message.command === "getPageTree") {
    state.pageTree = message.result || null;
  }

  if (message.command === "captureScreenshot") {
    const image = (message.result as { image?: { base64?: string; format?: string; node?: { id: string } } })?.image;
    if (image?.base64) {
      const mime = String(image.format || "PNG").toLowerCase() === "svg" ? "image/svg+xml" : "image/png";
      state.lastCapture = {
        nodeId: image.node?.id || "",
        format: String(image.format || "PNG"),
        dataUrl: `data:${mime};base64,${image.base64}`,
      };
    }
  }

  if (message.command === "getVariables") {
    const collections = ((message.result as { collections?: unknown[] })?.collections || []).length;
    const syncMessage = createBridgeSyncResultMessage("tokens", message.result);
    forwardToBridge(serializeBridgeEnvelope(syncMessage));
    recordSyncSummary("tokens", message.result);
    addLog("success", `Synced tokens`, { collections });
  }

  if (message.command === "getComponents") {
    const count = Array.isArray(message.result) ? message.result.length : 0;
    const syncMessage = createBridgeSyncResultMessage("components", message.result);
    forwardToBridge(serializeBridgeEnvelope(syncMessage));
    recordSyncSummary("components", message.result);
    addLog("success", `Synced components`, { count });
  }

  if (message.command === "getStyles") {
    const count = Array.isArray(message.result) ? message.result.length : 0;
    const syncMessage = createBridgeSyncResultMessage("styles", message.result);
    forwardToBridge(serializeBridgeEnvelope(syncMessage));
    recordSyncSummary("styles", message.result);
    addLog("success", `Synced styles`, { count });
  }

  if (message.command === "getChanges") {
    addLog("info", "Read buffered changes", { count: Array.isArray(message.result) ? message.result.length : 0 });
  }
}

function requestCommand(command: WidgetCommandName, params: Record<string, unknown> = {}, label: string = command, kind: WidgetJob["kind"] = "system"): void {
  const requestId = createRunId("cmd");
  sendToMain({
    channel: WIDGET_V2_CHANNEL,
    source: "ui",
    type: "run-command",
    requestId,
    command,
    params,
    action: { kind, label },
  });
}

function recordSyncSummary(part: "tokens" | "components" | "styles", result: unknown, error?: string): void {
  const syncMessage = createBridgeSyncResultMessage(part, result, error);
  state.syncSummary = mergeSyncSummaries(state.syncSummary, syncMessage.summary);
  state.lastSyncAt = Date.now();
}

function sendToMain(message: WidgetUiEnvelope): void {
  parent.postMessage({ pluginMessage: message }, "*");
}

function upsertJob(job: WidgetJob): void {
  state.jobs = upsertJobState(state.jobs, job, MAX_JOBS);
}

function addLog(level: WidgetLogEntry["level"], message: string, detail?: unknown): void {
  state.logs.unshift({
    id: createRunId("log"),
    level,
    message,
    detail,
    timestamp: Date.now(),
  });
  if (state.logs.length > LOG_LIMIT) {
    state.logs = state.logs.slice(0, LOG_LIMIT);
  }
}

function render(): void {
  app.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand-wrap">
          <div class="brand-mark"></div>
          <div class="brand-copy">
            <div class="brand-name">memoire</div>
            <div class="brand-sub">Figma control plane / agent operator</div>
          </div>
        </div>
        <div class="status-cluster">
          <div class="status-pill ${state.connection.stage}">
            ${escapeHtml(connectionLabel())}
          </div>
        </div>
      </div>
      <div class="content">
        <div class="main-column">
          <section class="panel">
            <div class="metrics">
              ${metric("File", state.connection.fileName || "No file")}
              ${metric("Page", state.connection.pageName || "No page")}
              ${metric("Port", state.connection.port ? `:${state.connection.port}` : "--")}
              ${metric("Latency", state.connection.latencyMs ? `${state.connection.latencyMs}ms` : "--")}
            </div>
            <div class="toolbar">
              <button class="tool-btn" data-action="sync">Sync Design System</button>
              <button class="tool-btn" data-action="inspect">Inspect Selection</button>
              <button class="tool-btn" data-action="capture">Capture Node</button>
              <button class="tool-btn" data-action="changes">Read Changes</button>
              <button class="tool-btn" data-action="page-tree">Inspect Page Tree</button>
              <button class="tool-btn" data-action="retry">Reconnect</button>
            </div>
          </section>

          <section class="panel">
            <div class="panel-header">
              <div class="stack">
                <div class="panel-title">Operator Console</div>
                <div class="panel-subtitle">Jobs first. Selection and system on demand.</div>
              </div>
              <div class="muted mono">${escapeHtml(new Date().toLocaleTimeString())}</div>
            </div>
            <div class="tabstrip">
              <button class="tab ${state.activeTab === "jobs" ? "active" : ""}" data-tab="jobs">Jobs</button>
              <button class="tab ${state.activeTab === "selection" ? "active" : ""}" data-tab="selection">Selection</button>
              <button class="tab ${state.activeTab === "system" ? "active" : ""}" data-tab="system">System</button>
            </div>
            <div class="tab-panel ${state.activeTab === "jobs" ? "active" : ""}">
              <div class="jobs-list">${renderJobs()}</div>
            </div>
            <div class="tab-panel ${state.activeTab === "selection" ? "active" : ""}">
              <div class="selection-list">${renderSelection()}</div>
            </div>
            <div class="tab-panel ${state.activeTab === "system" ? "active" : ""}">
              <div class="system-list">${renderSystem()}</div>
            </div>
          </section>
        </div>
        <div class="side-column">
          <section class="panel">
            <div class="panel-header">
              <div class="stack">
                <div class="panel-title">Activity Feed</div>
                <div class="panel-subtitle">Bridge events, sync summaries, failures.</div>
              </div>
            </div>
            <div class="log-list">${renderLogs()}</div>
          </section>
        </div>
      </div>
    </div>
  `;

  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.onclick = () => {
      state.activeTab = button.dataset.tab as UiState["activeTab"];
      render();
    };
  });

  app.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
    button.onclick = () => handleAction(button.dataset.action || "");
  });

  app.querySelectorAll<HTMLButtonElement>("[data-node-action]").forEach((button) => {
    button.onclick = () => handleNodeAction(button.dataset.nodeAction || "", button.dataset.nodeId || "");
  });
}

function handleAction(action: string): void {
  switch (action) {
    case "sync":
      requestCommand("getVariables", {}, "Sync tokens", "sync");
      requestCommand("getComponents", {}, "Sync components", "sync");
      requestCommand("getStyles", {}, "Sync styles", "sync");
      break;
    case "inspect":
      requestCommand("getSelection", {}, "Inspect selection", "selection");
      break;
    case "capture": {
      const node = state.selection.nodes[0];
      if (!node) {
        addLog("warn", "Select a node before capturing");
        render();
        return;
      }
      requestCommand("captureScreenshot", { nodeId: node.id, format: "PNG", scale: 2 }, "Capture node", "capture");
      break;
    }
    case "changes":
      requestCommand("getChanges", {}, "Read changes", "changes");
      break;
    case "page-tree":
      requestCommand("getPageTree", { depth: 2 }, "Inspect page tree", "system");
      break;
    case "retry":
      if (state.bridge.ws) {
        try {
          state.bridge.ws.close();
        } catch {
          // ignore
        }
      }
      state.bridge.ws = null;
      state.bridge.port = null;
      state.bridge.scanTimer = null;
      scanBridge();
      break;
    default:
      break;
  }
}

function handleNodeAction(action: string, nodeId: string): void {
  const node = state.selection.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    addLog("warn", "Selection node is no longer available", { nodeId });
    render();
    return;
  }

  switch (action) {
    case "copy-id":
      void copyToClipboard(node.id, "Copied node id", { nodeId: node.id });
      break;
    case "copy-key":
      if (!node.component?.key) {
        addLog("warn", "Selection does not have a component key", { nodeId: node.id });
        render();
        return;
      }
      void copyToClipboard(node.component.key, "Copied component key", { nodeId: node.id, key: node.component.key });
      break;
    case "jump":
      requestCommand("navigateTo", { nodeId: node.id }, `Jump to ${node.name}`, "navigation");
      break;
    case "capture-node":
      requestCommand("captureScreenshot", { nodeId: node.id, format: "PNG", scale: 2 }, `Capture ${node.name}`, "capture");
      break;
    default:
      break;
  }
}

function renderJobs(): string {
  const overview = buildJobsOverview(state.jobs);
  if (!state.jobs.length) {
    return emptyCard("No tracked jobs yet", "Run sync, inspect selection, or capture a node to populate the operator timeline.");
  }

  const cards: string[] = [];
  cards.push(`
    <article class="system-card">
      <div class="card-topline">
        <strong class="card-title">Run overview</strong>
        <span class="chip">${overview.runningCount} active</span>
      </div>
      <div class="jobs-summary-grid">
        ${summaryMetric("Running", String(overview.runningCount), `${overview.active.length} in flight`)}
        ${summaryMetric("Completed", String(overview.completedCount), overview.latestCompleted ? overview.latestCompleted.label : "No recent success")}
        ${summaryMetric("Failed", String(overview.failedCount), overview.latestFailure ? overview.latestFailure.label : "No failures")}
        ${summaryMetric("Bridge queue", String(pendingBridgeRequests.size), state.bridge.stage)}
      </div>
      ${overview.latestFailure ? `
        <div class="jobs-alert error">
          <strong>Last failure</strong>
          <span>${escapeHtml(overview.latestFailure.label)} · ${escapeHtml(overview.latestFailure.error || overview.latestFailure.summary || "No error text")}</span>
        </div>
      ` : ""}
      ${overview.latestCompleted ? `
        <div class="jobs-alert success">
          <strong>Last completion</strong>
          <span>${escapeHtml(overview.latestCompleted.label)} · ${escapeHtml(overview.latestCompleted.summary || overview.latestCompleted.command || "Complete")}</span>
        </div>
      ` : ""}
      ${state.syncSummary ? `
        <div class="jobs-alert success">
          <strong>Last sync</strong>
          <span>${escapeHtml(formatSyncSummary(state.syncSummary))}${state.lastSyncAt ? ` · ${escapeHtml(new Date(state.lastSyncAt).toLocaleTimeString())}` : ""}</span>
        </div>
      ` : ""}
      ${state.healSummary ? `
        <div class="jobs-alert ${state.healSummary.healed ? "success" : "error"}">
          <strong>Healer</strong>
          <span>${escapeHtml(formatHealSummary(state.healSummary))}</span>
        </div>
      ` : ""}
    </article>
  `);

  cards.push(...state.jobs.map((job) => `
      <article class="job-card ${job.status}">
        <div class="card-topline">
          <strong class="card-title">${escapeHtml(job.label)}</strong>
          <span class="chip">${escapeHtml(job.status)}</span>
        </div>
        <div class="stack muted">
          <div>${escapeHtml(job.command || job.kind)} · ${escapeHtml(formatElapsedTime(job))}</div>
          <div class="mono">run ${escapeHtml(job.runId)}</div>
          <div>${escapeHtml(job.summary || job.progressText || "Running")}</div>
          ${job.error ? `<div class="mono">${escapeHtml(job.error)}</div>` : ""}
        </div>
      </article>
    `));

  return cards.join("");
}

function renderSelection(): string {
  const cards: string[] = [];
  cards.push(`
    <article class="selection-card">
      <div class="card-topline">
        <strong class="card-title">Live selection</strong>
        <span class="chip">${state.selection.count} nodes</span>
      </div>
      <div class="split-grid">
        <div class="kv-grid">
          <span class="kv-key">Page</span><span>${escapeHtml(state.selection.pageName || "Current page")}</span>
          <span class="kv-key">Page ID</span><span class="mono">${escapeHtml(state.selection.pageId || "—")}</span>
          <span class="kv-key">Updated</span><span>${state.selection.updatedAt ? escapeHtml(new Date(state.selection.updatedAt).toLocaleTimeString()) : "--"}</span>
        </div>
        <div class="inline-actions">
          <button class="tool-btn" data-action="inspect">Refresh</button>
          <button class="tool-btn" data-action="capture">Capture</button>
        </div>
      </div>
    </article>
  `);

  if (state.lastCapture) {
    cards.push(`
      <article class="selection-card">
        <div class="card-topline">
          <strong class="card-title">Latest capture</strong>
          <span class="chip">${escapeHtml(state.lastCapture.format)}</span>
        </div>
        <div class="selection-preview">
          <img src="${state.lastCapture.dataUrl}" alt="Selection preview">
        </div>
      </article>
    `);
  }

  if (!state.selection.nodes.length) {
    cards.push(emptyCard("Nothing selected", "Select a node in Figma to inspect layout, component metadata, styles, and IDs."));
    return cards.join("");
  }

  for (const node of state.selection.nodes) {
    cards.push(renderSelectionNode(node));
  }

  return cards.join("");
}

function renderSelectionNode(node: WidgetSelectionNodeSnapshot): string {
  const facts = describeSelectionNode(node);

  return `
    <article class="selection-card">
      <div class="card-topline">
        <strong class="card-title">${escapeHtml(node.name)}</strong>
        <div class="chips">${facts.chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}</div>
      </div>
      <div class="inline-actions">
        <button class="tool-btn" data-node-action="copy-id" data-node-id="${escapeHtml(node.id)}">Copy ID</button>
        <button class="tool-btn" data-node-action="jump" data-node-id="${escapeHtml(node.id)}">Jump to node</button>
        <button class="tool-btn" data-node-action="capture-node" data-node-id="${escapeHtml(node.id)}">Capture</button>
        ${node.component?.key ? `<button class="tool-btn" data-node-action="copy-key" data-node-id="${escapeHtml(node.id)}">Copy key</button>` : ""}
      </div>
      <div class="kv-grid">
        <span class="kv-key">Node</span><span class="mono">${escapeHtml(node.id)}</span>
        <span class="kv-key">Bounds</span><span>${formatBounds(node)}</span>
        <span class="kv-key">Text</span><span>${escapeHtml(node.characters ? node.characters.slice(0, 120) : "—")}</span>
        <span class="kv-key">Fill</span><span>${facts.fillHex ? `<span class="mono">${facts.fillHex}</span>` : "—"}</span>
        <span class="kv-key">Styles</span><span>${escapeHtml(facts.styleIds.join(" / ") || "—")}</span>
        <span class="kv-key">State</span><span>${escapeHtml(facts.stateFacts.join(", ") || "—")}</span>
        <span class="kv-key">Component</span><span>${escapeHtml(node.component?.key || node.component?.description || "—")}</span>
        <span class="kv-key">Variant</span><span>${escapeHtml(facts.variantPairs.join(", ") || "—")}</span>
        <span class="kv-key">Variables</span><span>${escapeHtml(facts.variableBindings.join(", ") || "—")}</span>
        <span class="kv-key">Layout</span><span>${escapeHtml(facts.layoutFacts.join(", ") || "—")}</span>
        <span class="kv-key">Props</span><span>${escapeHtml(facts.propertyFacts.join(", ") || "—")}</span>
      </div>
    </article>
  `;
}

function renderSystem(): string {
  const cards: string[] = [];

  cards.push(`
    <article class="system-card">
      <div class="card-topline">
        <strong class="card-title">Connection</strong>
        <span class="chip">${escapeHtml(connectionLabel())}</span>
      </div>
      <div class="kv-grid">
        <span class="kv-key">Bridge</span><span>${escapeHtml(state.bridge.name || "Scanning")}</span>
        <span class="kv-key">Port</span><span>${state.bridge.port ? `:${state.bridge.port}` : "--"}</span>
        <span class="kv-key">Latency</span><span>${state.bridge.latencyMs ? `${state.bridge.latencyMs}ms` : "--"}</span>
        <span class="kv-key">Editor</span><span>${escapeHtml(state.connection.editorType || "figma")}</span>
        <span class="kv-key">Ports tried</span><span>${escapeHtml(state.bridge.portsTried.join(", ") || "—")}</span>
        <span class="kv-key">Reconnect</span><span>${state.bridge.scanTimer ? `${state.bridge.reconnectDelayMs}ms` : "Idle"}</span>
        <span class="kv-key">Pending bridge</span><span>${pendingBridgeRequests.size}</span>
      </div>
    </article>
  `);

  cards.push(`
    <article class="system-card">
      <div class="card-topline">
        <strong class="card-title">Change stream</strong>
        <span class="chip">${state.bufferedChanges}</span>
      </div>
      <div class="kv-grid">
        <span class="kv-key">Latest batch</span><span>${state.changeCount}</span>
        <span class="kv-key">Buffered</span><span>${state.bufferedChanges}</span>
        <span class="kv-key">Page update</span><span>${state.lastPageUpdate ? escapeHtml(new Date(state.lastPageUpdate).toLocaleTimeString()) : "--"}</span>
      </div>
    </article>
  `);

  if (state.pageTree) {
    cards.push(`
      <article class="system-card">
        <div class="card-topline">
          <strong class="card-title">Page tree</strong>
          <span class="chip">cached</span>
        </div>
        <pre class="mono muted">${escapeHtml(JSON.stringify(state.pageTree, null, 2).slice(0, 2400))}</pre>
      </article>
    `);
  } else {
    cards.push(emptyCard("Page tree not loaded", "Use Inspect Page Tree to load a structural snapshot into the control plane."));
  }

  return cards.join("");
}

function renderLogs(): string {
  if (!state.logs.length) {
    return emptyCard("No activity yet", "Bridge and plugin events will appear here as jobs run and connection state changes.");
  }
  return state.logs
    .map((entry) => `
      <article class="log-card ${entry.level}">
        <div class="card-topline">
          <strong class="card-title">${escapeHtml(entry.message)}</strong>
          <span class="chip">${escapeHtml(entry.level)}</span>
        </div>
        <div class="stack muted">
          <div>${escapeHtml(new Date(entry.timestamp).toLocaleTimeString())}</div>
          ${entry.detail ? `<pre class="mono muted">${escapeHtml(JSON.stringify(entry.detail, null, 2))}</pre>` : ""}
        </div>
      </article>
    `)
    .join("");
}

function metric(label: string, value: string): string {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
    </div>
  `;
}

function summaryMetric(label: string, value: string, detail: string): string {
  return `
    <div class="summary-metric">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(value)}</div>
      <div class="muted">${escapeHtml(detail)}</div>
    </div>
  `;
}

function formatSyncSummary(summary: WidgetSyncSummary): string {
  const parts = [`${summary.tokens} collections`, `${summary.components} components`, `${summary.styles} styles`];
  if (summary.partialFailures.length) {
    parts.push(`${summary.partialFailures.length} partial failure(s)`);
  }
  return parts.join(" · ");
}

function formatHealSummary(summary: WidgetHealSummary): string {
  const status = summary.healed ? "healed" : "needs review";
  return `round ${summary.round} · ${summary.issueCount} issue(s) · ${status}`;
}

function emptyCard(title: string, copy: string): string {
  return `
    <article class="empty-card">
      <div class="stack">
        <strong class="card-title">${escapeHtml(title)}</strong>
        <span class="muted">${escapeHtml(copy)}</span>
      </div>
    </article>
  `;
}

function connectionLabel(): string {
  if (state.connection.stage === "connected") {
    return "Connected";
  }
  if (state.connection.stage === "scanning") {
    return "Scanning";
  }
  if (state.connection.stage === "reconnecting") {
    return "Reconnecting";
  }
  return "Offline";
}

function formatBounds(node: WidgetSelectionNodeSnapshot): string {
  const parts = [node.x, node.y, node.width, node.height].map((value) => value === undefined ? "?" : Math.round(value).toString());
  return `${parts[0]}, ${parts[1]} / ${parts[2]} × ${parts[3]}`;
}

async function copyToClipboard(value: string, successMessage: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    addLog("success", successMessage, detail);
  } catch (error) {
    addLog("warn", "Clipboard write failed", error instanceof Error ? error.message : String(error));
  }
  render();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
