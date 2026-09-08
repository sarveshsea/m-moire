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

it('renders empty research confidence as finite zero-width segments', () => {
  const dom = render({ findings: [], themes: [], personas: [], sources: [] });
  expect(dom.window.document.querySelector('#section-research').innerHTML).not.toContain('NaN');
  expect([...dom.window.document.querySelectorAll('.res-conf-seg')].map((node: any) => node.style.width)).toEqual(['0%', '0%', '0%']);
});

it('renders escaped research findings, persona variants and source attribution', () => {
  const dom = render({
    findings: ['high', 'medium', 'low'].map((confidence, index) => ({ id: `finding-${index}`, statement: `<Finding ${index}>`, confidence, tags: ['<Tag>'], evidence: index ? [] : ['<Evidence>'], source: index ? '' : 'interview.txt' })),
    themes: [{ name: '<Theme>', description: 'Frequent concern', frequency: 3, findingIds: [] }, { name: 'Secondary', description: 'Another', frequency: 1, findingIds: [] }],
    personas: [50, 70, 90].map((frustration) => ({ name: `Reader ${frustration}`, role: 'Editor', quote: '<Quote>', experience: '3 years', bidVolume: 'Monthly', frustration, goals: ['<Goal>'], painPoints: ['<Pain>'], behaviors: ['Compare'], tools: ['<Tool>'] })).concat([{ name: 'Guest', role: 'Reader', goals: [], painPoints: [], behaviors: [] }] as never),
    sources: [{ name: '<Source>', type: 'interview', processedAt: '2026-09-01' }], quality: { overallScore: 75 },
  });
  const document = dom.window.document;
  expect(document.querySelectorAll('.res-persona-name')).toHaveLength(4);
  expect(document.querySelectorAll('.res-frust-fill')).toHaveLength(3);
  expect(document.querySelector('.res-persona-list').textContent).toContain('<Goal>');
  expect(document.querySelector('.res-source-name').textContent).toBe('<Source>');
  expect(document.querySelector('#res-insights').textContent).toContain('<Finding 0>');
  expect(document.querySelector('#res-insights').textContent).toContain('research');
  expect(document.querySelector('tag,evidence,theme,quote,goal,pain,tool,source')).toBeNull();
});
