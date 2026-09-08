import { describe, expect, it } from 'vitest';
import { extractDesignTokensFromCss, extractDesignTokensFromSources, renderTokenExtractionMarkdown, renderTokenExtractionSummary } from '../extractor.js';
describe('token extraction evidence and health reporting', () => {
  it('handles empty and malformed CSS without invented variable tokens', () => {
    const report = extractDesignTokensFromCss(['/* --fake: #123456; */ broken', '<style> </style>']);
    expect(report.tokens).toEqual([]); expect(report.semanticCoverage.present).toEqual([]);
    expect(renderTokenExtractionMarkdown(report)).toContain('No duplicate token values');
    expect(renderTokenExtractionSummary(report)).toContain('0 tokens extracted');
  });
  it('preserves named modes, custom-property values and source provenance', () => {
    const report = extractDesignTokensFromSources([
      { id: 'one', content: '<style>:host { --brand_color: #123456 !important; --opacity: .5; --count: -2; --size: 4px; --empty: ; }</style>' },
      { id: 'two', content: '[data-theme="warm"] { --brand_color: #654321; } .theme-ocean { --brand_color: #abcdef; } .dark { --brand_color: #111111; } :root { --size: 8px; }' },
    ], { includeInferredLiterals: false });
    const color = report.tokens.find(t => t.cssVariable === '--brand_color')!;
    expect(color).toMatchObject({ name: 'brand-color', collection: 'extracted:2-sources', values: { default: '#123456', warm: '#654321', ocean: '#abcdef', dark: '#111111' } });
    expect(report.tokens.find(t => t.name === 'count')!.values.default).toBe(-2);
    expect(report.modes).toEqual(['default', 'dark', 'ocean', 'warm']);
    expect(report.modeCoverage.completeTokenCount).toBe(1); expect(report.aliasGraph.edgeCount).toBe(0);
  });
  it('classifies aliases, shadow, radius, typography and dimensions without resolving values', () => {
    const report = extractDesignTokensFromCss([':root { --unknown: opaque; --alias: var(--radius); --radius: 4px; --font: Inter; --shade: 0 2px 4px #123456; --dimension: 20vh; --calculated: calc(100% - 4px); --noop: none; }']);
    expect(report.tokens.find(t => t.name === 'alias')).toMatchObject({ type: 'radius', values: { default: 'var(--radius)' } });
    expect(report.families.shadow.count).toBe(1); expect(report.families.typography.count).toBe(1); expect(report.families.spacing.count).toBe(1);
    expect(report.aliasGraph).toMatchObject({ edgeCount: 1, resolvedReferenceCount: 1, maxDepth: 1 });
    expect(renderTokenExtractionSummary(report).join('\n')).toContain('1 alias');
  });
  it('promotes repeated literals only when they are absent from explicit tokens', () => {
    const css = ':root { --primary: #123456; } .a,.b { color: #123456; background: #654321; box-shadow: 0 2px 4px #999999; padding: 0px 16px; border-radius: 0px 4px; font-size: 12px; font-family: Inter; line-height: calc(1rem + 2px); } .c { background: #654321; margin: 16px; border-radius: 4px; font-size: 12px; font-family: Inter; }';
    const report = extractDesignTokensFromCss([css], { sourceName: 'fixture' });
    expect(report.literalCandidates.find(c => c.value === '#654321')).toMatchObject({ promoted: true, occurrences: 2 });
    expect(report.literalCandidates.find(c => c.value === '#123456')?.promoted).toBe(false);
    expect(report.tokens.some(t => t.collection === 'inferred-literal:fixture')).toBe(true);
    expect(report.recommendations.some(r => r.action.includes('Review inferred'))).toBe(true);
    expect(extractDesignTokensFromCss([css], { includeInferredLiterals: false }).summary.inferredTokenCount).toBe(0);
  });
  it('limits promotion volume while retaining occurrence evidence', () => {
    const declarations = Array.from({ length: 40 }, (_, i) => `padding: ${i + 1}px;`).join(' ');
    const report = extractDesignTokensFromCss([`.a { ${declarations} } .b { ${declarations} }`]);
    expect(report.literalCandidates).toHaveLength(40); expect(report.summary.inferredTokenCount).toBe(36);
    expect(report.literalCandidates.filter(c => c.promoted)).toHaveLength(36);
  });
  it('collects each utility family without classifying layout-only utilities as tokens', () => {
    const report = extractDesignTokensFromSources([{ id: 'component', kind: 'tsx', content: '<div className="hover:bg-primary text-sm p-4 rounded shadow font-bold flex"></div><p class=\'bg-primary leading-tight\'></p><div className={`[&]:ring-2 gap-4 tracking-wide`} />' }]);
    expect(report.utilityCandidates).toEqual(expect.arrayContaining([expect.objectContaining({ utility: 'bg-primary', occurrences: 2, type: 'color' }), expect.objectContaining({ utility: 'text-sm', type: 'typography' }), expect.objectContaining({ utility: 'rounded', type: 'radius' }), expect.objectContaining({ utility: 'shadow', type: 'shadow' })]));
    expect(report.utilityCandidates.some(c => c.utility === 'flex')).toBe(false);
    expect(renderTokenExtractionMarkdown(report, 'component')).toContain('Source: component');
  });
  it('reports unresolved references, cycles, duplicates and incomplete modes distinctly', () => {
    const vars = Array.from({ length: 25 }, (_, i) => `--color-${i}: #${(0x100000 + i % 5).toString(16)};`).join(' ');
    const report = extractDesignTokensFromCss([`:root { ${vars} --a: var(--b); --b: var(--a); --missing: var(--absent); } .dark { --color-0: #222222; }`]);
    expect(report.aliasGraph.circularReferences.length).toBeGreaterThan(0); expect(report.aliasGraph.unresolvedReferences).toContainEqual({ token: '--missing', reference: '--absent' });
    expect(report.duplicates.length).toBeGreaterThan(3); expect(report.modeCoverage.partialTokenCount).toBe(24);
    const markdown = renderTokenExtractionMarkdown(report); expect(markdown).toContain('+4 more'); expect(markdown).toContain('--absent'); expect(markdown).toContain('Collapse duplicate');
  });
  it('recognizes complete semantic and scale coverage without irrelevant warnings', () => {
    const slots = ['background', 'foreground', 'primary', 'secondary', 'accent', 'muted', 'border', 'ring', 'card', 'popover', 'destructive', 'input'];
    const palette = slots.map((name, i) => `--${name}: #${(0x112233 + i).toString(16)};`).join(' ');
    const dimensions = Array.from({ length: 8 }, (_, i) => `--space-${i}: ${i + 1}px;`).join(' ') + Array.from({ length: 6 }, (_, i) => `--font-${i}: ${i + 10}px;`).join(' ') + '--radius-sm: 3px; --radius-md: 5px; --radius-lg: 7px;';
    const report = extractDesignTokensFromCss([`:root { ${palette} ${dimensions} } .dark { ${palette} }`]);
    expect(report.semanticCoverage).toMatchObject({ score: 100, missing: [] }); expect(report.modeCoverage.score).toBe(100);
    expect(report.scaleHealth).toMatchObject({ spacingScaleScore: 100, typographyScaleScore: 100, radiusScaleScore: 100 });
    expect(report.recommendations).toEqual([]); expect(renderTokenExtractionMarkdown(report)).toContain('No recommendations');
  });
});
