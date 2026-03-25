/**
 * Research Synthesizer — Obsidian-style knowledge graph that produces
 * design-language-aware output Claude can consume for spec writing,
 * product management, and design decisions.
 *
 * Transforms raw insights into:
 * - Interconnected themes with wikilinks
 * - Design-backed personas with behavioral archetypes
 * - Product spec recommendations grounded in research
 * - Design language briefs (voice, tone, interaction principles)
 * - Gap analysis with prioritized next-steps
 */

import type { ResearchInsight, ResearchPersona, ResearchTheme, ResearchStore } from "./engine.js";

export interface SynthesisResult {
  themes: ResearchTheme[];
  personas: ResearchPersona[];
  keyFindings: ResearchInsight[];
  gaps: string[];
  recommendations: string[];
  designLanguage: DesignLanguageBrief;
  specRecommendations: SpecRecommendation[];
  obsidianGraph: ObsidianNode[];
}

export interface DesignLanguageBrief {
  voiceAttributes: string[];
  toneGuidelines: string[];
  interactionPrinciples: string[];
  visualDirections: string[];
  antiPatterns: string[];
}

export interface SpecRecommendation {
  name: string;
  type: "component" | "page" | "dataviz";
  atomicLevel?: "atom" | "molecule" | "organism" | "template";
  rationale: string;
  supportingInsights: string[];
  priority: "critical" | "high" | "medium" | "low";
  estimatedComplexity: "simple" | "moderate" | "complex";
}

export interface ObsidianNode {
  id: string;
  type: "insight" | "theme" | "persona" | "spec-rec" | "design-principle";
  title: string;
  links: string[]; // IDs of connected nodes
  tags: string[];
  content: string;
}

/**
 * Synthesize all research data into a coherent, design-aware output.
 */
export function synthesizeResearch(store: ResearchStore): SynthesisResult {
  const themes = identifyThemes(store.insights);
  const personas = inferPersonas(store.insights);
  const keyFindings = rankInsights(store.insights);
  const gaps = identifyGaps(store);
  const recommendations = generateRecommendations(themes, keyFindings);
  const designLanguage = deriveDesignLanguage(store.insights, themes);
  const specRecommendations = generateSpecRecommendations(themes, keyFindings, personas);
  const obsidianGraph = buildObsidianGraph(store, themes, personas, specRecommendations);

  return {
    themes,
    personas,
    keyFindings,
    gaps,
    recommendations,
    designLanguage,
    specRecommendations,
    obsidianGraph,
  };
}

// ── Theme Identification ─────────────────────────────────

function identifyThemes(insights: ResearchInsight[]): ResearchTheme[] {
  const tagCounts = new Map<string, ResearchInsight[]>();

  for (const insight of insights) {
    for (const tag of insight.tags) {
      const group = tagCounts.get(tag) ?? [];
      group.push(insight);
      tagCounts.set(tag, group);
    }
  }

  // Also identify emergent themes from co-occurring tags
  const coOccurrence = new Map<string, number>();
  for (const insight of insights) {
    const tags = insight.tags;
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const pair = [tags[i], tags[j]].sort().join("+");
        coOccurrence.set(pair, (coOccurrence.get(pair) ?? 0) + 1);
      }
    }
  }

  const themes = Array.from(tagCounts.entries())
    .filter(([_, group]) => group.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tag, group]) => {
      // Enrich description with co-occurring context
      const relatedTags = Array.from(coOccurrence.entries())
        .filter(([pair, count]) => pair.includes(tag) && count >= 2)
        .map(([pair]) => pair.split("+").find(t => t !== tag))
        .filter(Boolean)
        .slice(0, 3);

      const desc = relatedTags.length > 0
        ? `${group.length} findings related to "${tag}" — often co-occurs with ${relatedTags.join(", ")}`
        : `${group.length} findings related to "${tag}"`;

      return {
        name: tag,
        description: desc,
        insights: group.map((i) => i.id),
        frequency: group.length,
      };
    });

  return themes;
}

// ── Persona Inference ────────────────────────────────────

function inferPersonas(insights: ResearchInsight[]): ResearchPersona[] {
  const personas: ResearchPersona[] = [];

  // Look for user-type patterns across all research
  const qualitative = insights.filter(i =>
    i.tags.includes("qualitative") || i.tags.includes("survey") || i.tags.includes("interview")
  );

  if (qualitative.length < 3) {
    // Not enough data for personas — return a research-backed archetype
    if (insights.length >= 5) {
      personas.push({
        name: "Primary User",
        role: "Derived from research patterns",
        goals: extractByPattern(insights, /\b(want|need|goal|wish|expect|prefer)\b/i, 5),
        painPoints: extractByPattern(insights, /\b(pain|frustrat|difficult|challeng|struggle|slow|error)\b/i, 5),
        behaviors: extractByPattern(insights, /\b(usually|always|often|tend|habit|workflow|routine)\b/i, 5),
        source: `Synthesized from ${insights.length} insights`,
      });
    }
    return personas;
  }

  // Cluster qualitative insights by behavioral signals
  const powerUsers = qualitative.filter(i =>
    i.finding.toLowerCase().match(/\b(advanced|power|expert|frequent|daily|heavy)\b/)
  );
  const newUsers = qualitative.filter(i =>
    i.finding.toLowerCase().match(/\b(new|beginner|onboard|first\s*time|learn|confused)\b/)
  );
  const managers = qualitative.filter(i =>
    i.finding.toLowerCase().match(/\b(manage|oversee|approv|review|team|report|stakeholder)\b/)
  );

  if (powerUsers.length >= 2) {
    personas.push({
      name: "Power User",
      role: "Frequent, advanced user who pushes feature boundaries",
      goals: extractFindings(powerUsers, /want|need|goal/i, 4),
      painPoints: extractFindings(powerUsers, /pain|frustrat|slow/i, 4),
      behaviors: extractFindings(powerUsers, /usually|always|workflow/i, 3),
      source: `${powerUsers.length} power-user insights`,
    });
  }

  if (newUsers.length >= 2) {
    personas.push({
      name: "New User",
      role: "Recently onboarded, learning the system",
      goals: extractFindings(newUsers, /want|need|understand/i, 4),
      painPoints: extractFindings(newUsers, /confus|overwhelm|unclear/i, 4),
      behaviors: extractFindings(newUsers, /try|explore|ask/i, 3),
      source: `${newUsers.length} new-user insights`,
    });
  }

  if (managers.length >= 2) {
    personas.push({
      name: "Manager / Stakeholder",
      role: "Reviews, approves, and oversees team output",
      goals: extractFindings(managers, /want|need|visibility/i, 4),
      painPoints: extractFindings(managers, /delay|bottleneck|unclear/i, 4),
      behaviors: extractFindings(managers, /review|check|monitor/i, 3),
      source: `${managers.length} management-level insights`,
    });
  }

  // Fallback: if no behavioral clusters, create a generic persona
  if (personas.length === 0) {
    personas.push({
      name: "Primary User",
      role: "Core user derived from qualitative research",
      goals: extractByPattern(qualitative, /want|need|goal/i, 5),
      painPoints: extractByPattern(qualitative, /pain|frustrat|difficult/i, 5),
      behaviors: extractByPattern(qualitative, /usually|often|workflow/i, 4),
      source: `Synthesized from ${qualitative.length} qualitative findings`,
    });
  }

  return personas;
}

function extractByPattern(insights: ResearchInsight[], pattern: RegExp, max: number): string[] {
  return insights
    .filter(i => pattern.test(i.finding))
    .map(i => i.finding)
    .slice(0, max);
}

function extractFindings(insights: ResearchInsight[], pattern: RegExp, max: number): string[] {
  const matches = insights.filter(i => pattern.test(i.finding)).map(i => i.finding);
  if (matches.length > 0) return matches.slice(0, max);
  return insights.slice(0, max).map(i => i.finding);
}

// ── Insight Ranking ──────────────────────────────────────

function rankInsights(insights: ResearchInsight[]): ResearchInsight[] {
  return [...insights].sort((a, b) => {
    const confOrder = { high: 3, medium: 2, low: 1 };
    const aScore = confOrder[a.confidence] + a.evidence.length * 0.5 + a.tags.length * 0.3;
    const bScore = confOrder[b.confidence] + b.evidence.length * 0.5 + b.tags.length * 0.3;
    return bScore - aScore;
  });
}

// ── Gap Analysis ─────────────────────────────────────────

function identifyGaps(store: ResearchStore): string[] {
  const gaps: string[] = [];

  if (store.insights.filter(i => i.tags.includes("quantitative")).length === 0) {
    gaps.push("No quantitative data — add survey scores, analytics, or usage metrics");
  }
  if (store.insights.filter(i => i.tags.includes("qualitative")).length === 0) {
    gaps.push("No qualitative data — add interviews, open-ended survey responses, or usability tests");
  }
  if (store.sources.length < 2) {
    gaps.push("Single data source — triangulate with 2+ sources for reliability");
  }
  if (store.insights.filter(i => i.confidence === "high").length === 0) {
    gaps.push("No high-confidence findings — need more evidence or source diversity");
  }
  if (store.personas.length === 0) {
    gaps.push("No personas defined — consider user interviews or behavioral clustering");
  }
  if (!store.insights.some(i => i.tags.includes("competitor-insight") || i.tags.includes("market-context"))) {
    gaps.push("No competitive landscape data — consider market analysis");
  }

  return gaps;
}

// ── Recommendations ──────────────────────────────────────

function generateRecommendations(
  themes: ResearchTheme[],
  keyFindings: ResearchInsight[]
): string[] {
  const recs: string[] = [];

  if (themes.length > 0) {
    recs.push(`Priority theme: "${themes[0].name}" (${themes[0].frequency} supporting findings) — address this first`);
  }

  const highFindings = keyFindings.filter(f => f.confidence === "high");
  if (highFindings.length > 0) {
    recs.push(`${highFindings.length} high-confidence findings should directly inform component specs and design decisions`);
  }

  const painPoints = keyFindings.filter(f =>
    f.tags.includes("pain-point") || f.finding.toLowerCase().includes("frustrat")
  );
  if (painPoints.length >= 3) {
    recs.push(`${painPoints.length} pain points identified — prioritize by frequency and severity`);
  }

  if (themes.length > 5) {
    recs.push("Many themes identified — consider affinity mapping to merge related themes");
  }

  return recs;
}

// ── Design Language Derivation ───────────────────────────

function deriveDesignLanguage(
  insights: ResearchInsight[],
  themes: ResearchTheme[]
): DesignLanguageBrief {
  const voice: string[] = [];
  const tone: string[] = [];
  const interaction: string[] = [];
  const visual: string[] = [];
  const anti: string[] = [];

  // Derive from pain points (what to avoid)
  const pains = insights.filter(i =>
    i.finding.toLowerCase().match(/\b(frustrat|confus|overwhelm|slow|error|complex)\b/)
  );
  for (const pain of pains.slice(0, 5)) {
    if (/confus|unclear/i.test(pain.finding)) {
      voice.push("Clear and unambiguous — label every action, never assume context");
      anti.push("Avoid jargon or ambiguous icons without labels");
    }
    if (/overwhelm|complex/i.test(pain.finding)) {
      interaction.push("Progressive disclosure — show essentials first, details on demand");
      visual.push("Generous whitespace — never crowd the viewport");
    }
    if (/slow|wait/i.test(pain.finding)) {
      interaction.push("Instant feedback — every action shows a response within 100ms");
    }
    if (/error/i.test(pain.finding)) {
      interaction.push("Forgiving — allow undo, confirm destructive actions, validate inline");
      tone.push("Supportive when errors occur — guide toward resolution, not blame");
    }
  }

  // Derive from positive signals
  const positives = insights.filter(i =>
    i.finding.toLowerCase().match(/\b(love|great|easy|fast|intuitive|enjoy|prefer)\b/)
  );
  for (const pos of positives.slice(0, 3)) {
    if (/fast|quick/i.test(pos.finding)) interaction.push("Speed is a feature — minimize clicks and load times");
    if (/easy|intuitive/i.test(pos.finding)) interaction.push("Familiar patterns — use conventions users already know");
  }

  // Defaults if research doesn't cover these
  if (voice.length === 0) voice.push("Professional and concise — monospace terminal aesthetic");
  if (tone.length === 0) tone.push("Confident but not arrogant — data-backed, not opinion-driven");
  if (interaction.length === 0) interaction.push("Keyboard-first with mouse support");
  if (visual.length === 0) visual.push("Dark theme primary, light theme for content/documents");

  return {
    voiceAttributes: dedupe(voice),
    toneGuidelines: dedupe(tone),
    interactionPrinciples: dedupe(interaction),
    visualDirections: dedupe(visual),
    antiPatterns: dedupe(anti),
  };
}

// ── Spec Recommendations ─────────────────────────────────

function generateSpecRecommendations(
  themes: ResearchTheme[],
  keyFindings: ResearchInsight[],
  personas: ResearchPersona[]
): SpecRecommendation[] {
  const recs: SpecRecommendation[] = [];

  // Recommend components based on pain points
  const painFindings = keyFindings.filter(f =>
    f.tags.includes("pain-point") || f.finding.toLowerCase().match(/frustrat|difficult|slow/)
  );

  for (const pain of painFindings.slice(0, 5)) {
    if (/form|input|field|entry/i.test(pain.finding)) {
      recs.push({
        name: "smart-form",
        type: "component",
        atomicLevel: "organism",
        rationale: `Research shows form-related pain: "${pain.finding.slice(0, 80)}..."`,
        supportingInsights: [pain.id],
        priority: "high",
        estimatedComplexity: "complex",
      });
    }
    if (/search|find|filter/i.test(pain.finding)) {
      recs.push({
        name: "search-filter",
        type: "component",
        atomicLevel: "molecule",
        rationale: `Users struggle with finding content: "${pain.finding.slice(0, 80)}..."`,
        supportingInsights: [pain.id],
        priority: "high",
        estimatedComplexity: "moderate",
      });
    }
    if (/navigation|lost|where/i.test(pain.finding)) {
      recs.push({
        name: "breadcrumb-nav",
        type: "component",
        atomicLevel: "molecule",
        rationale: `Navigation confusion reported: "${pain.finding.slice(0, 80)}..."`,
        supportingInsights: [pain.id],
        priority: "critical",
        estimatedComplexity: "simple",
      });
    }
  }

  // Recommend dashboard if data/reporting themes exist
  if (themes.some(t => t.name.match(/data|report|metric|dashboard|analytics/i))) {
    recs.push({
      name: "analytics-dashboard",
      type: "page",
      rationale: "Research themes indicate need for data visibility and reporting",
      supportingInsights: themes.find(t => t.name.match(/data|report/i))?.insights.slice(0, 3) ?? [],
      priority: "high",
      estimatedComplexity: "complex",
    });
  }

  // Deduplicate by name
  const seen = new Set<string>();
  return recs.filter(r => {
    if (seen.has(r.name)) return false;
    seen.add(r.name);
    return true;
  });
}

// ── Obsidian Knowledge Graph ─────────────────────────────

function buildObsidianGraph(
  store: ResearchStore,
  themes: ResearchTheme[],
  personas: ResearchPersona[],
  specRecs: SpecRecommendation[]
): ObsidianNode[] {
  const nodes: ObsidianNode[] = [];

  // Insight nodes
  for (const insight of store.insights) {
    const linkedThemes = themes
      .filter(t => t.insights.includes(insight.id))
      .map(t => `theme-${t.name}`);

    nodes.push({
      id: insight.id,
      type: "insight",
      title: insight.finding.slice(0, 80),
      links: linkedThemes,
      tags: insight.tags,
      content: [
        `# ${insight.finding}`,
        "",
        `**Confidence:** ${insight.confidence}`,
        `**Source:** ${insight.source}`,
        "",
        insight.evidence.length > 0 ? `## Evidence\n${insight.evidence.map(e => `> ${e}`).join("\n\n")}` : "",
        "",
        linkedThemes.length > 0 ? `## Themes\n${linkedThemes.map(t => `- [[${t}]]`).join("\n")}` : "",
      ].filter(Boolean).join("\n"),
    });
  }

  // Theme nodes
  for (const theme of themes) {
    const linkedInsights = theme.insights;
    const linkedSpecs = specRecs
      .filter(s => s.supportingInsights.some(id => linkedInsights.includes(id)))
      .map(s => `spec-${s.name}`);

    nodes.push({
      id: `theme-${theme.name}`,
      type: "theme",
      title: theme.name,
      links: [...linkedInsights, ...linkedSpecs],
      tags: [theme.name],
      content: [
        `# ${theme.name}`,
        "",
        theme.description,
        `**Frequency:** ${theme.frequency}`,
        "",
        `## Insights\n${linkedInsights.map(id => `- [[${id}]]`).join("\n")}`,
        linkedSpecs.length > 0 ? `\n## Recommended Specs\n${linkedSpecs.map(s => `- [[${s}]]`).join("\n")}` : "",
      ].filter(Boolean).join("\n"),
    });
  }

  // Persona nodes
  for (const persona of personas) {
    const slug = persona.name.toLowerCase().replace(/\s+/g, "-");
    nodes.push({
      id: `persona-${slug}`,
      type: "persona",
      title: persona.name,
      links: [],
      tags: ["persona"],
      content: [
        `# ${persona.name}`,
        `**Role:** ${persona.role}`,
        "",
        `## Goals\n${persona.goals.map(g => `- ${g}`).join("\n")}`,
        "",
        `## Pain Points\n${persona.painPoints.map(p => `- ${p}`).join("\n")}`,
        "",
        `## Behaviors\n${persona.behaviors.map(b => `- ${b}`).join("\n")}`,
      ].join("\n"),
    });
  }

  // Spec recommendation nodes
  for (const spec of specRecs) {
    nodes.push({
      id: `spec-${spec.name}`,
      type: "spec-rec",
      title: spec.name,
      links: spec.supportingInsights,
      tags: [spec.type, spec.priority],
      content: [
        `# Recommended: ${spec.name}`,
        `**Type:** ${spec.type}${spec.atomicLevel ? ` (${spec.atomicLevel})` : ""}`,
        `**Priority:** ${spec.priority}`,
        `**Complexity:** ${spec.estimatedComplexity}`,
        "",
        `## Rationale\n${spec.rationale}`,
        "",
        `## Supporting Research\n${spec.supportingInsights.map(id => `- [[${id}]]`).join("\n")}`,
      ].join("\n"),
    });
  }

  return nodes;
}

// ── Helpers ──────────────────────────────────────────────

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}
