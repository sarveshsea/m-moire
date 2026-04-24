// ── State ──────────────────────────────────
const API_BASE = window.location.origin;
let ws = null;
let currentEdit = null;
let agentLogVisible = false;
let figmaControlState = createEmptyFigmaControlState();

// ── WebSocket Connection ───────────────────
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);

  ws.onopen = () => {
    console.log('[Memoire] WebSocket connected');
    ws.send(JSON.stringify({ type: 'request-state' }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    } catch (err) {
      console.warn('[Memoire] Invalid WebSocket message:', err);
    }
  };

  ws.onclose = () => {
    console.log('[Memoire] WebSocket disconnected, reconnecting...');
    setTimeout(connectWs, 2000);
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'design-system-updated':
      if (msg.data && msg.data.action === 'token-updated') {
        showToast('Token updated: ' + (msg.data.token?.name || ''), 'success');
      }
      checkFigmaStatus();
      break;
    case 'spec-updated':
      showToast('Spec updated: ' + (msg.data?.spec?.name || ''), 'success');
      checkFigmaStatus();
      break;
    case 'figma-synced':
      showToast('Synced to Figma: ' + (msg.data?.token || msg.data?.scope || ''), 'synced');
      checkFigmaStatus();
      break;
    case 'agent-status':
      updateAgentLog(msg.data?.task);
      checkFigmaStatus();
      break;
    case 'agent-result':
      updateAgentLog(msg.data?.task);
      if (msg.data?.task?.status === 'completed') {
        showToast('Agent completed: ' + (msg.data.task.intent || ''), 'success');
      } else if (msg.data?.task?.status === 'failed') {
        showToast('Agent failed: ' + (msg.data.task.error || ''), 'error');
      }
      checkFigmaStatus();
      break;
    case 'reload':
      showToast('Code updated — reloading...', 'success');
      setTimeout(() => location.reload(), 500);
      break;
    case 'error':
      showToast(msg.data?.message || 'Error', 'error');
      break;
  }
}

// ── Filter ─────────────────────────────────
function filter(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.card').forEach(card => {
    card.style.display = (type === 'all' || card.dataset.type === type) ? '' : 'none';
  });
}

// ── Section Tabs ──────────────────────
function showSection(id, link) {
  document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.hdr-nav-link').forEach(l => l.classList.remove('active'));
  const panel = document.getElementById('section-' + id);
  if (panel) panel.classList.add('active');
  if (link) link.classList.add('active');
  // Show grid inside specs section when active
  if (id === 'specs') {
    const grid = document.getElementById('grid');
    if (grid) grid.style.display = '';
  }
}

// ── Research Sub-Panels ──────────────────────
function showResPanel(id, btn) {
  document.querySelectorAll('.res-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.res-nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('res-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function toggleEvidence(idx) {
  const el = document.getElementById('ev-' + idx);
  if (!el) return;
  const isOpen = el.style.display === 'block';
  el.style.display = isOpen ? 'none' : 'block';
}

function filterInsights(conf, btn) {
  document.querySelectorAll('#res-insights .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.res-insight').forEach(card => {
    if (conf === 'all') {
      card.style.display = '';
    } else {
      card.style.display = card.dataset.conf === conf ? '' : 'none';
    }
  });
}

// ── Specs Sub-Panels ──────────────────────────
function showSpecPanel(id, btn) {
  document.querySelectorAll('.spec-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#section-specs .res-nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('spec-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function toggleSpec(headEl) {
  const body = headEl.nextElementSibling;
  if (!body) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  const arrow = headEl.querySelector('.spec-arrow');
  if (arrow) arrow.textContent = isOpen ? '>' : 'v';
}

// ── Command Palette ────────────────────────
function openPalette() {
  document.getElementById('cmd-palette').classList.remove('hidden');
  const input = document.getElementById('cmd-input');
  input.value = '';
  input.focus();
}

function closePalette() {
  document.getElementById('cmd-palette').classList.add('hidden');
  document.getElementById('cmd-status').classList.add('hidden');
}

async function runAgent(intent) {
  if (!intent) intent = document.getElementById('cmd-input').value.trim();
  if (!intent) return;

  const status = document.getElementById('cmd-status');
  status.classList.remove('hidden');
  status.innerHTML = '<span style="color:var(--warn)">&#9670;</span> Running agent: ' + escHtml(intent) + '...';

  // Show agent log
  if (!agentLogVisible) toggleAgentLog();

  try {
    const res = await fetch(API_BASE + '/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: intent,
        options: { autoSync: true }
      })
    });
    const data = await res.json();
    if (data.task) {
      status.innerHTML = '<span style="color:#4ade80">&#10003;</span> Agent started: ' + escHtml(data.task.id);
      setTimeout(closePalette, 1500);
    } else {
      status.innerHTML = '<span style="color:var(--error)">&#10007;</span> ' + escHtml(data.error || 'Failed to start agent');
    }
  } catch (err) {
    status.innerHTML = '<span style="color:var(--error)">&#10007;</span> ' + escHtml(err.message || 'Unknown error');
  }
}

// ── Edit Panel ─────────────────────────────
function openEditPanel(type, name, data) {
  currentEdit = { type, name, data };
  const panel = document.getElementById('edit-panel');
  const title = document.getElementById('edit-title');
  const body = document.getElementById('edit-body');

  panel.classList.remove('hidden');

  if (type === 'token') {
    title.textContent = 'Edit Token: ' + name;
    body.innerHTML = buildTokenEditForm(data);
  } else if (type === 'spec') {
    title.textContent = 'Edit Spec: ' + name;
    body.innerHTML = buildSpecEditForm(data);
  }
}

function closeEditPanel() {
  document.getElementById('edit-panel').classList.add('hidden');
  currentEdit = null;
}

function buildTokenEditForm(token) {
  const modeEntries = Object.entries(token.values || {});
  let html = '<div class="edit-field"><label class="edit-label">Name</label><input class="edit-input" id="edit-token-name" value="' + escAttr(token.name) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Type</label><input class="edit-input" value="' + escAttr(token.type) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Collection</label><input class="edit-input" value="' + escAttr(token.collection) + '" readonly /></div>';

  for (const [mode, val] of modeEntries) {
    const strVal = String(val);
    if (token.type === 'color' && /^#[0-9a-fA-F]{3,8}$/.test(strVal)) {
      html += '<div class="edit-field"><label class="edit-label">Value (' + escHtml(mode) + ')</label>';
      html += '<div class="edit-color-row">';
      html += '<input type="color" class="edit-color-swatch" value="' + escAttr(strVal) + '" oninput="this.nextElementSibling.value=this.value" />';
      html += '<input class="edit-input edit-color-input" data-mode="' + escAttr(mode) + '" value="' + escAttr(strVal) + '" oninput="this.previousElementSibling.value=this.value" />';
      html += '</div></div>';
    } else {
      html += '<div class="edit-field"><label class="edit-label">Value (' + escHtml(mode) + ')</label>';
      html += '<input class="edit-input" data-mode="' + escAttr(mode) + '" value="' + escAttr(strVal) + '" /></div>';
    }
  }

  html += '<div class="edit-field"><label class="edit-label">CSS Variable</label><input class="edit-input" value="' + escAttr(token.cssVariable || '') + '" readonly /></div>';
  return html;
}

function buildSpecEditForm(spec) {
  let html = '<div class="edit-field"><label class="edit-label">Name</label><input class="edit-input" value="' + escAttr(spec.name) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Type</label><input class="edit-input" value="' + escAttr(spec.type) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Purpose</label><textarea class="edit-input" id="edit-spec-purpose" rows="3">' + escHtml(spec.purpose) + '</textarea></div>';

  if (spec.type === 'component') {
    html += '<div class="edit-field"><label class="edit-label">Variants (comma-separated)</label><input class="edit-input" id="edit-spec-variants" value="' + escAttr((spec.variants || []).join(', ')) + '" /></div>';
    html += '<div class="edit-field"><label class="edit-label">shadcn Base (comma-separated)</label><input class="edit-input" id="edit-spec-shadcn" value="' + escAttr((spec.shadcnBase || []).join(', ')) + '" /></div>';
    html += '<div class="edit-field"><label class="edit-label">Props (JSON)</label><textarea class="edit-input" id="edit-spec-props" rows="5">' + escHtml(JSON.stringify(spec.props || {}, null, 2)) + '</textarea></div>';
  }

  if (spec.type === 'page') {
    html += '<div class="edit-field"><label class="edit-label">Layout</label><select class="edit-input" id="edit-spec-layout">';
    for (const l of ['sidebar-main','full-width','centered','dashboard','split','marketing']) {
      html += '<option' + (spec.layout === l ? ' selected' : '') + '>' + l + '</option>';
    }
    html += '</select></div>';
  }

  if (spec.type === 'dataviz') {
    html += '<div class="edit-field"><label class="edit-label">Chart Type</label><select class="edit-input" id="edit-spec-charttype">';
    for (const ct of ['line','bar','area','pie','donut','scatter','radar','composed']) {
      html += '<option' + (spec.chartType === ct ? ' selected' : '') + '>' + ct + '</option>';
    }
    html += '</select></div>';
  }

  html += '<div class="edit-field"><label class="edit-label">Tags (comma-separated)</label><input class="edit-input" id="edit-spec-tags" value="' + escAttr((spec.tags || []).join(', ')) + '" /></div>';
  return html;
}

async function saveEdit() {
  if (!currentEdit) return;

  try {
    if (currentEdit.type === 'token') {
      const token = { ...currentEdit.data };
      // Collect updated values from form
      const modeInputs = document.querySelectorAll('#edit-body [data-mode]');
      for (const input of modeInputs) {
        const mode = input.dataset.mode;
        if (mode && Object.hasOwn(token.values, mode)) {
          token.values[mode] = input.value;
        }
      }
      const res = await fetch(API_BASE + '/api/tokens', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Token saved & syncing to Figma...', 'success');
        closeEditPanel();
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } else if (currentEdit.type === 'spec') {
      const spec = { ...currentEdit.data };
      const purposeEl = document.getElementById('edit-spec-purpose');
      if (purposeEl) spec.purpose = purposeEl.value;

      if (spec.type === 'component') {
        const variantsEl = document.getElementById('edit-spec-variants');
        if (variantsEl) spec.variants = variantsEl.value.split(',').map(s => s.trim()).filter(Boolean);
        const shadcnEl = document.getElementById('edit-spec-shadcn');
        if (shadcnEl) spec.shadcnBase = shadcnEl.value.split(',').map(s => s.trim()).filter(Boolean);
        const propsEl = document.getElementById('edit-spec-props');
        if (propsEl) { try { spec.props = JSON.parse(propsEl.value); } catch { showToast('Invalid JSON in Props field', 'error'); return; } }
      }
      if (spec.type === 'page') {
        const layoutEl = document.getElementById('edit-spec-layout');
        if (layoutEl) spec.layout = layoutEl.value;
      }
      if (spec.type === 'dataviz') {
        const ctEl = document.getElementById('edit-spec-charttype');
        if (ctEl) spec.chartType = ctEl.value;
      }
      const tagsEl = document.getElementById('edit-spec-tags');
      if (tagsEl) spec.tags = tagsEl.value.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(API_BASE + '/api/specs/' + encodeURIComponent(spec.name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Spec saved!', 'success');
        closeEditPanel();
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Toast ──────────────────────────────────
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Agent Log ──────────────────────────────
function toggleAgentLog() {
  const log = document.getElementById('agent-log');
  const btn = document.getElementById('agent-log-toggle');
  agentLogVisible = !agentLogVisible;
  log.classList.toggle('hidden', !agentLogVisible);
  btn.style.display = agentLogVisible ? 'none' : '';
}

var conflictsPanelVisible = false;

function toggleConflictsPanel() {
  const panel = document.getElementById('conflicts-panel');
  const btn = document.getElementById('conflicts-toggle');
  conflictsPanelVisible = !conflictsPanelVisible;
  panel.classList.toggle('hidden', !conflictsPanelVisible);
  btn.style.display = conflictsPanelVisible ? 'none' : '';
}

function renderConflicts(syncState) {
  const btn = document.getElementById('conflicts-toggle');
  const countEl = document.getElementById('conflicts-count');
  const body = document.getElementById('conflicts-body');

  if (!syncState || !syncState.conflicts || syncState.conflicts.length === 0) {
    btn.classList.add('hidden');
    body.innerHTML = '<div class="conflicts-empty">No unresolved conflicts</div>';
    return;
  }

  btn.classList.remove('hidden');
  countEl.textContent = String(syncState.conflictCount || syncState.conflicts.length);

  body.innerHTML = syncState.conflicts.map(function(c) {
    var figHash = (c.figmaHash || '').slice(0, 8);
    var codeHash = (c.codeHash || '').slice(0, 8);
    return '<div class="conflict-row">' +
      '<div>' +
        '<div class="conflict-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="conflict-detail">' + c.entityType + ' / figma:' + figHash + ' vs code:' + codeHash + '</div>' +
      '</div>' +
      '<div class="conflict-actions">' +
        '<button class="conflict-btn figma" onclick="resolveConflict(\'' + escapeHtml(c.name) + '\',\'figma-wins\')">Figma wins</button>' +
        '<button class="conflict-btn code" onclick="resolveConflict(\'' + escapeHtml(c.name) + '\',\'code-wins\')">Code wins</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function resolveConflict(name, resolution) {
  try {
    await fetch(API_BASE + '/api/sync/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, resolution: resolution }),
    });
    checkFigmaStatus();
  } catch (err) {
    addLog('error', 'Failed to resolve conflict: ' + err.message);
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var researchPanelVisible = false;

function toggleResearchPanel() {
  var panel = document.getElementById('research-panel');
  var btn = document.getElementById('research-toggle');
  researchPanelVisible = !researchPanelVisible;
  panel.classList.toggle('hidden', !researchPanelVisible);
  btn.style.display = researchPanelVisible ? 'none' : '';
  if (researchPanelVisible) fetchResearch();
}

async function fetchResearch() {
  try {
    var res = await fetch(API_BASE + '/api/research');
    if (!res.ok) return;
    var data = await res.json();
    renderResearchPanel(data);
  } catch {
    // silent
  }
}

function renderResearchPanel(data) {
  var body = document.getElementById('research-panel-body');
  var findings = data && (data.findings || data.insights) || [];
  if (!data || (!findings?.length && !data.personas?.length && !data.themes?.length)) {
    body.innerHTML = '<div class="research-empty">No research data. Run: memi research from-file &lt;file&gt;</div>';
    return;
  }

  var html = '';

  // Coverage bar
  if (data.coverage) {
    var pct = Math.round(data.coverage.ratio * 100);
    html += '<div class="research-coverage">' +
      '<span>Coverage: ' + data.coverage.covered + '/' + data.coverage.total + ' specs (' + pct + '%)</span>' +
      '<div class="research-bar"><div class="research-bar-fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  // Findings
  if (findings?.length) {
    html += '<div class="research-section">FINDINGS (' + findings.length + ')</div>';
    for (var i = 0; i < Math.min(findings.length, 10); i++) {
      var ins = findings[i];
      var tags = (ins.tags || []).slice(0, 3).map(function(t) { return '<span class="research-tag">' + escapeHtml(t) + '</span>'; }).join('');
      html += '<div class="research-item">' +
        '<div style="color:var(--fg)">' + escapeHtml(ins.statement || ins.finding) + '</div>' +
        '<div style="margin-top:2px">' + tags + ' <span style="color:var(--fg-dim)">' + ins.confidence + '</span></div>' +
      '</div>';
    }
    if (findings.length > 10) {
      html += '<div class="research-item" style="color:var(--fg-dim)">... and ' + (findings.length - 10) + ' more</div>';
    }
  }

  // Personas
  if (data.personas?.length) {
    html += '<div class="research-section">PERSONAS (' + data.personas.length + ')</div>';
    for (var p = 0; p < data.personas.length; p++) {
      var persona = data.personas[p];
      html += '<div class="research-item">' +
        '<div style="color:var(--fg);font-weight:500">' + escapeHtml(persona.name) + ' <span style="font-weight:400;color:var(--fg-dim)">' + escapeHtml(persona.role || '') + '</span></div>' +
        '<div style="color:var(--fg-dim);margin-top:2px">Goals: ' + (persona.goals || []).join(', ') + '</div>' +
      '</div>';
    }
  }

  // Themes
  if (data.themes?.length) {
    html += '<div class="research-section">THEMES (' + data.themes.length + ')</div>';
    for (var t = 0; t < Math.min(data.themes.length, 8); t++) {
      var theme = data.themes[t];
      html += '<div class="research-item">' + escapeHtml(theme.name) + ' <span style="color:var(--fg-dim)">(' + (theme.findingIds?.length || theme.insightIds?.length || 0) + ' findings)</span></div>';
    }
  }

  body.innerHTML = html;
}

function updateAgentLog(task) {
  if (!task) return;
  const body = document.getElementById('agent-log-body');
  let entry = document.getElementById('agent-task-' + task.id);
  if (!entry) {
    entry = document.createElement('div');
    entry.id = 'agent-task-' + task.id;
    entry.className = 'agent-log-entry';
    body.prepend(entry);
  }
  let html = '<div style="color:var(--accent);margin-bottom:4px;font-size:11px">' + escHtml(task.intent) + '</div>';
  for (const step of (task.steps || [])) {
    html += '<div style="padding-left:12px;font-size:10px"><span class="step-name">' + escHtml(step.name) + '</span>';
    html += '<span class="step-status ' + escAttr(step.status) + '">' + escHtml(step.status);
    if (step.detail) html += ' — ' + escHtml(step.detail);
    html += '</span></div>';
  }
  if (task.status === 'completed') html += '<div style="color:#4ade80;font-size:9px;margin-top:3px">&#10003; COMPLETED</div>';
  if (task.status === 'failed') html += '<div style="color:var(--error);font-size:9px;margin-top:3px">&#10007; FAILED: ' + escHtml(task.error || '') + '</div>';
  entry.innerHTML = html;
  body.scrollTop = 0;
}

// ── Figma Status ───────────────────────────
async function checkFigmaStatus() {
  try {
    const [statusPayload, jobsPayload, selectionPayload, agentsPayload, pipelinePayload, syncPayload, registryPayload] = await Promise.all([
      fetchJsonWithFallback(['/api/figma/status', '/api/status']),
      fetchJsonOptional('/api/figma/jobs', []),
      fetchJsonOptional('/api/figma/selection', null),
      fetchJsonOptional('/api/figma/agents', []),
      fetchJsonOptional('/api/pipeline/stats', null),
      fetchJsonOptional('/api/sync/state', null),
      fetchJsonOptional('/api/agents', null),
    ]);

    figmaControlState = normalizeFigmaControlState(statusPayload, jobsPayload, selectionPayload, agentsPayload);
    figmaControlState._pipeline = pipelinePayload;
    figmaControlState._sync = syncPayload;
    figmaControlState._registry = registryPayload;
    renderFigmaControlSummary();
    renderConflicts(syncPayload);
    syncAgentLogFromControlState();
  } catch {
    figmaControlState = createEmptyFigmaControlState();
    renderFigmaControlSummary();
  }
}

function createEmptyFigmaControlState() {
  return {
    connected: false,
    port: null,
    clients: [],
    jobs: [],
    selection: null,
    agents: [],
    sync: null,
    heal: null,
    source: 'offline',
    fetchedAt: 0,
  };
}

async function fetchJsonWithFallback(paths) {
  let lastError = null;
  for (const path of paths) {
    try {
      const res = await fetch(API_BASE + path);
      if (!res.ok) {
        throw new Error('HTTP ' + res.status);
      }
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Unable to load status');
}

async function fetchJsonOptional(path, fallback) {
  try {
    const res = await fetch(API_BASE + path);
    if (!res.ok) {
      return fallback;
    }
    return await res.json();
  } catch {
    return fallback;
  }
}

function normalizeFigmaControlState(statusPayload, jobsPayload, selectionPayload, agentsPayload) {
  const connected = Boolean(
    statusPayload?.connected ??
    statusPayload?.figma?.running ??
    statusPayload?.figma ??
    statusPayload?.bridge?.connected ??
    statusPayload?.connection?.stage === 'connected'
  );
  const clients = Array.isArray(statusPayload?.clients)
    ? statusPayload.clients
    : Array.isArray(statusPayload?.bridge?.clients)
      ? statusPayload.bridge.clients
      : [];
  const port = statusPayload?.port ?? statusPayload?.bridge?.port ?? statusPayload?.connection?.port ?? null;
  const jobs = normalizeArrayPayload(jobsPayload, 'jobs');
  const selection = selectionPayload && selectionPayload.selection ? selectionPayload.selection : selectionPayload;
  const agents = normalizeArrayPayload(agentsPayload, 'agents');
  const sync = inferLatestSyncSummary(statusPayload, jobsPayload);
  const heal = inferLatestHealSummary(statusPayload, jobsPayload);

  return {
    connected,
    port,
    clients,
    jobs,
    selection,
    agents,
    sync,
    heal,
    source: connected ? 'connected' : 'offline',
    fetchedAt: Date.now(),
  };
}

function normalizeArrayPayload(payload, key) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload[key])) {
    return payload[key];
  }
  return [];
}

function inferLatestSyncSummary(statusPayload, jobsPayload) {
  if (statusPayload && typeof statusPayload === 'object' && statusPayload.sync) {
    return statusPayload.sync;
  }
  if (statusPayload && typeof statusPayload === 'object' && statusPayload.syncSummary) {
    return statusPayload.syncSummary;
  }
  if (jobsPayload && typeof jobsPayload === 'object' && jobsPayload.sync) {
    return jobsPayload.sync;
  }
  return null;
}

function inferLatestHealSummary(statusPayload, jobsPayload) {
  if (statusPayload && typeof statusPayload === 'object' && statusPayload.heal) {
    return statusPayload.heal;
  }
  if (statusPayload && typeof statusPayload === 'object' && statusPayload.healSummary) {
    return statusPayload.healSummary;
  }
  if (jobsPayload && typeof jobsPayload === 'object' && jobsPayload.heal) {
    return jobsPayload.heal;
  }
  return null;
}

function renderFigmaControlSummary() {
  const dot = document.getElementById('figma-dot');
  const status = document.getElementById('figma-status');
  const meta = document.getElementById('figma-meta');
  const bridgeChip = document.getElementById('figma-summary-bridge');
  const jobsChip = document.getElementById('figma-summary-jobs');
  const selectionChip = document.getElementById('figma-summary-selection');
  const agentsChip = document.getElementById('figma-summary-agents');
  const syncChip = document.getElementById('figma-summary-sync');
  const healChip = document.getElementById('figma-summary-heal');
  const clients = figmaControlState.clients || [];
  const jobs = figmaControlState.jobs || [];
  const agents = figmaControlState.agents || [];
  const selection = figmaControlState.selection || {};
  const activeJobs = jobs.filter((job) => job.status === 'running' || job.status === 'queued');
  const failedJobs = jobs.filter((job) => job.status === 'failed');
  const connected = Boolean(figmaControlState.connected);

  if (dot) {
    dot.classList.toggle('connected', connected);
  }
  if (status) {
    status.textContent = connected ? 'Figma: connected' : 'Figma: offline';
  }
  if (meta) {
    meta.textContent = connected
      ? bridgeLabel(figmaControlState.port, clients.length, figmaControlState.fetchedAt)
      : 'Waiting for widget state';
  }

  setChip(bridgeChip, connected ? 'Bridge: live' : 'Bridge: offline', connected ? 'good' : 'bad');
  setChip(jobsChip, 'Jobs: ' + jobsLabel(activeJobs.length, jobs.length, failedJobs.length), jobs.length ? 'good' : 'dim');
  setChip(selectionChip, 'Selection: ' + selectionLabel(selection), selection?.count ? 'good' : 'dim');
  setChip(agentsChip, 'Agents: ' + agentsLabel(agents), agents.length ? 'good' : 'dim');
  setChip(syncChip, 'Sync: ' + syncLabel(figmaControlState.sync), figmaControlState.sync ? 'good' : 'dim');

  // Pipeline chip
  const pipelineChip = document.getElementById('figma-summary-pipeline');
  const pl = figmaControlState._pipeline;
  if (pl) {
    const plLabel = pl.pullCount + ' pulls / ' + pl.generateCount + ' gen' + (pl.errorCount ? ' / ' + pl.errorCount + ' err' : '');
    setChip(pipelineChip, 'Pipeline: ' + plLabel, pl.errorCount ? 'warn' : pl.pullCount ? 'good' : 'dim');
  } else {
    setChip(pipelineChip, 'Pipeline: idle', 'dim');
  }

  // Agent Registry chip
  const registryChip = document.getElementById('figma-summary-registry');
  const reg = figmaControlState._registry;
  if (reg && reg.agentCount > 0) {
    const regLabel = reg.online + ' online' + (reg.busy ? ' / ' + reg.busy + ' busy' : '') + ' / ' + reg.queue.pending + ' queued';
    setChip(registryChip, 'Registry: ' + regLabel, reg.online ? 'good' : 'dim');
  } else {
    setChip(registryChip, 'Registry: no agents', 'dim');
  }

  // Update Sync chip with conflict data from new endpoint
  const syncState = figmaControlState._sync;
  if (syncState && syncState.conflictCount > 0) {
    setChip(syncChip, 'Sync: ' + syncState.conflictCount + ' conflict' + (syncState.conflictCount > 1 ? 's' : ''), 'warn');
  }

  setChip(healChip, 'Healer: ' + healLabel(figmaControlState.heal), figmaControlState.heal?.healed ? 'good' : figmaControlState.heal ? 'warn' : 'dim');
}

function syncAgentLogFromControlState() {
  const agents = Array.isArray(figmaControlState.agents) ? figmaControlState.agents : [];
  for (const agent of agents) {
    updateAgentLog({
      id: agent.runId + ':' + agent.taskId + ':' + agent.role,
      intent: '[' + agent.role + '] ' + agent.title,
      steps: [{
        name: 'status',
        status: normalizeAgentStatus(agent.status),
        detail: [
          agent.summary || '',
          agent.error || '',
          agent.healRound !== undefined ? ('heal ' + agent.healRound) : '',
          agent.elapsedMs !== undefined ? formatAgentElapsed(agent.elapsedMs) : '',
        ].filter(Boolean).join(' / '),
      }],
      status: agent.status === 'done' ? 'completed' : agent.status === 'error' ? 'failed' : 'running',
      error: agent.error || '',
    });
  }
}

function bridgeLabel(port, clientCount, fetchedAt) {
  const parts = [];
  if (port) {
    parts.push(':' + port);
  }
  parts.push(clientCount + ' plugin' + (clientCount === 1 ? '' : 's'));
  if (fetchedAt) {
    parts.push(new Date(fetchedAt).toLocaleTimeString());
  }
  return parts.join(' / ');
}

function jobsLabel(activeCount, totalCount, failedCount) {
  if (!totalCount) {
    return 'idle';
  }
  const parts = [];
  if (activeCount) {
    parts.push(activeCount + ' active');
  }
  parts.push(totalCount + ' total');
  if (failedCount) {
    parts.push(failedCount + ' failed');
  }
  return parts.join(' / ');
}

function selectionLabel(selection) {
  if (!selection || !selection.count) {
    return 'none';
  }
  const pageName = selection.pageName || 'current page';
  return selection.count + ' on ' + pageName;
}

function agentsLabel(agents) {
  if (!agents.length) {
    return 'none';
  }
  const active = agents.filter((agent) => agent.status === 'busy' || agent.status === 'idle').length;
  return active ? active + ' active / ' + agents.length + ' total' : agents.length + ' total';
}

function syncLabel(sync) {
  if (!sync) {
    return 'n/a';
  }
  const failures = sync.partialFailures ? sync.partialFailures.length : 0;
  return sync.tokens + 't / ' + sync.components + 'c / ' + sync.styles + 's' + (failures ? ' / ' + failures + ' partial' : '');
}

function healLabel(heal) {
  if (!heal) {
    return 'n/a';
  }
  return 'r' + heal.round + ' / ' + heal.issueCount + ' issues' + (heal.healed ? ' / healed' : '');
}

function normalizeAgentStatus(status) {
  if (status === 'done') return 'completed';
  if (status === 'busy') return 'running';
  return status || 'idle';
}

function formatAgentElapsed(elapsedMs) {
  if (elapsedMs < 1000) return elapsedMs + 'ms';
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + 'm ' + remainder + 's';
}

function setChip(element, label, tone) {
  if (!element) return;
  element.textContent = label;
  element.className = 'figma-chip ' + tone;
}

// ── Make Cards Editable ────────────────────
function makeCardsEditable() {
  // Color swatches
  document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.setAttribute('data-editable', 'true');
    swatch.addEventListener('click', async () => {
      const name = swatch.getAttribute('title')?.split(':')[0]?.trim();
      if (!name) return;
      try {
        const res = await fetch(API_BASE + '/api/tokens');
        const data = await res.json();
        const token = (data.tokens || []).find(t => t.name === name);
        if (token) openEditPanel('token', name, token);
      } catch (err) { showToast('Failed to load token', 'error'); }
    });
  });

  // Spec cards
  document.querySelectorAll('.card').forEach(card => {
    const nameEl = card.querySelector('.card-name');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    const type = card.dataset.type;
    card.setAttribute('data-editable', 'true');

    // Add edit button
    const head = card.querySelector('.card-head');
    if (head) {
      const btn = document.createElement('button');
      btn.className = 'card-edit-btn';
      btn.textContent = 'EDIT';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const res = await fetch(API_BASE + '/api/specs/' + encodeURIComponent(name));
          const data = await res.json();
          if (data.spec) openEditPanel('spec', name, data.spec);
          else showToast('Spec not found', 'error');
        } catch (err) { showToast('Failed to load spec', 'error'); }
      });
      head.appendChild(btn);
    }
  });
}

// ── Keyboard Shortcuts ─────────────────────
document.addEventListener('keydown', (e) => {
  // Cmd+K or Ctrl+K — open command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openPalette();
  }
  // Escape — close panels
  if (e.key === 'Escape') {
    closePalette();
    closeEditPanel();
  }
  // Enter in command palette — run agent
  if (e.key === 'Enter' && !document.getElementById('cmd-palette').classList.contains('hidden')) {
    e.preventDefault();
    runAgent();
  }
});

// ── Helpers ────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Stats (auto-count from DOM) ─────────────
function updateStats() {
  const flows = document.querySelectorAll('.screen-card').length;
  const specs = document.querySelectorAll('.spec-section-head').length || document.querySelectorAll('#section-specs .spec-panel').length;
  const tokens = document.querySelectorAll('.sys-swatch').length + document.querySelectorAll('.sys-type-row').length;
  const uf = document.getElementById('stat-userflows');
  const sp = document.getElementById('stat-specs');
  const tk = document.getElementById('stat-tokens');
  if (uf) uf.textContent = flows;
  if (sp) sp.textContent = specs;
  if (tk) tk.textContent = tokens;
  const sc = document.getElementById('screens-count');
  if (sc) sc.textContent = flows + ' USERFLOWS';
}

// ── Init ───────────────────────────────────
connectWs();
checkFigmaStatus();
setInterval(checkFigmaStatus, 10000);
makeCardsEditable();
updateStats();
