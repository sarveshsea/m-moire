import { normalizeTokenPath } from '../tokens/dtcg.js';
import { normalizeDesignEvidence, fingerprint, type DesignEvidence } from './evidence.js';
import { readFrontendSources, SOURCE_LIMITS, assertNotAborted } from './files.js';
import { discoverStaticEvidence } from './static.js';
import type { FrontendBrief, FrontendMapping, FrontendComponent, FrontendToken, FrontendStory } from './types.js';
export { normalizeDesignEvidence, DesignEvidenceSchema } from './evidence.js';
export type { DesignEvidence } from './evidence.js';
export type { FrontendBrief, FrontendComponent, FrontendMapping, FrontendStory, FrontendToken } from './types.js';
export interface BuildFrontendBriefOptions { projectRoot: string; intent: string; designEvidence?: unknown; maxBytes?: number; signal?: AbortSignal; }

/** Read-only source context for the calling harness. This is not a metadata receipt or rendered verification. */
export async function buildFrontendBrief(options: BuildFrontendBriefOptions): Promise<FrontendBrief> {
  assertNotAborted(options.signal);
  const maxBytes = options.maxBytes ?? 16384;
  if (!Number.isInteger(maxBytes) || maxBytes < 2048 || maxBytes > 16384) throw new Error('maxBytes must be an integer between 2048 and 16384.');
  if (typeof options.intent !== 'string' || !options.intent.trim() || Buffer.byteLength(options.intent) > 1024) throw new Error('Intent must contain 1–1024 UTF-8 bytes.');
  const evidence = options.designEvidence === undefined ? undefined : normalizeDesignEvidence(options.designEvidence);
  const files = await readFrontendSources(options.projectRoot, options.signal);
  const discovered = await discoverStaticEvidence(files.sources, options.signal);
  const mappings = resolveMappings(evidence, discovered.components, discovered.tokens, discovered.stories);
  const terms = new Set(options.intent.toLowerCase().split(/\W+/).filter(Boolean));
  const priority = (component: FrontendComponent) => (evidence?.mappings.some(mapping => mapping.path === component.path && mapping.exportName === component.exportName) ? 100 : 0) + (terms.has(component.exportName.toLowerCase()) ? 10 : 0);
  const components = [...discovered.components].sort((a, b) => priority(b) - priority(a) || compare(a.path + a.exportName, b.path + b.exportName));
  const omissions = [...files.omissions, ...discovered.omissions].sort((a, b) => compare(a.path + a.reason, b.path + b.reason));
  const brief: FrontendBrief = {
    schemaVersion: 'memi.frontend-brief.v1', intent: options.intent,
    design: evidence ? { source: evidence.source, documentId: evidence.documentId, nodeId: evidence.nodeId, ...(evidence.revision ? { revision: evidence.revision } : {}), fingerprint: fingerprint(JSON.stringify(evidence)), acquisition: 'host-supplied', adapterVersion: '1' } : null,
    components, tokens: discovered.tokens, stories: discovered.stories, mappings,
    scan: { complete: omissions.length === 0, filesRead: files.sources.length, bytesRead: files.bytesRead, fingerprint: fingerprint(files.sources.map(source => `${source.path}:${source.hash}`).join('\n')) },
    omissions, retrieval: [],
    unresolved: [
      ...(!evidence ? ['Design connector context was not supplied; design intent is unassessed.'] : []),
      ...(evidence && !evidence.mappings.length ? ['No explicit code mappings supplied; component candidates are not verified design matches.'] : []),
      ...(discovered.stories.length === 0 ? ['No statically resolved stories; rendered behavior remains unassessed.'] : []),
      ...(mappings.some(mapping => mapping.status !== 'observed') ? ['Mapping conflicts, stale fingerprints or incomplete APIs require resolution before implementation.'] : []),
      ...(components.some(component => !component.propsComplete) ? ['Some component APIs require source inspection; external types and computed props are unassessed.'] : []),
      'Imports are relative to the repository root; adapt to the destination module. Story IDs are inferred until checked against a Storybook index.',
    ],
    verification: { status: 'unassessed', reason: 'Static discovery only. Run authorized repository tests and rendered accessibility/interaction checks; no tool execution is implied.' },
    limits: { maxBytes, ...SOURCE_LIMITS, omittedItems: 0 },
  };
  return boundBrief(brief, maxBytes);
}
function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function resolveMappings(evidence: DesignEvidence | undefined, components: FrontendComponent[], tokens: FrontendToken[], stories: FrontendStory[]): FrontendMapping[] {
  return (evidence?.mappings ?? []).map(mapping => {
    const component = components.find(item => item.path === mapping.path && item.exportName === mapping.exportName);
    const issues: string[] = [];
    const peers = evidence?.mappings.filter(other => other !== mapping && other.path === mapping.path && other.exportName === mapping.exportName) ?? [];
    if (peers.some(other => Object.keys(mapping.props).some(key => key in other.props && other.props[key] !== mapping.props[key]))) {
      issues.push('Conflicting design prop values target the same component mapping. Supply one selected instance at a time.');
    }
    if (!component) issues.push('Mapped export is absent or unsupported in the current bounded repository scan.');
    if (component && mapping.sourceHash && component.sourceHash !== mapping.sourceHash) issues.push('Code fingerprint differs from the supplied mapping.');
    for (const [key, value] of Object.entries(mapping.props)) {
      const prop = component?.props.find(item => item.name === key);
      if (!prop) issues.push(`${key}: ${component?.propsComplete ? 'unsupported prop' : 'prop unassessed'}.`);
      else if (prop.values && !prop.values.includes(value as string | number | boolean)) issues.push(`${key}: unsupported value.`);
      else if (['String', 'Number', 'Boolean'].includes(prop.type) && typeof value !== prop.type.toLowerCase()) issues.push(`${key}: incompatible primitive type.`);
      else if (!prop.values && !['String', 'Number', 'Boolean'].includes(prop.type)) issues.push(`${key}: value compatibility unassessed.`);
    }
    for (const token of mapping.tokens) {
      const matches = tokens.filter(item => normalizeTokenPath(item.name) === normalizeTokenPath(token));
      if (!matches.length) issues.push(`${token}: token missing from the bounded scan.`);
      else if (new Set(matches.map(item => JSON.stringify(item.value))).size > 1) issues.push(`${token}: conflicting values or unresolved modes.`);
    }
    const stale = Boolean(component && mapping.sourceHash && component.sourceHash !== mapping.sourceHash);
    const uncertain = !component?.propsComplete || issues.some(issue => issue.includes('unassessed'));
    return { path: mapping.path, exportName: mapping.exportName, status: !component ? 'conflict' : stale ? 'stale' : issues.some(issue => !issue.includes('unassessed')) ? 'conflict' : uncertain ? 'unassessed' : 'observed', issues, storyRefs: stories.filter(story => story.componentPath === mapping.path && story.componentExport === mapping.exportName).map(story => story.ref), mustReuse: Boolean(component), requestedProps: { ...mapping.props }, tokenRefs: [...mapping.tokens] };
  });
}
function boundBrief(input: FrontendBrief, maxBytes: number): FrontendBrief {
  let brief = input;
  while (Buffer.byteLength(JSON.stringify(brief)) > maxBytes) {
    const key = (['tokens', 'stories', 'components', 'mappings'] as const).find(key => brief[key].length > 0);
    if (!key) {
      if (brief.omissions.length > 1 || brief.retrieval.length > 1 || brief.unresolved.length > 1) {
        brief = { ...brief, omissions: [{ path: '.', reason: 'context-budget' }], retrieval: ['.'], unresolved: ['Context omitted. Inspect source and resolve mappings before implementation; verification remains unassessed.'] };
        continue;
      }
      if (brief.intent.length > 80 || (brief.design && (brief.design.documentId.length > 80 || brief.design.nodeId.length > 80 || (brief.design.revision?.length ?? 0) > 80))) {
        brief = { ...brief, intent: brief.intent.slice(0, 80), design: brief.design ? { ...brief.design, documentId: brief.design.documentId.slice(0, 80), nodeId: brief.design.nodeId.slice(0, 80), revision: brief.design.revision?.slice(0, 80) } : null };
        continue;
      }
      throw new Error('Brief metadata cannot fit the requested byte budget.');
    }
    const removeCount = brief[key].length > 32 ? Math.ceil(brief[key].length / 2) : 1;
    const removed = brief[key].slice(-removeCount);
    const refs = removed.map(item => item.path);
    brief = { ...brief, [key]: brief[key].slice(0, -removeCount), limits: { ...brief.limits, omittedItems: brief.limits.omittedItems + removeCount }, omissions: brief.omissions.some(item => item.reason === 'context-budget') ? brief.omissions : [...brief.omissions, { path: '.', reason: 'context-budget' }], retrieval: [...new Set([...brief.retrieval, ...refs])].slice(0, 8) };
  }
  return brief;
}
