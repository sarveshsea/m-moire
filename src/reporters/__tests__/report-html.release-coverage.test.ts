import { afterEach, beforeEach, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureExecutionPolicy, resetExecutionPolicyForTests } from '../../security/execution-policy.js';
import { composeReport } from '../report-html.js';
import { fingerprintIssue } from '../../app-quality/baseline.js';
const { JSDOM } = createRequire(import.meta.url)('jsdom');
let root: string;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'memi-report-render-')); configureExecutionPolicy({ projectRoot: root, profile: 'locked' }); await mkdir(join(root, '.memoire/app-quality'), { recursive: true }); });
afterEach(async () => { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
async function artifact(name: string, value: unknown) { await writeFile(join(root, '.memoire/app-quality', name), JSON.stringify(value)); }
function diagnosis(score: number) {
  return { generatedAt: '2026-09-08', target: '.', summary: { score, verdict: 'needs-work', scannedFiles: 2 }, scores: {}, issues: [] };
}

it('reports absent or corrupt artifacts as missing without inventing a score', async () => {
  await writeFile(join(root, '.memoire/app-quality/diagnosis.json'), '{broken');
  const report = await composeReport({ projectRoot: root });
  expect(report.score).toBeNull(); expect(report.sections).toEqual([]);
  expect(report.missing).toHaveLength(3); expect(report.markdown).toContain('Not Included');
  expect(report.html).not.toContain('class="score-num"');
});

it.each([[95, '#3fb950'], [80, '#d29922'], [65, '#f0883e'], [40, '#f85149']])('renders assessed score %s with its severity color', async (score, color) => {
  await artifact('diagnosis.json', diagnosis(Number(score)));
  const report = await composeReport({ projectRoot: root });
  expect(report.score).toBe(score); expect(report.html).toContain(`color:${color}`);
  expect(report.markdown).toContain(`**${score}/100**`);
  expect(report.markdown).toContain('coverage metadata unavailable');
  expect(report.html).toContain('No issues detected by the static scan.');
});

it('preserves an explicitly unassessed score rather than presenting zero as measured quality', async () => {
  await artifact('diagnosis.json', { ...diagnosis(0), summary: { ...diagnosis(0).summary, scoreScope: 'none' }, unassessedDimensions: ['native rendering'] });
  const report = await composeReport({ projectRoot: root });
  expect(report.score).toBeNull(); expect(report.markdown).toContain('**unassessed**');
  expect(report.html).toContain('not a whole-product pass');
});

it.each([true, false])('renders evidence and companion report sections with redact=%s', async (redact) => {
  const issue = { id: 'finding<1>', severity: 'high', title: '<Finding>', detail: 'private-detail', recommendation: 'Use <Button>', evidenceLocations: [{ file: 'src/View.tsx', line: 4, excerpt: 'private-excerpt' }] };
  await artifact('diagnosis.json', { ...diagnosis(70), quality: { score: 75, coverage: 0.5 }, policy: { hash: 'policy<hash>', preset: '<preset>' }, issues: [issue, { ...issue, id: 'second', evidenceLocations: [] }], compliance: { summary: { critical: 1, warning: 1, filesChecked: 2 }, findings: [{ severity: 'critical', file: 'src/View.tsx', message: '<Structure>', fix: '<Split>', docRef: '<Guideline>' }, { severity: 'warning', file: 'src/Other.tsx', message: 'Review', docRef: 'Doc' }] } });
  await artifact('ux-audit.json', { score: 80, tenetCoverage: [{ name: '<Clarity>', status: 'not-assessed' }, { name: 'Control', status: 'pass' }], trapRisks: [{ name: '<Trap>', status: 'not-assessed', riskScore: 0 }, { name: 'Overload', status: 'risk', riskScore: 40 }] });
  await artifact('interface-craft.json', { score: 65, dimensions: [{ name: '<Motion>', lens: 'behavior', status: 'not-assessed', score: null }, { name: 'Hierarchy', lens: 'visual', status: 'pass', score: 90 }] });
  const report = await composeReport({ projectRoot: root, redact });
  expect(report.sections).toEqual(['diagnosis', 'ux-audit', 'interface-craft', 'skill-compliance']);
  expect(report.missing).toEqual([]); expect(report.score).toBe(75);
  expect(report.markdown).toContain('Category coverage: 50%');
  expect(report.markdown).toContain('src/View.tsx:4');
  expect(report.html.includes('private-excerpt')).toBe(!redact);
  expect(report.markdown.includes('private-detail')).toBe(!redact);
  expect(report.html).toContain('unverified, NOT verified-good');
  const dom = new JSDOM(report.html);
  try {
    expect(dom.window.document.querySelector('finding,button,structure,split,guideline,clarity,trap,motion')).toBeNull();
    expect(dom.window.document.body.textContent).toContain('<Finding>');
    expect(dom.window.document.body.textContent).toContain('<Clarity>');
    expect(dom.window.document.querySelectorAll('table')).toHaveLength(3);
    expect(dom.window.document.querySelector('script[src],link[rel="stylesheet"]')).toBeNull();
  } finally { dom.window.close(); }
});


it('keeps accepted baseline findings visible with explicit suppressed counts', async () => {
  const issue = { id: 'spacing.rule', severity: 'medium', title: 'Accepted debt', detail: 'Spacing detail', recommendation: 'Review spacing', evidenceLocations: [{ file: 'src/View.tsx', excerpt: 'gap-3' }] };
  await artifact('diagnosis.json', { ...diagnosis(80), issues: [issue] });
  await writeFile(join(root, '.memoire/baseline.json'), JSON.stringify({ schemaVersion: 1, acceptedAt: '2026-09-01', entries: fingerprintIssue(issue as never) }));
  const report = await composeReport({ projectRoot: root });
  expect(report.markdown).toContain('1 accepted finding(s) suppressed from gating (visible below)');
  expect(report.html).toContain('1 baselined finding(s) suppressed from gating');
  expect(report.html).toContain('Accepted debt');
  expect(report.markdown).toContain('src/View.tsx');
});
