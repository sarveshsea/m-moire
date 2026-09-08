import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as gates from '../../../scripts/check-release.mjs';

const names = ['memoire-design-tooling', 'audit-frontend-design', 'remember-design-system', 'enforce-design-ci', 'build-swiftui-interface'];
// Frozen candidate examples from d1503168; these are historical test inputs, not release evidence.
const candidateRecipes: Record<string, string> = {
  "memoire-design-tooling": "---\nname: memoire-design-tooling\ndescription: Use when a task spans interface understanding, design-system memory, UI audits, design CI, Figma, shadcn or Tailwind code generation, research, or agent design workflows and needs the correct Memi capability selected.\n---\n\n# Memi Design Tooling\n\nMemi gives coding agents repository-specific interface evidence before they edit UI. Start with the smallest workflow that answers the task; Figma, global installation, and a daemon are optional.\n\n## Choose A Workflow\n\n- Before reviewing or changing frontend UI: use `audit-frontend-design`.\n- Before building from an existing product system: use `remember-design-system`.\n- When adding deterministic pull-request gates: use `enforce-design-ci`.\n- For native SwiftUI, SwiftData, App Intents, or Apple-platform verification: use `build-swiftui-interface`.\n- For Figma, research, scaffolding, registry publishing, or multi-agent work: continue below.\n\nInstall one focused skill directly:\n\n```bash\nnpx skills add memi-design/memi --skill audit-frontend-design\n```\n\nThis skill requires the reviewed 2.8 frontend contract. Check `memi --version` and npm registry availability first. If the beta is unpublished, use a reviewed local build; after publication, use the exact verified beta version. npm stable remains 2.7.9.\n\n## Compact Preflight\n\n```bash\nmemi agent brief . --frontend --intent \"<interface task>\" --max-bytes 16384 --json\n```\n\nRead cited source files when the bounded brief lacks necessary evidence. Optional `--design-evidence design/selected-node.json` accepts normalized Figma/Paper data supplied by the harness; missing mappings and verification stay explicit.\n\n## Local Checks And MCP\n\n```bash\nmemi diagnose . --json --no-write --fail-on none\nmemi diagnose . --receipt-only --fail-on none\nmemi --profile locked mcp start --no-figma\n```\n\nLocked MCP exposes four read tools: prepare_frontend_brief, prepare_design_agent_brief, prepare_apple_design_brief, and diagnose_app_quality. The frontend tool supplies actual repository evidence. Many legacy CLI and write tools remain unavailable; capability grants do not unlock deferred command paths. Keep connector calls, project edits, and browser execution in the harness's reviewed workflow.\n\nReuse local components and tokens according to the consumer project's conventions. Source-bearing JSON is working context; receipt-only is a separate metadata output. See docs/FRONTEND_WORKFLOW.md for the candidate evidence schema and actual verification flow.\n\n## Evidence Contract\n\n1. Read local instructions and existing product-system files first.\n2. Collect the minimum evidence that can change the implementation.\n3. Cite `file:line` findings and existing components or tokens.\n4. Make scoped edits.\n5. Re-run the same deterministic checks.\n6. Report commands, artifacts, files changed, and remaining assumptions.\n\nDo not claim visual correctness from source checks alone. When rendered behavior matters, verify the actual route at desktop and mobile viewports.\n",
  "audit-frontend-design": "---\nname: audit-frontend-design\ndescription: Use when reviewing or changing a React, Next.js, Tailwind, or shadcn interface and you need evidence-backed findings for accessibility, hierarchy, tokens, states, and responsive design before editing code.\n---\n\n# Audit Frontend Design\n\nAudit the real source tree before proposing UI changes. Memi's checks are deterministic and file-anchored; no Figma connection or background process is required.\n\nCheck `memi --version` and npm registry availability. If the 2.8 beta is unpublished, use a reviewed local candidate; after publication, use the exact verified beta version. npm stable remains 2.7.9.\n\n## Run The Audit\n\nFrom the repository root:\n\n```bash\nmemi diagnose . --json --no-write --fail-on none\n```\n\nFor UX behavior and visual craft detail, run only the relevant follow-up:\n\n```bash\nmemi ux audit . --json --no-write\nmemi craft audit . --json --no-write\n```\n\nA supplied screenshot is context, not proof that Memi performed pixel analysis. Use the harness browser or image tools for actual rendered checks. Use `memi diagnose . --receipt-only --fail-on none` when the output must exclude source content.\n\n## Workflow\n\n1. Read repository instructions and identify the requested route or component.\n2. Run `diagnose` before broad UI edits.\n3. Group findings by user impact, not by checker name.\n4. Verify each proposed fix against the cited file and local design tokens.\n5. Implement only fixes relevant to the user's request.\n6. Re-run the same command and report assessed quality, category coverage, scan omissions, and remaining findings.\n\n## Output\n\nLead with actionable findings:\n\n| Priority | Evidence | Change |\n| --- | --- | --- |\n| High | `path/to/file.tsx:line` and rule id | Specific code-level fix |\n\nInclude the command run, before/after score, files changed, and unresolved risks. Never replace source evidence with generic taste advice.\n",
  "remember-design-system": "---\nname: remember-design-system\ndescription: Use when an agent is about to build or refactor interface code and needs a compact, repository-specific brief covering existing tokens, components, routes, conventions, and verification commands.\n---\n\n# Remember The Design System\n\nBuild design context from the repository instead of guessing from the prompt. This is a preflight for UI work, not a request to redesign the product.\n\nThis skill targets the reviewed 2.8 frontend contract. Check `memi --version` and npm registry availability; npm stable 2.7.9 does not have `--frontend`. If the beta is unpublished, use a reviewed local candidate; after publication, use the exact verified beta version.\n\n## Build The Brief\n\nTranslate the user's task into a short intent, then run from the repository root:\n\n```bash\nmemi agent brief . --frontend --intent \"<user's interface task>\" --max-bytes 16384 --json\n```\n\nThe frontend brief already includes bounded token and story evidence. For a selected Figma or Paper node, use the harness connector and supply its normalized evidence:\n\n```bash\nmemi agent brief . --frontend --intent \"<task>\" --design-evidence design/selected-node.json --json\n```\n\n## Apply The Memory\n\n1. Prefer existing components and the project's conventions. Do not impose a new component library or CSS framework.\n2. Map every new component to atom, molecule, organism, template, or page.\n3. Reuse semantic CSS variables and Tailwind theme tokens. Do not introduce raw hex values when a token exists.\n4. Preserve route, state, loading, empty, error, focus, and responsive behavior identified by the brief.\n5. Resolve stale/conflicting mappings and missing required props before editing. Read cited source files when the bounded brief omits needed details.\n6. Treat inferred story IDs and host-supplied mappings as evidence, not rendered verification. Run the actual project tests.\n\n## Handoff\n\nBefore editing, state the components and tokens you will reuse. After editing, cite files changed, evidence followed, checks run, and any design assumptions that remain.\n",
  "enforce-design-ci": "---\nname: enforce-design-ci\ndescription: Use when a repository needs deterministic pull-request checks for new accessibility, design-token, component-structure, responsive, and UI-state regressions with file-level evidence.\n---\n\n# Enforce Design CI\n\nAdd a reviewable design-quality gate that runs without an LLM. Memi writes a policy, baseline, universal agent skill, SARIF, and human-readable report artifacts.\n\nThe verification command targets the reviewed 2.8 frontend contract; check `memi --version` and npm registry availability. If the beta is unpublished, use a reviewed local candidate; after publication, use the exact verified beta version. Beta `init` remains unavailable in every profile. Initialization below uses public 2.7.9 explicitly and writes project configuration. The Action remains on public stable 2.7.9 during the beta.\n\n## Initialize\n\nInspect the worktree first. When the task authorizes setup, run:\n\n```bash\nnpx -y @memi-design/cli@2.7.9 init --team --kit universal --json\n```\n\nReview the generated policy and baseline before committing them. Existing debt remains visible but does not block unrelated pull requests.\n\n## Verify Locally\n\n```bash\nmemi --profile connected --allow project-write --allow source-content-persistence --allow shell ci . --no-scope --report --json\n```\n\nThe command may exit nonzero when findings exceed the configured gate. Treat that as a quality result, not a tool crash.\n\n## Add GitHub Actions\n\nUse the pinned major action in `.github/workflows/design.yml`:\n\n```yaml\nname: Design CI\non: [pull_request]\njobs:\n  design:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: read\n      security-events: write\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0\n      - uses: memi-design/memi@v2\n        with:\n          version: \"2.7.9\"\n```\n\n## Completion Criteria\n\n- Policy and baseline are reviewed and committed.\n- Local CI produces SARIF and a design-health report.\n- The workflow passes on unchanged accepted debt and fails on a seeded regression.\n- The final handoff names the gate threshold, suppressed baseline count, active findings, and artifact paths.\n",
  "build-swiftui-interface": "---\nname: build-swiftui-interface\ndescription: Use when a coding agent must design, scaffold, implement, or verify an iOS or macOS SwiftUI interface with Apple-platform state, accessibility, availability, testing, and Xcode evidence.\n---\n\n# Build SwiftUI Interface\n\nUse this as Apple-platform design and verification guidance. Pair it with an installed host's Apple-platform tools when simulator, profiling, App Intents, or detailed framework guidance is needed.\n\n## 2.8 beta availability\n\nThis skill requires the reviewed 2.8 frontend contract. Check `memi --version` and npm registry availability first. If the beta is unpublished, use a reviewed local build; after publication, use the exact verified beta version. npm stable remains 2.7.9.\n\nMemi's `ios brief` and `ios scaffold` commands are unavailable in 2.8.0-beta.1, including preview and write modes. Capability grants do not enable them. This skill does not provide an automatic SwiftUI scaffolding pipeline.\n\nWith a reviewed candidate running `memi --profile locked mcp start --no-figma`, the host may call the read-only `prepare_apple_design_brief` tool:\n\n```json\n{\"intent\":\"Review the feature contract\",\"platform\":\"ios\",\"detail\":\"compact\"}\n```\n\n`platform` accepts `ios` or `macos`. This tool prepares guidance without running Xcode or writing files; it does not inspect native source or replace project verification.\n\nInspect the actual project: deployment target, Swift language mode, shared schemes, local components, assets, navigation, state ownership, test targets, and nearby implementation patterns. Prepare the feature contract with the coding host using that evidence, and review proposed paths and source before writing. Preserve the repository's project-generation workflow.\n\nThe supported `memi agent brief . --json` command can provide general project context; it is not an equivalent Apple-platform brief or proof that SwiftUI was analyzed. Memi's frontend checks do not establish native UI correctness.\n\n## Implementation rules\n\n1. Reuse local SwiftUI components and semantic assets before adding primitives.\n2. Keep state ownership narrow; keep I/O and expensive work out of `body`.\n3. Define loading, empty, populated, error, Dynamic Type, VoiceOver, reduced-motion, and dark-appearance states.\n4. Gate newer APIs. Liquid Glass requires an iOS 26+ branch and a behaviorally equivalent fallback.\n5. Treat June 2026 APIs by their documented availability; do not invent an iOS version label.\n6. Preserve the existing architecture and project-generation workflow.\n\n## Verification receipt\n\nRun the repository's canonical commands. When none exist, discover shared schemes and explicit destinations with `xcodebuild -list -json` and `xcrun simctl list devices available`, then build and test the smallest target.\n\nReport exact commands, files, deployment assumptions, simulator flow, accessibility states, and anything not executed. A source review is not simulator proof, and a simulator build is not signing or App Store proof.\n"
};
const candidate = (name: string) => candidateRecipes[name];
const evaluate = (skillName: string, content: string, overrides = {}) => (gates as any).evaluateSkillDistributionGate({
  skillName, content, version: '2.8.0-beta.1', engineState: 'candidate', previousPublicVersion: '2.7.9', ...overrides,
});

describe('skill distribution release contracts', () => {
  it.each(names)('accepts the frozen reviewed local candidate recipe for %s', name => {
    expect(evaluate(name, candidate(name))).toEqual([]);
  });
  it.each(['2.8.0-beta.1', 'latest', '2.7.8'])('rejects candidate installation recipes using %s', version => {
    expect(evaluate('audit-frontend-design', candidate('audit-frontend-design') + `\n\`\`\`bash\nnpx -y @memi-design/cli@${version} diagnose .\n\`\`\``)).not.toEqual([]);
  });
  it.each([
    'memi agent install --dry-run --json',
    'memi --profile connected --allow project-write init --team --json',
    'memi ios scaffold --dry-run',
    'memi mcp start --no-figma',
  ])('rejects unavailable or unprofiled candidate recipe %s', command => {
    expect(evaluate('memoire-design-tooling', candidate('memoire-design-tooling') + `\n\`\`\`bash\n${command}\n\`\`\``)).not.toEqual([]);
  });
  it('rejects lost frontend and receipt contracts even if other local commands remain', () => {
    expect(evaluate('remember-design-system', candidate('remember-design-system').replaceAll('--frontend', '--mode local'))).not.toEqual([]);
    expect(evaluate('memoire-design-tooling', candidate('memoire-design-tooling').replaceAll('--receipt-only', '--json'))).not.toEqual([]);
  });
  it('requires reviewed local and unpublished availability language', () => {
    expect(evaluate('audit-frontend-design', candidate('audit-frontend-design').replace(/reviewed local/gi, 'available').replace(/unpublished/gi, 'published'))).not.toEqual([]);
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


const betaTerms: Record<string, string[]> = {
  'memoire-design-tooling': ['memi agent brief . --frontend', '--receipt-only', 'memi --profile locked mcp start --no-figma'],
  'audit-frontend-design': ['memi diagnose . --json --no-write', '--receipt-only'],
  'remember-design-system': ['memi agent brief . --frontend', '--design-evidence'],
  'enforce-design-ci': ['memi --profile connected --allow project-write --allow source-content-persistence --allow shell ci'],
  'build-swiftui-interface': ['prepare_apple_design_brief', 'memi --profile locked mcp start --no-figma', 'commands are unavailable'],
};
const publishedBeta = (name: string) => `name: ${name}\nPublished beta 2.8.0-beta.1, subject to named limitations.\nInstall: npx -y @memi-design/cli@2.8.0-beta.1\n${betaTerms[name].join('\n')}`;

describe('published beta supported skill distribution', () => {
  it.each(names)('accepts supported published beta recipes for %s', name => {
    expect(evaluate(name, publishedBeta(name), { engineState: 'published' })).toEqual([]);
  });
  it.each(['memi agent install --dry-run --json', 'memi init --team', 'memi ios scaffold --dry-run', 'memi mcp start --no-figma'])('rejects unsupported published beta recipe %s', command => {
    expect(evaluate('audit-frontend-design', publishedBeta('audit-frontend-design') + `\n\`\`\`bash\n${command}\n\`\`\``, { engineState: 'published' })).not.toEqual([]);
  });
  it.each(['latest', 'next', '2.7.9'])('rejects non-exact published beta install pin %s', pin => {
    expect(evaluate('audit-frontend-design', publishedBeta('audit-frontend-design').replace('cli@2.8.0-beta.1', `cli@${pin}`), { engineState: 'published' })).not.toEqual([]);
  });
  it('requires exact install pin, beta availability and supported frontend terms', () => {
    const content = publishedBeta('memoire-design-tooling');
    for (const term of ['npx -y @memi-design/cli@2.8.0-beta.1', 'Published beta', '--frontend', '--receipt-only']) {
      expect(evaluate('memoire-design-tooling', content.replace(term, ''), { engineState: 'published' })).not.toEqual([]);
    }
  });
});


describe('actual canonical skill distribution', () => {
  const manifest = JSON.parse(readFileSync('release-manifest.json', 'utf8'));
  const engine = manifest.releaseGroups.engine;
  it.each(names)('validates %s against the declared release state', name => {
    expect(['candidate', 'published']).toContain(engine.state);
    expect(evaluate(name, readFileSync(`skills/${name}/SKILL.md`, 'utf8'), {
      version: engine.version,
      engineState: engine.state,
      previousPublicVersion: engine.previousPublicRelease?.version,
    })).toEqual([]);
  });
});
