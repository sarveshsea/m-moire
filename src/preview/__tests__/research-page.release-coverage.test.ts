import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { generateResearchDashboard } from '../templates/research-page.js';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
const opened: any[] = [];
afterEach(() => opened.splice(0).forEach((dom) => dom.window.close()));
const emptyResearch = { findings: [], themes: [], personas: [], sources: [] };
function finding(id: string, tags: string[], confidence = 'high') {
  return { id, statement: `Finding ${id}`, tags, confidence, source: 'interviews/session.txt', createdAt: '2026-09-01', evidence: [] };
}
function page(research: unknown) {
  const dom = new JSDOM(generateResearchDashboard(research as never, '2026-09-08'), { url: 'http://localhost', runScripts: 'outside-only' });
  opened.push(dom);
  const filename = resolve('src/preview/templates/research-page.client.js');
  new Script(readFileSync(filename, 'utf8'), { filename }).runInContext(dom.getInternalVMContext());
  return dom.window;
}

it.each(["Reader's workflow", 'Small, focused'])('filters the exact tag %s without interpreting it as JavaScript or a delimiter', (tag) => {
  const browser = page({ ...emptyResearch, findings: [finding('matching', [tag]), finding('other', ['Elsewhere'])] });
  const button = [...browser.document.querySelectorAll('.tag')].find((node: any) => node.textContent.startsWith(tag)) as any;
  const handler = button.getAttribute('onclick');
  if (handler) expect(() => button.addEventListener('click', browser.Function(handler))).not.toThrow();
  button.click();
  const cards = browser.document.querySelectorAll('.insight');
  expect(cards[0].style.display).toBe('');
  expect(cards[1].style.display).toBe('none');
  button.click();
  expect(cards[1].style.display).toBe('');
});
