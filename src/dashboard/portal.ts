/**
 * Agent Portal HTML Generator — Live dashboard for Mémoire.
 *
 * AgenticUI aesthetic: monospace, dark, terminal-paper feel.
 * Connects via SSE to receive real-time events from the bridge.
 * Can trigger Figma actions via POST /api/action.
 */

interface PortalConfig {
  bridgePort: number;
  bridgeClients: { id: string; file: string; editor: string; connectedAt: string }[];
  dashboardPort: number;
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
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mémoire Agent Portal</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --bg-card: #111111;
  --bg-hover: #1a1a1a;
  --bg-active: #1e1e1e;
  --fg: #e0e0e0;
  --fg-muted: #666666;
  --fg-dim: #444444;
  --border: #222222;
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

/* ── Header ──────────────────────────────── */
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  position: sticky;
  top: 0;
  z-index: 10;
}

.hdr-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hdr-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.hdr-title span { color: var(--accent-bright); }

.conn-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 2px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.conn-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fg-dim);
}

.conn-badge.live .dot { background: var(--green); box-shadow: 0 0 4px var(--green); }
.conn-badge.live { border-color: var(--green-dim); color: var(--green); }

.hdr-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.hdr-right .port { color: var(--accent-bright); font-weight: 700; }

/* ── Layout ──────────────────────────────── */
.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: calc(100vh - 50px);
}

/* ── Sidebar ─────────────────────────────── */
.sidebar {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}

.sidebar-section {
  padding: 14px 16px 8px;
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
  border-bottom: 1px solid #191919;
  background: none;
  color: var(--fg);
  font-family: var(--mono);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.1s;
}

.action-btn:hover { background: var(--bg-hover); }
.action-btn:active { background: var(--bg-active); }

.action-btn .label {
  font-weight: 600;
  letter-spacing: 0.5px;
}

.action-btn .desc {
  font-size: 10px;
  color: var(--fg-muted);
}

.action-btn.running {
  color: var(--yellow);
}

.action-btn.running .spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Figma Clients ───────────────────────── */
.clients {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.client-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 10px;
}

.client-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--green);
  flex-shrink: 0;
}

.client-name { color: var(--fg); font-weight: 600; }
.client-meta { color: var(--fg-muted); }

.no-clients {
  padding: 16px;
  font-size: 10px;
  color: var(--fg-muted);
  text-align: center;
  line-height: 1.8;
}

/* ── Main Panel ──────────────────────────── */
.main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Tabs ────────────────────────────────── */
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}

.tab {
  padding: 10px 20px;
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
}

.tab:hover { color: var(--fg); }
.tab.active { color: var(--accent-bright); border-bottom-color: var(--accent-bright); }

/* ── Panels ──────────────────────────────── */
.panel {
  display: none;
  flex: 1;
  overflow: auto;
}

.panel.active { display: flex; flex-direction: column; }

/* ── Event Feed ──────────────────────────── */
.feed {
  flex: 1;
  overflow-y: auto;
  padding: 0;
  font-size: 11px;
}

.feed-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 20px;
  border-bottom: 1px solid #151515;
  transition: background 0.1s;
}

.feed-entry:hover { background: var(--bg-hover); }

.feed-ts {
  color: var(--fg-dim);
  font-size: 10px;
  flex-shrink: 0;
  min-width: 65px;
}

.feed-icon {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-weight: 700;
}

.feed-icon.ok { color: var(--green); }
.feed-icon.err { color: var(--red); }
.feed-icon.warn { color: var(--yellow); }
.feed-icon.info { color: var(--blue); }
.feed-icon.dim { color: var(--fg-dim); }

.feed-msg { flex: 1; word-break: break-word; }

.feed-detail {
  margin-top: 4px;
  padding: 6px 10px;
  background: var(--bg);
  border-radius: 2px;
  font-size: 10px;
  color: var(--fg-muted);
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  cursor: pointer;
}

.feed-detail.collapsed {
  max-height: 40px;
  overflow: hidden;
  position: relative;
}

.feed-detail.collapsed::after {
  content: '...click to expand';
  position: absolute;
  bottom: 0;
  right: 0;
  padding: 0 6px;
  background: var(--bg);
  color: var(--fg-dim);
  font-size: 9px;
}

.feed-size {
  flex-shrink: 0;
  font-size: 9px;
  color: var(--fg-dim);
  min-width: 50px;
  text-align: right;
}

/* ── Data Panel ──────────────────────────── */
.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
  padding: 20px;
}

.data-card {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-card);
  overflow: hidden;
}

.data-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.data-card-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.data-card-count {
  font-size: 10px;
  color: var(--fg-muted);
}

.data-card-body {
  padding: 12px 14px;
  font-size: 10px;
  max-height: 300px;
  overflow: auto;
}

.data-empty {
  color: var(--fg-dim);
  text-align: center;
  padding: 20px;
  font-size: 10px;
}

/* ── Token Swatch ────────────────────────── */
.token-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
}

.token-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.token-name { color: var(--accent); }
.token-val { color: var(--fg-muted); margin-left: auto; }

/* ── Component List ──────────────────────── */
.comp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.comp-name { font-weight: 600; }
.comp-variants { color: var(--fg-muted); margin-left: auto; font-size: 9px; }

/* ── Stats Bar ───────────────────────────── */
.stats-bar {
  display: flex;
  gap: 20px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  flex-shrink: 0;
}

.stats-bar .n { color: var(--accent-bright); font-weight: 700; margin-right: 3px; }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-title"><span>ARK</span> AGENT PORTAL</div>
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
  <!-- Sidebar: Actions + Clients -->
  <div class="sidebar">
    <div class="sidebar-section">FIGMA CONNECTION</div>
    <div id="clientsPanel">
      ${config.bridgeClients.length > 0
        ? config.bridgeClients.map((c) => `
          <div class="clients">
            <div class="client-item">
              <span class="client-dot"></span>
              <span class="client-name">${esc(c.file)}</span>
              <span class="client-meta">${esc(c.editor)}</span>
            </div>
          </div>`).join("")
        : `<div class="no-clients">No Figma plugin connected<br>Run the plugin in Figma</div>`
      }
    </div>

    <div class="sidebar-section">DESIGN SYSTEM</div>
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

    <div class="sidebar-section">INSPECT</div>
    <button class="action-btn" onclick="runAction('inspect')" id="btn-inspect">
      <span class="label">SELECTION</span>
      <span class="desc">Current selection</span>
    </button>
    <button class="action-btn" onclick="runAction('page-tree')" id="btn-page-tree">
      <span class="label">PAGE TREE</span>
      <span class="desc">IA structure</span>
    </button>
    <button class="action-btn" onclick="runAction('stickies')" id="btn-stickies">
      <span class="label">STICKIES</span>
      <span class="desc">FigJam notes</span>
    </button>

    <div class="sidebar-section">SYNC</div>
    <button class="action-btn" onclick="runAction('full-sync')" id="btn-full-sync">
      <span class="label">FULL SYNC</span>
      <span class="desc">Tokens + components + styles</span>
    </button>
  </div>

  <!-- Main Panel -->
  <div class="main">
    <div class="tabs">
      <button class="tab active" onclick="switchTab('feed', this)">LIVE FEED</button>
      <button class="tab" onclick="switchTab('data', this)">DATA</button>
    </div>

    <div class="stats-bar" id="statsBar">
      <span><span class="n" id="statTokens">0</span>TOKENS</span>
      <span><span class="n" id="statComponents">0</span>COMPONENTS</span>
      <span><span class="n" id="statStyles">0</span>STYLES</span>
      <span><span class="n" id="statEvents">0</span>EVENTS</span>
    </div>

    <!-- Feed Panel -->
    <div class="panel active" id="panel-feed">
      <div class="feed" id="feed"></div>
    </div>

    <!-- Data Panel -->
    <div class="panel" id="panel-data">
      <div class="data-grid">
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Tokens</span>
            <span class="data-card-count" id="tokenCount">0</span>
          </div>
          <div class="data-card-body" id="tokenData">
            <div class="data-empty">Run TOKENS action to pull</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Components</span>
            <span class="data-card-count" id="compCount">0</span>
          </div>
          <div class="data-card-body" id="compData">
            <div class="data-empty">Run COMPONENTS action to pull</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Styles</span>
            <span class="data-card-count" id="styleCount">0</span>
          </div>
          <div class="data-card-body" id="styleData">
            <div class="data-empty">Run STYLES action to pull</div>
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
            <div class="data-empty">Run PAGE TREE action</div>
          </div>
        </div>
        <div class="data-card">
          <div class="data-card-head">
            <span class="data-card-title">Stickies</span>
            <span class="data-card-count" id="stickyCount">0</span>
          </div>
          <div class="data-card-body" id="stickyData">
            <div class="data-empty">Run STICKIES action</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
// ── State ────────────────────────────────────
let eventCount = 0;
let tokenCount = 0;
let compCount = 0;
let styleCount = 0;
const store = { tokens: null, components: null, styles: null, selection: null, tree: null, stickies: null };

// ── SSE Connection ───────────────────────────
let evtSource = null;
let reconnectTimer = null;

function connectSSE() {
  evtSource = new EventSource('/events');

  evtSource.onopen = () => {
    setBadge('live', 'CONNECTED');
    addFeed('ok', 'Portal connected to Mémoire bridge');
  };

  evtSource.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleEvent(msg);
    } catch {}
  };

  evtSource.onerror = () => {
    setBadge('dead', 'DISCONNECTED');
    evtSource.close();
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, 3000);
  };
}

function setBadge(state, text) {
  const badge = document.getElementById('connBadge');
  const label = document.getElementById('connLabel');
  badge.className = 'conn-badge ' + state;
  label.textContent = text;
}

// ── Event Handler ────────────────────────────
function handleEvent(msg) {
  const { type, data, ts } = msg;

  switch (type) {
    case 'init': {
      if (data.status.clients && data.status.clients.length > 0) {
        renderClients(data.status.clients);
      }
      if (data.recentEvents) {
        for (const evt of data.recentEvents) {
          handleEvent({ type: evt.type, data: evt.data, ts: evt.ts });
        }
      }
      break;
    }

    case 'action-result': {
      const { action, result, error } = data;
      if (error) {
        addFeed('err', 'ACTION ' + action + ' failed: ' + error);
      } else {
        const size = result ? JSON.stringify(result).length : 0;
        addFeed('ok', 'ACTION ' + action + ' — ' + sizeLabel(size), result);
        storeActionResult(action, result);
      }
      clearRunning(action);
      break;
    }

    case 'sync-data': {
      const { part, result, error } = data;
      if (error) {
        addFeed('err', 'SYNC ' + part + ' failed: ' + error);
      } else {
        const size = result ? JSON.stringify(result).length : 0;
        addFeed('ok', 'SYNC ' + part + ' — ' + sizeLabel(size), result);
        storeSyncResult(part, result);
      }
      break;
    }

    case 'selection': {
      const nodes = data.nodes || [];
      if (nodes.length > 0) {
        const names = nodes.map(n => n.name).join(', ');
        addFeed('info', 'SELECTION ' + nodes.length + ' node' + (nodes.length > 1 ? 's' : '') + ' — ' + names);
        store.selection = nodes;
        renderSelection(nodes);
      }
      break;
    }

    case 'page-changed': {
      addFeed('info', 'PAGE → ' + (data.page || 'unknown'));
      break;
    }

    case 'document-changed': {
      const count = data.changes || 0;
      addFeed('dim', 'DOC CHANGE — ' + count + ' change' + (count !== 1 ? 's' : ''));
      break;
    }

    case 'plugin-connected': {
      addFeed('ok', 'Plugin connected: ' + (data.file || data.id));
      updateClients();
      break;
    }

    case 'plugin-disconnected': {
      addFeed('warn', 'Plugin disconnected');
      updateClients();
      break;
    }

    case 'chat': {
      addFeed('info', '[' + (data.from || 'figma') + '] ' + data.text);
      break;
    }

    case 'event': {
      const level = data.type === 'success' ? 'ok' : data.type === 'error' ? 'err' : data.type === 'warn' ? 'warn' : 'info';
      addFeed(level, data.message);
      break;
    }
  }
}

// ── Store Action Results ─────────────────────
function storeActionResult(action, result) {
  if (action === 'pull-tokens' && result) {
    store.tokens = result;
    renderTokens(result);
  } else if (action === 'pull-components' && result) {
    store.components = result;
    renderComponents(result);
  } else if (action === 'pull-styles' && result) {
    store.styles = result;
    renderStyles(result);
  } else if (action === 'stickies' && result) {
    store.stickies = result;
    renderStickies(result);
  } else if (action === 'page-tree' && result) {
    store.tree = result;
    renderTree(result);
  } else if (action === 'inspect' && result) {
    const nodes = result.nodes || (Array.isArray(result) ? result : []);
    store.selection = nodes;
    renderSelection(nodes);
  }
}

function storeSyncResult(part, result) {
  if (part === 'tokens' && result) { store.tokens = result; renderTokens(result); }
  if (part === 'components' && result) { store.components = result; renderComponents(result); }
  if (part === 'styles' && result) { store.styles = result; renderStyles(result); }
}

// ── Renderers ────────────────────────────────
function renderTokens(data) {
  const collections = data.collections || [];
  let count = 0;
  let html = '';
  for (const col of collections) {
    for (const v of (col.variables || [])) {
      count++;
      const val = v.valuesByMode ? Object.values(v.valuesByMode)[0] : '';
      const isColor = v.resolvedType === 'COLOR' && typeof val === 'object' && val && 'r' in val;
      const colorHex = isColor ? rgbHex(val) : null;
      html += '<div class="token-row">';
      if (colorHex) {
        html += '<span class="token-swatch" style="background:' + colorHex + '"></span>';
      }
      html += '<span class="token-name">' + escH(v.name) + '</span>';
      html += '<span class="token-val">' + escH(colorHex || String(val ?? '')) + '</span>';
      html += '</div>';
    }
  }
  document.getElementById('tokenData').innerHTML = html || '<div class="data-empty">No tokens found</div>';
  document.getElementById('tokenCount').textContent = count;
  document.getElementById('statTokens').textContent = count;
  tokenCount = count;
}

function renderComponents(data) {
  const comps = Array.isArray(data) ? data : [];
  let html = '';
  for (const c of comps) {
    html += '<div class="comp-row">';
    html += '<span class="comp-name">' + escH(c.name) + '</span>';
    const vCount = c.variants ? c.variants.length : 0;
    if (vCount > 0) html += '<span class="comp-variants">' + vCount + ' variant' + (vCount > 1 ? 's' : '') + '</span>';
    html += '</div>';
  }
  document.getElementById('compData').innerHTML = html || '<div class="data-empty">No components found</div>';
  document.getElementById('compCount').textContent = comps.length;
  document.getElementById('statComponents').textContent = comps.length;
  compCount = comps.length;
}

function renderStyles(data) {
  const styles = Array.isArray(data) ? data : [];
  let html = '';
  for (const s of styles) {
    html += '<div class="comp-row">';
    html += '<span class="comp-name">' + escH(s.name) + '</span>';
    html += '<span class="comp-variants">' + (s.styleType || s.type || '') + '</span>';
    html += '</div>';
  }
  document.getElementById('styleData').innerHTML = html || '<div class="data-empty">No styles found</div>';
  document.getElementById('styleCount').textContent = styles.length;
  document.getElementById('statStyles').textContent = styles.length;
  styleCount = styles.length;
}

function renderSelection(nodes) {
  let html = '';
  for (const n of nodes) {
    html += '<div class="comp-row">';
    html += '<span class="comp-name">' + escH(n.name) + '</span>';
    html += '<span class="comp-variants">' + (n.type || '') + '</span>';
    html += '</div>';
  }
  document.getElementById('selData').innerHTML = html || '<div class="data-empty">Nothing selected</div>';
  document.getElementById('selCount').textContent = nodes.length;
}

function renderStickies(data) {
  const stickies = Array.isArray(data) ? data : [];
  let html = '';
  for (const s of stickies) {
    html += '<div class="comp-row">';
    html += '<span class="comp-name">' + escH(s.text ? s.text.slice(0, 60) : s.id) + '</span>';
    html += '</div>';
  }
  document.getElementById('stickyData').innerHTML = html || '<div class="data-empty">No stickies found</div>';
  document.getElementById('stickyCount').textContent = stickies.length;
}

function renderTree(data) {
  const pages = data.pages || [];
  let html = '';
  let nodeCount = 0;
  for (const page of pages) {
    html += '<div class="comp-row"><span class="comp-name">' + escH(page.name) + '</span><span class="comp-variants">PAGE</span></div>';
    nodeCount++;
    for (const child of (page.children || [])) {
      html += '<div class="comp-row" style="padding-left:14px"><span class="comp-name" style="color:var(--fg-muted)">' + escH(child.name) + '</span><span class="comp-variants">' + (child.type || '') + '</span></div>';
      nodeCount++;
    }
  }
  document.getElementById('treeData').innerHTML = html || '<div class="data-empty">No pages found</div>';
  document.getElementById('treeCount').textContent = nodeCount;
}

function renderClients(clients) {
  const el = document.getElementById('clientsPanel');
  if (!clients || clients.length === 0) {
    el.innerHTML = '<div class="no-clients">No Figma plugin connected<br>Run the plugin in Figma</div>';
    return;
  }
  let html = '<div class="clients">';
  for (const c of clients) {
    html += '<div class="client-item"><span class="client-dot"></span><span class="client-name">' + escH(c.file) + '</span><span class="client-meta">' + escH(c.editor) + '</span></div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

async function updateClients() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    renderClients(data.clients);
  } catch {}
}

// ── Actions ──────────────────────────────────
async function runAction(action) {
  const btnId = 'btn-' + action;
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.add('running');
    btn.disabled = true;
  }

  addFeed('info', 'Running: ' + action);

  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      addFeed('err', action + ' failed: ' + (data.error || 'Unknown error'));
    } else {
      const size = data.result ? JSON.stringify(data.result).length : 0;
      addFeed('ok', action + ' complete — ' + sizeLabel(size), data.result);

      // For full-sync the response has tokens, components, styles directly
      if (action === 'full-sync') {
        if (data.tokens) { store.tokens = data.tokens; renderTokens(data.tokens); }
        if (data.components) { store.components = data.components; renderComponents(data.components); }
        if (data.styles) { store.styles = data.styles; renderStyles(data.styles); }
      } else {
        storeActionResult(action, data.result);
      }
    }
  } catch (err) {
    addFeed('err', action + ' error: ' + err.message);
  }

  clearRunning(action);
}

function clearRunning(action) {
  // Map action-result actions back to button IDs
  const map = {
    'pull-tokens': 'btn-pull-tokens',
    'pull-components': 'btn-pull-components',
    'pull-styles': 'btn-pull-styles',
    'stickies': 'btn-stickies',
    'inspect': 'btn-inspect',
    'selection-info': 'btn-inspect',
    'page-tree': 'btn-page-tree',
    'full-sync': 'btn-full-sync',
  };
  const btnId = map[action] || ('btn-' + action);
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.remove('running');
    btn.disabled = false;
  }
}

// ── Feed ─────────────────────────────────────
function addFeed(level, msg, detail) {
  eventCount++;
  document.getElementById('statEvents').textContent = eventCount;

  const feed = document.getElementById('feed');
  const wasAtBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;

  const icons = { ok: '+', err: '✗', warn: '!', info: '·', dim: '·' };
  const entry = document.createElement('div');
  entry.className = 'feed-entry';

  let html =
    '<span class="feed-ts">' + timeStr() + '</span>' +
    '<span class="feed-icon ' + level + '">' + (icons[level] || '·') + '</span>' +
    '<span class="feed-msg">' + escH(msg);

  if (detail) {
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail);
    const size = detailStr.length;
    if (size > 100) {
      html += '<div class="feed-detail collapsed" onclick="this.classList.toggle(\\'collapsed\\')">' + escH(detailStr) + '</div>';
    }
    html += '</span><span class="feed-size">' + sizeLabel(size) + '</span>';
  } else {
    html += '</span>';
  }

  entry.innerHTML = html;
  feed.appendChild(entry);

  if (wasAtBottom) {
    requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
  }

  while (feed.children.length > 500) feed.removeChild(feed.firstChild);
}

// ── Tabs ─────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
}

// ── Helpers ──────────────────────────────────
function escH(s) {
  if (typeof s !== 'string') s = String(s ?? '');
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function sizeLabel(bytes) {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + 'MB';
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return bytes + 'B';
}

function rgbHex(c) {
  if (!c || typeof c.r !== 'number') return null;
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b;
}

// ── Init ─────────────────────────────────────
connectSSE();
addFeed('info', 'Mémoire Agent Portal starting...');
</script>
</body>
</html>`;
}
