/**
 * Web Researcher — Performs deep online research on a topic
 * and produces structured, source-attributed findings.
 */

import { createLogger } from "../engine/logger.js";

const log = createLogger("web-researcher");

export interface WebSource {
  url: string;
  title: string;
  snippet: string;
  fetchedAt: string;
}

export interface WebResearchResult {
  topic: string;
  sources: WebSource[];
  findings: string[];
  summary: string;
  researchedAt: string;
}

/**
 * Research a topic by fetching and analyzing web content.
 * This is designed to be called by Claude via MCP tools —
 * the actual web fetching is delegated to the MCP host.
 */
export function buildResearchPlan(topic: string): {
  queries: string[];
  strategy: string;
} {
  // Generate a set of search queries for comprehensive research
  const queries = [
    topic,
    `${topic} best practices`,
    `${topic} user research findings`,
    `${topic} design patterns`,
    `${topic} case study`,
  ];

  return {
    queries,
    strategy: [
      `1. Search for "${topic}" across multiple angles`,
      "2. Fetch top 3-5 results per query",
      "3. Extract key findings and patterns",
      "4. Cross-reference sources for reliability",
      "5. Synthesize into structured findings",
    ].join("\n"),
  };
}

/**
 * Process fetched web content into research findings.
 * Called after the MCP host fetches the pages.
 */
export function processWebContent(
  topic: string,
  pages: { url: string; title: string; content: string }[]
): WebResearchResult {
  const sources: WebSource[] = [];
  const findings: string[] = [];

  for (const page of pages) {
    // Extract meaningful snippets (first substantive paragraph)
    const paragraphs = page.content
      .split(/\n\n+/)
      .filter((p) => p.length > 100 && p.length < 2000)
      .slice(0, 3);

    sources.push({
      url: page.url,
      title: page.title,
      snippet: paragraphs[0] ?? page.content.slice(0, 300),
      fetchedAt: new Date().toISOString(),
    });

    // Each substantive paragraph is a finding candidate
    for (const para of paragraphs) {
      findings.push(para.trim());
    }
  }

  // Deduplicate similar findings
  const unique = deduplicateFindings(findings);

  const summary = [
    `Researched "${topic}" across ${sources.length} sources.`,
    `Found ${unique.length} unique findings.`,
  ].join(" ");

  return {
    topic,
    sources,
    findings: unique,
    summary,
    researchedAt: new Date().toISOString(),
  };
}

function deduplicateFindings(findings: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const finding of findings) {
    // Simple dedup by first 50 chars
    const key = finding.slice(0, 50).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(finding);
    }
  }

  return result;
}
