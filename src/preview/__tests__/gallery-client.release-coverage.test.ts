import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { generatePreviewHTML } from '../templates/gallery-page.js';

// Execute the unchanged classic browser script with its real source filename.
// No synthesized exports, copied functions, or manually credited coverage.
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const filename = resolve('src/preview/templates/gallery-page.client.js');
const client = new Script(readFileSync(filename, 'utf8'), { filename });
let dom: any;
let browser: any;
let request: ReturnType<typeof vi.fn>;
let sockets: Array<{ url: string; send: ReturnType<typeof vi.fn>; onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void }>;
let routes: Record<string, unknown>;

async function settle() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
function element(id: string): HTMLElement { return browser.document.getElementById(id); }
function key(key: string, options = {}) { browser.document.dispatchEvent(new browser.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })); }

beforeEach(async () => {
  routes = {};
  sockets = [];
  dom = new JSDOM(generatePreviewHTML({ projectName: 'Gallery test', specs: [], tokens: [], research: null, generatedAt: '2026-01-01' }), {
    url: 'http://localhost:3456', runScripts: 'outside-only',
  });
  browser = dom.window;
  browser.console = { log: vi.fn(), warn: vi.fn() };
  browser.setTimeout = vi.fn();
  browser.setInterval = vi.fn();
  browser.WebSocket = class {
    send = vi.fn();
    constructor(public url: string) { sockets.push(this); }
  };
  request = vi.fn(async (url: string) => ({ ok: true, json: async () => routes[new URL(url).pathname] ?? {} }));
  browser.fetch = request;
  client.runInContext(dom.getInternalVMContext());
  await settle();
});
afterEach(() => { dom?.window.close(); });

describe('gallery browser behavior', () => {
  it('starts a local websocket, requests state, and reports offline status without payloads', () => {
    expect(sockets[0].url).toBe('ws://localhost:3456');
    sockets[0].onopen?.();
    expect(sockets[0].send).toHaveBeenCalledWith('{"type":"request-state"}');
    expect(element('figma-status').textContent).toBe('Figma: offline');
    expect(element('figma-summary-jobs').textContent).toBe('Jobs: idle');
    sockets[0].onmessage?.({ data: 'invalid-json' });
    expect(browser.console.warn).toHaveBeenCalled();
    sockets[0].onclose?.();
    expect(browser.setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
  });

  it('opens the command palette with keyboard focus and closes both panels on Escape', () => {
    key('k', { ctrlKey: true });
    expect(element('cmd-palette').classList.contains('hidden')).toBe(false);
    expect(browser.document.activeElement.id).toBe('cmd-input');
    key('Escape');
    expect(element('cmd-palette').classList.contains('hidden')).toBe(true);
    expect(element('edit-panel').classList.contains('hidden')).toBe(true);
  });
});

describe('gallery untrusted connector text boundaries', () => {
  it('keeps conflict names as data when a resolution button is activated', async () => {
    const name = "'); window.__galleryInjected = true; //";
    browser.renderConflicts({ conflicts: [{ name, entityType: 'token' }] });
    const button = browser.document.querySelector('.conflict-btn.figma');
    // Compile exactly the browser's inline handler, then dispatch the real click.
    // JSDOM outside-only deliberately does not enable automatic inline scripts.
    if (button.getAttribute('onclick')) {
      button.addEventListener('click', browser.Function(button.getAttribute('onclick')));
    }
    button.click();
    await settle();
    expect(browser.__galleryInjected).toBeUndefined();
    expect(request).toHaveBeenCalledWith('http://localhost:3456/api/sync/resolve', expect.objectContaining({
      body: JSON.stringify({ name, resolution: 'figma-wins' }),
    }));
  });

  it('renders persona goals as text instead of injecting HTML elements', () => {
    const goal = '<img src=x onerror="window.__galleryInjected=true">';
    browser.renderResearchPanel({ personas: [{ name: 'Researcher', goals: [goal] }] });
    const body = element('research-panel-body');
    expect(body.querySelector('img')).toBeNull();
    expect(body.textContent).toContain(goal);
  });
});

it('keeps conflict metadata and research confidence and coverage labels as text', () => {
  const markup = '<img src=x onerror="window.__galleryInjected=true">';
  browser.renderConflicts({ conflicts: [{ name: 'Safe', entityType: markup, figmaHash: '<svg/onload=1>', codeHash: '<b>code' }] });
  expect(element('conflicts-body').querySelector('img,svg,b')).toBeNull();
  expect(element('conflicts-body').textContent).toContain(markup);
  browser.renderResearchPanel({ findings: [{ statement: 'Observation', confidence: markup }], coverage: { ratio: 0.5, covered: markup, total: 2 } });
  expect(element('research-panel-body').querySelector('img')).toBeNull();
  expect(element('research-panel-body').textContent).toContain(markup);
});

it('treats malformed array-like research counts as untrusted text', () => {
  const markup = '<img src=x onerror="window.__galleryInjected=true">';
  browser.renderResearchPanel({ findings: { length: markup }, personas: { length: markup }, themes: [{ name: 'Theme', findingIds: { length: markup } }] });
  expect(element('research-panel-body').querySelector('img')).toBeNull();
  expect(element('research-panel-body').textContent).not.toContain('undefined');
});

describe('gallery editing and navigation', () => {
  it('filters cards, switches panels, and toggles disclosure state', () => {
    const host = browser.document.createElement('div');
    host.innerHTML = '<button id="all-filter" class="filter-btn active"></button><button id="component-filter" class="filter-btn"></button><div class="card" data-type="component"></div><div class="card" data-type="page"></div><div id="ev-7"></div><div id="res-insights" class="res-panel"><div class="res-insight" data-conf="high"></div><div class="res-insight" data-conf="low"></div></div><div id="spec-extra" class="spec-panel"></div><h3 id="disclosure"><span class="spec-arrow">&gt;</span></h3><div id="disclosure-body"></div>';
    browser.document.body.append(host);
    browser.filter('component', element('component-filter'));
    expect(host.querySelector('[data-type="page"]').style.display).toBe('none');
    browser.filter('all', element('all-filter'));
    expect(host.querySelector('[data-type="page"]').style.display).toBe('');
    browser.showSection('specs', null);
    expect(element('section-specs').classList.contains('active')).toBe(true);
    browser.showSection('missing', element('all-filter'));
    browser.showResPanel('insights', element('component-filter'));
    expect(element('res-insights').classList.contains('active')).toBe(true);
    browser.filterInsights('high', element('component-filter'));
    expect(host.querySelector('[data-conf="low"]').style.display).toBe('none');
    browser.filterInsights('all', null);
    expect(host.querySelector('[data-conf="low"]').style.display).toBe('');
    browser.showSpecPanel('extra', element('component-filter'));
    expect(element('spec-extra').classList.contains('active')).toBe(true);
    for (const display of ['block', 'none']) {
      browser.toggleEvidence(7); browser.toggleSpec(element('disclosure'));
      expect(element('ev-7').style.display).toBe(display);
      expect(element('disclosure-body').style.display).toBe(display);
    }
    browser.toggleEvidence('missing');
    browser.toggleSpec(browser.document.createElement('div'));
  });

  it.each(['color', 'dimension'])('edits and saves %s token values without altering unrelated modes', async (type) => {
    const token = { name: '<Accent>', type, collection: 'Core', values: { light: type === 'color' ? '#fff' : 16, dark: 'var(--alias)' } };
    browser.openEditPanel('token', token.name, token);
    expect(element('edit-title').textContent).toBe('Edit Token: <Accent>');
    const input = browser.document.querySelector('[data-mode="light"]');
    input.value = type === 'color' ? '#123456' : '20';
    routes['/api/tokens'] = { ok: true };
    await browser.saveEdit();
    const call = request.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(call![1].body).token.values).toEqual({ light: input.value, dark: 'var(--alias)' });
    expect(element('edit-panel').classList.contains('hidden')).toBe(true);
    expect(element('toast-container').textContent).toContain('Token saved');
    await browser.saveEdit();
    expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
  });

  it.each(['component', 'page', 'dataviz'])('saves %s specs from their actual generated edit form', async (type) => {
    const spec = { name: 'Card / main', type, purpose: 'Original', tags: ['old'], variants: ['default'], shadcnBase: ['card'], props: { title: 'string' }, layout: 'centered', chartType: 'bar' };
    browser.openEditPanel('spec', spec.name, spec);
    (element('edit-spec-purpose') as HTMLTextAreaElement).value = 'Updated purpose';
    (element('edit-spec-tags') as HTMLInputElement).value = ' new, , checked ';
    routes['/api/specs/Card%20%2F%20main'] = { ok: true };
    await browser.saveEdit();
    const call = request.mock.calls.find(([, options]) => options?.method === 'PUT');
    expect(JSON.parse(call![1].body)).toMatchObject({ purpose: 'Updated purpose', tags: ['new', 'checked'], type });
    expect(element('toast-container').textContent).toContain('Spec saved!');
  });

  it('rejects invalid JSON props before sending a spec update', async () => {
    browser.openEditPanel('spec', 'Card', { name: 'Card', type: 'component', purpose: '' });
    (element('edit-spec-props') as HTMLTextAreaElement).value = '{ invalid';
    await browser.saveEdit();
    expect(request.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    expect(element('toast-container').textContent).toContain('Invalid JSON in Props field');
  });

  it.each(['rejected', 'offline'])('shows a token save %s error without closing the editor', async (outcome) => {
    browser.openEditPanel('token', 'Spacing', { name: 'Spacing', type: 'dimension', values: {} });
    request.mockImplementation(async () => { if (outcome === 'offline') throw new Error('offline'); return { json: async () => ({ ok: false, error: 'Denied' }) }; });
    await browser.saveEdit();
    expect(element('edit-panel').classList.contains('hidden')).toBe(false);
    expect(element('toast-container').textContent).toContain(outcome === 'offline' ? 'offline' : 'Denied');
  });
});

describe('gallery status and agent interactions', () => {
  it.each(['started', 'denied', 'offline'])('submits palette intent and renders the %s result as text', async (outcome) => {
    key('k', { metaKey: true });
    (element('cmd-input') as HTMLInputElement).value = 'Build <Card>';
    request.mockImplementation(async (url: string, options?: { method: string }) => {
      if (options?.method === 'POST') {
        if (outcome === 'offline') throw new Error('offline');
        return { json: async () => outcome === 'started' ? { task: { id: '<task-1>' } } : { error: '<denied>' } };
      }
      return { ok: true, json: async () => ({}) };
    });
    key('Enter'); await settle();
    const call = request.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(call![1].body).intent).toBe('Build <Card>');
    expect(element('cmd-status').textContent).toContain(outcome === 'started' ? '<task-1>' : outcome === 'denied' ? '<denied>' : 'offline');
    expect(element('cmd-status').querySelector('task-1,denied')).toBeNull();
    expect(element('agent-log').classList.contains('hidden')).toBe(false);
  });

  it('does not submit empty palette input', async () => {
    browser.openPalette(); key('Enter'); await settle();
    expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it.each([
    ['design-system-updated', { action: 'token-updated', token: { name: 'Accent' } }, 'Token updated: Accent'],
    ['spec-updated', { spec: { name: 'Card' } }, 'Spec updated: Card'],
    ['figma-synced', { scope: 'tokens' }, 'Synced to Figma: tokens'],
    ['agent-result', { task: { id: 'done', intent: 'Build', status: 'completed' } }, 'Agent completed: Build'],
    ['agent-result', { task: { id: 'error', intent: 'Build', status: 'failed', error: 'Denied' } }, 'Agent failed: Denied'],
    ['error', {}, 'Error'],
    ['reload', {}, 'Code updated'],
  ])('renders %s websocket updates without losing the transport', async (type, data, text) => {
    sockets[0].onmessage?.({ data: JSON.stringify({ type, data }) }); await settle();
    expect(element('toast-container').textContent).toContain(text);
    expect(browser.console.warn).not.toHaveBeenCalled();
  });

  it('renders a live bridge with jobs, selection, agents, partial sync, conflicts and pipeline state', async () => {
    routes = {
      '/api/figma/status': { connected: true, port: 3055, clients: [{}], sync: { tokens: 3, components: 2, styles: 1, partialFailures: ['token'] }, heal: { round: 2, issueCount: 1, healed: false } },
      '/api/figma/jobs': { jobs: [{ status: 'running' }, { status: 'queued' }, { status: 'failed' }] },
      '/api/figma/selection': { selection: { count: 2, pageName: 'Home' } },
      '/api/figma/agents': { agents: [{ runId: 'run', taskId: 'task', role: 'builder', title: 'Card', status: 'done', summary: 'Built', elapsedMs: 62000, healRound: 2 }] },
      '/api/pipeline/stats': { pullCount: 3, generateCount: 2, errorCount: 1 },
      '/api/sync/state': { conflicts: [{ name: 'Accent', entityType: 'token' }], conflictCount: 1 },
      '/api/agents': { agentCount: 1, online: 1, busy: 1, queue: { pending: 2 } },
    };
    await browser.checkFigmaStatus();
    expect(element('figma-status').textContent).toBe('Figma: connected');
    expect(element('figma-summary-jobs').textContent).toBe('Jobs: 2 active / 3 total / 1 failed');
    expect(element('figma-summary-selection').textContent).toBe('Selection: 2 on Home');
    expect(element('figma-summary-sync').textContent).toBe('Sync: 1 conflict');
    expect(element('figma-summary-pipeline').classList.contains('warn')).toBe(true);
    expect(element('figma-summary-registry').textContent).toContain('1 online / 1 busy / 2 queued');
    expect(element('agent-log-body').textContent).toContain('1m 2s');
    expect(element('agent-log-body').textContent).toContain('COMPLETED');
    browser.document.querySelector('.conflict-btn.code').click(); await settle();
    expect(request).toHaveBeenCalledWith('http://localhost:3456/api/sync/resolve', expect.objectContaining({ body: '{"name":"Accent","resolution":"code-wins"}' }));
  });

  it('falls back from unavailable primary status and tolerates optional endpoint errors', async () => {
    request.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/status')) return { ok: true, json: async () => ({ bridge: { connected: true, port: 3000, clients: [{}, {}] } }) };
      if (url.endsWith('/api/figma/status')) return { ok: false, status: 503 };
      throw new Error('optional unavailable');
    });
    await browser.checkFigmaStatus();
    expect(element('figma-status').textContent).toBe('Figma: connected');
    expect(element('figma-meta').textContent).toContain('2 plugins');
    request.mockRejectedValue(new Error('offline'));
    await browser.checkFigmaStatus();
    expect(element('figma-status').textContent).toBe('Figma: offline');
  });

  it('renders bounded research lists and opens and closes its panel', async () => {
    routes['/api/research'] = { insights: Array.from({ length: 12 }, (_, i) => ({ finding: `Finding ${i}`, confidence: 'high', tags: ['one', 'two', 'three', 'four'] })), personas: [{ name: 'Reader', role: 'Editor', goals: ['Read'] }], themes: Array.from({ length: 9 }, (_, i) => ({ name: `Theme ${i}`, insightIds: ['finding'] })), coverage: { ratio: 0.5, covered: 1, total: 2 } };
    browser.toggleResearchPanel(); await settle();
    expect(element('research-panel').classList.contains('hidden')).toBe(false);
    expect(element('research-panel-body').textContent).toContain('Coverage: 1/2 specs (50%)');
    expect(element('research-panel-body').textContent).toContain('... and 2 more');
    expect(element('research-panel-body').textContent).not.toContain('Theme 8');
    browser.toggleResearchPanel();
    expect(element('research-panel').classList.contains('hidden')).toBe(true);
  });
});

describe('gallery editable card discovery', () => {
  it('loads a clicked swatch and spec edit button through their API routes', async () => {
    const host = browser.document.createElement('div');
    host.innerHTML = '<button class="swatch" title="Accent: #fff"></button><div class="card" data-type="component"><div class="card-head"><span class="card-name">Card / one</span></div></div>';
    browser.document.body.append(host);
    routes['/api/tokens'] = { tokens: [{ name: 'Other' }, { name: 'Accent', type: 'color', values: { light: '#fff' }, cssVariable: '--accent' }] };
    routes['/api/specs/Card%20%2F%20one'] = { spec: { name: 'Card / one', type: 'component', purpose: 'Reusable' } };
    browser.makeCardsEditable();
    host.querySelector('.swatch').click(); await settle();
    expect(element('edit-title').textContent).toBe('Edit Token: Accent');
    host.querySelector('.card-edit-btn').click(); await settle();
    expect(element('edit-title').textContent).toBe('Edit Spec: Card / one');
    expect(host.querySelectorAll('.card-edit-btn')).toHaveLength(1);
  });

  it.each(['missing', 'offline'])('reports %s spec discovery and handles unavailable tokens', async (outcome) => {
    const host = browser.document.createElement('div');
    host.innerHTML = '<button class="swatch" title="Absent: #fff"></button><button class="swatch"></button><div class="card"><div class="card-head"><span class="card-name">Missing</span></div></div><div class="card"></div>';
    browser.document.body.append(host);
    browser.makeCardsEditable();
    if (outcome === 'offline') request.mockRejectedValue(new Error('offline'));
    host.querySelector('.swatch').click();
    host.querySelectorAll('.swatch')[1].click();
    host.querySelector('.card-edit-btn').click(); await settle();
    expect(element('toast-container').textContent).toContain(outcome === 'offline' ? 'Failed to load spec' : 'Spec not found');
    expect(element('edit-panel').classList.contains('hidden')).toBe(true);
  });
});

it('reports a conflict resolution network failure without throwing a secondary error', async () => {
  request.mockRejectedValue(new Error('Connection unavailable'));
  await expect(browser.resolveConflict('Accent', 'figma-wins')).resolves.toBeUndefined();
  expect(element('toast-container').textContent).toContain('Failed to resolve conflict: Connection unavailable');
  expect(element('toast-container').querySelector('.toast.error')).not.toBeNull();
});
