/**
 * Web Researcher — Performs structured online research with
 * content scoring, entity extraction, and cross-source validation.
 *
 * Works in two modes:
 * 1. Plan mode: generates search queries + strategy for MCP host
 * 2. Process mode: takes fetched pages and produces structured findings
 */

import { createLogger } from "../engine/logger.js";

const log = createLogger("web-researcher");

export interface WebSource {
  url: string;
  title: string;
  snippet: string;
  fetchedAt: string;
  relevanceScore: number;
  domain: string;
}

export interface WebFinding {
  text: string;
  confidence: "high" | "medium" | "low";
  sourceUrls: string[];
  category: FindingCategory;
  entities: string[];
}

export type FindingCategory =
  | "best-practice"
  | "user-need"
  | "pain-point"
  | "market-data"
  | "design-pattern"
  | "technical-constraint"
  | "competitor-insight"
  | "regulatory"
  | "general";

export interface WebResearchResult {
  topic: string;
  sources: WebSource[];
  findings: WebFinding[];
  crossValidated: WebFinding[];
  gaps: string[];
  summary: string;
  researchedAt: string;
}

// ── Category Detection Patterns ──────────────────────────

const CATEGORY_PATTERNS: [RegExp, FindingCategory][] = [
  [/\b(best practice|recommend|should|guideline|standard)\b/i, "best-practice"],
  [/\b(user[s']?\s*(want|need|expect|prefer|struggle)|customer\s*(demand|feedback))\b/i, "user-need"],
  [/\b(pain\s*point|frustrat|difficult|challeng|complain|problem|issue|blocker)\b/i, "pain-point"],
  [/\b(market\s*(size|share|growth|trend|valuation)|revenue|billion|million\s*users|% (of|market))\b/i, "market-data"],
  [/\b(pattern|component|layout|ui\s*kit|design\s*system|material\s*design|atomic)\b/i, "design-pattern"],
  [/\b(api\s*limit|browser\s*support|performance|latency|bandwidth|compatibility)\b/i, "technical-constraint"],
  [/\b(competitor|alternative|vs\.?|compared\s*to|market\s*leader)\b/i, "competitor-insight"],
  [/\b(regulation|compliance|gdpr|wcag|ada|hipaa|legal\s*requirement)\b/i, "regulatory"],
];

function categorize(text: string): FindingCategory {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "general";
}

// ── Entity Extraction ────────────────────────────────────

const ENTITY_PATTERNS = [
  /\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,                  // Proper nouns (2+ words)
  /\b(?:React|Vue|Angular|Svelte|Next\.?js|Tailwind|Figma)\b/g, // Tech products
  /\b(?:WCAG|ARIA|GDPR|ADA|HIPAA|SOC\s*2)\b/g,                 // Standards
  /\b\d+(?:\.\d+)?%\b/g,                                        // Percentages
  /\$[\d,.]+[BMK]?\b/g,                                          // Dollar amounts
];

function extractEntities(text: string): string[] {
  const entities = new Set<string>();
  for (const pattern of ENTITY_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (m.length > 2 && m.length < 60) entities.add(m.trim());
      }
    }
  }
  return Array.from(entities);
}

// ── Relevance Scoring ────────────────────────────────────

function scoreRelevance(text: string, topic: string): number {
  const topicTerms = topic.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = text.toLowerCase();
  let score = 0;

  // Term frequency
  for (const term of topicTerms) {
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
    const matches = textLower.match(regex);
    if (matches) score += matches.length * 10;
  }

  // Boost for substantive content
  if (text.length > 200) score += 5;
  if (text.length > 500) score += 5;

  // Boost for data-rich content
  if (/\d+%/.test(text)) score += 8;
  if (/\$[\d,.]+/.test(text)) score += 8;

  // Boost for structured findings
  if (/\b(finding|result|conclusion|recommendation)\b/i.test(text)) score += 10;

  // Penalize short/generic content
  if (text.length < 80) score -= 10;

  return Math.max(0, Math.min(100, score));
}

// ── Research Plan Builder ────────────────────────────────

export interface ResearchPlan {
  queries: string[];
  strategy: string;
  expectedSources: number;
  focusAreas: FindingCategory[];
}

/**
 * Build a comprehensive research plan with multiple query angles.
 */
export function buildResearchPlan(topic: string, options?: {
  depth?: "quick" | "standard" | "deep";
  focus?: FindingCategory[];
}): ResearchPlan {
  const depth = options?.depth ?? "standard";
  const focus = options?.focus ?? [];

  // Core queries
  const queries: string[] = [topic];

  // Angle-based queries
  const angles: Record<string, string[]> = {
    quick: [
      `${topic} overview`,
      `${topic} best practices`,
    ],
    standard: [
      `${topic} best practices 2024 2025`,
      `${topic} user research findings`,
      `${topic} design patterns UX`,
      `${topic} case study results`,
      `${topic} common problems pain points`,
    ],
    deep: [
      `${topic} best practices 2024 2025`,
      `${topic} user research findings academic`,
      `${topic} design patterns UX UI`,
      `${topic} case study results ROI`,
      `${topic} common problems pain points`,
      `${topic} market size growth trends`,
      `${topic} competitor analysis comparison`,
      `${topic} accessibility compliance requirements`,
      `${topic} technical implementation guide`,
      `${topic} future trends predictions`,
    ],
  };

  queries.push(...angles[depth]);

  // Add focus-area-specific queries
  if (focus.includes("competitor-insight")) {
    queries.push(`${topic} alternatives comparison review`);
  }
  if (focus.includes("regulatory")) {
    queries.push(`${topic} compliance legal requirements`);
  }
  if (focus.includes("market-data")) {
    queries.push(`${topic} market size revenue statistics`);
  }

  const strategy = [
    `Research Plan: "${topic}"`,
    `Depth: ${depth} (${queries.length} queries)`,
    "",
    "Execution steps:",
    ...queries.map((q, i) => `  ${i + 1}. Search: "${q}"`),
    "",
    `Target: ${depth === "quick" ? "3-5" : depth === "standard" ? "8-15" : "15-25"} unique sources`,
    "For each source:",
    "  - Fetch full page content",
    "  - Extract substantive paragraphs (100-2000 chars)",
    "  - Score relevance to topic",
    "  - Categorize finding type",
    "  - Extract named entities",
    "",
    "Cross-validation:",
    "  - Findings supported by 2+ sources get HIGH confidence",
    "  - Findings from 1 authoritative source get MEDIUM confidence",
    "  - Single-source findings get LOW confidence",
  ].join("\n");

  return {
    queries,
    strategy,
    expectedSources: depth === "quick" ? 5 : depth === "standard" ? 12 : 25,
    focusAreas: focus.length > 0 ? focus : ["best-practice", "user-need", "pain-point", "design-pattern"],
  };
}

// ── Content Processing ───────────────────────────────────

interface FetchedPage {
  url: string;
  title: string;
  content: string;
}

/**
 * Process fetched web content into structured, scored findings
 * with cross-source validation.
 */
export function processWebContent(
  topic: string,
  pages: FetchedPage[]
): WebResearchResult {
  const sources: WebSource[] = [];
  const rawFindings: { text: string; sourceUrl: string; score: number }[] = [];

  for (const page of pages) {
    const domain = extractDomain(page.url);

    // Extract substantive paragraphs
    const paragraphs = extractParagraphs(page.content);
    const pageScore = scoreRelevance(page.content.slice(0, 2000), topic);

    sources.push({
      url: page.url,
      title: page.title,
      snippet: paragraphs[0] ?? page.content.slice(0, 300),
      fetchedAt: new Date().toISOString(),
      relevanceScore: pageScore,
      domain,
    });

    // Score each paragraph independently
    for (const para of paragraphs) {
      const score = scoreRelevance(para, topic);
      if (score >= 15) {
        rawFindings.push({ text: para.trim(), sourceUrl: page.url, score });
      }
    }
  }

  // Deduplicate and merge findings from multiple sources
  const merged = mergeFindings(rawFindings);

  // Cross-validate: findings supported by 2+ sources get boosted confidence
  const crossValidated = merged.filter(f => f.sourceUrls.length >= 2);

  // Identify research gaps
  const gaps = identifyResearchGaps(merged, topic);

  // Sort by confidence then score
  merged.sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 };
    return confOrder[b.confidence] - confOrder[a.confidence];
  });

  const summary = [
    `Researched "${topic}" across ${sources.length} sources.`,
    `Found ${merged.length} findings (${crossValidated.length} cross-validated).`,
    gaps.length > 0 ? `Research gaps: ${gaps.join("; ")}` : "No major gaps identified.",
  ].join(" ");

  log.info({ topic, sources: sources.length, findings: merged.length, crossValidated: crossValidated.length }, "Research complete");

  return {
    topic,
    sources: sources.sort((a, b) => b.relevanceScore - a.relevanceScore),
    findings: merged,
    crossValidated,
    gaps,
    summary,
    researchedAt: new Date().toISOString(),
  };
}

// ── Paragraph Extraction ─────────────────────────────────

function extractParagraphs(content: string): string[] {
  return content
    .split(/\n\n+/)
    .map(p => p.replace(/\s+/g, " ").trim())
    .filter(p => {
      // Must be substantive
      if (p.length < 80 || p.length > 2000) return false;
      // Skip navigation/boilerplate
      if (/^(menu|nav|footer|header|copyright|cookie|subscribe)/i.test(p)) return false;
      // Skip lists of links
      if ((p.match(/https?:\/\//g) || []).length > 3) return false;
      // Must have sentences (not just fragments)
      if (!/[.!?]/.test(p)) return false;
      return true;
    })
    .slice(0, 10); // Cap per page
}

// ── Finding Merger ───────────────────────────────────────

function mergeFindings(
  raw: { text: string; sourceUrl: string; score: number }[]
): WebFinding[] {
  const groups: Map<string, { texts: string[]; sourceUrls: Set<string>; maxScore: number }> = new Map();

  for (const finding of raw) {
    // Key by first 80 chars normalized
    const key = finding.text.slice(0, 80).toLowerCase().replace(/\s+/g, " ");

    // Check for similar existing findings (fuzzy match)
    let merged = false;
    for (const [existingKey, group] of groups) {
      if (similarity(key, existingKey) > 0.6) {
        group.texts.push(finding.text);
        group.sourceUrls.add(finding.sourceUrl);
        group.maxScore = Math.max(group.maxScore, finding.score);
        merged = true;
        break;
      }
    }

    if (!merged) {
      groups.set(key, {
        texts: [finding.text],
        sourceUrls: new Set([finding.sourceUrl]),
        maxScore: finding.score,
      });
    }
  }

  return Array.from(groups.values()).map(group => {
    // Pick the longest/best text as representative
    const bestText = group.texts.sort((a, b) => b.length - a.length)[0];
    const sourceCount = group.sourceUrls.size;

    return {
      text: bestText,
      confidence: sourceCount >= 3 ? "high" : sourceCount >= 2 ? "medium" : "low",
      sourceUrls: Array.from(group.sourceUrls),
      category: categorize(bestText),
      entities: extractEntities(bestText),
    };
  });
}

// ── Similarity (Jaccard on word bigrams) ─────────────────

function similarity(a: string, b: string): number {
  const bigramsA = new Set(bigrams(a));
  const bigramsB = new Set(bigrams(b));
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return intersection / (bigramsA.size + bigramsB.size - intersection);
}

function bigrams(str: string): string[] {
  const words = str.split(/\s+/);
  const result: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    result.push(words[i] + " " + words[i + 1]);
  }
  return result;
}

// ── Domain Extractor ─────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

// ── Gap Analysis ─────────────────────────────────────────

// ── HTML Stripping ──────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── URL Fetcher ─────────────────────────────────────────

/**
 * Fetch a URL and return its text content (HTML stripped).
 */
export async function fetchUrl(url: string, options?: { timeoutMs?: number }): Promise<{
  url: string;
  title: string;
  content: string;
  ok: boolean;
  error?: string;
}> {
  const timeoutMs = options?.timeoutMs ?? 15000;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Memoire-Research/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain,*/*",
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return { url, title: "", content: "", ok: false, error: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const content = stripHtml(html);

    // Extract title from HTML
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : url;

    return { url, title, content, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ url, error: message }, "Fetch failed");
    return { url, title: "", content: "", ok: false, error: message };
  }
}

// ── Execute Web Research (URL-based) ────────────────────

/**
 * Research a topic by fetching explicit URLs, stripping HTML,
 * and producing structured findings via processWebContent().
 */
export async function executeWebResearch(
  topic: string,
  urls: string[],
  options?: { timeoutMs?: number; concurrency?: number }
): Promise<WebResearchResult> {
  const concurrency = options?.concurrency ?? 5;
  const timeoutMs = options?.timeoutMs ?? 15000;

  log.info({ topic, urlCount: urls.length, concurrency }, "Starting web research");

  // Fetch URLs with concurrency control
  const pages: FetchedPage[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(url => fetchUrl(url, { timeoutMs }))
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        pages.push({
          url: result.value.url,
          title: result.value.title,
          content: result.value.content,
        });
      }
    }
  }

  log.info({ topic, fetched: pages.length, total: urls.length }, "URLs fetched");

  return processWebContent(topic, pages);
}

// ── Execute Web Research with Plan ──────────────────────

export interface WebResearchPlanResult {
  plan: ResearchPlan;
  /** Call with fetched page data to produce findings. */
  processResults: (pages: FetchedPage[]) => WebResearchResult;
}

/**
 * Build a research plan and return it along with a callback
 * to process results. This allows MCP hosts or Claude agents
 * to perform the actual fetching.
 */
export function executeWebResearchWithPlan(
  topic: string,
  options?: { depth?: "quick" | "standard" | "deep"; focus?: FindingCategory[] }
): WebResearchPlanResult {
  const plan = buildResearchPlan(topic, options);

  return {
    plan,
    processResults: (pages: FetchedPage[]) => processWebContent(topic, pages),
  };
}

// ── Gap Analysis ─────────────────────────────────────────

function identifyResearchGaps(findings: WebFinding[], topic: string): string[] {
  const gaps: string[] = [];
  const categories = new Set(findings.map(f => f.category));

  if (!categories.has("user-need")) {
    gaps.push("No user needs or preferences captured — consider user research or survey data");
  }
  if (!categories.has("market-data")) {
    gaps.push("No market data found — consider industry reports or analytics");
  }
  if (!categories.has("competitor-insight")) {
    gaps.push("No competitor analysis — consider comparative research");
  }
  if (!categories.has("regulatory") && /\b(health|finance|education|government)\b/i.test(topic)) {
    gaps.push("Domain may have compliance requirements — investigate regulatory landscape");
  }
  if (findings.filter(f => f.confidence === "high").length === 0) {
    gaps.push("No high-confidence findings — more sources needed for cross-validation");
  }

  return gaps;
}
