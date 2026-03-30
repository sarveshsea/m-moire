import {
  type AgentBoxState,
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
import { findFirst, findIndexBy } from "../shared/compat.js";
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
  agentStatuses: AgentBoxState[];
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
const MAX_AGENT_STATUSES = 48;
const PENDING_REQUEST_TIMEOUT_MS = 35000;
const pendingBridgeRequests = new Map<string, PendingBridgeRequest>();
const pendingRequestTimers = new Map<string, number>();

let app: HTMLDivElement | null = null;
let bootstrapped = false;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
const bootstrapOnReady = () => {
  document.removeEventListener("DOMContentLoaded", bootstrapOnReady);
  bootstrap();
};

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
  agentStatuses: [],
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
    reconnectDelayMs: 2000,
    latencyMs: null,
    lastPingSentAt: 0,
    scanTimer: null,
  },
};

bootstrap();

function bootstrap(): void {
  if (bootstrapped) {
    return;
  }

  const root = document.getElementById("app");
  if (!root) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrapOnReady);
      return;
    }
    throw new Error("Plugin root element not found");
  }

  app = root as HTMLDivElement;
  bootstrapped = true;

  render();
  bindPluginMessages();
  sendToMain({ channel: WIDGET_V2_CHANNEL, source: "ui", type: "ping" });
  window.setTimeout(scanBridge, 200);
  keepaliveInterval = window.setInterval(function keepalive() {
    sendToMain({ channel: WIDGET_V2_CHANNEL, source: "ui", type: "ping" });
    if (state.bridge.ws && state.bridge.ws.readyState === WebSocket.OPEN) {
      state.bridge.lastPingSentAt = Date.now();
      try {
        state.bridge.ws.send(JSON.stringify({ channel: "memoire.bridge.v2", source: "plugin", type: "ping" }));
      } catch {
        // Send failed — connection is stale
        state.bridge.ws = null;
        setBridgeStage("reconnecting");
        scheduleReconnect();
      }
    }
  }, 20000);
}

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
        addLog("success", "Plugin ready", {
          file: message.connection.fileName,
          page: message.connection.pageName,
        });
        scheduleRender();
        break;
      case "pong":
        state.connection = message.connection;
        scheduleRender();
        break;
      case "connection":
        state.connection = message.connection;
        forwardToBridge(serializeBridgeEnvelope(createBridgeConnectionStateMessage(message.connection)));
        scheduleRender();
        break;
      case "selection":
        state.selection = message.selection;
        forwardToBridge(serializeBridgeEnvelope(createBridgeSelectionMessage(message.selection)));
        scheduleRender();
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
        scheduleRender();
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
        scheduleRender();
        break;
      case "job":
        upsertJob(message.job);
        forwardToBridge(serializeBridgeEnvelope(createBridgeJobStatusMessage(message.job)));
        scheduleRender();
        break;
      case "command-result":
        handleCommandResult(message);
        scheduleRender();
        break;
      case "log":
        addLog(message.entry.level, message.entry.message, message.entry.detail);
        scheduleRender();
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
  scheduleRender();
  // Prefer last known port for faster reconnection
  const startPort = state.bridge.port && state.bridge.port >= PORT_START && state.bridge.port <= PORT_END
    ? state.bridge.port
    : PORT_START;
  tryNextPort(startPort);
}

function nextScanPort(current: number): number {
  // Wrap around: after PORT_END, go back to PORT_START
  // Stop when we've tried all ports in the range
  const next = current >= PORT_END ? PORT_START : current + 1;
  return next;
}

function tryNextPort(port: number): void {
  // Stop if we've tried all ports in the range
  if (state.bridge.portsTried.length >= (PORT_END - PORT_START + 1)) {
    setBridgeStage("offline");
    scheduleReconnect();
    return;
  }

  // Skip ports already tried in this scan cycle
  if (state.bridge.portsTried.indexOf(port) >= 0) {
    tryNextPort(nextScanPort(port));
    return;
  }

  state.bridge.portsTried.push(port);
  let ws: WebSocket;
  try {
    ws = new WebSocket("ws://localhost:" + port);
  } catch {
    tryNextPort(nextScanPort(port));
    return;
  }
  let settled = false;

  const timeout = window.setTimeout(function onScanTimeout() {
    if (settled) return;
    settled = true;
    try { ws.close(); } catch { /* ignore */ }
    tryNextPort(nextScanPort(port));
  }, 2500);

  ws.onmessage = function onScanMessage(event) {
    var payload;
    try { payload = JSON.parse(event.data); } catch { return; }

    if (payload.type === "pong" && state.bridge.lastPingSentAt > 0) {
      state.bridge.latencyMs = Date.now() - state.bridge.lastPingSentAt;
    }

    if (!settled) {
      // Validate identity: must be a proper Mémoire bridge (type=identify with channel field)
      var isIdentify = payload.type === "identify" && payload.channel === "memoire.bridge.v2";
      var isPong = payload.type === "pong" && payload.channel === "memoire.bridge.v2";
      if (isIdentify || isPong) {
        settled = true;
        window.clearTimeout(timeout);
        adoptBridge(ws, port, payload);
        return;
      }
    }

    handleBridgeMessage(payload);
  };

  ws.onerror = function onScanError() {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    tryNextPort(nextScanPort(port));
  };

  ws.onclose = function onScanClose() {
    if (!settled) {
      settled = true;
      window.clearTimeout(timeout);
      tryNextPort(nextScanPort(port));
      return;
    }
    // Active connection lost
    if (state.bridge.ws === ws) {
      // Preserve last known port for fast reconnect
      var lastPort = state.bridge.port;
      state.bridge.ws = null;
      state.bridge.port = lastPort;
      state.jobs = disconnectActiveJobs(state.jobs);
      cleanupPendingRequests();
      setBridgeStage("reconnecting");
      addLog("warn", "Bridge disconnected");
      scheduleRender();
      scheduleReconnect();
    }
  };
}

function adoptBridge(ws: WebSocket, port: number, payload: { name?: string }): void {
  state.bridge.ws = ws;
  state.bridge.port = port;
  state.bridge.name = payload.name || "Mémoire";
  state.bridge.reconnectDelayMs = 2000;
  setBridgeStage("connected");
  addLog("success", `Connected :${port}`);
  forwardToBridge({
    type: "bridge-hello",
    file: state.connection.fileName || "unknown",
    fileKey: state.connection.fileKey || "",
    editor: state.connection.editorType || "figma",
  });
  scheduleRender();
  // Auto-sync on connect — pull selection immediately
  window.setTimeout(() => {
    requestCommand("getSelection", {}, "Auto-inspect", "selection");
  }, 300);
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
  // Gentler backoff: 2s → 4s → 8s → 12s → 15s (cap)
  state.bridge.reconnectDelayMs = Math.min(delay * 1.5, 15000);
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
  try {
    state.bridge.ws.send(JSON.stringify(payload));
    return true;
  } catch {
    // Send failed — connection is stale, trigger reconnect
    state.bridge.ws = null;
    setBridgeStage("reconnecting");
    scheduleReconnect();
    return false;
  }
}

function cleanupPendingRequests(): void {
  // Clear all pending bridge request tracking on disconnect
  for (var timerId of pendingRequestTimers.values()) {
    window.clearTimeout(timerId);
  }
  pendingBridgeRequests.clear();
  pendingRequestTimers.clear();
}

function handleBridgeMessage(payload: unknown): void {
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
    case "agent-status":
      upsertAgentStatus(message.data);
      if (message.data.status === "error") {
        addLog("error", `Agent ${message.data.role} failed`, {
          runId: message.data.runId,
          taskId: message.data.taskId,
          summary: message.data.summary,
          error: message.data.error,
        });
      }
      scheduleRender();
      break;
    case "heal-result":
      state.healSummary = message.data ?? null;
      scheduleRender();
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
      createBridgeResponseEnvelope(message.id, undefined, "Unknown bridge command: " + message.method),
    ));
    return;
  }

  var dispatch = createBridgeCommandDispatch(message);
  trackBridgeRequest(pendingBridgeRequests, dispatch.requestId, message);

  // Auto-cleanup if main thread never responds within timeout
  var timerId = window.setTimeout(function onRequestTimeout() {
    var pending = pendingBridgeRequests.get(dispatch.requestId);
    if (pending) {
      pendingBridgeRequests.delete(dispatch.requestId);
      pendingRequestTimers.delete(dispatch.requestId);
      forwardToBridge(serializeBridgeEnvelope(
        createBridgeResponseEnvelope(pending.bridgeId, undefined, "Request timed out: " + dispatch.command),
      ));
      addLog("warn", "Command timed out: " + dispatch.command);
    }
  }, PENDING_REQUEST_TIMEOUT_MS);
  pendingRequestTimers.set(dispatch.requestId, timerId);

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
  // Clear pending request timeout
  var timer = pendingRequestTimers.get(message.requestId);
  if (timer) {
    window.clearTimeout(timer);
    pendingRequestTimers.delete(message.requestId);
  }

  var bridgeResponse = resolveBridgeResponse(pendingBridgeRequests, message);
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

function upsertAgentStatus(status: AgentBoxState): void {
  const next = [...state.agentStatuses];
  const existing = findIndexBy(next, (candidate) => getAgentStatusKey(candidate) === getAgentStatusKey(status));
  if (existing >= 0) {
    next[existing] = status;
  } else {
    next.unshift(status);
  }
  state.agentStatuses = next.sort(compareAgentStatuses).slice(0, MAX_AGENT_STATUSES);
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

let renderScheduled = false;
let lastRenderTime = 0;
const RENDER_THROTTLE_MS = 80;

function scheduleRender(): void {
  if (renderScheduled) return;
  const elapsed = Date.now() - lastRenderTime;
  if (elapsed >= RENDER_THROTTLE_MS) {
    render();
    return;
  }
  renderScheduled = true;
  window.setTimeout(() => {
    renderScheduled = false;
    render();
  }, RENDER_THROTTLE_MS - elapsed);
}

function render(): void {
  if (!app) {
    return;
  }
  lastRenderTime = Date.now();

  const hasSelection = state.selection.nodes.length > 0;
  const selNode = state.selection.nodes[0];
  const latestLog = state.logs[0];
  const isConnected = state.connection.stage === "connected";
  const portLabel = state.connection.port ? `:${state.connection.port}` : "";
  const latencyLabel = state.connection.latencyMs ? `${state.connection.latencyMs}ms` : "";
  const connMeta = [portLabel, latencyLabel].filter(Boolean).join(" / ");

  app.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <div class="brand-wrap">
          <svg class="brand-flower" viewBox="0 0 120 120" width="22" height="22">
            <defs><mask id="h"><rect width="120" height="120" fill="white"/><ellipse cx="60" cy="34" rx="10" ry="15" fill="black"/><ellipse cx="84" cy="52" rx="10" ry="15" transform="rotate(72 84 52)" fill="black"/><ellipse cx="75" cy="80" rx="10" ry="15" transform="rotate(144 75 80)" fill="black"/><ellipse cx="45" cy="80" rx="10" ry="15" transform="rotate(-144 45 80)" fill="black"/><ellipse cx="36" cy="52" rx="10" ry="15" transform="rotate(-72 36 52)" fill="black"/></mask></defs>
            <g mask="url(#h)"><circle cx="60" cy="28" r="24" fill="#C24B38"/><circle cx="90" cy="50" r="24" fill="#C24B38"/><circle cx="78" cy="84" r="24" fill="#C24B38"/><circle cx="42" cy="84" r="24" fill="#C24B38"/><circle cx="30" cy="50" r="24" fill="#C24B38"/><circle cx="60" cy="58" r="18" fill="#C24B38"/></g>
          </svg>
        </div>
        <div class="status-cluster">
          ${connMeta ? `<span class="conn-meta">${escapeHtml(connMeta)}</span>` : ""}
          <div class="status-pill ${state.connection.stage}">
            ${escapeHtml(connectionLabel())}
          </div>
        </div>
      </div>

      <div class="context-bar">
        <div class="ctx-item">
          <span class="ctx-label">file</span>
          <span class="ctx-value">${escapeHtml(state.connection.fileName || "--")}</span>
        </div>
        <div class="ctx-sep"></div>
        <div class="ctx-item">
          <span class="ctx-label">page</span>
          <span class="ctx-value">${escapeHtml(state.connection.pageName || "--")}</span>
        </div>
        ${hasSelection ? `
          <div class="ctx-sep"></div>
          <div class="ctx-item">
            <span class="ctx-label">sel</span>
            <span class="ctx-value">${escapeHtml(selNode ? selNode.name : `${state.selection.count}`)}${state.selection.count > 1 ? ` +${state.selection.count - 1}` : ""}</span>
          </div>
        ` : ""}
        ${state.bufferedChanges > 0 ? `
          <div class="ctx-sep"></div>
          <div class="ctx-item">
            <span class="ctx-label">buf</span>
            <span class="ctx-value">${state.bufferedChanges}</span>
          </div>
        ` : ""}
      </div>

      <div class="toolbar">
        <button class="tool-btn primary" data-action="sync" ${isConnected ? "" : "disabled"}>sync</button>
        <button class="tool-btn" data-action="inspect" ${isConnected ? "" : "disabled"}>inspect</button>
        <button class="tool-btn" data-action="capture" ${hasSelection && isConnected ? "" : "disabled"}>capture</button>
        <button class="tool-btn" data-action="changes" ${isConnected ? "" : "disabled"}>changes</button>
        <button class="tool-btn" data-action="page-tree" ${isConnected ? "" : "disabled"}>tree</button>
        <button class="tool-btn" data-action="retry">reconnect</button>
      </div>

      <div class="content">
        <div class="tabstrip">
          <button class="tab ${state.activeTab === "jobs" ? "active" : ""}" data-tab="jobs">Jobs${state.jobs.length ? ` (${state.jobs.length})` : ""}</button>
          <button class="tab ${state.activeTab === "selection" ? "active" : ""}" data-tab="selection">Selection${hasSelection ? ` (${state.selection.count})` : ""}</button>
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
      </div>

      ${latestLog ? `
        <div class="ticker ${latestLog.level}">
          <span class="ticker-dot"></span>
          <span class="ticker-text">${escapeHtml(latestLog.message)}</span>
          <span class="ticker-time">${escapeHtml(new Date(latestLog.timestamp).toLocaleTimeString())}</span>
        </div>
      ` : ""}
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
        scheduleRender();
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
      if (state.bridge.scanTimer) {
        window.clearTimeout(state.bridge.scanTimer);
        state.bridge.scanTimer = null;
      }
      state.bridge.reconnectDelayMs = 2000;
      scanBridge();
      break;
    default:
      break;
  }
}

function handleNodeAction(action: string, nodeId: string): void {
  const node = findFirst(state.selection.nodes, (candidate) => candidate.id === nodeId);
  if (!node) {
    addLog("warn", "Selection node is no longer available", { nodeId });
    scheduleRender();
    return;
  }

  switch (action) {
    case "copy-id":
      void copyToClipboard(node.id, "Copied node id", { nodeId: node.id });
      break;
    case "copy-key":
      if (!node.component?.key) {
        addLog("warn", "No component key on selection", { nodeId: node.id });
        scheduleRender();
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
    return emptyCard("No jobs", "Run sync or inspect to begin.");
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
      ${state.agentStatuses.length ? `
        <div class="jobs-alert">
          <strong>Agent surface</strong>
          <span>${escapeHtml(formatAgentStatusSummary(state.agentStatuses))}</span>
        </div>
      ` : ""}
    </article>
  `);

  cards.push(...state.agentStatuses.slice(0, 6).map((agent) => `
      <article class="job-card ${agent.status === "done" ? "completed" : agent.status === "error" ? "failed" : "running"}">
        <div class="card-topline">
          <strong class="card-title">${escapeHtml(agent.title)}</strong>
          <span class="chip">${escapeHtml(agent.status)}</span>
        </div>
        <div class="stack muted">
          <div>${escapeHtml(agent.role)} · ${escapeHtml(agent.elapsedMs !== undefined ? formatDuration(agent.elapsedMs) : "live")}</div>
          <div class="mono">run ${escapeHtml(agent.runId)} · task ${escapeHtml(agent.taskId)}</div>
          <div>${escapeHtml(agent.summary || agent.error || "Agent update received")}</div>
        </div>
      </article>
    `));

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
          <img src="${escapeHtml(state.lastCapture.dataUrl)}" alt="Selection preview">
        </div>
      </article>
    `);
  }

  if (!state.selection.nodes.length) {
    cards.push(emptyCard("Nothing selected", "Select a node to inspect."));
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

  if (state.agentStatuses.length) {
    cards.push(`
      <article class="system-card">
        <div class="card-topline">
          <strong class="card-title">Agent status</strong>
          <span class="chip">${escapeHtml(formatAgentStatusSummary(state.agentStatuses))}</span>
        </div>
        <div class="stack">
          ${state.agentStatuses.slice(0, 8).map((agent) => `
            <div class="job-card ${agent.status === "done" ? "completed" : agent.status === "error" ? "failed" : agent.status === "busy" ? "running" : "queued"}">
              <div class="card-topline">
                <strong class="card-title">${escapeHtml(agent.title)}</strong>
                <span class="chip">${escapeHtml(agent.status)}</span>
              </div>
              <div class="stack muted">
                <div>${escapeHtml(agent.role)} · <span class="mono">${escapeHtml(agent.runId)}</span></div>
                ${agent.summary ? `<div>${escapeHtml(agent.summary)}</div>` : ""}
                ${agent.error ? `<div class="mono">${escapeHtml(agent.error)}</div>` : ""}
                <div>${escapeHtml(formatAgentStatusMeta(agent))}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    `);
  } else {
    cards.push(emptyCard(
      "No agent activity",
      "Status appears when orchestrator runs.",
    ));
  }

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
    cards.push(emptyCard("Page tree not loaded", "Run tree to load."));
  }

  cards.push(`
    <article class="system-card">
      <div class="card-topline">
        <strong class="card-title">Activity feed</strong>
        <span class="chip">${state.logs.length ? `${state.logs.length}` : "quiet"}</span>
      </div>
      <div class="stack">
        ${renderLogs()}
      </div>
    </article>
  `);

  return cards.join("");
}

function renderLogs(): string {
  if (!state.logs.length) {
    return emptyCard("Quiet", "Events log here as they happen.");
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

function getAgentStatusKey(agent: AgentBoxState): string {
  return `${agent.runId}:${agent.taskId}:${agent.role}`;
}

function compareAgentStatuses(left: AgentBoxState, right: AgentBoxState): number {
  const priority = (status: AgentBoxState["status"]): number => {
    switch (status) {
      case "busy":
        return 0;
      case "error":
        return 1;
      case "idle":
        return 2;
      case "done":
        return 3;
      default:
        return 4;
    }
  };

  const priorityDiff = priority(left.status) - priority(right.status);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  const elapsedDiff = (right.elapsedMs ?? 0) - (left.elapsedMs ?? 0);
  if (elapsedDiff !== 0) {
    return elapsedDiff;
  }

  return getAgentStatusKey(left).localeCompare(getAgentStatusKey(right));
}

function formatAgentStatusSummary(agents: AgentBoxState[]): string {
  const busy = agents.filter((agent) => agent.status === "busy").length;
  const done = agents.filter((agent) => agent.status === "done").length;
  const error = agents.filter((agent) => agent.status === "error").length;
  return `${busy} busy · ${done} done · ${error} error`;
}

function formatAgentStatusMeta(agent: AgentBoxState): string {
  const parts: string[] = [];
  if (agent.elapsedMs !== undefined) {
    parts.push(`elapsed ${formatDuration(agent.elapsedMs)}`);
  }
  if (agent.healRound !== undefined) {
    parts.push(`heal round ${agent.healRound}`);
  }
  if (!parts.length) {
    parts.push(`task ${agent.taskId}`);
  }
  return parts.join(" · ");
}

function formatDuration(elapsedMs: number): string {
  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
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
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(value);
    } else if (!copyToClipboardFallback(value)) {
      throw new Error("Clipboard API unavailable");
    }
    addLog("success", successMessage, detail);
  } catch (error) {
    addLog("warn", "Clipboard write failed", error instanceof Error ? error.message : String(error));
  }
  scheduleRender();
}

function copyToClipboardFallback(value: string): boolean {
  if (!document.body) {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
