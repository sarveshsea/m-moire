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

describe('research dashboard rendering', () => {
  it('renders explicit empty states without invented observations or confidence bars', () => {
    const browser = page(emptyResearch);
    const text = browser.document.body.textContent;
    expect(text).toContain('No findings yet'); expect(text).toContain('No themes yet');
    expect(text).toContain('No personas yet'); expect(text).toContain('No sources yet');
    expect(browser.document.querySelectorAll('.seg')).toHaveLength(0);
    expect(browser.document.querySelectorAll('.persona-card')).toHaveLength(0);
  });
  it('renders populated research counts, escaped evidence, bounded summaries and persona details', () => {
    const findings = Array.from({ length: 6 }, (_, index) => ({ ...finding(`f${index}`, ['Shared', index ? 'Other' : 'Primary'], ['high', 'medium', 'low'][index % 3]), statement: index ? `Finding ${index}` : '<Card> ' + 'long statement '.repeat(10), evidence: index ? ['One quote'] : ['<Quoted>', 'two', 'three', 'four', 'five', 'six'], source: index ? '' : 'interviews/notes.txt' }));
    const browser = page({ findings, themes: [{ name: '<Theme>', description: 'Shared concerns', frequency: 6, findingIds: findings.map((item) => item.id) }],
      personas: [{ name: '<Reader>', role: 'Editor', goals: ['Read <reports>'], painPoints: ['Noise'], behaviors: ['Compare'] }, { name: 'Guest', role: '', goals: [], painPoints: [], behaviors: [] }],
      sources: [{ name: 'interviews/notes.txt', type: 'interview' }, { name: '', type: 'notes' }],
      quality: { overallScore: 72 }, quantitativeMetrics: [{ name: 'Completion' }], opportunities: [{}], risks: [{}], contradictions: [{}], summary: { narrative: '<Summary>', nextActions: [] } });
    const document = browser.document;
    expect(document.querySelectorAll('.insight')).toHaveLength(6);
    expect(document.querySelectorAll('.seg')).toHaveLength(3);
    expect(document.querySelector('.tag').textContent).toContain('Shared6');
    expect(document.querySelector('.insight details').textContent).toContain('+1 more');
    expect(document.querySelector('.theme-card').textContent).toContain('+3 more findings');
    expect(document.querySelector('.theme-card').textContent).toContain('...');
    expect(document.querySelector('.persona-card').textContent).toContain('Read <reports>');
    expect(document.querySelector('card,quoted,theme,reader,reports')).toBeNull();
    expect(document.body.textContent).toContain('Run synthesis to generate next actions.');
    expect(document.body.textContent).toContain('notes.txt');
    browser.switchTab('themes', document.querySelectorAll('.tab-btn')[1]);
    expect(document.getElementById('tab-themes').classList.contains('active')).toBe(true);
  });
  it('executes the actual emitted script and wires the rendered tag buttons', () => {
    const html = generateResearchDashboard({ ...emptyResearch, findings: [finding('one', ['One']), finding('two', ['Two'])] } as never, '2026-09-08');
    const dom = new JSDOM(html, { runScripts: 'outside-only' }); opened.push(dom);
    new Script(dom.window.document.querySelector('script').textContent).runInContext(dom.getInternalVMContext());
    dom.window.document.querySelector('.tag').click();
    expect(dom.window.document.querySelectorAll('.insight')[1].style.display).toBe('none');
  });
});
