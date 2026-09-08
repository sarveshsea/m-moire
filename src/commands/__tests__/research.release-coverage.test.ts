import { Command } from 'commander';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerResearchCommand } from '../research.js';
import { ComponentSpecSchema } from '../../specs/types.js';

let root: string;
let logs: string[];
const originalExit = process.exitCode;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'memoire-research-cli-'));
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  process.exitCode = 0;
});
afterEach(async () => { vi.restoreAllMocks(); process.exitCode = originalExit; await rm(root, { recursive: true, force: true }); });
function harness() {
  const quality = { overallScore: 0, sampleSize: 0, completenessScore: 0, sourceDiversityScore: 0, triangulationScore: 0, structureScore: 0, notes: ['Collect source evidence'] };
  const store = { observations: [], findings: [], themes: [], personas: [], sources: [], quantitativeMetrics: [], opportunities: [], risks: [], contradictions: [], quality };
  const research = {
    load: vi.fn(), getStore: () => store, fromFile: vi.fn(),
    fromTranscript: vi.fn().mockResolvedValue({ segments: [], insights: [], speakers: [{ name: 'Participant', wordCount: 10 }], sentiment: { positive: 0, negative: 0, neutral: 1, mixed: 0 }, summary: 'No findings' }),
    fromStickies: vi.fn().mockResolvedValue({ totalStickies: 0, clusters: [], unclustered: [], summary: 'No stickies' }),
    fromUrls: vi.fn().mockResolvedValue({ topic: 'navigation', sources: [], findings: [], crossValidated: [], gaps: [], summary: 'No source evidence' }),
    synthesize: vi.fn().mockResolvedValue({ themes: [], summary: 'No synthesis evidence' }),
    assessQuality: vi.fn().mockReturnValue(quality), generateReport: vi.fn().mockResolvedValue('# Résumé\r\nNo findings\r\n'),
  };
  const engine = { config: { projectRoot: root }, init: vi.fn(), research, registry: { getAllSpecs: vi.fn().mockResolvedValue([]) }, figma: { isConnected: true, extractStickies: vi.fn().mockResolvedValue([]) }, connectFigma: vi.fn() };
  async function run(args: string[]) {
    const program = new Command().exitOverride(); registerResearchCommand(program, engine as never);
    await program.parseAsync(['research', ...args], { from: 'user' });
    return { text: logs.join('\n'), payload: () => JSON.parse(logs.at(-1)!) };
  }
  return { engine, research, store, run };
}

describe('research CLI preconditions and receipts', () => {
  it.each(['from-file', 'from-transcript'])('rejects missing %s input before initializing the engine', async action => {
    const h = harness();
    expect((await h.run([action, join(root, 'missing')])).text).toContain('File not found');
    expect(h.engine.init).not.toHaveBeenCalled();
    expect(h.research.load).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
  it('warns on a real input file that yields no findings', async () => {
    const file = join(root, 'empty.csv'); await writeFile(file, 'response\n');
    const h = harness();
    expect((await h.run(['from-file', file])).text).toContain('No findings extracted');
    expect(h.research.fromFile).toHaveBeenCalledWith(file);
  });
  it.each([1, 2])('reports %s imported findings without miscounting other entities', async count => {
    const file = join(root, 'data.csv'); await writeFile(file, 'response\nUseful');
    const h = harness();
    Object.assign(h.store, { findings: Array.from({ length: count }, () => ({})), themes: [{}], personas: [{}] });
    expect((await h.run(['from-file', file])).text).toContain(`Extracted ${count} finding${count === 1 ? '' : 's'}, 1 theme, 1 persona`);
  });
  it.each([false, true])('forwards transcript source labels and reports speakers with JSON=%s', async json => {
    const file = join(root, 'interview.txt'); await writeFile(file, 'Participant: Hello');
    const h = harness();
    const result = await h.run(['from-transcript', file, '--label', 'Study A', ...(json ? ['--json'] : [])]);
    expect(h.research.fromTranscript).toHaveBeenCalledWith(file, 'Study A');
    if (json) expect(result.payload()).toMatchObject({ transcript: { segments: 0, findings: 0, speakers: ['Participant'] } });
    else expect(result.text).toContain('Participant (10 words)');
  });
  it.each([false, true])('connects only when FigJam is disconnected=%s', async disconnected => {
    const h = harness(); h.engine.figma.isConnected = !disconnected;
    expect((await h.run(['from-stickies'])).text).toContain('No stickies');
    expect(h.engine.connectFigma).toHaveBeenCalledTimes(disconnected ? 1 : 0);
    expect(h.research.fromStickies).toHaveBeenCalledWith([]);
  });
  it.each([[['--plan-only']], [[]], [['--urls', ' , , ']]])('keeps web planning read-only for %j', async options => {
    const h = harness(); const result = await h.run(['web', 'navigation', ...options]);
    expect(result.text).toContain('navigation');
    expect(h.engine.init).not.toHaveBeenCalled();
    expect(h.research.fromUrls).not.toHaveBeenCalled();
  });
  it.each([false, true])('trims URLs and forwards only nonempty sources with JSON=%s', async json => {
    const h = harness();
    const result = await h.run(['web', 'navigation', '--urls', ' https://a.test, , https://b.test ', ...(json ? ['--json'] : [])]);
    expect(h.research.fromUrls).toHaveBeenCalledWith('navigation', ['https://a.test', 'https://b.test']);
    if (json) expect(result.payload()).toMatchObject({ web: { sources: 0, findings: 0, crossValidated: 0 } });
    else expect(result.text).toContain('No source evidence');
  });
  it('prints corroborated evidence and remaining gaps separately', async () => {
    const h = harness();
    h.research.fromUrls.mockResolvedValue({ topic: 'navigation', sources: [{}], findings: [{}], crossValidated: [{ confidence: 'high', text: 'Participants could not find settings' }], gaps: ['Missing mobile evidence'], summary: 'One source group' });
    const result = await h.run(['web', 'navigation', '--urls', 'https://a.test']);
    expect(result.text).toContain('[high] Participants could not find settings');
    expect(result.text).toContain('Missing mobile evidence');
  });
  it('leaves absent synthesis recommendations null instead of inventing winners', async () => {
    const h = harness();
    expect((await h.run(['synthesize', '--json'])).payload()).toMatchObject({ synthesis: { topTheme: null, topOpportunity: null, topRisk: null, sampleSize: 0, qualityScore: 0 } });
  });
  it.each(['synthesize', 'quality', 'report'])('renders human %s outcome after loading research', async action => {
    const h = harness(); const result = await h.run([action]);
    expect(h.engine.init).toHaveBeenCalledOnce(); expect(h.research.load).toHaveBeenCalledOnce();
    expect(result.text).toMatch(/Quality score: 0|Collect source evidence|Report saved/);
  });
  it('counts UTF-8 report bytes and CRLF lines correctly', async () => {
    const h = harness();
    expect((await h.run(['report', '--json'])).payload().report).toMatchObject({ markdownBytes: Buffer.byteLength('# Résumé\r\nNo findings\r\n'), markdownLines: 3 });
  });
  it.each([false, true])('reports empty research backing coverage with JSON=%s', async json => {
    const h = harness(); const result = await h.run(['coverage', ...(json ? ['--json'] : [])]);
    if (json) expect(result.payload()).toMatchObject({ coverage: null, totalSpecs: 0 });
    else expect(result.text).toContain('nothing to measure');
  });
  it('filters trace entries case-insensitively while exposing stale citations', async () => {
    const h = harness();
    h.engine.registry.getAllSpecs.mockResolvedValue([ComponentSpecSchema.parse({ type: 'component', purpose: 'Settings', name: 'SettingsCard', researchBacking: ['missing-finding'] }), ComponentSpecSchema.parse({ type: 'component', purpose: 'Other', name: 'OtherCard' })]);
    const result = await h.run(['trace', 'settings', '--json']);
    expect(result.payload().entries).toHaveLength(1);
    expect(result.payload().entries[0]).toMatchObject({ spec: 'SettingsCard', unresolved: ['missing-finding'] });
    expect(result.payload().staleCitations).toBe(1);
  });
});
