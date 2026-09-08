import { afterEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { generatePreviewHTML } from '../templates/gallery-page.js';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const opened: any[] = [];
afterEach(() => opened.splice(0).forEach((dom) => dom.window.close()));
function render(research: unknown = null) {
  const dom = new JSDOM(generatePreviewHTML({ projectName: 'Fixture', specs: [], tokens: [], research: research as never, generatedAt: '2026-09-08' }), { url: 'http://localhost', runScripts: 'outside-only' });
  opened.push(dom); return dom;
}
it('ships executable gallery behavior inside the actual generated HTML', async () => {
  const dom = render(); const browser = dom.window;
  browser.WebSocket = class { send() {} };
  browser.fetch = async () => ({ ok: true, json: async () => ({}) });
  browser.setTimeout = () => 0; browser.setInterval = () => 0;
  const source = browser.document.querySelector('script').textContent;
  expect(() => new Script(source).runInContext(dom.getInternalVMContext())).not.toThrow();
  browser.document.dispatchEvent(new browser.KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  expect(browser.document.getElementById('cmd-palette').classList.contains('hidden')).toBe(false);
  expect(browser.document.activeElement.id).toBe('cmd-input');
  for (let index = 0; index < 15; index++) await Promise.resolve();
});
