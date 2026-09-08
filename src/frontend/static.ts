import { parse } from '@babel/parser';
import { posix } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { fromDtcg, isDtcgDocument } from '../tokens/dtcg.js';
import { assertNotAborted, type FrontendSource } from './files.js';
import type { FrontendComponent, FrontendProp, FrontendStory, FrontendToken, FrontendOmission } from './types.js';
interface Ast { type: string; [key: string]: unknown; }
function node(value: unknown): Ast | undefined { return value !== null && typeof value === 'object' && 'type' in value ? value as Ast : undefined; }
function children(value: unknown): Ast[] { return Array.isArray(value) ? value.map(node).filter((item): item is Ast => Boolean(item)) : []; }
function name(value: unknown): string { const item = node(value); return typeof item?.name === 'string' ? item.name : typeof item?.value === 'string' ? item.value : ''; }
function unwrap(value: unknown): Ast | undefined {
  let current = node(value);
  for (let i = 0; i < 12 && current && ['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(current.type); i++) current = node(current.expression);
  return current;
}
function property(value: unknown, key: string): Ast | undefined {
  const object = unwrap(value);
  if (object?.type !== 'ObjectExpression') return undefined;
  const member = children(object.properties).find(item => item.type === 'ObjectProperty' && !item.computed && name(item.key) === key);
  return unwrap(member?.value);
}
function primitive(value: unknown): string | number | boolean | undefined {
  const item = node(value);
  if (item && ['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(item.type)) return item.value as string | number | boolean;
  return undefined;
}
function propsFor(type: Ast | undefined, types: Map<string, Ast>, depth = 0): { props: FrontendProp[]; complete: boolean } {
  if (!type || depth > 8) return { props: [], complete: false };
  if (type.type === 'TSTypeAnnotation') return propsFor(node(type.typeAnnotation), types, depth + 1);
  if (type.type === 'TSTypeReference') return propsFor(types.get(name(type.typeName)), types, depth + 1);
  if (type.type === 'TSTypeAliasDeclaration') return propsFor(node(type.typeAnnotation), types, depth + 1);
  if (type.type === 'TSInterfaceDeclaration') {
    const result = propsFor(node(type.body), types, depth + 1);
    return { ...result, complete: result.complete && children(type.extends).length === 0 };
  }
  const members = children(type.type === 'TSInterfaceBody' ? type.body : type.members);
  if (!['TSInterfaceBody', 'TSTypeLiteral'].includes(type.type)) return { props: [], complete: false };
  const props = members.filter(item => item.type === 'TSPropertySignature' && !item.computed).map(member => {
    const annotation = node(node(member.typeAnnotation)?.typeAnnotation);
    const literalTypes = annotation?.type === 'TSUnionType' ? children(annotation.types) : annotation ? [annotation] : [];
    const values = literalTypes.map(item => primitive(item.literal));
    const hasValues = values.length > 0 && values.every(value => value !== undefined);
    return { name: name(member.key), required: !member.optional, type: annotation?.type.replace(/^TS|Keyword$/g, '') ?? 'unknown', ...(hasValues ? { values: values as Array<string | number | boolean> } : {}) };
  });
  return { props, complete: members.every(item => item.type === 'TSPropertySignature' && !item.computed) };
}
function declarationProps(declaration: Ast | undefined, types: Map<string, Ast>) {
  if (!declaration) return { props: [], complete: false };
  if (declaration.type === 'VariableDeclarator') return declarationProps(unwrap(declaration.init), types);
  if (!['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(declaration.type)) return { props: [], complete: false };
  const parameters = children(declaration.params);
  if (parameters.length === 0) return { props: [], complete: true };
  return propsFor(node(parameters[0].typeAnnotation), types);
}
function declarations(statements: Ast[]): Ast[] {
  return statements.flatMap(statement => {
    const declaration = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? node(statement.declaration) : statement;
    return declaration?.type === 'VariableDeclaration' ? children(declaration.declarations) : declaration ? [declaration] : [];
  });
}
function resolveImport(from: string, specifier: string, available: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier));
  if (base.startsWith('../')) return undefined;
  return [base, ...['.tsx', '.ts', '.jsx', '.js'].map(extension => base + extension), ...['.tsx', '.ts', '.jsx', '.js'].map(extension => base + '/index' + extension)].find(path => available.has(path));
}
export async function discoverStaticEvidence(sources: FrontendSource[], signal?: AbortSignal) {
  const components: FrontendComponent[] = []; const stories: FrontendStory[] = []; const tokens: FrontendToken[] = []; const omissions: FrontendOmission[] = [];
  const available = new Set(sources.map(source => source.path));
  for (const source of sources) {
    await setImmediate();
    assertNotAborted(signal);
    if (source.path.endsWith('.css')) { tokens.push(...cssTokens(source)); continue; }
    if (source.path.endsWith('.json')) { tokens.push(...jsonTokens(source, omissions)); continue; }
    let statements: Ast[];
    try { statements = parse(source.content, { sourceType: 'unambiguous', plugins: ['typescript', 'jsx'] }).program.body as unknown as Ast[]; }
    catch { omissions.push({ path: source.path, reason: 'parse-failure' }); continue; }
    const local = declarations(statements);
    const types = new Map(local.filter(item => ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(item.type)).map(item => [name(item.id), item]));
    const locals = new Map(local.map(item => [name(item.id), item]));
    if (/\.stories\.[jt]sx?$/.test(source.path)) {
      stories.push(...discoverStories(source.path, statements, locals, available, omissions)); continue;
    }
    for (const statement of statements) {
      if (statement.type === 'ExportAllDeclaration' || (statement.type === 'ExportNamedDeclaration' && statement.source)) { omissions.push({ path: source.path, reason: 'reexport-unassessed' }); continue; }
      const declaration = node(statement.declaration);
      const exported = statement.type === 'ExportDefaultDeclaration' ? [{ exportName: 'default', declaration: declaration?.type === 'Identifier' ? locals.get(name(declaration)) : declaration }]
        : statement.type === 'ExportNamedDeclaration' ? [
          ...(declaration?.type === 'VariableDeclaration' ? children(declaration.declarations) : declaration ? [declaration] : []).map(item => ({ exportName: name(item.id), declaration: item })),
          ...children(statement.specifiers).map(item => ({ exportName: name(item.exported), declaration: locals.get(name(item.local)) })),
        ] : [];
      for (const item of exported) {
        if (!item.declaration || ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(item.declaration.type) || (item.exportName !== 'default' && !/^[A-Z]/.test(item.exportName))) continue;
        const implementation = item.declaration.type === 'VariableDeclarator' ? unwrap(item.declaration.init) : item.declaration;
        if (!implementation || !['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'CallExpression', 'ClassDeclaration'].includes(implementation.type)) continue;
        const api = declarationProps(item.declaration, types);
        const loc = item.declaration.loc as { start?: { line?: number } } | undefined;
        components.push({ path: source.path, exportName: item.exportName, import: item.exportName === 'default' ? `import Component from './${source.path.replace(/\.[jt]sx?$/, '')}';` : `import { ${item.exportName} } from './${source.path.replace(/\.[jt]sx?$/, '')}';`, sourceHash: source.hash, props: api.props, propsComplete: api.complete, line: loc?.start?.line ?? 1 });
      }
    }
  }
  const resolvedStories = stories.filter(story => components.some(component => component.path === story.componentPath && component.exportName === story.componentExport));
  const unresolvedStoryPaths = [...new Set(stories.filter(story => !resolvedStories.includes(story)).map(story => story.path))];
  return { components, stories: resolvedStories, tokens, omissions: [...omissions, ...unresolvedStoryPaths.map(path => ({ path, reason: 'story-export-unresolved' }))] };
}
function discoverStories(path: string, statements: Ast[], locals: Map<string, Ast>, available: Set<string>, omissions: FrontendOmission[]): FrontendStory[] {
  const exportedDefault = statements.find(item => item.type === 'ExportDefaultDeclaration');
  let meta = unwrap(exportedDefault?.declaration);
  if (meta?.type === 'Identifier') meta = unwrap(locals.get(name(meta))?.init);
  const component = property(meta, 'component');
  const title = primitive(property(meta, 'title'));
  const imports = statements.filter(item => item.type === 'ImportDeclaration');
  const importDeclaration = imports.find(item => children(item.specifiers).some(specifier => name(specifier.local) === name(component)));
  const specifier = children(importDeclaration?.specifiers).find(item => name(item.local) === name(component));
  const importPath = primitive(importDeclaration?.source);
  const componentPath = typeof importPath === 'string' ? resolveImport(path, importPath, available) : undefined;
  if (!componentPath || !specifier) { omissions.push({ path, reason: 'story-component-unresolved' }); return []; }
  if (property(meta, 'includeStories') || property(meta, 'excludeStories') || children(meta?.properties).some(item => item.type === 'SpreadElement')) {
    omissions.push({ path, reason: 'story-filter-or-spread-unassessed' }); return [];
  }
  const componentExport = specifier.type === 'ImportDefaultSpecifier' ? 'default' : name(specifier.imported);
  const names = statements.filter(item => item.type === 'ExportNamedDeclaration' && item.exportKind !== 'type').flatMap(item => {
    const declaration = node(item.declaration);
    return declaration?.type === 'VariableDeclaration' ? children(declaration.declarations).map(item => name(item.id)) : declaration?.type === 'FunctionDeclaration' ? [name(declaration.id)] : [];
  });
  return names.filter(Boolean).map(exportName => ({ path, exportName, ref: `${path}#${exportName}`, componentPath, componentExport, ...(typeof title === 'string' ? { id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}--${exportName.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}` } : {}), status: 'inferred' }));
}
function cssTokens(source: FrontendSource): FrontendToken[] {
  const withoutComments = source.content.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)\s*[;}]/g)].map(match => ({ path: source.path, name: match[1], value: match[2].trim(), mode: 'unassessed' }));
}
function jsonTokens(source: FrontendSource, omissions: FrontendOmission[]): FrontendToken[] {
  try {
    const value: unknown = JSON.parse(source.content);
    if (!isDtcgDocument(value)) { omissions.push({ path: source.path, reason: 'token-format-unassessed' }); return []; }
    const parsed = fromDtcg(value);
    if (parsed.warnings.length) omissions.push({ path: source.path, reason: 'token-alias-or-type-unresolved' });
    return parsed.tokens.flatMap(token => Object.entries(token.values).map(([mode, value]) => ({ path: source.path, name: token.name, value, mode })));
  } catch { omissions.push({ path: source.path, reason: 'token-parse-failure' }); return []; }
}
