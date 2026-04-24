import type { DesignToken } from "../engine/registry.js";

type TokenType = DesignToken["type"];

export interface TokenExtractionSource {
  id: string;
  content: string;
  kind?: "css" | "html" | "tsx" | "jsx" | "js" | "ts" | "vue" | "svelte" | "unknown";
}

export interface TokenAlias {
  token: string;
  cssVariable: string;
  mode: string;
  references: string[];
  rawValue: string;
}

export interface LiteralTokenCandidate {
  type: TokenType;
  value: string;
  occurrences: number;
  properties: string[];
  promoted: boolean;
}

export interface UtilityTokenCandidate {
  type: TokenType;
  utility: string;
  occurrences: number;
}

export interface TokenFamilySummary {
  count: number;
  tokenNames: string[];
  cssVariables: string[];
  modes: string[];
}

export interface TokenSemanticCoverage {
  score: number;
  required: string[];
  present: string[];
  missing: string[];
}

export interface TokenScaleHealth {
  overallScore: number;
  colorScaleScore: number;
  spacingScaleScore: number;
  typographyScaleScore: number;
  radiusScaleScore: number;
  notes: string[];
}

export interface TokenModeCoverage {
  score: number;
  modes: string[];
  completeTokenCount: number;
  partialTokenCount: number;
  missingByMode: Record<string, string[]>;
}

export interface TokenDuplicateGroup {
  type: TokenType;
  value: string;
  tokens: string[];
}

export interface TokenAliasGraph {
  edgeCount: number;
  resolvedReferenceCount: number;
  unresolvedReferences: Array<{ token: string; reference: string }>;
  circularReferences: string[][];
  maxDepth: number;
}

export interface TokenRecommendation {
  priority: "high" | "medium" | "low";
  action: string;
  rationale: string;
}

export interface TokenExtractionSummary {
  tokenCount: number;
  variableTokenCount: number;
  inferredTokenCount: number;
  aliasCount: number;
  modeCount: number;
  modeCoverageScore: number;
  literalCandidateCount: number;
  utilityCandidateCount: number;
  duplicateGroupCount: number;
  unresolvedAliasCount: number;
  confidenceScore: number;
  notes: string[];
}

export interface TokenExtractionReport {
  tokens: DesignToken[];
  aliases: TokenAlias[];
  modes: string[];
  sourceCount: number;
  families: Record<TokenType, TokenFamilySummary>;
  semanticCoverage: TokenSemanticCoverage;
  scaleHealth: TokenScaleHealth;
  modeCoverage: TokenModeCoverage;
  duplicates: TokenDuplicateGroup[];
  aliasGraph: TokenAliasGraph;
  recommendations: TokenRecommendation[];
  literalCandidates: LiteralTokenCandidate[];
  utilityCandidates: UtilityTokenCandidate[];
  summary: TokenExtractionSummary;
}

interface TokenDraft {
  name: string;
  cssVariable: string;
  type: TokenType;
  values: Map<string, string | number>;
  collection: string;
  sourceIds: Set<string>;
  inferred: boolean;
}

interface Declaration {
  property: string;
  value: string;
  selector: string;
  mode: string;
  sourceId: string;
}

interface LiteralAccumulator {
  type: TokenType;
  value: string;
  occurrences: number;
  properties: Set<string>;
}

const TOKEN_TYPES: TokenType[] = ["color", "spacing", "typography", "radius", "shadow", "other"];
const SEMANTIC_SLOTS = [
  "background",
  "foreground",
  "primary",
  "secondary",
  "accent",
  "muted",
  "border",
  "ring",
  "card",
  "popover",
  "destructive",
  "input",
];

const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\b(?:rgba?|hsla?|oklch|lch|lab)\([^)]+\)/g,
  /\bcolor-mix\([^)]+\)/g,
];

const IGNORE_COLORS = new Set([
  "#000",
  "#000000",
  "#fff",
  "#ffffff",
  "#0000",
  "#ffff",
  "transparent",
  "currentcolor",
  "rgba(0,0,0,0)",
  "rgba(255,255,255,0)",
]);

const SOURCE_FILE_LIMIT = 500;
const PROMOTED_LITERAL_LIMIT = 36;

export function extractDesignTokensFromCss(
  cssBlocks: string[],
  options: { sourceName?: string; includeInferredLiterals?: boolean } = {},
): TokenExtractionReport {
  const sources = cssBlocks.map((content, index) => ({
    id: options.sourceName ? `${options.sourceName}#css-${index + 1}` : `css-${index + 1}`,
    content,
    kind: "css" as const,
  }));
  return extractDesignTokensFromSources(sources, options);
}

export function extractDesignTokensFromSources(
  sources: TokenExtractionSource[],
  options: { sourceName?: string; includeInferredLiterals?: boolean } = {},
): TokenExtractionReport {
  const cappedSources = sources.slice(0, SOURCE_FILE_LIMIT);
  const drafts = new Map<string, TokenDraft>();
  const aliases: TokenAlias[] = [];
  const literalMap = new Map<string, LiteralAccumulator>();
  const utilityMap = new Map<string, UtilityTokenCandidate>();
  const includeInferredLiterals = options.includeInferredLiterals ?? true;

  for (const source of cappedSources) {
    const declarations = extractDeclarations(source);
    for (const declaration of declarations) {
      if (declaration.property.startsWith("--")) {
        const cssVariable = normalizeCssVariable(declaration.property);
        const tokenName = tokenNameFromCssVariable(cssVariable);
        const draft = drafts.get(cssVariable) ?? {
          name: tokenName,
          cssVariable,
          type: classifyToken(tokenName, declaration.value),
          values: new Map<string, string | number>(),
          collection: `extracted:${source.id}`,
          sourceIds: new Set<string>(),
          inferred: false,
        };
        draft.type = chooseMoreSpecificType(draft.type, classifyToken(tokenName, declaration.value));
        draft.values.set(declaration.mode, normalizeTokenValue(declaration.value));
        draft.sourceIds.add(source.id);
        drafts.set(cssVariable, draft);

        const references = extractVariableReferences(declaration.value);
        if (references.length > 0) {
          aliases.push({
            token: tokenName,
            cssVariable,
            mode: declaration.mode,
            references,
            rawValue: declaration.value,
          });
        }
      } else {
        collectLiteralCandidates(declaration, literalMap);
      }
    }

    collectUtilityCandidates(source.content, utilityMap);
  }

  propagateAliasTypes(drafts, aliases);

  const literalCandidates = Array.from(literalMap.values())
    .map((candidate) => ({
      type: candidate.type,
      value: candidate.value,
      occurrences: candidate.occurrences,
      properties: Array.from(candidate.properties).sort(),
      promoted: false,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.value.localeCompare(b.value));

  if (includeInferredLiterals) {
    promoteLiteralTokens(drafts, literalCandidates, options.sourceName ?? "source");
  }

  const tokens = Array.from(drafts.values())
    .map((draft) => draftToToken(draft))
    .sort(compareTokens);

  const modes = collectModes(tokens);
  const families = buildFamilies(tokens, modes);
  const semanticCoverage = buildSemanticCoverage(tokens);
  const modeCoverage = buildModeCoverage(tokens, modes);
  const duplicates = buildDuplicateGroups(tokens);
  const aliasGraph = buildAliasGraph(tokens, aliases);
  const scaleHealth = buildScaleHealth(tokens, semanticCoverage, modeCoverage, aliasGraph);
  const utilityCandidates = Array.from(utilityMap.values())
    .sort((a, b) => b.occurrences - a.occurrences || a.utility.localeCompare(b.utility));

  const variableTokenCount = tokens.filter((token) => !token.collection.startsWith("inferred-literal:")).length;
  const inferredTokenCount = tokens.length - variableTokenCount;
  const recommendations = buildRecommendations({
    semanticCoverage,
    modeCoverage,
    duplicates,
    aliasGraph,
    inferredTokenCount,
    utilityCandidateCount: utilityCandidates.length,
  });
  const summary = buildSummary({
    tokenCount: tokens.length,
    variableTokenCount,
    inferredTokenCount,
    aliasCount: aliases.length,
    modeCount: modes.length,
    modeCoverageScore: modeCoverage.score,
    literalCandidateCount: literalCandidates.length,
    utilityCandidateCount: utilityCandidates.length,
    duplicateGroupCount: duplicates.length,
    unresolvedAliasCount: aliasGraph.unresolvedReferences.length,
    scaleHealth,
    semanticCoverage,
  });

  return {
    tokens,
    aliases,
    modes,
    sourceCount: cappedSources.length,
    families,
    semanticCoverage,
    scaleHealth,
    modeCoverage,
    duplicates,
    aliasGraph,
    recommendations,
    literalCandidates,
    utilityCandidates,
    summary,
  };
}

export function renderTokenExtractionSummary(report: TokenExtractionReport): string[] {
  const lines = [
    `${report.summary.tokenCount} tokens extracted`,
    `${report.summary.variableTokenCount} variable-backed`,
    `${report.summary.inferredTokenCount} inferred from repeated literals`,
    `${report.summary.modeCount} mode${report.summary.modeCount === 1 ? "" : "s"}`,
    `mode coverage ${report.modeCoverage.score}/100`,
    `${report.summary.aliasCount} alias${report.summary.aliasCount === 1 ? "" : "es"}`,
    `${report.summary.unresolvedAliasCount} unresolved alias reference${report.summary.unresolvedAliasCount === 1 ? "" : "s"}`,
    `semantic coverage ${report.semanticCoverage.score}/100`,
    `scale health ${report.scaleHealth.overallScore}/100`,
  ];

  if (report.summary.notes.length > 0) {
    lines.push(...report.summary.notes.slice(0, 3));
  }

  return lines;
}

export function renderTokenExtractionMarkdown(report: TokenExtractionReport, sourceLabel = "token source"): string {
  const familyRows = TOKEN_TYPES.map((type) =>
    `| ${type} | ${report.families[type].count} | ${report.families[type].modes.join(", ") || "-"} |`,
  ).join("\n");

  const missingModeRows = Object.entries(report.modeCoverage.missingByMode)
    .filter(([, tokens]) => tokens.length > 0)
    .map(([mode, tokens]) => `| ${mode} | ${tokens.slice(0, 20).join(", ")}${tokens.length > 20 ? `, +${tokens.length - 20} more` : ""} |`)
    .join("\n");

  const duplicateRows = report.duplicates.slice(0, 20).map((group) =>
    `| ${group.type} | \`${group.value}\` | ${group.tokens.join(", ")} |`,
  ).join("\n");

  const unresolvedRows = report.aliasGraph.unresolvedReferences.slice(0, 20).map((item) =>
    `| ${item.token} | ${item.reference} |`,
  ).join("\n");

  const recommendationRows = report.recommendations.map((item) =>
    `| ${item.priority} | ${item.action} | ${item.rationale} |`,
  ).join("\n");

  return [
    `# Token Extraction Report`,
    ``,
    `Source: ${sourceLabel}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Executive Summary`,
    ``,
    `- Tokens extracted: ${report.summary.tokenCount}`,
    `- Variable-backed tokens: ${report.summary.variableTokenCount}`,
    `- Inferred tokens: ${report.summary.inferredTokenCount}`,
    `- Modes: ${report.modes.join(", ") || "default"}`,
    `- Semantic coverage: ${report.semanticCoverage.score}/100`,
    `- Mode coverage: ${report.modeCoverage.score}/100`,
    `- Scale health: ${report.scaleHealth.overallScore}/100`,
    `- Confidence: ${report.summary.confidenceScore}/100`,
    ``,
    `## Token Families`,
    ``,
    `| Family | Count | Modes |`,
    `|--------|-------|-------|`,
    familyRows,
    ``,
    `## Semantic Coverage`,
    ``,
    `Present: ${report.semanticCoverage.present.join(", ") || "none"}`,
    ``,
    `Missing: ${report.semanticCoverage.missing.join(", ") || "none"}`,
    ``,
    `## Mode Coverage`,
    ``,
    `Complete mode-sensitive tokens: ${report.modeCoverage.completeTokenCount}`,
    ``,
    `Partial mode-sensitive tokens: ${report.modeCoverage.partialTokenCount}`,
    ``,
    missingModeRows ? [
      `| Mode | Missing tokens |`,
      `|------|----------------|`,
      missingModeRows,
      ``,
    ].join("\n") : `No missing mode-sensitive tokens detected.\n`,
    `## Alias Graph`,
    ``,
    `- Alias edges: ${report.aliasGraph.edgeCount}`,
    `- Resolved references: ${report.aliasGraph.resolvedReferenceCount}`,
    `- Unresolved references: ${report.aliasGraph.unresolvedReferences.length}`,
    `- Circular references: ${report.aliasGraph.circularReferences.length}`,
    `- Max alias depth: ${report.aliasGraph.maxDepth}`,
    ``,
    unresolvedRows ? [
      `| Token | Missing reference |`,
      `|-------|-------------------|`,
      unresolvedRows,
      ``,
    ].join("\n") : `No unresolved alias references detected.\n`,
    `## Duplicate Values`,
    ``,
    duplicateRows ? [
      `| Type | Value | Tokens |`,
      `|------|-------|--------|`,
      duplicateRows,
      ``,
    ].join("\n") : `No duplicate token values detected.\n`,
    `## Recommendations`,
    ``,
    recommendationRows ? [
      `| Priority | Action | Rationale |`,
      `|----------|--------|-----------|`,
      recommendationRows,
      ``,
    ].join("\n") : `No recommendations. Token extraction looks publish-ready.\n`,
    `## Notes`,
    ``,
    report.summary.notes.map((note) => `- ${note}`).join("\n") || "- No notes.",
    ``,
  ].join("\n");
}

function extractDeclarations(source: TokenExtractionSource): Declaration[] {
  const css = stripComments(extractStyleContent(source.content));
  const declarations: Declaration[] = [];

  const themeRegex = /@theme([^{]*)\{([\s\S]*?)\}/gi;
  let themeMatch: RegExpExecArray | null;
  while ((themeMatch = themeRegex.exec(css)) !== null) {
    const selector = `@theme${themeMatch[1] ?? ""}`;
    const mode = inferMode(selector);
    declarations.push(...parseDeclarationBlock(themeMatch[2] ?? "", selector, mode, source.id));
  }

  const ruleRegex = /([^{}]+)\{([^{}]*)\}/g;
  let ruleMatch: RegExpExecArray | null;
  while ((ruleMatch = ruleRegex.exec(css)) !== null) {
    const selector = (ruleMatch[1] ?? "").trim();
    if (!selector || selector.startsWith("@keyframes")) continue;
    const mode = inferMode(selector);
    declarations.push(...parseDeclarationBlock(ruleMatch[2] ?? "", selector, mode, source.id));
  }

  return declarations;
}

function extractStyleContent(content: string): string {
  const styleBlocks: string[] = [];
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleRegex.exec(content)) !== null) {
    const body = styleMatch[1]?.trim();
    if (body) styleBlocks.push(body);
  }

  if (styleBlocks.length === 0) return content;
  return styleBlocks.join("\n");
}

function parseDeclarationBlock(
  block: string,
  selector: string,
  mode: string,
  sourceId: string,
): Declaration[] {
  const declarations: Declaration[] = [];

  const customPropertyRegex = /(--[\w-]+)\s*:\s*([^;{}]+)/g;
  let customMatch: RegExpExecArray | null;
  while ((customMatch = customPropertyRegex.exec(block)) !== null) {
    const property = customMatch[1]?.trim();
    const value = cleanDeclarationValue(customMatch[2] ?? "");
    if (property && value) {
      declarations.push({ property, value, selector, mode, sourceId });
    }
  }

  const propertyRegex = /([a-zA-Z-][\w-]*)\s*:\s*([^;{}]+)/g;
  let propertyMatch: RegExpExecArray | null;
  while ((propertyMatch = propertyRegex.exec(block)) !== null) {
    const property = propertyMatch[1]?.trim().toLowerCase();
    const value = cleanDeclarationValue(propertyMatch[2] ?? "");
    if (property && value && !property.startsWith("--")) {
      declarations.push({ property, value, selector, mode, sourceId });
    }
  }

  return declarations;
}

function cleanDeclarationValue(value: string): string {
  return value
    .replace(/!important/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "");
}

function inferMode(selector: string): string {
  const lower = selector.toLowerCase();
  const dataTheme = selector.match(/\[data-(?:theme|mode)=["']?([\w-]+)["']?\]/i);
  if (dataTheme?.[1]) return dataTheme[1].toLowerCase();
  const themeClass = selector.match(/\.theme-([\w-]+)/i);
  if (themeClass?.[1]) return themeClass[1].toLowerCase();
  if (lower.includes("prefers-color-scheme: dark") || lower.includes(".dark")) return "dark";
  if (lower.includes("@theme") || lower.includes(":root") || lower.includes(":host")) return "default";
  return "default";
}

function normalizeCssVariable(property: string): string {
  const trimmed = property.trim();
  return trimmed.startsWith("--") ? trimmed : `--${trimmed}`;
}

function tokenNameFromCssVariable(cssVariable: string): string {
  return cssVariable
    .replace(/^--/, "")
    .replace(/_/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTokenValue(value: string): string | number {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function classifyToken(name: string, rawValue: string): TokenType {
  const lowerName = name.toLowerCase();
  const lowerValue = rawValue.toLowerCase().trim();

  if (/shadow|elevation|overlay/.test(lowerName) || looksLikeShadow(lowerValue)) return "shadow";
  if (/radius|rounded|corner/.test(lowerName)) return "radius";
  if (isColorValue(lowerValue) || /color|foreground|background|bg|surface|canvas|brand|primary|secondary|accent|muted|border|ring|destructive|success|warning|danger|error|info|card|popover|input/.test(lowerName)) {
    return "color";
  }
  if (/font|type|text|leading|tracking|letter|line-height|weight/.test(lowerName)) return "typography";
  if (/space|spacing|gap|pad|padding|margin|inset|container|breakpoint|size|width|height/.test(lowerName) || looksLikeDimension(lowerValue)) {
    return "spacing";
  }

  return "other";
}

function chooseMoreSpecificType(current: TokenType, next: TokenType): TokenType {
  if (current === next) return current;
  if (current === "other") return next;
  if (next === "other") return current;
  const priority: TokenType[] = ["color", "typography", "spacing", "radius", "shadow", "other"];
  return priority.indexOf(next) < priority.indexOf(current) ? next : current;
}

function isColorValue(value: string): boolean {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (IGNORE_COLORS.has(normalized)) return true;
  return COLOR_PATTERNS.some((pattern) => {
    const re = new RegExp(pattern.source, pattern.flags);
    return re.test(value);
  }) || /^(transparent|currentcolor|canvas|canvastext)$/.test(normalized);
}

function looksLikeDimension(value: string): boolean {
  if (value.startsWith("var(") || value.startsWith("calc(")) return false;
  return /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|svh|svw|lvh|lvw|dvh|dvw|%)$/.test(value);
}

function looksLikeShadow(value: string): boolean {
  if (value === "none" || value.startsWith("var(")) return false;
  return /(?:^|\s)-?\d+(?:\.\d+)?(?:px|rem|em)\s+-?\d+(?:\.\d+)?(?:px|rem|em)/.test(value) && isColorValue(value);
}

function extractVariableReferences(value: string): string[] {
  const refs = new Set<string>();
  const refRegex = /var\(\s*(--[\w-]+)/g;
  let refMatch: RegExpExecArray | null;
  while ((refMatch = refRegex.exec(value)) !== null) {
    if (refMatch[1]) refs.add(refMatch[1]);
  }
  return Array.from(refs).sort();
}

function collectLiteralCandidates(declaration: Declaration, literalMap: Map<string, LiteralAccumulator>): void {
  const values = extractLiteralsFromDeclaration(declaration);
  for (const { type, value } of values) {
    const key = `${type}:${normalizeLiteralValue(value)}`;
    const current = literalMap.get(key) ?? {
      type,
      value,
      occurrences: 0,
      properties: new Set<string>(),
    };
    current.occurrences += 1;
    current.properties.add(declaration.property);
    literalMap.set(key, current);
  }
}

function extractLiteralsFromDeclaration(declaration: Declaration): Array<{ type: TokenType; value: string }> {
  const property = declaration.property.toLowerCase();
  const value = declaration.value.trim();
  if (!value || value.startsWith("var(")) return [];

  const results: Array<{ type: TokenType; value: string }> = [];
  if (/color|background|border|outline|fill|stroke|caret|accent|shadow/.test(property)) {
    for (const color of extractColors(value)) {
      const normalized = normalizeLiteralValue(color);
      if (!IGNORE_COLORS.has(normalized)) results.push({ type: "color", value: color });
    }
  }

  if (/box-shadow|text-shadow/.test(property) && value !== "none") {
    results.push({ type: "shadow", value });
  }

  if (/border-radius|radius/.test(property)) {
    for (const part of splitDimensionParts(value)) {
      if (part !== "0" && part !== "0px") results.push({ type: "radius", value: part });
    }
  }

  if (/font-size|line-height|letter-spacing/.test(property)) {
    for (const part of splitDimensionParts(value)) {
      if (part !== "0" && part !== "0px") results.push({ type: "typography", value: part });
    }
  }

  if (/padding|margin|gap|inset|top|right|bottom|left|width|height|min-width|max-width|min-height|max-height/.test(property)) {
    for (const part of splitDimensionParts(value)) {
      if (part !== "0" && part !== "0px") results.push({ type: "spacing", value: part });
    }
  }

  if (property === "font-family" && !value.startsWith("var(")) {
    results.push({ type: "typography", value });
  }

  return results;
}

function extractColors(value: string): string[] {
  const colors: string[] = [];
  for (const pattern of COLOR_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(value)) !== null) {
      colors.push(match[0].trim());
    }
  }
  return colors;
}

function splitDimensionParts(value: string): string[] {
  if (value.startsWith("calc(") || value.startsWith("clamp(") || value.startsWith("min(") || value.startsWith("max(")) {
    return [value];
  }
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => /^-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%)$/.test(part));
}

function normalizeLiteralValue(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function collectUtilityCandidates(content: string, utilityMap: Map<string, UtilityTokenCandidate>): void {
  const classRegex = /\bclass(?:Name)?\s*=\s*(?:"([^"]+)"|'([^']+)'|\{`([^`]+)`\})/g;
  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(content)) !== null) {
    const classValue = classMatch[1] ?? classMatch[2] ?? classMatch[3] ?? "";
    for (const utility of classValue.split(/\s+/).map(cleanUtility).filter(Boolean)) {
      const type = classifyUtility(utility);
      if (!type) continue;
      const key = `${type}:${utility}`;
      const current = utilityMap.get(key) ?? { type, utility, occurrences: 0 };
      current.occurrences += 1;
      utilityMap.set(key, current);
    }
  }
}

function cleanUtility(utility: string): string {
  return utility
    .trim()
    .replace(/^\w+:/g, "")
    .replace(/^\[[^\]]+\]:/, "");
}

function classifyUtility(utility: string): TokenType | null {
  if (/^(bg|text|border|ring|outline|fill|stroke|from|via|to)-/.test(utility) || /\[#?[0-9a-fA-F]{3,8}\]/.test(utility)) {
    return utility.startsWith("text-") && /^(text-xs|text-sm|text-base|text-lg|text-xl|text-2xl|text-3xl|text-4xl|text-5xl|text-6xl|text-7xl|text-8xl|text-9xl)$/.test(utility)
      ? "typography"
      : "color";
  }
  if (/^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y|inset|top|right|bottom|left|w|h|min-w|max-w|min-h|max-h)-/.test(utility)) {
    return "spacing";
  }
  if (/^rounded(?:-|$)/.test(utility)) return "radius";
  if (/^shadow(?:-|$)/.test(utility)) return "shadow";
  if (/^(font|leading|tracking)-/.test(utility)) return "typography";
  return null;
}

function propagateAliasTypes(drafts: Map<string, TokenDraft>, aliases: TokenAlias[]): void {
  for (const alias of aliases) {
    const draft = drafts.get(alias.cssVariable);
    if (!draft || draft.type !== "other") continue;
    for (const reference of alias.references) {
      const referenceDraft = drafts.get(reference);
      if (referenceDraft && referenceDraft.type !== "other") {
        draft.type = referenceDraft.type;
        break;
      }
    }
  }
}

function promoteLiteralTokens(
  drafts: Map<string, TokenDraft>,
  literalCandidates: LiteralTokenCandidate[],
  sourceName: string,
): void {
  const existingValues = new Set<string>();
  for (const draft of drafts.values()) {
    for (const value of draft.values.values()) {
      existingValues.add(normalizeLiteralValue(String(value)));
    }
  }

  const perTypeCounts = new Map<TokenType, number>();
  let promotedCount = 0;
  for (const candidate of literalCandidates) {
    if (promotedCount >= PROMOTED_LITERAL_LIMIT) break;
    if (candidate.occurrences < 2) continue;
    if (candidate.type === "other") continue;
    if (existingValues.has(normalizeLiteralValue(candidate.value))) continue;

    const nextCount = (perTypeCounts.get(candidate.type) ?? 0) + 1;
    perTypeCounts.set(candidate.type, nextCount);

    const cssVariable = `--memi-${candidate.type}-extracted-${nextCount}`;
    drafts.set(cssVariable, {
      name: `${candidate.type}-extracted-${nextCount}`,
      cssVariable,
      type: candidate.type,
      values: new Map([["default", candidate.value]]),
      collection: `inferred-literal:${sourceName}`,
      sourceIds: new Set(["literal-analysis"]),
      inferred: true,
    });
    candidate.promoted = true;
    promotedCount += 1;
  }
}

function draftToToken(draft: TokenDraft): DesignToken {
  return {
    name: draft.name,
    collection: draft.inferred ? draft.collection : summarizeCollection(draft),
    type: draft.type,
    values: Object.fromEntries(draft.values.entries()),
    cssVariable: draft.cssVariable,
  };
}

function summarizeCollection(draft: TokenDraft): string {
  const sourceIds = Array.from(draft.sourceIds);
  if (sourceIds.length === 0) return draft.collection;
  if (sourceIds.length === 1) return `extracted:${sourceIds[0]}`;
  return `extracted:${sourceIds.length}-sources`;
}

function compareTokens(a: DesignToken, b: DesignToken): number {
  const typeDelta = TOKEN_TYPES.indexOf(a.type) - TOKEN_TYPES.indexOf(b.type);
  if (typeDelta !== 0) return typeDelta;
  return a.name.localeCompare(b.name);
}

function collectModes(tokens: DesignToken[]): string[] {
  const modes = new Set<string>();
  for (const token of tokens) {
    for (const mode of Object.keys(token.values)) modes.add(mode);
  }
  return Array.from(modes).sort((a, b) => {
    if (a === "default") return -1;
    if (b === "default") return 1;
    return a.localeCompare(b);
  });
}

function buildFamilies(tokens: DesignToken[], modes: string[]): Record<TokenType, TokenFamilySummary> {
  const families = Object.fromEntries(TOKEN_TYPES.map((type) => [
    type,
    {
      count: 0,
      tokenNames: [] as string[],
      cssVariables: [] as string[],
      modes: [] as string[],
    },
  ])) as Record<TokenType, TokenFamilySummary>;

  for (const token of tokens) {
    const family = families[token.type];
    family.count += 1;
    family.tokenNames.push(token.name);
    family.cssVariables.push(token.cssVariable);
    family.modes = modes.filter((mode) => token.values[mode] !== undefined || family.modes.includes(mode));
  }

  for (const family of Object.values(families)) {
    family.tokenNames.sort();
    family.cssVariables.sort();
    family.modes = Array.from(new Set(family.modes)).sort();
  }

  return families;
}

function buildSemanticCoverage(tokens: DesignToken[]): TokenSemanticCoverage {
  const haystack = tokens
    .filter((token) => token.type === "color" || token.type === "radius")
    .map((token) => `${token.name} ${token.cssVariable}`.toLowerCase());
  const present = SEMANTIC_SLOTS.filter((slot) =>
    haystack.some((entry) => new RegExp(`(^|[-_])${escapeRegExp(slot)}($|[-_])`).test(entry)),
  );
  const missing = SEMANTIC_SLOTS.filter((slot) => !present.includes(slot));
  const score = Math.round((present.length / SEMANTIC_SLOTS.length) * 100);
  return { score, required: SEMANTIC_SLOTS, present, missing };
}

function buildModeCoverage(tokens: DesignToken[], modes: string[]): TokenModeCoverage {
  const modeSensitiveTokens = tokens.filter((token) => token.type === "color" || token.type === "shadow");
  if (modes.length <= 1 || modeSensitiveTokens.length === 0) {
    return {
      score: 100,
      modes,
      completeTokenCount: modeSensitiveTokens.length,
      partialTokenCount: 0,
      missingByMode: Object.fromEntries(modes.map((mode) => [mode, []])),
    };
  }

  const missingByMode = Object.fromEntries(modes.map((mode) => [mode, [] as string[]]));
  let completeTokenCount = 0;
  let partialTokenCount = 0;

  for (const token of modeSensitiveTokens) {
    const missingModes = modes.filter((mode) => token.values[mode] === undefined);
    if (missingModes.length === 0) {
      completeTokenCount += 1;
      continue;
    }
    partialTokenCount += 1;
    for (const mode of missingModes) {
      missingByMode[mode].push(token.cssVariable);
    }
  }

  for (const values of Object.values(missingByMode)) {
    values.sort();
  }

  const score = Math.round((completeTokenCount / modeSensitiveTokens.length) * 100);
  return {
    score,
    modes,
    completeTokenCount,
    partialTokenCount,
    missingByMode,
  };
}

function buildDuplicateGroups(tokens: DesignToken[]): TokenDuplicateGroup[] {
  const groups = new Map<string, TokenDuplicateGroup>();
  for (const token of tokens) {
    for (const value of Object.values(token.values)) {
      const normalized = normalizeDuplicateValue(String(value));
      if (!normalized || normalized.startsWith("var(")) continue;
      const key = `${token.type}:${normalized}`;
      const group = groups.get(key) ?? {
        type: token.type,
        value: String(value),
        tokens: [],
      };
      if (!group.tokens.includes(token.cssVariable)) {
        group.tokens.push(token.cssVariable);
      }
      groups.set(key, group);
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.tokens.length > 1)
    .map((group) => ({ ...group, tokens: group.tokens.sort() }))
    .sort((a, b) => b.tokens.length - a.tokens.length || a.value.localeCompare(b.value));
}

function buildAliasGraph(tokens: DesignToken[], aliases: TokenAlias[]): TokenAliasGraph {
  const knownVariables = new Set(tokens.map((token) => token.cssVariable));
  const edges = new Map<string, string[]>();
  for (const alias of aliases) {
    const existing = edges.get(alias.cssVariable) ?? [];
    for (const reference of alias.references) {
      if (!existing.includes(reference)) existing.push(reference);
    }
    edges.set(alias.cssVariable, existing.sort());
  }

  const unresolvedReferences: Array<{ token: string; reference: string }> = [];
  let resolvedReferenceCount = 0;
  for (const [token, references] of edges.entries()) {
    for (const reference of references) {
      if (knownVariables.has(reference)) {
        resolvedReferenceCount += 1;
      } else {
        unresolvedReferences.push({ token, reference });
      }
    }
  }

  const circularReferences: string[][] = [];
  let maxDepth = 0;
  for (const token of edges.keys()) {
    const result = walkAliasGraph(token, edges, []);
    maxDepth = Math.max(maxDepth, result.maxDepth);
    for (const cycle of result.cycles) {
      const key = cycle.join(">");
      if (!circularReferences.some((existing) => existing.join(">") === key)) {
        circularReferences.push(cycle);
      }
    }
  }

  return {
    edgeCount: Array.from(edges.values()).reduce((sum, references) => sum + references.length, 0),
    resolvedReferenceCount,
    unresolvedReferences: unresolvedReferences.sort((a, b) => a.token.localeCompare(b.token)),
    circularReferences,
    maxDepth,
  };
}

function walkAliasGraph(
  token: string,
  edges: Map<string, string[]>,
  path: string[],
): { maxDepth: number; cycles: string[][] } {
  if (path.includes(token)) {
    return {
      maxDepth: path.length,
      cycles: [path.slice(path.indexOf(token)).concat(token)],
    };
  }

  const references = edges.get(token) ?? [];
  if (references.length === 0) {
    return { maxDepth: path.length, cycles: [] };
  }

  let maxDepth = path.length;
  const cycles: string[][] = [];
  for (const reference of references) {
    const result = walkAliasGraph(reference, edges, [...path, token]);
    maxDepth = Math.max(maxDepth, result.maxDepth);
    cycles.push(...result.cycles);
  }
  return { maxDepth, cycles };
}

function buildScaleHealth(
  tokens: DesignToken[],
  semanticCoverage: TokenSemanticCoverage,
  modeCoverage: TokenModeCoverage,
  aliasGraph: TokenAliasGraph,
): TokenScaleHealth {
  const colorCount = tokens.filter((token) => token.type === "color").length;
  const spacingCount = tokens.filter((token) => token.type === "spacing").length;
  const typographyCount = tokens.filter((token) => token.type === "typography").length;
  const radiusCount = tokens.filter((token) => token.type === "radius").length;
  const darkModeTokens = tokens.filter((token) => Object.keys(token.values).some((mode) => mode.includes("dark"))).length;
  const aliasCount = tokens.filter((token) => Object.values(token.values).some((value) => String(value).includes("var("))).length;

  const aliasHealthPenalty = aliasGraph.unresolvedReferences.length > 0 || aliasGraph.circularReferences.length > 0 ? 12 : 0;
  const colorScaleScore = clampScore(Math.round(
    Math.min(1, colorCount / 16) * 38 +
    semanticCoverage.score * 0.36 +
    modeCoverage.score * 0.16 +
    Math.min(10, darkModeTokens) -
    aliasHealthPenalty,
  ));
  const spacingScaleScore = clampScore(Math.round(Math.min(1, spacingCount / 8) * 100));
  const typographyScaleScore = clampScore(Math.round(Math.min(1, typographyCount / 6) * 100));
  const radiusScaleScore = clampScore(Math.round(Math.min(1, radiusCount / 3) * 100));
  const overallScore = clampScore(Math.round(
    colorScaleScore * 0.42 +
    spacingScaleScore * 0.22 +
    typographyScaleScore * 0.22 +
    radiusScaleScore * 0.14,
  ));

  const notes: string[] = [];
  if (semanticCoverage.missing.length > 0) {
    notes.push(`Missing shadcn semantic slots: ${semanticCoverage.missing.slice(0, 6).join(", ")}`);
  }
  if (darkModeTokens === 0) notes.push("No dark-mode token overrides detected");
  if (modeCoverage.score < 90) notes.push(`Mode coverage is ${modeCoverage.score}/100; some colors/shadows do not define all modes`);
  if (aliasGraph.unresolvedReferences.length > 0) notes.push(`${aliasGraph.unresolvedReferences.length} alias references point at missing variables`);
  if (aliasGraph.circularReferences.length > 0) notes.push(`${aliasGraph.circularReferences.length} circular alias chains detected`);
  if (aliasCount === 0) notes.push("No alias tokens detected; semantic/raw token separation may be weak");
  if (spacingCount < 5) notes.push("Spacing scale is thin; expect one-off layout values");
  if (typographyCount < 3) notes.push("Typography tokens are thin; inspect type ramp manually");

  return {
    overallScore,
    colorScaleScore,
    spacingScaleScore,
    typographyScaleScore,
    radiusScaleScore,
    notes,
  };
}

function buildRecommendations(input: {
  semanticCoverage: TokenSemanticCoverage;
  modeCoverage: TokenModeCoverage;
  duplicates: TokenDuplicateGroup[];
  aliasGraph: TokenAliasGraph;
  inferredTokenCount: number;
  utilityCandidateCount: number;
}): TokenRecommendation[] {
  const recommendations: TokenRecommendation[] = [];

  if (input.semanticCoverage.score < 75) {
    recommendations.push({
      priority: "high",
      action: "Add missing shadcn semantic slots before publishing",
      rationale: `Missing ${input.semanticCoverage.missing.slice(0, 6).join(", ")} makes install behavior inconsistent across apps.`,
    });
  }

  if (input.modeCoverage.score < 90) {
    recommendations.push({
      priority: "high",
      action: "Complete dark/light mode coverage for color and shadow tokens",
      rationale: `${input.modeCoverage.partialTokenCount} mode-sensitive tokens are missing at least one mode.`,
    });
  }

  if (input.aliasGraph.unresolvedReferences.length > 0 || input.aliasGraph.circularReferences.length > 0) {
    recommendations.push({
      priority: "high",
      action: "Fix token alias graph before shipping generated CSS",
      rationale: `${input.aliasGraph.unresolvedReferences.length} unresolved references and ${input.aliasGraph.circularReferences.length} cycles can break runtime styles.`,
    });
  }

  if (input.duplicates.length > 3) {
    recommendations.push({
      priority: "medium",
      action: "Collapse duplicate literal values into semantic aliases",
      rationale: `${input.duplicates.length} duplicate groups suggest raw palette tokens are leaking into semantic slots.`,
    });
  }

  if (input.inferredTokenCount > 0) {
    recommendations.push({
      priority: "medium",
      action: "Review inferred literal tokens before saving them as canonical",
      rationale: "Memoire promoted repeated hardcoded values so they can be migrated, but naming needs human intent.",
    });
  }

  if (input.utilityCandidateCount > 0) {
    recommendations.push({
      priority: "low",
      action: "Use Tailwind utility patterns to prioritize token migrations",
      rationale: "Frequently repeated utilities indicate where token adoption will remove the most design debt.",
    });
  }

  return recommendations;
}

function buildSummary(input: {
  tokenCount: number;
  variableTokenCount: number;
  inferredTokenCount: number;
  aliasCount: number;
  modeCount: number;
  modeCoverageScore: number;
  literalCandidateCount: number;
  utilityCandidateCount: number;
  duplicateGroupCount: number;
  unresolvedAliasCount: number;
  scaleHealth: TokenScaleHealth;
  semanticCoverage: TokenSemanticCoverage;
}): TokenExtractionSummary {
  const confidenceScore = clampScore(Math.round(
    input.scaleHealth.overallScore * 0.38 +
    input.semanticCoverage.score * 0.22 +
    input.modeCoverageScore * 0.16 +
    Math.min(100, input.variableTokenCount * 5) * 0.2 +
    Math.min(100, input.aliasCount * 10) * 0.04,
  ));

  const notes = [...input.scaleHealth.notes];
  if (input.inferredTokenCount > 0) {
    notes.push(`${input.inferredTokenCount} tokens inferred from repeated literals; review before publishing`);
  }
  if (input.utilityCandidateCount > 0) {
    notes.push(`${input.utilityCandidateCount} Tailwind utility patterns detected for migration planning`);
  }
  if (input.duplicateGroupCount > 0) {
    notes.push(`${input.duplicateGroupCount} duplicate value groups detected`);
  }
  if (input.unresolvedAliasCount > 0) {
    notes.push(`${input.unresolvedAliasCount} unresolved alias references detected`);
  }

  return {
    tokenCount: input.tokenCount,
    variableTokenCount: input.variableTokenCount,
    inferredTokenCount: input.inferredTokenCount,
    aliasCount: input.aliasCount,
    modeCount: input.modeCount,
    modeCoverageScore: input.modeCoverageScore,
    literalCandidateCount: input.literalCandidateCount,
    utilityCandidateCount: input.utilityCandidateCount,
    duplicateGroupCount: input.duplicateGroupCount,
    unresolvedAliasCount: input.unresolvedAliasCount,
    confidenceScore,
    notes,
  };
}

function normalizeDuplicateValue(value: string): string {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (IGNORE_COLORS.has(normalized)) return "";
  if (normalized === "none" || normalized === "0" || normalized === "0px") return "";
  return normalized;
}

function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
