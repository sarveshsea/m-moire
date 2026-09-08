import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown, buildWorkspaceSkillManifest, buildWorkspaceSkillNote } from '../frontmatter.js';
const options = { noteDir: '/synthetic/skills', fallbackName: 'fallback-name' };
const manifest = (frontmatter: Record<string, unknown> = {}, body = '') => buildWorkspaceSkillManifest(frontmatter, body, options);
describe('workspace skill YAML subset and manifest normalization', () => {
  it('preserves markdown without a complete frontmatter envelope', () => {
    for (const text of ['# Plain', '---\nname: incomplete', '\uFEFF# Plain']) expect(parseSkillMarkdown(text)).toEqual({ frontmatter: {}, body: text });
    expect(parseSkillMarkdown('\uFEFF---\r\nname: test\r\n---\r\nBody')).toEqual({ frontmatter: { name: 'test' }, body: 'Body' });
  });
  it('parses quoted scalars, typed values, JSON maps and quote-aware arrays', () => {
    const parsed = parseSkillMarkdown(`---\n# Comment\nname: "A \\"quoted\\" name"\nsingle: 'It''s a skill'\nnullish: null\ntilde: ~\nyes: true\nno: false\nnumber: -1.5\nobject: {"enabled":true}\ninvalidObject: {invalid}\ntags: ["a,b", 'c,d', 3, false, plain]\nempty: []\n---\nbody`).frontmatter;
    expect(parsed).toMatchObject({ name: 'A "quoted" name', single: "It's a skill", nullish: null, tilde: null, yes: true, no: false, number: -1.5, object: { enabled: true }, invalidObject: '{invalid}', tags: ['a,b', 'c,d', 3, false, 'plain'], empty: [] });
  });
  it('supports nested metadata, empty scalars and literal/folded paragraphs', () => {
    const result = parseSkillMarkdown('---\nmetadata:\n\n  memoire:\n    category: research\n  author: Person\nempty:\nnext: present\nliteral: |\n  one\n  two\n\nfolded: >\n  first\n  paragraph\n\n  second\nignored line\n: ignored\ntrailing:\n---\n');
    expect(result.frontmatter).toEqual({ metadata: { memoire: { category: 'research' }, author: 'Person' }, empty: '', next: 'present', literal: 'one\ntwo', folded: 'first paragraph\n\nsecond', trailing: '' });
  });
  it('normalizes precedence, metadata lists, engines and stable manifest defaults', () => {
    const result = manifest({ name: 'Top_Name', description: 'Explicit', category: 'CRAFT', freedomLevel: 'MAXIMUM', activateOn: ' custom ', tags: ['one', '', 3], dependencies: '["base", "base"]', engines: [], metadata: { author: 'Author', description: 'Ignored', tags: 'two', dependencies: ['another'], engines: { memoire: '>=2.7.9' }, memoire: { name: 'Ignored', tags: ['one', 'three'], version: '1.2.3' } } });
    expect(result).toMatchObject({ name: 'top-name', description: 'Explicit', version: '1.2.3', author: 'Author', category: 'craft', tags: ['one', 'three', 'two'], dependencies: ['base', 'another'], engines: { memoire: '>=2.7.9' }, skills: [{ name: 'Top Name', activateOn: 'custom', freedomLevel: 'maximum' }] });
  });
  it.each([['Interview research', 'research', 'research-to-dashboard'], ['Slack integration', 'connect', 'always'], ['Generate SwiftUI', 'generate', 'component-creation'], ['Audit accessibility', 'craft', 'design-review'], ['Motion prototype', 'craft', 'prototype-creation'], ['Typography', 'craft', 'design-creation']])('infers %s routing from evidence', (body, category, activateOn) => {
    const result = manifest({ category: 'invalid' }, body); expect(result.category).toBe(category); expect(result.skills[0].activateOn).toBe(activateOn);
  });
  it.each([['read only', 'read-only'], ['analysis only', 'read-only'], ['reference only', 'reference'], ['design', 'high']])('infers %s freedom conservatively', (body, freedom) => {
    expect(manifest({ freedomLevel: 'invalid' }, body).skills[0].freedomLevel).toBe(freedom);
  });
  it('honors disabled model invocation and explicit freedom precedence', () => {
    expect(manifest({ 'disable-model-invocation': true }).skills[0].freedomLevel).toBe('reference');
    expect(manifest({ 'disable-model-invocation': true, freedomLevel: 'read-only' }).skills[0].freedomLevel).toBe('read-only');
  });
  it('uses fallback metadata and meaningful body lines without accepting invalid versions', () => {
    expect(manifest({ metadata: { skill: 'nested/skill' }, tags: '   ' }, '\n#\n## Heading')).toMatchObject({ name: 'nested-skill', description: 'Heading', tags: [] });
    expect(manifest({ skill: 'legacy.skill', engines: { other: '1' } }, '\nPlain description')).toMatchObject({ name: 'legacy-skill', description: 'Plain description' });
    expect(manifest({ title: 'Named', metadata: [] })).toMatchObject({ name: 'named', description: 'Named' });
    expect(manifest({ name: '!!!' }).name).toBe('workspace-skill');
    expect(() => manifest({ version: 'latest' })).toThrow();
    expect(buildWorkspaceSkillNote('---\nname: Local\n---\nText', { ...options, skillFileName: 'local.md' })).toMatchObject({ builtIn: false, enabled: true, path: options.noteDir, manifest: { skills: [{ file: 'local.md' }] } });
  });
});
