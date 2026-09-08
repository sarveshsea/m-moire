import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as gates from '../../../scripts/check-release.mjs';

const names = ['memoire-design-tooling', 'audit-frontend-design', 'remember-design-system', 'enforce-design-ci', 'build-swiftui-interface'];
const current = (name: string) => readFileSync(`skills/${name}/SKILL.md`, 'utf8');
const evaluate = (skillName: string, content: string, overrides = {}) => (gates as any).evaluateSkillDistributionGate({
  skillName, content, version: '2.8.0-beta.1', engineState: 'candidate', previousPublicVersion: '2.7.9', ...overrides,
});

describe('skill distribution release contracts', () => {
  it.each(names)('accepts the actual reviewed local candidate recipe for %s', name => {
    expect(evaluate(name, current(name))).toEqual([]);
  });
  it.each(['2.8.0-beta.1', 'latest', '2.7.8'])('rejects candidate installation recipes using %s', version => {
    expect(evaluate('audit-frontend-design', current('audit-frontend-design') + `\n\`\`\`bash\nnpx -y @memi-design/cli@${version} diagnose .\n\`\`\``)).not.toEqual([]);
  });
  it.each([
    'memi agent install --dry-run --json',
    'memi --profile connected --allow project-write init --team --json',
    'memi ios scaffold --dry-run',
    'memi mcp start --no-figma',
  ])('rejects unavailable or unprofiled candidate recipe %s', command => {
    expect(evaluate('memoire-design-tooling', current('memoire-design-tooling') + `\n\`\`\`bash\n${command}\n\`\`\``)).not.toEqual([]);
  });
  it('rejects lost frontend and receipt contracts even if other local commands remain', () => {
    expect(evaluate('remember-design-system', current('remember-design-system').replaceAll('--frontend', '--mode local'))).not.toEqual([]);
    expect(evaluate('memoire-design-tooling', current('memoire-design-tooling').replaceAll('--receipt-only', '--json'))).not.toEqual([]);
  });
  it('requires reviewed local and unpublished availability language', () => {
    expect(evaluate('audit-frontend-design', current('audit-frontend-design').replace(/reviewed local/gi, 'available').replace(/unpublished/gi, 'published'))).not.toEqual([]);
  });
  it('keeps stable focused skill pins exact, rejecting floating and older commands', () => {
    const content = '---\nname: audit-frontend-design\n---\n```bash\nnpx -y @memi-design/cli@2.7.9 diagnose . --json --no-write\n```';
    const stable = { engineState: 'published', version: '2.7.9' };
    expect(evaluate('audit-frontend-design', content, stable)).toEqual([]);
    for (const bad of ['latest', '2.7.8']) expect(evaluate('audit-frontend-design', content.replace('cli@2.7.9', `cli@${bad}`), stable)).not.toEqual([]);
  });
  it('preserves stable umbrella installation and MCP contracts', () => {
    const content = 'name: memoire-design-tooling\nmemi agent brief\nmemi agent install --dry-run --json\nmemi mcp start --no-figma';
    const stable = { engineState: 'published', version: '2.7.9' };
    expect(evaluate('memoire-design-tooling', content, stable)).toEqual([]);
    expect(evaluate('memoire-design-tooling', content.replace('memi agent install --dry-run --json', ''), stable)).not.toEqual([]);
  });
});
