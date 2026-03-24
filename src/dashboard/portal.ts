/**
 * Agent Portal HTML Generator — Live dashboard for Noche.
 *
 * Tabs: SETUP | LIVE FEED | DATA | COMPOSE
 *
 * SETUP tab guides the user through full bridge setup:
 *   1. Figma token
 *   2. File key (pre-filled for Labor Budgeting 3.1)
 *   3. Plugin install
 *
 * LIVE FEED streams SSE events from the bridge.
 * DATA shows tokens / components / styles / IA tree.
 * COMPOSE lets you run `noche compose "<intent>"` from the browser.
 */

interface PortalConfig {
  bridgePort: number;
  bridgeClients: { id: string; file: string; editor: string; connectedAt: string }[];
  dashboardPort: number;
  projectName?: string;
  figmaFileKey?: string;
  figmaNodeId?: string;
  hasToken?: boolean;
  pluginManifestPath?: string;
}

/** Escape HTML entities */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generatePortalHTML(config: PortalConfig): string {
  const projectName = config.projectName || "Noche";
  const fileKey = config.figmaFileKey || "";
  const nodeId = config.figmaNodeId || "";
  const hasToken = config.hasToken ?? false;
  const pluginManifestPath = config.pluginManifestPath || "";
  const figmaUrl = fileKey
    ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(projectName)}${nodeId ? `?node-id=${nodeId.replace(":", "-")}` : ""}`
    : "";

  // Determine initial tab: if no token → SETUP, else FEED
  const initialTab = hasToken ? "feed" : "setup";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Noche — ${esc(projectName)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'%3E%3Cdefs%3E%3CradialGradient id='m' cx='0.4' cy='0.35' r='0.65'%3E%3Cstop offset='0%25' stop-color='%23f5f0e6'/%3E%3Cstop offset='100%25' stop-color='%23c2b48c'/%3E%3C/radialGradient%3E%3CradialGradient id='s' cx='0.7' cy='0.5' r='0.55'%3E%3Cstop offset='0%25' stop-color='%231a1a2e' stop-opacity='0'/%3E%3Cstop offset='100%25' stop-color='%230d0d1a' stop-opacity='0.7'/%3E%3C/radialGradient%3E%3CclipPath id='c'%3E%3Ccircle cx='120' cy='120' r='52'/%3E%3C/clipPath%3E%3C/defs%3E%3Ccircle cx='120' cy='120' r='52' fill='url(%23m)'/%3E%3Ccircle cx='120' cy='120' r='52' fill='url(%23s)' clip-path='url(%23c)'/%3E%3Cellipse cx='106' cy='104' rx='22' ry='26' fill='white' opacity='0.07' clip-path='url(%23c)'/%3E%3C/svg%3E">
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --bg-card: #111111;
  --bg-hover: #1a1a1a;
  --bg-active: #1e1e1e;
  --bg-inset: #0d0d0d;
  --fg: #e0e0e0;
  --fg-muted: #666666;
  --fg-dim: #3a3a3a;
  --border: #1e1e1e;
  --border-bright: #2e2e2e;
  --accent: #d4d4d4;
  --accent-bright: #ffffff;
  --green: #4ade80;
  --green-dim: #166534;
  --yellow: #fbbf24;
  --yellow-dim: #854d0e;
  --red: #f87171;
  --red-dim: #991b1b;
  --blue: #60a5fa;
  --blue-dim: #1e40af;
  --purple: #a78bfa;
  --mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
  --radius: 3px;
}

body {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
  line-height: 1.6;
}

/* ── Header ─────────────────────────── */
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  position: sticky;
  top: 0;
  z-index: 10;
}

.hdr-left { display: flex; align-items: center; gap: 14px; }

.hdr-brand {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent-bright);
}

.hdr-project {
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hdr-project a {
  color: var(--blue);
  text-decoration: none;
}
.hdr-project a:hover { text-decoration: underline; }

.conn-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 2px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.conn-badge .dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--fg-dim);
}

.conn-badge.live .dot  { background: var(--green); box-shadow: 0 0 4px var(--green); }
.conn-badge.live       { border-color: var(--green-dim); color: var(--green); }
.conn-badge.dead .dot  { background: var(--red); }
.conn-badge.dead       { border-color: var(--red-dim); color: var(--red); }

.hdr-right {
  display: flex; align-items: center; gap: 14px;
  font-size: 10px; color: var(--fg-muted);
  letter-spacing: 1px; text-transform: uppercase;
}
.hdr-right .port { color: var(--accent-bright); font-weight: 700; }

/* ── Layout ─────────────────────────── */
.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: calc(100vh - 46px);
}

/* ── Sidebar ────────────────────────── */
.sidebar {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  overflow-y: auto;
}

.sbl { /* sidebar label */
  padding: 12px 16px 8px;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--fg-muted);
  border-bottom: 1px solid var(--border);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border: none;
  border-bottom: 1px solid #161616;
  background: none;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.1s;
}
.action-btn:hover  { background: var(--bg-hover); }
.action-btn:active { background: var(--bg-active); }
.action-btn .label { font-weight: 600; letter-spacing: 0.5px; }
.action-btn .desc  { font-size: 10px; color: var(--fg-muted); }

.action-btn.running { color: var(--yellow); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.action-btn.running .spinner { display: inline-block; animation: spin 1s linear infinite; }

/* Figma clients */
.client-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #141414;
  font-size: 10px;
}
.client-dot {
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--green);
  flex-shrink: 0;
}
.client-name { color: var(--fg); font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.client-meta { color: var(--fg-muted); }

.no-clients {
  padding: 16px;
  font-size: 10px;
  color: var(--fg-muted);
  text-align: center;
  line-height: 2;
}

/* Setup step indicators */
.step-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid #141414;
  font-size: 10px;
}
.step-num {
  width: 18px; height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-bright);
  display: flex; align-items: center; justify-content: center;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
  color: var(--fg-muted);
}
.step-num.done  { background: var(--green-dim); border-color: var(--green); color: var(--green); }
.step-num.active{ background: var(--blue-dim); border-color: var(--blue); color: var(--blue); }
.step-label { flex: 1; }
.step-label .sl { font-weight: 600; }
.step-label .sd { color: var(--fg-muted); }

/* ── Main ───────────────────────────── */
.main { display: flex; flex-direction: column; overflow: hidden; }

.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}

.tab {
  padding: 10px 18px;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--fg-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.tab:hover { color: var(--fg); }
.tab.active { color: var(--accent-bright); border-bottom-color: var(--accent-bright); }
.tab .tab-badge {
  position: absolute;
  top: 7px; right: 8px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--yellow);
}

.panel {
  display: none;
  flex: 1;
  overflow: auto;
}
.panel.active { display: flex; flex-direction: column; }

/* ── Stats bar ──────────────────────── */
.stats-bar {
  display: flex; gap: 20px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  flex-shrink: 0;
}
.stats-bar .n { color: var(--accent-bright); font-weight: 700; margin-right: 3px; }

/* ── Feed ───────────────────────────── */
.feed { flex: 1; overflow-y: auto; font-size: 11px; }

.feed-entry {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 6px 20px;
  border-bottom: 1px solid #131313;
  transition: background 0.1s;
}
.feed-entry:hover { background: var(--bg-hover); }
.feed-ts   { color: var(--fg-dim); font-size: 10px; flex-shrink: 0; min-width: 65px; }
.feed-icon { flex-shrink: 0; width: 14px; text-align: center; font-weight: 700; }
.feed-icon.ok   { color: var(--green); }
.feed-icon.err  { color: var(--red); }
.feed-icon.warn { color: var(--yellow); }
.feed-icon.info { color: var(--blue); }
.feed-icon.dim  { color: var(--fg-dim); }
.feed-msg { flex: 1; word-break: break-word; }

.feed-detail {
  margin-top: 4px; padding: 6px 10px;
  background: var(--bg); border-radius: 2px;
  font-size: 10px; color: var(--fg-muted);
  max-height: 200px; overflow: auto;
  white-space: pre-wrap; cursor: pointer;
}
.feed-detail.collapsed {
  max-height: 40px; overflow: hidden; position: relative;
}
.feed-detail.collapsed::after {
  content: '…expand';
  position: absolute; bottom: 0; right: 0;
  padding: 0 6px; background: var(--bg);
  color: var(--fg-dim); font-size: 9px;
}
.feed-size { flex-shrink: 0; font-size: 9px; color: var(--fg-dim); min-width: 50px; text-align: right; }

/* ── Data grid ──────────────────────── */
.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px; padding: 20px;
}
.data-card {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-card);
  overflow: hidden;
}
.data-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
}
.data-card-title { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.data-card-count { font-size: 10px; color: var(--fg-muted); }
.data-card-body  { padding: 12px 14px; font-size: 10px; max-height: 280px; overflow: auto; }
.data-empty { color: var(--fg-dim); text-align: center; padding: 20px; font-size: 10px; }

.token-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.token-swatch { width: 14px; height: 14px; border-radius: 2px; border: 1px solid var(--border); flex-shrink: 0; }
.token-name { color: var(--accent); }
.token-val  { color: var(--fg-muted); margin-left: auto; }

.comp-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
.comp-name { font-weight: 600; }
.comp-tag  { font-size: 9px; color: var(--fg-muted); margin-left: auto; background: var(--bg); border: 1px solid var(--border); padding: 1px 5px; border-radius: 2px; }

/* ── Setup panel ────────────────────── */
.setup-panel {
  flex: 1; overflow-y: auto;
  padding: 28px 32px;
  max-width: 680px;
  margin: 0 auto;
  width: 100%;
}

.setup-header {
  margin-bottom: 28px;
}

.setup-title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--accent-bright);
  margin-bottom: 6px;
}

.setup-sub {
  font-size: 11px;
  color: var(--fg-muted);
  line-height: 1.8;
}

.setup-file-pill {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 10px;
  padding: 6px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-bright);
  border-radius: 3px;
  font-size: 10px;
  color: var(--blue);
}
.setup-file-pill a { color: var(--blue); text-decoration: none; }
.setup-file-pill a:hover { text-decoration: underline; }

.setup-step {
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 16px;
  overflow: hidden;
  transition: border-color 0.2s;
}
.setup-step.active { border-color: var(--blue-dim); }
.setup-step.done   { border-color: var(--green-dim); opacity: 0.7; }

.setup-step-head {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  cursor: pointer;
  user-select: none;
}

.setup-step-num {
  width: 22px; height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border-bright);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; flex-shrink: 0;
}
.setup-step.active .setup-step-num { background: var(--blue-dim); border-color: var(--blue); color: var(--blue); }
.setup-step.done .setup-step-num   { background: var(--green-dim); border-color: var(--green); color: var(--green); }

.setup-step-title { flex: 1; font-weight: 600; font-size: 11px; letter-spacing: 0.5px; }
.setup-step-status { font-size: 10px; color: var(--fg-muted); }
.setup-step.done .setup-step-status { color: var(--green); }

.setup-step-body {
  padding: 16px;
  border-top: 1px solid var(--border);
  display: none;
}
.setup-step.active .setup-step-body { display: block; }

.setup-label {
  font-size: 10px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}

.setup-input {
  width: 100%;
  padding: 9px 12px;
  background: var(--bg-inset);
  border: 1px solid var(--border-bright);
  border-radius: 3px;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.setup-input:focus { border-color: var(--blue); }
.setup-input::placeholder { color: var(--fg-dim); }

.setup-hint {
  margin-top: 8px;
  font-size: 10px;
  color: var(--fg-muted);
  line-height: 1.7;
}

.setup-hint code {
  background: var(--bg-inset);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 2px;
  font-size: 10px;
  color: var(--accent);
}

.setup-btn {
  margin-top: 12px;
  padding: 9px 20px;
  background: var(--bg-inset);
  border: 1px solid var(--border-bright);
  border-radius: 3px;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
}
.setup-btn:hover { border-color: var(--blue); color: var(--blue); background: var(--blue-dim); }
.setup-btn.primary { border-color: var(--blue); color: var(--blue); }
.setup-btn.success { border-color: var(--green); color: var(--green); }

.plugin-path {
  display: block;
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 10px;
  color: var(--accent);
  word-break: break-all;
}

.setup-success-box {
  margin-top: 16px;
  padding: 14px 16px;
  background: rgba(74,222,128,0.04);
  border: 1px solid var(--green-dim);
  border-radius: 3px;
  font-size: 11px;
  color: var(--green);
  display: none;
  line-height: 1.8;
}

/* ── Compose panel ──────────────────── */
.compose-panel {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden;
}

.compose-intro {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 10px;
  color: var(--fg-muted);
  line-height: 1.8;
  flex-shrink: 0;
}

.compose-input-row {
  display: flex; gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}

.compose-input {
  flex: 1;
  padding: 9px 12px;
  background: var(--bg-inset);
  border: 1px solid var(--border-bright);
  border-radius: 3px;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 12px;
  outline: none;
  transition: border-color 0.15s;
}
.compose-input:focus { border-color: var(--blue); }
.compose-input::placeholder { color: var(--fg-dim); }

.compose-run-btn {
  padding: 9px 18px;
  background: var(--bg-inset);
  border: 1px solid var(--blue-dim);
  border-radius: 3px;
  color: var(--blue);
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.compose-run-btn:hover { background: var(--blue-dim); border-color: var(--blue); }
.compose-run-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.compose-examples {
  padding: 10px 20px;
  border-bottom: 1px solid var(--border);
  display: flex; flex-wrap: wrap; gap: 6px;
  flex-shrink: 0;
  background: var(--bg-card);
}

.compose-chip {
  padding: 3px 10px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 2px;
  font-size: 10px;
  color: var(--fg-muted);
  cursor: pointer;
  transition: all 0.1s;
  letter-spacing: 0.3px;
}
.compose-chip:hover { color: var(--blue); border-color: var(--blue-dim); background: var(--blue-dim); }

.compose-output {
  flex: 1; overflow-y: auto;
  padding: 16px 20px;
  font-size: 11px;
}

.compose-result {
  margin-bottom: 16px;
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.compose-result-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px;
  background: var(--bg-card);
  font-size: 10px;
  border-bottom: 1px solid var(--border);
}

.compose-result-intent { font-weight: 600; color: var(--blue); }
.compose-result-ts { color: var(--fg-dim); }
.compose-result-status { font-size: 9px; text-transform: uppercase; letter-spacing: 1px; }
.compose-result-status.ok { color: var(--green); }
.compose-result-status.err { color: var(--red); }
.compose-result-status.running { color: var(--yellow); animation: pulse 1s ease infinite; }

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.compose-result-body {
  padding: 12px 14px;
  font-size: 10px;
  color: var(--fg-muted);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-brand">NOCHE</div>
    <div class="hdr-project">
      ${figmaUrl
        ? `<a href="${esc(figmaUrl)}" target="_blank" rel="noopener">${esc(projectName)}</a>`
        : esc(projectName)}
    </div>
    <div class="conn-badge" id="connBadge">
      <span class="dot"></span>
      <span id="connLabel">CONNECTING</span>
    </div>
  </div>
  <div class="hdr-right">
    <span>BRIDGE <span class="port">:${config.bridgePort || "—"}</span></span>
    <span>PORTAL <span class="port">:${config.dashboardPort}</span></span>
  </div>
</div>

<div class="layout">

  <!-- ── Sidebar ── -->
  <div class="sidebar">

    <div class="sbl">FIGMA CONNECTION</div>
    <div id="clientsPanel">
      ${config.bridgeClients.length > 0
        ? config.bridgeClients.map((c) => `
          <div class="client-item">
            <span class="client-dot"></span>
            <span class="client-name" title="${esc(c.file)}">${esc(c.file)}</span>
            <span class="client-meta">${esc(c.editor)}</span>
          </div>`).join("")
        : `<div class="no-clients">No plugin connected<br><span style="color:var(--fg-dim)">Open Noche plugin in Figma</span></div>`
      }
    </div>

    <div class="sbl">SETUP PROGRESS</div>
    <div class="step-row" id="sideStep1">
      <div class="step-num ${hasToken ? "done" : "active"}" id="ss1">1</div>
      <div class="step-label">
        <div class="sl">Figma Token</div>
        <div class="sd">${hasToken ? "Configured" : "Required"}</div>
      </div>
    </div>
    <div class="step-row" id="sideStep2">
      <div class="step-num ${fileKey ? "done" : ""}" id="ss2">2</div>
      <div class="step-label">
        <div class="sl">File Key</div>
        <div class="sd">${fileKey ? fileKey.slice(0, 12) + "…" : "Not set"}</div>
      </div>
    </div>
    <div class="step-row" id="sideStep3">
      <div class="step-num" id="ss3">3</div>
      <div class="step-label">
        <div class="sl">Plugin</div>
        <div class="sd" id="sidePluginStatus">${config.bridgeClients.length > 0 ? "Connected" : "Waiting"}</div>
      </div>
    </div>

    <div class="sbl">DESIGN SYSTEM</div>
    <button class="action-btn" onclick="runAction('pull-tokens')" id="btn-pull-tokens">
      <span class="label">TOKENS</span>
      <span class="desc">Variables</span>
    </button>
    <button class="action-btn" onclick="runAction('pull-components')" id="btn-pull-components">
      <span class="label">COMPONENTS</span>
      <span class="desc">Library</span>
    </button>
    <button class="action-btn" onclick="runAction('pull-styles')" id="btn-pull-styles">
      <span class="label">STYLES</span>
      <span class="desc">Colors, text, effects</span>
    </button>

    <div class="sbl">INSPECT</div>
    <button class="action-btn" onclick="runAction('inspect')" id="btn-inspect">
      <span class="label">SELECTION</span>
      <span class="desc">Current node</span>
    </button>
    <button class="action-btn" onclick="runAction('page-tree')" id="btn-page-tree">
      <span class="label">PAGE TREE</span>
      <span class="desc">IA structure</span>
    </button>
    <button class="action-btn" onclick="runAction('stickies')" id="btn-stickies">
      <span class="label">STICKIES</span>
      <span class="desc">FigJam notes</span>
    </button>

    <div class="sbl">SYNC</div>
    <button class="action-btn" onclick="runAction('full-sync')" id="btn-full-sync">
      <span class="label">FULL SYNC</span>
      <span class="desc">Tokens + components + styles</span>
    </button>

  </div>

  <!-- ── Main ── -->
  <div class="main">
    <div class="tabs">
      <button class="tab ${initialTab === "setup" ? "active" : ""}" onclick="switchTab('setup', this)" id="tabSetup">
        SETUP
        ${!hasToken ? '<span class="tab-badge"></span>' : ""}
      </button>
      <button class="tab ${initialTab === "feed" ? "active" : ""}" onclick="switchTab('feed', this)">LIVE FEED</button>
      <button class="tab" onclick="switchTab('data', this)">DATA</button>
      <button class="tab" onclick="switchTab('compose', this)">COMPOSE</button>
    </div>

    <!-- ── SETUP PANEL ── -->
    <div class="panel ${initialTab === "setup" ? "active" : ""}" id="panel-setup">
      <div class="setup-panel">
        <div class="setup-header">
          <div class="setup-title">Bridge Setup</div>
          <div class="setup-sub">
            Connect Noche to Figma in three steps.<br>
            This dashboard will update in real-time once the plugin is running.
          </div>
          ${figmaUrl ? `
          <div class="setup-file-pill">
            <span style="color:var(--fg-muted)">FILE</span>
            <a href="${esc(figmaUrl)}" target="_blank" rel="noopener">${esc(projectName)}</a>
            ${nodeId ? `<span style="color:var(--fg-dim)">node ${esc(nodeId)}</span>` : ""}
          </div>` : ""}
        </div>

        <!-- Step 1: Token -->
        <div class="setup-step ${hasToken ? "done" : "active"}" id="step1">
          <div class="setup-step-head" onclick="toggleStep('step1')">
            <div class="setup-step-num">1</div>
            <div class="setup-step-title">Figma Personal Access Token</div>
            <div class="setup-step-status" id="step1status">${hasToken ? "✓ Configured" : "Required"}</div>
          </div>
          <div class="setup-step-body">
            <div class="setup-label">Token</div>
            <input class="setup-input" type="password" id="tokenInput"
              placeholder="figd_xxxxxxxxxxxx"
              value="" autocomplete="off" spellcheck="false">
            <div class="setup-hint">
              Get your token:<br>
              1. Open Figma Desktop → avatar → <code>Settings</code><br>
              2. Scroll to <code>Personal access tokens</code><br>
              3. Click <code>Generate new token</code> → name it <code>Noche</code><br>
              4. Paste the token above (starts with <code>figd_</code>)
            </div>
            <button class="setup-btn primary" onclick="saveToken()">SAVE TOKEN</button>
            <div class="setup-success-box" id="step1success">
              Token saved to .env.local<br>
              Proceeding to step 2…
            </div>
          </div>
        </div>

        <!-- Step 2: File key -->
        <div class="setup-step ${fileKey ? "done" : ""}" id="step2">
          <div class="setup-step-head" onclick="toggleStep('step2')">
            <div class="setup-step-num">2</div>
            <div class="setup-step-title">Figma File Key</div>
            <div class="setup-step-status" id="step2status">${fileKey ? "✓ " + esc(fileKey) : "Optional"}</div>
          </div>
          <div class="setup-step-body">
            <div class="setup-label">File URL or Key</div>
            <input class="setup-input" id="fileKeyInput"
              placeholder="figma.com/design/abc123... or abc123"
              value="${esc(fileKey)}" spellcheck="false">
            <div class="setup-hint">
              Pre-filled from <code>.env.local</code>.<br>
              This is used by <code>noche pull</code> to sync without specifying a file each time.
            </div>
            <button class="setup-btn primary" onclick="saveFileKey()">SAVE FILE KEY</button>
            <div class="setup-success-box" id="step2success">
              File key saved to .env.local
            </div>
          </div>
        </div>

        <!-- Step 3: Plugin -->
        <div class="setup-step ${config.bridgeClients.length > 0 ? "done" : ""}" id="step3">
          <div class="setup-step-head" onclick="toggleStep('step3')">
            <div class="setup-step-num">3</div>
            <div class="setup-step-title">Install &amp; Run the Noche Plugin</div>
            <div class="setup-step-status" id="step3status">${config.bridgeClients.length > 0 ? "✓ Connected" : "Waiting"}</div>
          </div>
          <div class="setup-step-body">
            <div class="setup-hint" style="margin-bottom:12px">
              The plugin runs inside Figma Desktop and bridges to this server over WebSocket.<br>
              It auto-discovers Noche on ports 9223–9232.
            </div>
            <div class="setup-label">Install steps</div>
            <div class="setup-hint">
              1. Open <strong>Figma Desktop</strong><br>
              2. <code>Plugins</code> → <code>Development</code> → <code>Import plugin from manifest</code><br>
              3. Select the manifest file:
            </div>
            <code class="plugin-path" id="pluginPath">${esc(pluginManifestPath) || "Loading…"}</code>
            <div class="setup-hint" style="margin-top:12px">
              4. Run: <code>Plugins → Development → Noche → Run Plugin</code><br>
              5. The plugin auto-connects to bridge port <strong>${config.bridgePort || "9223"}</strong>
            </div>
            <div id="step3success" class="setup-success-box" style="${config.bridgeClients.length > 0 ? "display:block" : ""}">
              Plugin connected — bridge is live<br>
              <span style="color:var(--fg-muted)">You can now use FULL SYNC, inspect nodes, and run compose commands.</span>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── FEED PANEL ── -->
    <div class="panel ${initialTab === "feed" ? "active" : ""}" id="panel-feed">
      <div class="stats-bar" id="statsBar">
        <span><span class="n" id="statTokens">0</span>TOKENS</span>
        <span><span class="n" id="statComponents">0</span>COMPONENTS</span>
        <span><span class="n" id="statStyles">0</span>STYLES</span>
        <span><span class="n" id="statEvents">0</span>EVENTS</span>
      </div>
      <div class="feed" id="feed"></div>
    </div>

    <!-- ── DATA PANEL ── -->
    <div class="panel" id="panel-data">
      <div class="data-grid">
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Tokens</span>
            <span class="data-card-count" id="tokenCount">0</span>
          </div>
          <div class="data-card-body" id="tokenData">
            <div class="data-empty">Run TOKENS to pull</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Components</span>
            <span class="data-card-count" id="compCount">0</span>
          </div>
          <div class="data-card-body" id="compData">
            <div class="data-empty">Run COMPONENTS to pull</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Styles</span>
            <span class="data-card-count" id="styleCount">0</span>
          </div>
          <div class="data-card-body" id="styleData">
            <div class="data-empty">Run STYLES to pull</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Selection</span>
            <span class="data-card-count" id="selCount">0</span>
          </div>
          <div class="data-card-body" id="selData">
            <div class="data-empty">Select nodes in Figma</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Page Tree</span>
            <span class="data-card-count" id="treeCount">—</span>
          </div>
          <div class="data-card-body" id="treeData">
            <div class="data-empty">Run PAGE TREE</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Stickies</span>
            <span class="data-card-count" id="stickyCount">0</span>
          </div>
          <div class="data-card-body" id="stickyData">
            <div class="data-empty">Run STICKIES</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── COMPOSE PANEL ── -->
    <div class="panel" id="panel-compose">
      <div class="compose-intro">
        <strong style="color:var(--fg)">noche compose</strong> — natural language → Figma actions.<br>
        Describe what you want to build and Noche will classify, plan, and execute sub-tasks.
      </div>
      <div class="compose-examples">
        <span class="compose-chip" onclick="setCompose('generate a budget metric card atom')">budget metric card</span>
        <span class="compose-chip" onclick="setCompose('extract design tokens from current file')">extract tokens</span>
        <span class="compose-chip" onclick="setCompose('create a labor budgeting dashboard page')">create dashboard page</span>
        <span class="compose-chip" onclick="setCompose('audit the design system for inconsistencies')">audit design system</span>
        <span class="compose-chip" onclick="setCompose('generate a data table organism for labor data')">data table organism</span>
        <span class="compose-chip" onclick="setCompose('pull page tree and show IA structure')">page tree / IA</span>
      </div>
      <div class="compose-input-row">
        <input class="compose-input" id="composeInput"
          placeholder="describe what you want Noche to build or do…"
          onkeydown="if(event.key==='Enter')runCompose()">
        <button class="compose-run-btn" id="composeRunBtn" onclick="runCompose()">RUN →</button>
      </div>
      <div class="compose-output" id="composeOutput">
        <div style="color:var(--fg-dim);font-size:10px;text-align:center;padding:32px">
          No compose runs yet.<br>Type an intent above and press RUN.
        </div>
      </div>
    </div>

  </div>
</div>

<script>
// ── State ──────────────────────────────────
let eventCount = 0;
const store = { tokens: null, components: null, styles: null, selection: null, tree: null, stickies: null };

// ── SSE ────────────────────────────────────
let evtSource = null;
let reconnectTimer = null;

function connectSSE() {
  evtSource = new EventSource('/events');

  evtSource.onopen = () => {
    setBadge('live', 'LIVE');
    addFeed('ok', 'Portal connected to Noche bridge');
  };

  evtSource.onmessage = (e) => {
    try { handleEvent(JSON.parse(e.data)); } catch {}
  };

  evtSource.onerror = () => {
    setBadge('dead', 'OFFLINE');
    evtSource.close();
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, 3000);
    addFeed('err', 'Bridge disconnected — retrying in 3s…');
  };
}

function setBadge(state, text) {
  const b = document.getElementById('connBadge');
  const l = document.getElementById('connLabel');
  b.className = 'conn-badge ' + state;
  l.textContent = text;
}

// ── Event handler ──────────────────────────
function handleEvent(msg) {
  const { type, data, ts } = msg;

  switch (type) {
    case 'init': {
      if (data.status?.clients?.length > 0) renderClients(data.status.clients);
      if (data.recentEvents) {
        for (const evt of data.recentEvents) handleEvent({ type: evt.type, data: evt.data, ts: evt.ts });
      }
      // Resolve plugin path from bridge status
      if (data.status?.pluginManifestPath) {
        document.getElementById('pluginPath').textContent = data.status.pluginManifestPath;
      }
      break;
    }
    case 'action-result': {
      const { action, result, error } = data;
      if (error) {
        addFeed('err', 'ACTION ' + action + ' failed: ' + error);
      } else {
        const size = result ? JSON.stringify(result).length : 0;
        addFeed('ok', 'ACTION ' + action + ' — ' + sizeLbl(size), result);
        storeResult(action, result);
      }
      clearRunning(action);
      break;
    }
    case 'sync-data': {
      const { part, result, error } = data;
      if (error) {
        addFeed('err', 'SYNC ' + part + ' — ' + error);
      } else {
        const size = result ? JSON.stringify(result).length : 0;
        addFeed('ok', 'SYNC ' + part + ' — ' + sizeLbl(size), result);
        if (part === 'tokens' && result) renderTokens(result);
        if (part === 'components' && result) renderComponents(result);
        if (part === 'styles' && result) renderStyles(result);
      }
      break;
    }
    case 'selection': {
      const nodes = data.nodes || [];
      if (nodes.length > 0) {
        addFeed('info', 'SELECTION ' + nodes.length + ' — ' + nodes.map(n => n.name).join(', '));
        store.selection = nodes;
        renderSelection(nodes);
      }
      break;
    }
    case 'page-changed':
      addFeed('info', 'PAGE → ' + (data.page || '?'));
      break;
    case 'document-changed': {
      const c = data.changes || 0;
      addFeed('dim', 'DOC CHANGE — ' + c + ' change' + (c !== 1 ? 's' : ''));
      break;
    }
    case 'plugin-connected': {
      addFeed('ok', 'Plugin connected: ' + (data.file || data.id));
      updateClients();
      // Update sidebar step 3
      document.getElementById('step3status').textContent = '✓ Connected';
      document.getElementById('step3').className = 'setup-step done';
      document.getElementById('step3success').style.display = 'block';
      document.getElementById('ss3').className = 'step-num done';
      document.getElementById('sidePluginStatus').textContent = 'Connected';
      break;
    }
    case 'plugin-disconnected': {
      addFeed('warn', 'Plugin disconnected');
      updateClients();
      document.getElementById('ss3').className = 'step-num';
      document.getElementById('sidePluginStatus').textContent = 'Disconnected';
      break;
    }
    case 'chat':
      addFeed('info', '[' + (data.from || 'figma') + '] ' + data.text);
      break;
    case 'event': {
      const lv = data.type === 'success' ? 'ok' : data.type === 'error' ? 'err' : data.type === 'warn' ? 'warn' : 'info';
      addFeed(lv, data.message);
      break;
    }
    case 'compose-result': {
      renderComposeResult(data);
      break;
    }
  }
}

// ── Store / render ─────────────────────────
function storeResult(action, result) {
  if (action === 'pull-tokens')     { store.tokens = result;     renderTokens(result); }
  if (action === 'pull-components') { store.components = result; renderComponents(result); }
  if (action === 'pull-styles')     { store.styles = result;     renderStyles(result); }
  if (action === 'stickies')        { store.stickies = result;   renderStickies(result); }
  if (action === 'page-tree')       { store.tree = result;       renderTree(result); }
  if (action === 'inspect')         { const n = result?.nodes || (Array.isArray(result)?result:[]); store.selection=n; renderSelection(n); }
}

function renderTokens(data) {
  const cols = data?.collections || [];
  let count = 0; let html = '';
  for (const col of cols) {
    for (const v of (col.variables || [])) {
      count++;
      const val = v.valuesByMode ? Object.values(v.valuesByMode)[0] : '';
      const isColor = v.resolvedType === 'COLOR' && typeof val === 'object' && val && 'r' in val;
      const hex = isColor ? rgbHex(val) : null;
      html += '<div class="token-row">';
      if (hex) html += '<span class="token-swatch" style="background:' + hex + '"></span>';
      html += '<span class="token-name">' + escH(v.name) + '</span>';
      html += '<span class="token-val">' + escH(hex || String(val ?? '')) + '</span>';
      html += '</div>';
    }
  }
  document.getElementById('tokenData').innerHTML = html || '<div class="data-empty">No tokens</div>';
  document.getElementById('tokenCount').textContent = count;
  document.getElementById('statTokens').textContent = count;
}

function renderComponents(data) {
  const comps = Array.isArray(data) ? data : [];
  let html = '';
  for (const c of comps) {
    html += '<div class="comp-row"><span class="comp-name">' + escH(c.name) + '</span>';
    if (c.variants?.length) html += '<span class="comp-tag">' + c.variants.length + 'v</span>';
    html += '</div>';
  }
  document.getElementById('compData').innerHTML = html || '<div class="data-empty">No components</div>';
  document.getElementById('compCount').textContent = comps.length;
  document.getElementById('statComponents').textContent = comps.length;
}

function renderStyles(data) {
  const styles = Array.isArray(data) ? data : [];
  let html = '';
  for (const s of styles) {
    html += '<div class="comp-row"><span class="comp-name">' + escH(s.name) + '</span>';
    html += '<span class="comp-tag">' + escH(s.styleType || s.type || '') + '</span></div>';
  }
  document.getElementById('styleData').innerHTML = html || '<div class="data-empty">No styles</div>';
  document.getElementById('styleCount').textContent = styles.length;
  document.getElementById('statStyles').textContent = styles.length;
}

function renderSelection(nodes) {
  let html = '';
  for (const n of nodes) {
    html += '<div class="comp-row"><span class="comp-name">' + escH(n.name) + '</span>';
    html += '<span class="comp-tag">' + escH(n.type || '') + '</span></div>';
  }
  document.getElementById('selData').innerHTML = html || '<div class="data-empty">Nothing selected</div>';
  document.getElementById('selCount').textContent = nodes.length;
}

function renderStickies(data) {
  const stickies = Array.isArray(data) ? data : [];
  let html = '';
  for (const s of stickies) {
    html += '<div class="comp-row"><span class="comp-name">' + escH((s.text || s.id).slice(0, 60)) + '</span></div>';
  }
  document.getElementById('stickyData').innerHTML = html || '<div class="data-empty">No stickies</div>';
  document.getElementById('stickyCount').textContent = stickies.length;
}

function renderTree(data) {
  const pages = data?.pages || [];
  let html = ''; let nodeCount = 0;
  for (const page of pages) {
    html += '<div class="comp-row"><span class="comp-name">' + escH(page.name) + '</span><span class="comp-tag">PAGE</span></div>';
    nodeCount++;
    for (const child of (page.children || [])) {
      html += '<div class="comp-row" style="padding-left:14px"><span class="comp-name" style="color:var(--fg-muted)">' + escH(child.name) + '</span><span class="comp-tag">' + (child.type||'') + '</span></div>';
      nodeCount++;
    }
  }
  document.getElementById('treeData').innerHTML = html || '<div class="data-empty">No pages</div>';
  document.getElementById('treeCount').textContent = nodeCount;
}

function renderClients(clients) {
  const panel = document.getElementById('clientsPanel');
  if (!clients || clients.length === 0) {
    panel.innerHTML = '<div class="no-clients">No plugin connected<br><span style="color:var(--fg-dim)">Open Noche plugin in Figma</span></div>';
    return;
  }
  panel.innerHTML = clients.map(c =>
    '<div class="client-item">' +
    '<span class="client-dot"></span>' +
    '<span class="client-name" title="' + escH(c.file) + '">' + escH(c.file) + '</span>' +
    '<span class="client-meta">' + escH(c.editor) + '</span>' +
    '</div>'
  ).join('');
}

function updateClients() {
  fetch('/api/status').then(r => r.json()).then(s => {
    if (s.clients) renderClients(s.clients);
  }).catch(() => {});
}

// ── Actions ────────────────────────────────
function runAction(action) {
  const btn = document.getElementById('btn-' + action);
  if (btn) btn.classList.add('running');

  fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  }).then(r => r.json()).then(res => {
    if (res.error) addFeed('err', 'ACTION ' + action + ' — ' + res.error);
    clearRunning(action);
  }).catch(err => {
    addFeed('err', 'ACTION ' + action + ' — ' + err.message);
    clearRunning(action);
  });
}

function clearRunning(action) {
  const btn = document.getElementById('btn-' + action);
  if (btn) btn.classList.remove('running');
}

// ── Feed helpers ───────────────────────────
const ICONS = { ok:'+', err:'✗', warn:'!', info:'·', dim:'·' };

function addFeed(level, msg, detail) {
  eventCount++;
  document.getElementById('statEvents').textContent = eventCount;
  const feed = document.getElementById('feed');
  const now = new Date();
  const ts = now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const entry = document.createElement('div');
  entry.className = 'feed-entry';
  let html = '<span class="feed-ts">' + ts + '</span>';
  html += '<span class="feed-icon ' + level + '">' + ICONS[level] + '</span>';
  html += '<span class="feed-msg">' + escH(msg) + '</span>';
  if (detail) {
    const json = JSON.stringify(detail, null, 2);
    const size = json.length;
    html += '<span class="feed-size">' + sizeLbl(size) + '</span>';
    entry.innerHTML = html;
    const d = document.createElement('div');
    d.className = 'feed-detail collapsed';
    d.textContent = json;
    d.onclick = () => d.classList.toggle('collapsed');
    entry.querySelector('.feed-msg').after(d);
  } else {
    entry.innerHTML = html;
  }
  feed.appendChild(entry);
  feed.scrollTop = feed.scrollHeight;
}

// ── Setup wizard ───────────────────────────
function toggleStep(id) {
  const el = document.getElementById(id);
  if (el.classList.contains('active')) return; // already open
  ['step1','step2','step3'].forEach(s => {
    const se = document.getElementById(s);
    if (se && !se.classList.contains('done')) se.classList.remove('active');
  });
  if (!el.classList.contains('done')) el.classList.add('active');
}

function saveToken() {
  const val = document.getElementById('tokenInput').value.trim();
  if (!val) { alert('Please enter a token.'); return; }
  fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'FIGMA_TOKEN', value: val })
  }).then(r => r.json()).then(res => {
    if (res.ok) {
      document.getElementById('step1').className = 'setup-step done';
      document.getElementById('step1status').textContent = '✓ Saved';
      document.getElementById('step1success').style.display = 'block';
      document.getElementById('ss1').className = 'step-num done';
      setTimeout(() => {
        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');
      }, 800);
    } else {
      alert('Failed: ' + (res.error || 'unknown error'));
    }
  }).catch(err => alert('Error: ' + err.message));
}

function saveFileKey() {
  const raw = document.getElementById('fileKeyInput').value.trim();
  if (!raw) { alert('Please enter a file URL or key.'); return; }
  const match = raw.match(/figma\\.com\\/(?:design|file)\\/([^/?]+)/);
  const key = match ? match[1] : raw;
  fetch('/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'FIGMA_FILE_KEY', value: key })
  }).then(r => r.json()).then(res => {
    if (res.ok) {
      document.getElementById('step2').className = 'setup-step done';
      document.getElementById('step2status').textContent = '✓ ' + key;
      document.getElementById('step2success').style.display = 'block';
      document.getElementById('ss2').className = 'step-num done';
      setTimeout(() => {
        document.getElementById('step2').classList.remove('active');
        document.getElementById('step3').classList.add('active');
      }, 800);
    } else {
      alert('Failed: ' + (res.error || 'unknown'));
    }
  }).catch(err => alert('Error: ' + err.message));
}

// Load plugin manifest path on init
fetch('/api/status').then(r => r.json()).then(s => {
  if (s.pluginManifestPath) {
    document.getElementById('pluginPath').textContent = s.pluginManifestPath;
  }
}).catch(() => {});

// ── Compose ────────────────────────────────
function setCompose(text) {
  document.getElementById('composeInput').value = text;
  document.getElementById('composeInput').focus();
}

function runCompose() {
  const intent = document.getElementById('composeInput').value.trim();
  if (!intent) return;

  const btn = document.getElementById('composeRunBtn');
  btn.disabled = true;

  const id = 'compose-' + Date.now();
  const output = document.getElementById('composeOutput');

  // Remove placeholder
  const placeholder = output.querySelector('[data-placeholder]');
  if (placeholder) placeholder.remove();

  const card = document.createElement('div');
  card.className = 'compose-result';
  card.id = id;
  const now = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  card.innerHTML =
    '<div class="compose-result-head">' +
    '<span class="compose-result-intent">' + escH(intent) + '</span>' +
    '<span class="compose-result-ts">' + now + '</span>' +
    '<span class="compose-result-status running" id="' + id + '-status">RUNNING</span>' +
    '</div>' +
    '<div class="compose-result-body" id="' + id + '-body">Planning…</div>';
  output.prepend(card);

  fetch('/api/compose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent })
  }).then(r => r.json()).then(res => {
    const statusEl = document.getElementById(id + '-status');
    const bodyEl   = document.getElementById(id + '-body');
    if (res.error) {
      statusEl.className = 'compose-result-status err';
      statusEl.textContent = 'ERROR';
      bodyEl.textContent = res.error;
    } else {
      statusEl.className = 'compose-result-status ok';
      statusEl.textContent = 'DONE';
      bodyEl.textContent = res.summary || JSON.stringify(res, null, 2);
    }
    btn.disabled = false;
  }).catch(err => {
    const statusEl = document.getElementById(id + '-status');
    const bodyEl   = document.getElementById(id + '-body');
    statusEl.className = 'compose-result-status err';
    statusEl.textContent = 'ERROR';
    bodyEl.textContent = err.message;
    btn.disabled = false;
  });
}

function renderComposeResult(data) {
  const output = document.getElementById('composeOutput');
  const card = document.createElement('div');
  card.className = 'compose-result';
  const now = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  card.innerHTML =
    '<div class="compose-result-head">' +
    '<span class="compose-result-intent">' + escH(data.intent || 'compose') + '</span>' +
    '<span class="compose-result-ts">' + now + '</span>' +
    '<span class="compose-result-status ' + (data.error ? 'err' : 'ok') + '">' + (data.error ? 'ERROR' : 'DONE') + '</span>' +
    '</div>' +
    '<div class="compose-result-body">' + escH(data.summary || data.error || '') + '</div>';
  output.prepend(card);
}

// ── Tab switcher ───────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
  // Remove setup badge if switching away
  if (name !== 'setup') {
    const badge = document.querySelector('#tabSetup .tab-badge');
    if (badge) badge.remove();
  }
}

// ── Utilities ──────────────────────────────
function escH(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function sizeLbl(n) {
  return n > 1024 ? (n/1024).toFixed(1) + 'KB' : n + 'B';
}

function rgbHex(c) {
  const r = Math.round(c.r*255).toString(16).padStart(2,'0');
  const g = Math.round(c.g*255).toString(16).padStart(2,'0');
  const b = Math.round(c.b*255).toString(16).padStart(2,'0');
  return '#' + r + g + b;
}

// ── Boot ───────────────────────────────────
connectSSE();

// Auto-load cached design system from /api/data
fetch('/api/data').then(r => r.json()).then(payload => {
  const ds = payload.designSystem;
  const tree = payload.pageTree;

  if (ds) {
    if (ds.tokens?.length)     renderTokens({ collections: tokensToCollections(ds.tokens) });
    if (ds.components?.length) renderComponents(ds.components);
    if (ds.styles?.length)     renderStyles(ds.styles);
    addFeed('ok',
      'Design system loaded — ' +
      (ds.tokens?.length||0) + ' tokens · ' +
      (ds.components?.length||0) + ' components · ' +
      (ds.styles?.length||0) + ' styles'
    );
  }
  if (tree?.length) {
    renderTree({ pages: tree.map(p => ({ name: p.name, children: p.frames || [] })) });
    addFeed('info', 'Page tree loaded — ' + tree.length + ' pages');
  }
}).catch(() => {});

// Convert flat DesignToken[] → collections shape for renderTokens
function tokensToCollections(tokens) {
  const map = {};
  for (const t of tokens) {
    const col = t.collection || 'default';
    if (!map[col]) map[col] = { name: col, variables: [] };
    const firstVal = Object.values(t.values || {})[0];
    map[col].variables.push({
      name: t.name,
      resolvedType: t.type === 'color' ? 'COLOR' : 'FLOAT',
      valuesByMode: { default: firstVal },
    });
  }
  return Object.values(map);
}
</script>
</body>
</html>`;
}
