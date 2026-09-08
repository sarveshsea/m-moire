import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRepositoryAgentAuditContext } from '../agent-context.js';
import type { AppQualityDiagnosis } from '../engine.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, {recursive:true,force:true}))); });
function diagnosis(file: string): AppQualityDiagnosis {
 return {target:'.',generatedAt:'2026-09-08T00:00:00.000Z',summary:{},files:[{path:file,kind:'component',classCount:1,shadcnImports:[],hexColors:[],cssVariables:[]}],issues:[],sourceCoverage:{},assessedDimensions:[],unassessedDimensions:[],evidenceProvenance:[]} as unknown as AppQualityDiagnosis;
}
async function fixture() {const root=await mkdtemp(join(tmpdir(),'memi-context-read-'));roots.push(root);await mkdir(join(root,'repo'));await mkdir(join(root,'outside'));await writeFile(join(root,'outside','secret.tsx'),'export const Secret = () => <button className="PRIVATE_SOURCE_SENTINEL"/>;');return root;}
describe('repository excerpt read authority',()=>{
 it.each(['leaf','directory'] as const)('omits %s symlink escapes without returning source',async kind=>{
  const root=await fixture();
  if(kind==='leaf') await symlink(join(root,'outside','secret.tsx'),join(root,'repo','Button.tsx'));
  else await symlink(join(root,'outside'),join(root,'repo','src'),process.platform==='win32'?'junction':'dir');
  const result=await buildRepositoryAgentAuditContext(join(root,'repo'),diagnosis(kind==='leaf'?'Button.tsx':'src/secret.tsx'),{routingMode:'full'});
  expect(JSON.stringify(result)).not.toContain('PRIVATE_SOURCE_SENTINEL');expect(result.sourceExcerpts).toHaveLength(0);
  expect(result.excerptOmissions).toHaveLength(1);
 });
 it('reports oversized excerpt inputs instead of reading them without a ceiling',async()=>{
  const root=await fixture();await writeFile(join(root,'repo','Button.tsx'),'export const Big = () => <div className="TOO_LARGE"/>;\n'+' '.repeat(300_000));
  const result=await buildRepositoryAgentAuditContext(join(root,'repo'),diagnosis('Button.tsx'),{routingMode:'full'});
  expect(result.sourceExcerpts).toHaveLength(0);expect(result.excerptOmissions[0].reason).toBe('file-byte-limit');
 });
 it('keeps ordinary contained source useful',async()=>{
  const root=await fixture();await writeFile(join(root,'repo','Button.tsx'),'export const Button = () => <button className="rounded-md"/>;');
  const result=await buildRepositoryAgentAuditContext(join(root,'repo'),diagnosis('Button.tsx'),{routingMode:'full'});
  expect(JSON.stringify(result.sourceExcerpts)).toContain('rounded-md');expect(result.excerptOmissions).toEqual([]);
 });
});
