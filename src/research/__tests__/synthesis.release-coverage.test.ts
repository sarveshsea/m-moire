import { describe, expect, it } from 'vitest';
import { generateResearchReportArtifacts, generateResearchReportMarkdown, synthesizeResearch } from '../synthesis.js';
import type { ResearchStore } from '../engine.js';
const now = '2026-09-08T00:00:00Z';
function store(overrides: Record<string, unknown> = {}): ResearchStore {
  return { version: 2, sources: [], observations: [], findings: [], themes: [], personas: [], quantitativeMetrics: [], opportunities: [], risks: [], contradictions: [], quality: { overallScore: 0, sampleSize: 0, completenessScore: 0, sourceDiversityScore: 0, triangulationScore: 0, structureScore: 0, notes: [], generatedAt: now }, methods: { analysisMode: 'decision-grade', quantitativeApproach: 'descriptive', qualitativeApproach: 'coded', limitations: [] }, ...overrides } as ResearchStore;
}
function finding(id: string, overrides: Record<string, unknown> = {}) { return { id, statement: 'Navigation helps people finish their work', category: 'goal', confidence: 'medium', themeIds: [], evidenceObservationIds: [], evidenceSourceIds: [], sourceTypeCount: 0, method: 'qualitative', caveats: [], tags: ['navigation'], entities: [], sentiment: 'positive', signalTags: ['navigation'], createdAt: now, source: 'synthetic', evidence: [], ...overrides }; }
function source(id: string, overrides: Record<string, unknown> = {}) { return { id, name: id, type: 'transcript', processedAt: now, ...overrides }; }
function observation(id: string, overrides: Record<string, unknown> = {}) { return { id, sourceId: 's1', kind: 'transcript-segment', text: 'I usually follow the workflow to finish onboarding.', actor: 'Participant', tags: [], entities: [], sentiment: 'neutral', createdAt: now, ...overrides }; }
function metric(overrides: Record<string, unknown> = {}) { return { id: 'metric', source: 's1', field: 'rating', label: 'Rating', sampleSize: 20, missingCount: 0, missingRate: 0, min: 1, max: 5, mean: 4, median: 4, stdDev: 1, p25: 3, p75: 5, scaleType: 'likert-1-5', buckets: [], outlierCount: 0, cohortComparisons: [], ...overrides }; }
describe('deterministic research synthesis evidence and reporting', () => {
  it('reports missing evidence without inventing themes, personas or opportunities', () => {
    const result = synthesizeResearch(store());
    expect(result).toMatchObject({ findings: [], themes: [], personas: [], opportunities: [], risks: [], contradictions: [] });
    expect(result.methods.limitations).toContain('Quantitative input is missing; findings are primarily qualitative.');
    const report = generateResearchReportMarkdown(store());
    for (const text of ['No quantitative metrics', 'No themes synthesized', 'No personas synthesized', 'No clear opportunities', 'No major risks', 'No major contradictions']) expect(report).toContain(text);
    expect(result.summary.nextActions.join(' ')).toContain('Expand quantitative sample');
  });
  it('does not promote isolated evidence into a theme and resolves missing references safely', () => {
    const input = store({ findings: [finding('one', { evidenceSourceIds: ['missing'], evidenceObservationIds: ['missing'], tags: ['navigation', 'navigation'] })] });
    const result = synthesizeResearch(input); expect(result.themes).toEqual([]); expect(result.findings[0].themeIds).toEqual([]);
    expect(result.findings[0].tags).toEqual(['navigation']); expect(input.findings[0].tags).toEqual(['navigation', 'navigation']);
  });
  it('retains contradictory positive/negative evidence and traces themes to actual finding IDs', () => {
    const input = store({ sources: [source('s1'), source('s2', { sourceKind: 'mixed', qualityScore: 90 })], findings: [finding('positive', { evidenceSourceIds: ['s1'], evidenceObservationIds: ['o1'], entities: ['Admin'] }), finding('negative', { evidenceSourceIds: ['s2'], evidenceObservationIds: ['o2'], statement: 'Navigation is confusing and slow', category: 'pain-point', sentiment: 'negative' })], observations: [observation('o1'), observation('o2', { actor: 'Participant', cohort: 'Admin' })] });
    const result = synthesizeResearch(input);
    expect(result.contradictions).toEqual([expect.objectContaining({ positiveFindingIds: ['positive'], negativeFindingIds: ['negative'] })]);
    expect(result.opportunities[0].evidenceFindingIds).toEqual(['positive']); expect(result.risks[0].evidenceFindingIds).toEqual(['negative']);
    expect(result.themes[0]).toMatchObject({ frequency: 2, sourceCount: 2, sourceTypeCount: 2 });
    expect(result.findings.every(f => f.themeIds.includes(result.themes[0].id))).toBe(true);
    expect(result.personas.find(p => p.name === 'Participant')).toMatchObject({ confidence: 'medium', evidenceFindingIds: ['positive', 'negative'] });
    expect(result.methods.limitations.join(' ')).toContain('Contradictions');
    expect(generateResearchReportArtifacts(input)).toMatchObject({ markdown: expect.stringContaining('## Contradictions'), json: { version: 2, findings: expect.any(Array), sources: input.sources } });
  });
  it('derives fallback signals/category/sentiment without treating moderators as personas', () => {
    const input = store({ sources: [source('s1')], findings: [finding('fallback', { statement: '', source: 'Pain point: slow onboarding', category: '', sentiment: undefined, signalTags: [], tags: [], evidenceObservationIds: ['o1'] }), finding('blank', { statement: '', source: undefined, category: '', sentiment: undefined, signalTags: [], tags: [] })], observations: [observation('o1', { actor: 'moderator' }), observation('o2', { actor: undefined, cohort: undefined }), observation('o3', { actor: undefined, cohort: 'Reader', text: 'Short' })] });
    const result = synthesizeResearch(input); expect(result.findings[0].statement).toContain('slow onboarding'); expect(result.personas.map(p => p.name)).toEqual(['Reader']);
    expect(result.personas[0]).toMatchObject({ confidence: 'low', source: 'research', behaviors: [] });
  });
  it('bounds persona context while preserving prior quotes, goals and confidence', () => {
    const observations = Array.from({ length: 5 }, (_, i) => observation(`o${i}`, { cohort: i % 2 ? 'Admin' : 'Operator' }));
    const findings = observations.map((o, i) => finding(`f${i}`, { category: i % 2 ? 'workaround' : 'goal', evidenceObservationIds: [o.id], evidenceSourceIds: ['s1'], statement: `Unique workflow requirement ${i}` }));
    const input = store({ sources: [source('s1')], observations, findings, personas: [{ name: 'participant', role: 'prior', goals: ['Prior goal'], painPoints: ['Prior pain'], behaviors: ['Prior behavior'], source: 'earlier study', quote: 'Prior quote', confidence: 'high', evidenceFindingIds: ['old'] }, { name: 'Standalone', role: 'guest', goals: [], painPoints: [], behaviors: [], source: '' }] });
    const result = synthesizeResearch(input); const persona = result.personas.find(p => p.name === 'Participant')!;
    expect(persona).toMatchObject({ quote: 'Prior quote', confidence: 'high', role: 'Operator' }); expect(persona.goals).toContain('Prior goal'); expect(persona.evidenceFindingIds).toContain('old'); expect(persona.behaviors.length).toBeLessThanOrEqual(5);
    expect(result.personas.some(p => p.name === 'Standalone')).toBe(true);
    const withoutConfidence = store({ ...input, personas: [{ name: 'participant', role: 'prior', source: 'old', goals: [], painPoints: [], behaviors: [] }] });
    expect(synthesizeResearch(withoutConfidence).personas.find(p => p.name === 'Participant')!.confidence).toBe('high');
  });
  it('renders quantitative intervals, NPS, signed cohort deltas and source provenance', () => {
    const input = store({ sources: [source('s2', { processedAt: '2026-08-01', sourceKind: 'mixed', qualityScore: 90, itemCount: 20, sampleSize: 20, missingRate: 0, notes: ['Synthetic data'] }), source('s1')], quantitativeMetrics: [metric({ confidenceInterval95: { low: 3, high: 5 }, nps: { score: 20, promoterPct: 50, passivePct: 20, detractorPct: 30 }, cohortComparisons: [{ cohort: 'Admin', sampleSize: 10, mean: 4.5, deltaFromOverall: 0.5 }, { cohort: 'Reader', sampleSize: 10, mean: 3.5, deltaFromOverall: -0.5 }] }), metric({ id: 'second', label: 'Second metric' })] });
    const report = generateResearchReportMarkdown(input);
    for (const text of ['95% CI: 3.00 to 5.00', 'NPS: 20', 'delta +0.50', 'delta -0.50', 'Notes: Synthetic data', 'Items: 20']) expect(report).toContain(text);
    expect(report.indexOf('### s1')).toBeLessThan(report.indexOf('### s2'));
    const result = synthesizeResearch(input); expect(result.methods.limitations.join(' ')).not.toContain('Quantitative input is missing'); expect(result.summary.quantitativeMetrics).toBe(2);
  });
  it('aggregates multi-method evidence with high confidence and keeps all risk/opportunity evidence', () => {
    const sources = Array.from({ length: 4 }, (_, i) => source(`s${i}`, { sourceKind: i % 2 ? 'quantitative' : 'qualitative', qualityScore: 100, sampleSize: 40, missingRate: 0 }));
    const observations = Array.from({ length: 16 }, (_, i) => observation(`o${i}`, { sourceId: `s${i % 4}`, actor: `Actor${i % 2}` }));
    const findings = observations.map((o, i) => finding(`f${i}`, { evidenceSourceIds: [`s${i % 4}`], evidenceObservationIds: observations.slice(0, 4).map(o => o.id), method: i % 2 ? 'quantitative' : 'qualitative', category: i % 2 ? 'pain-point' : 'goal', sentiment: i % 2 ? 'negative' : 'positive', signalTags: [i < 8 ? 'navigation' : 'onboarding'] }));
    const result = synthesizeResearch(store({ sources, observations, findings, quantitativeMetrics: [metric()] }));
    expect(result.themes).toHaveLength(2); expect(result.themes.every(t => t.confidence === 'high')).toBe(true);
    expect(result.opportunities.every(o => o.priority === 'high')).toBe(true); expect(result.risks.every(r => r.severity === 'high')).toBe(true);
    expect(result.summary.nextActions.length).toBeLessThanOrEqual(4); expect(result.contradictions).toHaveLength(2);
    expect(generateResearchReportMarkdown(store({ sources, observations, findings, quantitativeMetrics: [metric()] }))).toContain('Representative quote');
  });
  it('orders high-priority opportunities and high-severity risks before weaker evidence', () => {
    const findings = [
      ...Array.from({ length: 3 }, (_, i) => finding(`high-op-${i}`, { signalTags: ['strong-opportunity'] })),
      ...Array.from({ length: 2 }, (_, i) => finding(`medium-op-${i}`, { signalTags: ['weaker-opportunity'] })),
      ...Array.from({ length: 3 }, (_, i) => finding(`high-risk-${i}`, { signalTags: ['strong-risk'], category: 'pain-point', sentiment: 'negative' })),
      ...Array.from({ length: 2 }, (_, i) => finding(`medium-risk-${i}`, { signalTags: ['weaker-risk'], category: 'pain-point', sentiment: 'negative' })),
    ];
    const result = synthesizeResearch(store({ findings }));
    expect(result.opportunities.map(item => item.priority)).toEqual(['high', 'medium']);
    expect(result.risks.map(item => item.severity)).toEqual(['high', 'medium']);
    expect(result.summary.topOpportunities[0]).toBe(result.opportunities.find(item => item.priority === 'high')!.title);
    expect(result.summary.topRisks[0]).toBe(result.risks.find(item => item.severity === 'high')!.title);
  });

});
