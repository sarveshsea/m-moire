import { arrayIncludes } from "./compat.js";

export const WIDGET_V2_CHANNEL = "memoire.widget.v2";

export const WIDGET_COMMAND_NAMES = [
  "execute",
  "getSelection",
  "getFileData",
  "getVariables",
  "getComponents",
  "getStyles",
  "getStickies",
  "getChanges",
  "getComponentImage",
  "createNode",
  "updateNode",
  "deleteNode",
  "setSelection",
  "navigateTo",
  "getPageList",
  "getPageTree",
  "captureScreenshot",
  "pushTokens",
  // Phase 6: exposes the operator-surface snapshot for `memi doctor --json`.
  "widgetSnapshot",
] as const;

export interface WidgetMetricsSnapshot {
  cmd_total: Record<string, number>;
  change_buffer_drops: number;
  reconnects: number;
  queue_depth: Record<string, number>;
  exec_rejects: Record<string, number>;
  selection_throttled: number;
  bridge_send_failed: number;
  startedAt: number;
  sampledAt: number;
}

export interface WidgetSystemSnapshot {
  sessionId: string;
  connection: WidgetConnectionState;
  metrics: WidgetMetricsSnapshot;
  changeBuffer: { size: number; capacity: number };
  bootedAt: number;
}

export interface WidgetOperatorSnapshot {
  protocol: typeof WIDGET_V2_CHANNEL;
  system: WidgetSystemSnapshot;
  selection: WidgetSelectionSnapshot;
  jobs: WidgetJob[];
  logs: WidgetLogEntry[];
}

export type WidgetCommandName = (typeof WIDGET_COMMAND_NAMES)[number];

export type WidgetJobKind =
  | "sync"
  | "selection"
  | "capture"
  | "changes"
  | "navigation"
  | "execute"
  | "system"
  | "heal";

export type WidgetJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "disconnected";

export interface WidgetConnectionState {
  stage: "offline" | "scanning" | "connected" | "reconnecting";
  port: number | null;
  name: string;
  latencyMs: number | null;
  fileName: string;
  fileKey: string | null;
  pageName: string;
  pageId: string | null;
  editorType: string;
  connectedAt: number | null;
  reconnectDelayMs: number | null;
}

export interface WidgetSelectionFill {
  type: string;
  color: { r: number; g: number; b: number; a?: number } | null;
}

export interface WidgetSelectionLayout {
  layoutMode: string | null;
  itemSpacing: number | null;
  paddingLeft: number | null;
  paddingRight: number | null;
  paddingTop: number | null;
  paddingBottom: number | null;
}

export interface WidgetSelectionComponent {
  key: string | null;
  description: string | null;
  isVariant: boolean;
  variantProperties: Record<string, string>;
  componentProperties: Record<string, { type: string; defaultValue?: unknown }>;
}

export interface WidgetSelectionNodeSnapshot {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  pageName: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  characters?: string;
  fills?: WidgetSelectionFill[];
  opacity?: number;
  rotation?: number;
  cornerRadius?: number;
  childCount?: number;
  fillStyleId?: string | null;
  strokeStyleId?: string | null;
  textStyleId?: string | null;
  component?: WidgetSelectionComponent;
  layout?: WidgetSelectionLayout;
  boundVariables?: Record<string, unknown>;
}

export interface WidgetSelectionSnapshot {
  count: number;
  pageName: string;
  pageId: string | null;
  sessionId?: string;
  nodes: WidgetSelectionNodeSnapshot[];
  updatedAt: number;
}

export interface WidgetSyncSummary {
  tokens: number;
  components: number;
  styles: number;
  partialFailures: string[];
}

export interface WidgetHealSummary {
  round: number;
  healed: boolean;
  issueCount: number;
  issues: string[];
}

export interface AgentBoxState {
  runId: string;
  taskId: string;
  role: string;
  title: string;
  status: "idle" | "busy" | "error" | "done";
  summary?: string;
  error?: string;
  healRound?: number;
  elapsedMs?: number;
}

// ── Multi-Agent Types ─────────────────────────────────────

export type AgentRole =
  | "token-engineer"
  | "component-architect"
  | "layout-designer"
  | "dataviz-specialist"
  | "code-generator"
  | "accessibility-checker"
  | "design-auditor"
  | "research-analyst"
  | "general";

export interface AgentRegistryEntry {
  id: string;
  name: string;
  role: AgentRole;
  pid: number;
  port: number;
  status: "online" | "busy" | "offline";
  lastHeartbeat: number;
  registeredAt: number;
  capabilities: string[];
}

export interface AgentRegistryState {
  agents: AgentRegistryEntry[];
  updatedAt: number;
}

export interface AgentTaskEnvelope {
  id: string;
  type: "task-assign" | "task-result" | "task-cancel";
  agentId: string;
  taskId: string;
  payload?: unknown;
  result?: unknown;
  error?: string;
}

export interface WidgetJob {
  id: string;
  runId: string;
  kind: WidgetJobKind;
  label: string;
  status: WidgetJobStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  progressText?: string;
  summary?: string;
  error?: string;
  command?: WidgetCommandName;
  payload?: unknown;
}

export interface WidgetLogEntry {
  id: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  detail?: unknown;
  timestamp: number;
}

export interface WidgetActionMeta {
  kind: WidgetJobKind;
  label: string;
}

export interface WidgetUiCommandEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "ui";
  type: "run-command";
  requestId: string;
  command: WidgetCommandName;
  params?: Record<string, unknown>;
  action?: WidgetActionMeta;
}

export interface WidgetUiPingEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "ui";
  type: "ping";
}

export type WidgetUiEnvelope = WidgetUiCommandEnvelope | WidgetUiPingEnvelope;

export interface WidgetBootstrapEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "bootstrap";
  connection: WidgetConnectionState;
  selection: WidgetSelectionSnapshot;
  initialJobs: WidgetJob[];
}

export interface WidgetPongEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "pong";
  connection: WidgetConnectionState;
}

export interface WidgetConnectionEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "connection";
  connection: WidgetConnectionState;
}

export interface WidgetSelectionEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "selection";
  selection: WidgetSelectionSnapshot;
}

export interface WidgetPageEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "page";
  pageName: string;
  pageId: string | null;
  updatedAt: number;
}

export interface WidgetChangesEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "changes";
  count: number;
  buffered: number;
  sessionId: string;
  runId?: string | null;
  updatedAt: number;
}

export interface WidgetJobEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "job";
  job: WidgetJob;
}

export interface WidgetCommandResultEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "command-result";
  requestId: string;
  command: WidgetCommandName;
  ok: boolean;
  sessionId: string;
  runId?: string | null;
  result?: unknown;
  error?: string;
}

export interface WidgetLogEnvelope {
  channel: typeof WIDGET_V2_CHANNEL;
  source: "main";
  type: "log";
  entry: WidgetLogEntry;
}

export type WidgetMainEnvelope =
  | WidgetBootstrapEnvelope
  | WidgetPongEnvelope
  | WidgetConnectionEnvelope
  | WidgetSelectionEnvelope
  | WidgetPageEnvelope
  | WidgetChangesEnvelope
  | WidgetJobEnvelope
  | WidgetCommandResultEnvelope
  | WidgetLogEnvelope;

export function isWidgetV2Envelope(value: unknown): value is WidgetUiEnvelope | WidgetMainEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "channel" in value &&
      (value as { channel?: string }).channel === WIDGET_V2_CHANNEL &&
      "type" in value,
  );
}

export function createRunId(prefix = "run"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isWidgetCommandName(value: unknown): value is WidgetCommandName {
  return typeof value === "string" && arrayIncludes(WIDGET_COMMAND_NAMES, value as WidgetCommandName);
}
