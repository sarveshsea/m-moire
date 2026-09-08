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
