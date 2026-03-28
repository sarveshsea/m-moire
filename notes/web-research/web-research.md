---
name: Web Research
description: >
  Structured web research for design intelligence. Covers topic exploration,
  content fetching, finding extraction, cross-source validation, entity
  extraction, gap analysis, and integration with MCP host agents. Outputs
  feed directly into Memoire research synthesis and spec pipelines.
activateOn: research-to-dashboard
freedomLevel: high
category: research
tags:
  - web-research
  - content-analysis
  - competitive
  - market-research
  - trends
  - design-patterns
  - best-practices
---

# Web Research — Memoire Research Skill

This skill drives structured web research from topic definition through
validated findings. Every section maps to concrete deliverables that feed
Memoire's research, spec, and codegen pipelines.

---

## Quick Reference — Research Depth Levels

| Depth | Queries | Sources | Time | When to Use |
|-------|---------|---------|------|-------------|
| `quick` | 2-3 focused queries | 5-8 sources | 15 min | Spot check, single question, fact verification |
| `standard` | 5-7 queries across angles | 10-20 sources | 45 min | Feature research, pattern discovery, general exploration |
| `deep` | 10-15 queries with refinement | 25-50 sources | 2+ hours | Comprehensive analysis, market mapping, trend identification |

### Depth Selection Guide

| Situation | Recommended Depth | Rationale |
|-----------|------------------|-----------|
| "What is the standard pattern for X?" | quick | Single factual answer |
| "What are best practices for checkout flows?" | standard | Multiple perspectives needed |
| "Full competitive landscape for design tools" | deep | Breadth and depth required |
| Validating a specific claim | quick | Confirmation from 2-3 sources |
| Informing a design decision | standard | Need options and tradeoffs |
| Building a research report for stakeholders | deep | Comprehensive coverage expected |
| Checking a regulatory requirement | standard | Need authoritative sources |
| Exploring an unfamiliar domain | deep | Unknown unknowns require breadth |

---

## Query Strategy by Depth

### Quick Depth — Focused Queries

```
Strategy: Precision over breadth.
Queries: 2-3 highly specific search terms.
Goal: Find the direct answer with minimal noise.

Example topic: "best practice for form validation timing"
  Query 1: "form validation timing UX best practice"
  Query 2: "inline validation vs on-submit validation research"
  Query 3: "form validation user experience guidelines"
```

### Standard Depth — Multi-Angle Queries

```
Strategy: Cover the topic from multiple perspectives.
Queries: 5-7 queries, each targeting a different angle.
Goal: Build a well-rounded understanding.

Example topic: "e-commerce checkout optimization"
  Query 1: "e-commerce checkout best practices 2026"
  Query 2: "checkout abandonment causes research data"
  Query 3: "one-page vs multi-step checkout conversion"
  Query 4: "guest checkout vs account creation impact"
  Query 5: "mobile checkout UX patterns"
  Query 6: "checkout form design accessibility"
  Query 7: "payment method selection UI patterns"
```

### Deep Depth — Exhaustive Coverage

```
Strategy: Systematic coverage with iterative refinement.
Queries: 10-15 queries, with follow-up queries based on findings.
Goal: Leave no significant angle unexplored.

Phase 1 — Broad exploration (5 queries):
  Cover the main topic from obvious angles.

Phase 2 — Fill gaps (3-5 queries):
  Based on Phase 1 findings, identify missing perspectives.
  Target specific sub-topics that emerged.

Phase 3 — Validate and deepen (2-5 queries):
  Cross-check key claims from Phase 1-2.
  Dive deep into the most impactful findings.
  Search for contradicting evidence.
```

---

## Providing URLs for Research

Users can provide specific URLs for the agent to analyze alongside
web search results.

### CLI Commands

```bash
# Topic-based web research (agent searches for sources)
memi research web "e-commerce checkout optimization"

# Topic with specific URLs to include
memi research web "checkout optimization" --urls https://baymard.com/checkout,https://nngroup.com/checkout

# URL-only analysis (no additional search)
memi research web --urls https://example.com/article1,https://example.com/article2

# With depth control
memi research web "design system trends" --depth deep

# With focus categories
memi research web "design system trends" --depth deep --focus competitor-insight,design-pattern

# With output label
memi research web "checkout optimization" --label "Checkout Redesign Research"

# Batch: research multiple topics
memi research web --batch topics.txt
```

### URL Handling

When URLs are provided:

```
1. FETCH — retrieve the page content
2. STRIP — remove navigation, ads, footers, scripts
3. EXTRACT — pull article body, headings, lists, data tables
4. SCORE — relevance to the research topic (0.0-1.0)
5. PROCESS — run through the standard finding extraction pipeline
```

URLs are treated as high-priority sources. They are always included in
the final findings regardless of relevance score (user intent overrides
algorithmic filtering).

---

## Content Processing Pipeline

### Stage 1 — Fetch

```
Input: URL
Output: Raw HTML

Methods:
  - Direct HTTP GET for public pages
  - MCP host fetch for pages requiring JavaScript rendering
  - Cached responses honored (304 Not Modified)
  - Timeout: 15 seconds per URL
  - Retry: 1 retry on timeout or 5xx
  - User-Agent: standard browser UA string

Error handling:
  - 403/401: log as "access denied", skip
  - 404: log as "not found", skip
  - 429: wait and retry once, then skip
  - Network error: log, skip
  - All errors are non-fatal — research continues with available sources
```

### Stage 2 — Strip HTML

```
Input: Raw HTML
Output: Clean text with structure markers

Remove:
  - <script>, <style>, <noscript> elements
  - Navigation bars, headers, footers (heuristic: <nav>, <header>, <footer>)
  - Sidebars (<aside>, elements with "sidebar" class)
  - Ads (elements with "ad", "advertisement", "sponsored" classes)
  - Cookie banners
  - Social share widgets
  - Comment sections

Preserve:
  - <article> or <main> content (priority container)
  - Headings (h1-h6) with hierarchy
  - Paragraphs
  - Lists (ordered and unordered)
  - Tables (as structured data)
  - Blockquotes
  - Code blocks
  - Image alt text (as "[Image: {alt text}]")
```

### Stage 3 — Extract Paragraphs

```
Input: Clean text with structure
Output: Array of content blocks

Each block:
  {
    "type": "heading" | "paragraph" | "list" | "table" | "blockquote" | "code",
    "level": 1-6 (for headings),
    "text": "{content}",
    "wordCount": {number},
    "position": {0.0-1.0 normalized position in document}
  }

Filter out:
  - Blocks with fewer than 10 words (likely navigation fragments)
  - Duplicate blocks (exact match)
  - Boilerplate blocks (copyright notices, "all rights reserved", etc.)
```

### Stage 4 — Score Relevance

```
Input: Array of content blocks + research topic
Output: Blocks with relevance scores

Scoring factors:
  - Keyword overlap with research topic (0.0-1.0)
  - Semantic similarity to topic (0.0-1.0)
  - Position boost: earlier content scored slightly higher
  - Heading context: blocks under relevant headings scored higher
  - Source authority: known authoritative domains scored higher

Relevance thresholds:
  - >= 0.7: High relevance — always include
  - 0.4-0.7: Medium relevance — include if under source limit
  - < 0.4: Low relevance — exclude unless specifically requested
```

### Stage 5 — Categorize Findings

```
Input: Relevant content blocks
Output: Categorized findings

Each finding is classified into exactly one category (see Finding Categories below).
Classification is based on:
  - Language patterns (prescriptive = best-practice, data-bearing = market-data)
  - Content structure (numbered lists often = best practices, percentages = market data)
  - Source type (research papers = user-need, competitor blogs = competitor-insight)
  - Topic alignment (regulatory language = regulatory, technical specs = technical-constraint)
```

### Stage 6 — Cross-Validate

```
Input: All categorized findings across all sources
Output: Findings with confidence scores

Validation rules:
  - Finding mentioned in 1 source: confidence = low (0.3)
  - Finding mentioned in 2 sources: confidence = medium (0.6)
  - Finding mentioned in 3+ sources: confidence = high (0.9)
  - Finding from authoritative source (research institution, standards body): +0.2 boost
  - Finding contradicted by another source: flag as "disputed", include both perspectives
```

---

## Finding Categories

Every extracted finding is classified into one of these categories.

| Category | Code | Description | Example |
|----------|------|-------------|---------|
| Best Practice | `best-practice` | Established convention or recommended approach | "Always show progress indicators during multi-step forms" |
| User Need | `user-need` | Documented user requirement or expectation | "Users expect checkout to complete in under 60 seconds" |
| Pain Point | `pain-point` | Known frustration or usability issue | "52% of users abandon carts when forced to create an account" |
| Market Data | `market-data` | Statistics, metrics, growth figures | "Global e-commerce conversion rate averages 2.86% in 2026" |
| Design Pattern | `design-pattern` | Reusable UI/UX pattern with documented usage | "Progressive disclosure in settings reduces cognitive load" |
| Technical Constraint | `technical-constraint` | Platform, browser, or infrastructure limitation | "Safari does not support the Payment Request API on macOS" |
| Competitor Insight | `competitor-insight` | Information about a specific competitor's approach | "Shopify checkout uses a single-page layout with accordion sections" |
| Regulatory | `regulatory` | Legal, compliance, or accessibility requirement | "PSD2 requires Strong Customer Authentication for EU payments" |

### Category Distribution Targets

For a well-rounded research output, aim for this distribution:

| Category | Target % | If Under-Represented |
|----------|----------|---------------------|
| best-practice | 20-30% | Add queries: "{topic} best practices", "{topic} guidelines" |
| user-need | 15-25% | Add queries: "{topic} user research", "{topic} user expectations" |
| pain-point | 10-20% | Add queries: "{topic} problems", "{topic} complaints", "{topic} abandonment" |
| market-data | 10-15% | Add queries: "{topic} statistics 2026", "{topic} market data" |
| design-pattern | 15-25% | Add queries: "{topic} UI patterns", "{topic} design examples" |
| technical-constraint | 5-10% | Add queries: "{topic} browser support", "{topic} limitations" |
| competitor-insight | 5-15% | Add queries: "how {competitor} handles {topic}" |
| regulatory | 5-10% | Add queries: "{topic} compliance", "{topic} legal requirements" |

---

## Cross-Validation Methodology

### Confidence Levels

| Level | Sources Required | Label | Color Code |
|-------|-----------------|-------|------------|
| Low | 1 source | `unverified` | muted |
| Medium | 2 sources | `corroborated` | default |
| High | 3+ sources | `validated` | primary |
| Authoritative | Standards body or research institution | `authoritative` | accent |
| Disputed | Contradicting sources found | `disputed` | warning |

### Validation Protocol

```
For each finding:

1. IDENTIFY — extract the core claim (strip subjective language)
2. SEARCH — look for the same claim in other processed sources
3. MATCH — determine if other findings support, contradict, or are neutral
4. SCORE — assign confidence based on match count and source authority
5. FLAG — mark disputed findings with both perspectives
```

### Source Authority Ranking

| Source Type | Authority Score | Examples |
|-------------|----------------|---------|
| Research institution | 1.0 | Nielsen Norman Group, Baymard Institute, Forrester |
| Standards body | 1.0 | W3C, WCAG, ISO, PCI DSS |
| Academic paper | 0.9 | Peer-reviewed UX research, HCI conferences |
| Industry report | 0.8 | Gartner, McKinsey, Deloitte research |
| Established publication | 0.7 | Smashing Magazine, A List Apart, UX Collective |
| Company blog (large) | 0.5 | Google, Apple, Shopify engineering blogs |
| Personal blog (expert) | 0.4 | Recognized practitioners with track record |
| Forum / discussion | 0.3 | Stack Overflow, Reddit, Hacker News |
| Company blog (small) | 0.2 | Unknown company marketing content |
| Content farm | 0.1 | SEO-driven content, thin articles |

---

## Entity Extraction

### Extractable Entity Types

The research pipeline extracts named entities from processed content.

| Entity Type | Detection Pattern | Example |
|-------------|------------------|---------|
| Product name | Proper noun + context (company, tool, platform) | "Figma", "Stripe", "Shopify" |
| Company name | Proper noun + org context | "Google", "Apple", "Baymard Institute" |
| Technology | Known tech terms, framework names | "React", "WebSocket", "Payment Request API" |
| Standard | Acronym + standards context | "WCAG 2.2", "PCI DSS", "PSD2", "SOC 2" |
| Percentage | `\d+(\.\d+)?%` | "52% of users", "3.2% conversion rate" |
| Dollar amount | `\$[\d,]+(\.\d+)?[BMK]?` | "$4.2B market size", "$49/month" |
| Time metric | Duration patterns | "under 3 seconds", "60-second checkout" |
| Person | Proper noun + role/title context | "Jakob Nielsen", "Vitaly Friedman" |

### Entity Output Format

```json
{
  "entities": [
    {
      "text": "Baymard Institute",
      "type": "company",
      "frequency": 7,
      "context": "research authority on e-commerce UX",
      "firstMention": "source-003"
    },
    {
      "text": "52%",
      "type": "percentage",
      "context": "cart abandonment rate when forced account creation",
      "source": "source-005",
      "confidence": "high"
    }
  ]
}
```

---

## Gap Analysis

After processing all findings, run gap analysis to identify what is
missing from the research.

### Gap Detection Protocol

```
1. INVENTORY — count findings per category
2. COMPARE — check against target distribution (see Category Distribution Targets)
3. IDENTIFY — flag categories with fewer findings than target
4. RECOMMEND — suggest additional queries to fill gaps
5. ASSESS — determine if gaps are acceptable (some topics naturally have fewer regulatory findings)
```

### Gap Report Format

```json
{
  "gapAnalysis": {
    "totalFindings": 47,
    "categoryDistribution": {
      "best-practice": { "count": 14, "percentage": 29.8, "target": "20-30%", "status": "adequate" },
      "user-need": { "count": 8, "percentage": 17.0, "target": "15-25%", "status": "adequate" },
      "pain-point": { "count": 6, "percentage": 12.8, "target": "10-20%", "status": "adequate" },
      "market-data": { "count": 3, "percentage": 6.4, "target": "10-15%", "status": "gap" },
      "design-pattern": { "count": 10, "percentage": 21.3, "target": "15-25%", "status": "adequate" },
      "technical-constraint": { "count": 2, "percentage": 4.3, "target": "5-10%", "status": "gap" },
      "competitor-insight": { "count": 4, "percentage": 8.5, "target": "5-15%", "status": "adequate" },
      "regulatory": { "count": 0, "percentage": 0.0, "target": "5-10%", "status": "gap" }
    },
    "gaps": [
      {
        "category": "market-data",
        "deficit": "3.6% below target minimum",
        "suggestedQueries": [
          "e-commerce checkout statistics 2026",
          "checkout conversion rate benchmarks",
          "mobile checkout market data"
        ]
      },
      {
        "category": "regulatory",
        "deficit": "5.0% below target minimum",
        "suggestedQueries": [
          "e-commerce checkout legal requirements",
          "payment processing compliance 2026",
          "GDPR checkout data requirements"
        ]
      }
    ],
    "recommendation": "Run 3-4 additional queries targeting market-data and regulatory categories"
  }
}
```

---

## Integration with MCP Host

When running inside a Claude agent session, the web research skill
leverages the MCP host's capabilities.

### Agent Web Research Workflow

```
STEP 1 — PLAN
  Agent receives research topic.
  Agent loads this skill.
  Agent determines depth level and query strategy.
  Agent identifies any user-provided URLs.

STEP 2 — SEARCH
  Agent uses its web search capability to find relevant sources.
  Agent evaluates search results for relevance and authority.
  Agent selects top sources to fetch.

STEP 3 — FETCH
  Agent retrieves page content for selected URLs.
  Agent processes user-provided URLs.
  Content is cleaned and structured.

STEP 4 — PROCESS
  Agent extracts findings from each source.
  Agent categorizes findings.
  Agent extracts entities.
  Agent scores relevance.

STEP 5 — SYNTHESIZE
  Agent cross-validates findings across sources.
  Agent assigns confidence scores.
  Agent runs gap analysis.
  Agent fills gaps with additional searches if deep depth.

STEP 6 — REPORT
  Agent generates structured findings JSON.
  Agent writes human-readable summary.
  Agent stores insights in Memoire research pipeline.
  Agent creates specs for data visualizations if needed.
```

### MCP Tool Usage

The agent may use these MCP tools during research:

| Tool | Purpose | When |
|------|---------|------|
| `WebSearch` | Find relevant sources for a query | Step 2 |
| `WebFetch` | Retrieve page content from URLs | Step 3 |
| `Read` | Read local files (existing research, transcripts) | Step 1, Step 5 |
| `Write` | Write findings, reports, insights | Step 6 |
| `Bash` | Run Memoire CLI commands for pipeline integration | Step 6 |

---

## Example Agent Workflow

### Full Research Session

```
User: "Research best practices for design system documentation"

Agent Plan:
  Depth: standard (7 queries)
  Focus: best-practice, design-pattern, competitor-insight
  Output: findings.json + summary.md

Query Set:
  1. "design system documentation best practices 2026"
  2. "how to document design system components"
  3. "design system documentation tools comparison"
  4. "component documentation examples Storybook Docusaurus"
  5. "design system governance documentation"
  6. "design token documentation patterns"
  7. "design system adoption documentation strategy"

Process:
  -> Search all 7 queries
  -> Select top 15 sources by relevance and authority
  -> Fetch and process each source
  -> Extract ~40-60 findings
  -> Cross-validate -> ~25-35 findings with medium+ confidence
  -> Gap analysis -> identify any missing categories
  -> Fill gaps if needed (1-2 additional queries)
  -> Generate findings.json and summary.md
  -> Store insights in .memoire/research/insights/
```

---

## Finding JSON Schema

Each extracted finding produces a JSON object:

```json
{
  "id": "find-001",
  "category": "best-practice",
  "statement": "Design system documentation should include live code examples alongside visual previews for every component",
  "evidence": "Both Storybook and Docusaurus documentation patterns show live code examples as the most referenced section by developers",
  "sources": [
    {
      "url": "https://example.com/article",
      "title": "Documentation Best Practices",
      "authority": 0.7,
      "fetchDate": "2026-03-28"
    }
  ],
  "confidence": "high",
  "confidenceScore": 0.85,
  "entities": [
    { "text": "Storybook", "type": "product" },
    { "text": "Docusaurus", "type": "product" }
  ],
  "tags": ["documentation", "code-examples", "developer-experience"],
  "relatedFindings": ["find-003", "find-012"]
}
```

---

## Output Formats

### Findings JSON

The primary output: a structured array of validated findings.

```
File: .memoire/research/web/{label}.findings.json
Contents:
  - metadata (topic, depth, date, query count, source count)
  - findings array (full finding objects)
  - entities array (extracted entities with frequency)
  - gap analysis results
  - source registry (all URLs with authority scores)
```

### Summary Markdown

Human-readable research summary for sharing with stakeholders.

```
File: .memoire/research/web/{label}.summary.md
Structure:
  - Research Topic and Scope
  - Key Findings (top 10 by confidence)
  - Category Breakdown (findings per category with counts)
  - Notable Entities (products, companies, standards mentioned)
  - Gap Analysis (what was not found)
  - Source List (all URLs with authority ratings)
  - Methodology Notes (depth, queries used, date range)
```

### Insights JSON (Memoire Pipeline Format)

Findings converted to Memoire insight objects for synthesis with other
research sources.

```
File: .memoire/research/insights/{label}.insights.json
Contents: Array of Memoire insight objects tagged with:
  source: "web-research"
  topic: "{research topic}"
  category: "{finding category}"
  confidence: 0.0-1.0
  date: "{ISO date}"
```

---

## Storage Structure

```
.memoire/
  research/
    web/
      checkout-optimization.findings.json    # structured findings
      checkout-optimization.summary.md       # human-readable summary
      checkout-optimization.meta.json        # research metadata
      checkout-optimization.sources.json     # source registry with auth scores
    insights/
      checkout-optimization.insights.json    # Memoire pipeline format
```

---

## Anti-Patterns and Quality Checks

### Research Anti-Patterns

| Anti-Pattern | Problem | Correction |
|-------------|---------|------------|
| Single-source findings | No validation, may be incorrect | Require 2+ sources for medium confidence |
| SEO content as authority | Thin content ranks well but lacks substance | Check source authority score, prefer research institutions |
| Recency bias | Ignoring established principles for new trends | Include both recent and foundational sources |
| Confirmation bias | Only searching for evidence that supports a hypothesis | Explicitly search for contradicting evidence |
| Depth without breadth | Deep dive on one angle, missing the full picture | Use the category distribution targets to check coverage |
| Breadth without depth | Surface-level findings on many topics | For standard/deep depth, ensure at least 3 high-confidence findings per key category |
| Ignoring contradictions | Presenting a false consensus | Flag disputed findings, present both sides |
| Outdated data | Statistics from years ago presented as current | Always check publication date, prefer data from last 2 years |

### Quality Checklist

Before finalizing web research output:

- [ ] All finding categories have adequate representation (or gaps are documented)
- [ ] High-confidence findings are supported by 3+ sources
- [ ] Disputed findings are flagged with both perspectives
- [ ] Source authority scores are reasonable (no content farms treated as authoritative)
- [ ] Entities are correctly extracted and typed
- [ ] Statistics include source attribution and date
- [ ] Gap analysis is complete with suggested follow-up queries
- [ ] Summary is readable without referencing the raw findings
- [ ] Insights are tagged correctly for Memoire pipeline integration
- [ ] No broken URLs in the source registry

---

## Workflow Summary

```
TRIGGER: User needs web research on a topic

1. SCOPE
   -> Determine depth level (quick / standard / deep)
   -> Define focus categories if specified
   -> Collect user-provided URLs
   -> Build query strategy

2. SEARCH
   -> Execute queries based on depth level
   -> Evaluate search results for relevance and authority
   -> Select top sources for fetching

3. FETCH
   -> Retrieve page content for selected URLs
   -> Process user-provided URLs
   -> Handle errors gracefully (skip failures, log warnings)

4. PROCESS
   -> Strip HTML, extract content blocks
   -> Score relevance to research topic
   -> Categorize findings into 8 categories
   -> Extract named entities

5. VALIDATE
   -> Cross-validate findings across sources
   -> Assign confidence scores
   -> Flag disputed findings
   -> Calculate source authority

6. ANALYZE
   -> Run gap analysis against category targets
   -> Fill gaps with additional queries (if standard/deep depth)
   -> Compile entity frequency and context

7. OUTPUT
   -> Generate findings.json (structured data)
   -> Generate summary.md (human-readable)
   -> Generate insights.json (Memoire pipeline format)
   -> Store in .memoire/research/web/

8. INTEGRATE
   -> Feed insights into Memoire research synthesizer
   -> Cross-reference with interview and survey data
   -> Generate specs for research dashboard components
```
