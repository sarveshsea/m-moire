import {
  detectResearchSentiment,
  extractResearchEntities,
  extractResearchSignals,
  formatResearchSignal,
  inferResearchCategory,
  stripFindingPrefix,
} from "./analysis.js";
import { assessResearchDataQuality } from "./quantitative.js";
import type {
  ResearchContradiction,
  ResearchDataQualitySnapshot,
  ResearchFinding,
  ResearchMethods,
  ResearchObservation,
  ResearchOpportunity,
  ResearchPersona,
  ResearchRisk,
  ResearchSourceKind,
  ResearchSourceRecord,
  ResearchStore,
  ResearchSummarySnapshot,
  ResearchTheme,
} from "./engine.js";

type EnrichedFinding = ResearchFinding & {
  sourceQuality: number;
  sourceKinds: Set<ResearchSourceKind>;
  sourceNames: string[];
  evidenceCount: number;
  actorNames: string[];
};

type ThemeGroup = {
  signal: string;
  findings: EnrichedFinding[];
  sourceIds: Set<string>;
  sourceKinds: Set<ResearchSourceKind>;
  sourceNames: Set<string>;
  categories: Map<string, number>;
  positiveCount: number;
  negativeCount: number;
  weightedEvidence: number;
  weightedSourceQuality: number;
  methods: Set<ResearchFinding["method"]>;
};

const RISK_CATEGORIES = new Set(["pain-point", "technical-constraint", "regulatory", "workaround", "cohort-difference"]);
const OPPORTUNITY_CATEGORIES = new Set(["goal", "need", "feature-request", "best-practice", "market-data"]);
const BEHAVIOR_CATEGORIES = new Set(["behavior", "workaround"]);
const IGNORED_ACTORS = new Set(["interviewer", "moderator", "unknown", "q", "a"]);

export function synthesizeResearch(store: ResearchStore): {
  findings: ResearchFinding[];
  themes: ResearchTheme[];
  personas: ResearchPersona[];
  opportunities: ResearchOpportunity[];
  risks: ResearchRisk[];
  contradictions: ResearchContradiction[];
  summary: ResearchSummarySnapshot;
  methods: ResearchMethods;
  quality: ResearchDataQualitySnapshot;
} {
  const sourceIndex = new Map(store.sources.map((source) => [source.id, source]));
  const observationIndex = new Map(store.observations.map((observation) => [observation.id, observation]));
  const enrichedFindings = store.findings.map((finding) => enrichFinding(finding, sourceIndex, observationIndex));
  const themes = buildThemes(enrichedFindings);
  const findingThemeIds = buildFindingThemeIndex(themes);

  const findings = enrichedFindings.map((finding) => ({
    ...finding,
    themeIds: findingThemeIds.get(finding.id) ?? [],
  }));

  const personas = buildPersonas(findings, store.observations, store.personas, sourceIndex);
  const opportunities = buildOpportunities(themes, findings);
  const risks = buildRisks(themes, findings);
  const contradictions = buildContradictions(themes, findings);

  const quality = assessResearchDataQuality({
    ...store,
    findings,
    themes,
    personas,
    opportunities,
    risks,
    contradictions,
  });
  const methods = buildMethods(store, quality, contradictions.length);
  const summary = buildSummary({
    findings,
    themes,
    personas,
    opportunities,
    risks,
    contradictions,
    quality,
    sources: store.sources,
    observations: store.observations,
    quantitativeMetrics: store.quantitativeMetrics,
  });

  return {
    findings,
    themes,
    personas,
    opportunities,
    risks,
    contradictions,
    summary,
    methods,
    quality,
  };
}

export function generateResearchReportArtifacts(store: ResearchStore): {
  markdown: string;
  json: Record<string, unknown>;
} {
  const synthesized = synthesizeResearch(store);
  const markdown = generateResearchReportMarkdown({
    ...store,
    findings: synthesized.findings,
    themes: synthesized.themes,
    personas: synthesized.personas,
    opportunities: synthesized.opportunities,
    risks: synthesized.risks,
    contradictions: synthesized.contradictions,
    quality: synthesized.quality,
    methods: synthesized.methods,
    summary: synthesized.summary,
  });

  return {
    markdown,
    json: {
      version: 2,
      generatedAt: new Date().toISOString(),
      summary: synthesized.summary,
      quality: synthesized.quality,
      methods: synthesized.methods,
      findings: synthesized.findings,
      themes: synthesized.themes,
      personas: synthesized.personas,
      quantitativeMetrics: store.quantitativeMetrics,
      opportunities: synthesized.opportunities,
      risks: synthesized.risks,
      contradictions: synthesized.contradictions,
      sources: store.sources,
      observations: store.observations,
    },
  };
}

export function generateResearchReportMarkdown(store: ResearchStore): string {
  const synthesized = synthesizeResearch(store);
  const sourceAppendix = mergeSourceRecords(store.sources);
  const lines: string[] = [
    "# Research Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Executive Summary",
    "",
    synthesized.summary.narrative,
    "",
    "## Methods & Data Quality",
    "",
    `- Analysis mode: ${synthesized.methods.analysisMode}`,
    `- Quantitative approach: ${synthesized.methods.quantitativeApproach}`,
    `- Qualitative approach: ${synthesized.methods.qualitativeApproach}`,
    `- Overall quality score: ${synthesized.quality.overallScore}/100`,
    `- Sample size: ${synthesized.quality.sampleSize}`,
    `- Completeness score: ${synthesized.quality.completenessScore}/100`,
    `- Source diversity score: ${synthesized.quality.sourceDiversityScore}/100`,
    `- Triangulation score: ${synthesized.quality.triangulationScore}/100`,
    `- Structure score: ${synthesized.quality.structureScore}/100`,
    "",
  ];

  for (const limitation of synthesized.methods.limitations) {
    lines.push(`- Limitation: ${limitation}`);
  }
  lines.push("");

  lines.push("## Quantitative Findings", "");
  if (store.quantitativeMetrics.length === 0) {
    lines.push("No quantitative metrics available yet.", "");
  } else {
    for (const metric of store.quantitativeMetrics.slice(0, 10)) {
      lines.push(`### ${metric.label}`);
      lines.push(`- Sample size: ${metric.sampleSize}`);
      lines.push(`- Mean: ${metric.mean.toFixed(2)}`);
      lines.push(`- Median: ${metric.median.toFixed(2)}`);
      lines.push(`- Std dev: ${metric.stdDev.toFixed(2)}`);
      lines.push(`- Missing rate: ${(metric.missingRate * 100).toFixed(1)}%`);
      lines.push(`- Outliers: ${metric.outlierCount}`);
      if (metric.confidenceInterval95) {
        lines.push(`- 95% CI: ${metric.confidenceInterval95.low.toFixed(2)} to ${metric.confidenceInterval95.high.toFixed(2)}`);
      }
      if (metric.nps) {
        lines.push(`- NPS: ${metric.nps.score} (${metric.nps.promoterPct}% promoters, ${metric.nps.passivePct}% passives, ${metric.nps.detractorPct}% detractors)`);
      }
      if (metric.cohortComparisons.length > 0) {
        for (const comparison of metric.cohortComparisons.slice(0, 3)) {
          const delta = `${comparison.deltaFromOverall >= 0 ? "+" : ""}${comparison.deltaFromOverall.toFixed(2)}`;
          lines.push(`- Cohort ${comparison.cohort}: mean ${comparison.mean.toFixed(2)}, delta ${delta} (n=${comparison.sampleSize})`);
        }
      }
      lines.push("");
    }
  }

  lines.push("## Top Themes", "");
  if (synthesized.themes.length === 0) {
    lines.push("No themes synthesized yet.", "");
  } else {
    for (const theme of synthesized.themes.slice(0, 8)) {
      lines.push(`### ${theme.name}`);
      lines.push(theme.description);
      lines.push(`- Findings: ${theme.frequency}`);
      lines.push(`- Sources: ${theme.sourceCount}`);
      lines.push(`- Source types: ${theme.sourceTypeCount}`);
      lines.push(`- Confidence: ${theme.confidence}`);
      if (theme.signalTags.length > 0) {
        lines.push(`- Signals: ${theme.signalTags.join(", ")}`);
      }
      lines.push("");
    }
  }

  lines.push("## Opportunities", "");
  if (synthesized.opportunities.length === 0) {
    lines.push("No clear opportunities detected yet.", "");
  } else {
    for (const opportunity of synthesized.opportunities) {
      lines.push(`### ${opportunity.title}`);
      lines.push(opportunity.summary);
      lines.push(`- Priority: ${opportunity.priority}`);
      lines.push(`- Confidence: ${opportunity.confidence}`);
      lines.push(`- Supporting findings: ${opportunity.evidenceFindingIds.length}`);
      lines.push(`- Sources: ${opportunity.sourceCount}`);
      lines.push("");
    }
  }

  lines.push("## Risks", "");
  if (synthesized.risks.length === 0) {
    lines.push("No major risks detected yet.", "");
  } else {
    for (const risk of synthesized.risks) {
      lines.push(`### ${risk.title}`);
      lines.push(risk.summary);
      lines.push(`- Severity: ${risk.severity}`);
      lines.push(`- Supporting findings: ${risk.evidenceFindingIds.length}`);
      lines.push(`- Sources: ${risk.sourceCount}`);
      lines.push("");
    }
  }

  lines.push("## Contradictions", "");
  if (synthesized.contradictions.length === 0) {
    lines.push("No major contradictions detected.", "");
  } else {
    for (const contradiction of synthesized.contradictions) {
      lines.push(`### ${contradiction.topic}`);
      lines.push(contradiction.summary);
      lines.push(`- Positive findings: ${contradiction.positiveFindingIds.length}`);
      lines.push(`- Negative findings: ${contradiction.negativeFindingIds.length}`);
      lines.push("");
    }
  }

  lines.push("## Personas", "");
  if (synthesized.personas.length === 0) {
    lines.push("No personas synthesized yet.", "");
  } else {
    for (const persona of synthesized.personas) {
      lines.push(`### ${persona.name}`);
      lines.push(`- Role: ${persona.role}`);
      if (persona.confidence) lines.push(`- Confidence: ${persona.confidence}`);
      if (persona.goals.length > 0) lines.push(`- Goals: ${persona.goals.join("; ")}`);
      if (persona.painPoints.length > 0) lines.push(`- Pain points: ${persona.painPoints.join("; ")}`);
      if (persona.behaviors.length > 0) lines.push(`- Behaviors: ${persona.behaviors.join("; ")}`);
      if (persona.quote) lines.push(`- Representative quote: "${persona.quote}"`);
      lines.push("");
    }
  }

  lines.push("## Recommended Next Moves", "");
  for (const action of synthesized.summary.nextActions) {
    lines.push(`- ${action}`);
  }
  lines.push("");

  lines.push("## Source Appendix", "");
  for (const source of sourceAppendix) {
    lines.push(`### ${source.name}`);
    lines.push(`- Type: ${source.type}`);
    lines.push(`- Processed: ${source.processedAt}`);
    if (typeof source.itemCount === "number") lines.push(`- Items: ${source.itemCount}`);
    if (typeof source.sampleSize === "number") lines.push(`- Sample size: ${source.sampleSize}`);
    if (typeof source.missingRate === "number") lines.push(`- Missing rate: ${(source.missingRate * 100).toFixed(1)}%`);
    if (typeof source.qualityScore === "number") lines.push(`- Quality score: ${source.qualityScore}/100`);
    if ((source.notes?.length ?? 0) > 0) lines.push(`- Notes: ${source.notes?.join("; ")}`);
    lines.push("");
  }

  return lines.join("\n");
}

function enrichFinding(
  finding: ResearchFinding,
  sourceIndex: Map<string, ResearchSourceRecord>,
  observationIndex: Map<string, ResearchObservation>,
): EnrichedFinding {
  const sourceRecords = finding.evidenceSourceIds
    .map((sourceId) => sourceIndex.get(sourceId))
    .filter((source): source is ResearchSourceRecord => Boolean(source));
  const sourceKinds = new Set(sourceRecords.map((source) => source.sourceKind ?? "qualitative"));
  const sourceNames = sourceRecords.map((source) => source.name);
  const evidenceObservations = finding.evidenceObservationIds
    .map((observationId) => observationIndex.get(observationId))
    .filter((observation): observation is ResearchObservation => Boolean(observation));

  const actorNames = unique(
    evidenceObservations
      .flatMap((observation) => [observation.actor, observation.cohort])
      .filter((value): value is string => Boolean(value))
      .filter((value) => !IGNORED_ACTORS.has(value.toLowerCase())),
  );

  const sourceQuality = sourceRecords.length === 0
    ? 60
    : Math.round(sourceRecords.reduce((sum, source) => sum + (source.qualityScore ?? 60), 0) / sourceRecords.length);
  const statement = finding.statement || stripFindingPrefix(finding.source ?? "");
  const tags = unique(finding.tags);
  const entities = finding.entities.length > 0
    ? unique(finding.entities)
    : extractResearchEntities(statement);
  const sentiment = finding.sentiment ?? detectResearchSentiment(statement);
  const signalTags = finding.signalTags.length > 0
    ? unique(finding.signalTags)
    : extractResearchSignals(statement, tags, entities);

  return {
    ...finding,
    statement,
    category: finding.category || inferResearchCategory(statement, tags),
    tags,
    entities,
    sentiment,
    signalTags,
    sourceQuality,
    sourceKinds,
    sourceNames,
    evidenceCount: Math.max(1, evidenceObservations.length),
    actorNames,
  };
}

function buildThemes(findings: EnrichedFinding[]): ResearchTheme[] {
  const groups = new Map<string, ThemeGroup>();

  for (const finding of findings) {
    const signals = finding.signalTags.length > 0 ? finding.signalTags.slice(0, 2) : [finding.category];
    for (const signal of signals) {
      if (!signal) continue;
      const group = groups.get(signal) ?? {
        signal,
        findings: [],
        sourceIds: new Set<string>(),
        sourceKinds: new Set<ResearchSourceKind>(),
        sourceNames: new Set<string>(),
        categories: new Map<string, number>(),
        positiveCount: 0,
        negativeCount: 0,
        weightedEvidence: 0,
        weightedSourceQuality: 0,
        methods: new Set<ResearchFinding["method"]>(),
      };

      group.findings.push(finding);
      finding.evidenceSourceIds.forEach((sourceId) => group.sourceIds.add(sourceId));
      finding.sourceKinds.forEach((kind) => group.sourceKinds.add(kind));
      finding.sourceNames.forEach((sourceName) => group.sourceNames.add(sourceName));
      group.categories.set(finding.category, (group.categories.get(finding.category) ?? 0) + 1);
      if (finding.sentiment === "positive") group.positiveCount += 1;
      if (finding.sentiment === "negative") group.negativeCount += 1;
      group.weightedEvidence += finding.evidenceCount;
      group.weightedSourceQuality += finding.sourceQuality;
      group.methods.add(finding.method);
      groups.set(signal, group);
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.findings.length >= 2 || group.sourceIds.size >= 2)
    .map((group, index) => {
      const score = scoreThemeGroup(group);
      const confidence = confidenceFromScore(score);
      const topCategories = Array.from(group.categories.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([category]) => category);

      return {
        id: `theme-${slugify(group.signal || `theme-${index + 1}`)}-${index + 1}`,
        name: formatResearchSignal(group.signal),
        description: `Observed across ${group.findings.length} findings, ${group.sourceIds.size} sources, and ${group.sourceKinds.size || 1} source type${group.sourceKinds.size === 1 ? "" : "s"}. Strongest categories: ${topCategories.join(", ") || "general"}.`,
        findingIds: unique(group.findings.map((finding) => finding.id)),
        frequency: group.findings.length,
        sourceCount: group.sourceIds.size,
        sourceTypeCount: Math.max(1, group.sourceKinds.size),
        confidence,
        signalTags: unique([group.signal, ...group.findings.flatMap((finding) => finding.signalTags).slice(0, 4)]),
        positiveCount: group.positiveCount,
        negativeCount: group.negativeCount,
      } satisfies ResearchTheme;
    })
    .sort((a, b) =>
      compareConfidence(b.confidence, a.confidence)
      || b.sourceTypeCount - a.sourceTypeCount
      || b.sourceCount - a.sourceCount
      || b.frequency - a.frequency
      || a.name.localeCompare(b.name),
    );
}

function buildFindingThemeIndex(themes: ResearchTheme[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const theme of themes) {
    for (const findingId of theme.findingIds) {
      const list = map.get(findingId) ?? [];
      list.push(theme.id);
      map.set(findingId, unique(list));
    }
  }
  return map;
}

function buildOpportunities(themes: ResearchTheme[], findings: ResearchFinding[]): ResearchOpportunity[] {
  const findingIndex = new Map(findings.map((finding) => [finding.id, finding]));

  return themes
    .map((theme) => {
      const related = theme.findingIds
        .map((findingId) => findingIndex.get(findingId))
        .filter((finding): finding is ResearchFinding => Boolean(finding));
      const evidence = related.filter((finding) =>
        OPPORTUNITY_CATEGORIES.has(finding.category)
        || (finding.method === "quantitative" && finding.sentiment === "positive")
        || finding.sentiment === "positive",
      );
      if (evidence.length === 0) return null;

      return {
        title: `${theme.name} opportunity`,
        summary: `Double down on ${theme.name.toLowerCase()} by prioritizing ${summarizeFindingStatements(evidence)}.`,
        theme: theme.name,
        priority: theme.confidence === "high" || evidence.length >= 3 ? "high" : evidence.length >= 2 ? "medium" : "low",
        confidence: theme.confidence,
        evidenceFindingIds: evidence.map((finding) => finding.id),
        sourceCount: new Set(evidence.flatMap((finding) => finding.evidenceSourceIds)).size,
      } satisfies ResearchOpportunity;
    })
    .filter((opportunity): opportunity is ResearchOpportunity => Boolean(opportunity))
    .sort((a, b) =>
      comparePriority(b.priority, a.priority)
      || compareConfidence(b.confidence, a.confidence)
      || b.sourceCount - a.sourceCount
      || a.title.localeCompare(b.title),
    );
}

function buildRisks(themes: ResearchTheme[], findings: ResearchFinding[]): ResearchRisk[] {
  const findingIndex = new Map(findings.map((finding) => [finding.id, finding]));

  return themes
    .map((theme) => {
      const related = theme.findingIds
        .map((findingId) => findingIndex.get(findingId))
        .filter((finding): finding is ResearchFinding => Boolean(finding));
      const evidence = related.filter((finding) =>
        RISK_CATEGORIES.has(finding.category)
        || finding.sentiment === "negative"
      );
      if (evidence.length === 0) return null;

      return {
        title: `${theme.name} risk`,
        summary: `${theme.name} shows persistent risk across ${evidence.length} supporting finding${evidence.length === 1 ? "" : "s"}: ${summarizeFindingStatements(evidence)}.`,
        theme: theme.name,
        severity: theme.confidence === "high" || evidence.length >= 3 ? "high" : evidence.length >= 2 ? "medium" : "low",
        evidenceFindingIds: evidence.map((finding) => finding.id),
        sourceCount: new Set(evidence.flatMap((finding) => finding.evidenceSourceIds)).size,
      } satisfies ResearchRisk;
    })
    .filter((risk): risk is ResearchRisk => Boolean(risk))
    .sort((a, b) =>
      comparePriority(b.severity, a.severity)
      || b.sourceCount - a.sourceCount
      || a.title.localeCompare(b.title),
    );
}

function buildContradictions(themes: ResearchTheme[], findings: ResearchFinding[]): ResearchContradiction[] {
  const findingIndex = new Map(findings.map((finding) => [finding.id, finding]));

  return themes
    .map((theme) => {
      const related = theme.findingIds
        .map((findingId) => findingIndex.get(findingId))
        .filter((finding): finding is ResearchFinding => Boolean(finding));
      const positive = related.filter((finding) => finding.sentiment === "positive").map((finding) => finding.id);
      const negative = related.filter((finding) => finding.sentiment === "negative").map((finding) => finding.id);
      if (positive.length === 0 || negative.length === 0) return null;

      return {
        topic: theme.name,
        positiveFindingIds: positive,
        negativeFindingIds: negative,
        summary: `${theme.name} includes both positive and negative evidence, which suggests meaningful variation across cohorts, sources, or workflows.`,
      } satisfies ResearchContradiction;
    })
    .filter((contradiction): contradiction is ResearchContradiction => Boolean(contradiction))
    .sort((a, b) =>
      (b.positiveFindingIds.length + b.negativeFindingIds.length)
      - (a.positiveFindingIds.length + a.negativeFindingIds.length)
      || a.topic.localeCompare(b.topic),
    );
}

function buildPersonas(
  findings: ResearchFinding[],
  observations: ResearchObservation[],
  existingPersonas: ResearchPersona[],
  sourceIndex: Map<string, ResearchSourceRecord>,
): ResearchPersona[] {
  const observationIndex = new Map(observations.map((observation) => [observation.id, observation]));
  const actorGroups = new Map<string, { observations: ResearchObservation[]; findingIds: Set<string>; cohorts: string[] }>();

  for (const observation of observations) {
    const actor = observation.actor || observation.cohort;
    if (!actor || IGNORED_ACTORS.has(actor.toLowerCase())) continue;
    const group = actorGroups.get(actor) ?? { observations: [], findingIds: new Set<string>(), cohorts: [] };
    group.observations.push(observation);
    if (observation.cohort) group.cohorts.push(observation.cohort);
    actorGroups.set(actor, group);
  }

  for (const finding of findings) {
    const relatedActors = unique(
      finding.evidenceObservationIds
        .map((observationId) => observationIndex.get(observationId))
        .filter((observation): observation is ResearchObservation => Boolean(observation))
        .flatMap((observation) => [observation.actor, observation.cohort])
        .filter((value): value is string => Boolean(value))
        .filter((value) => !IGNORED_ACTORS.has(value.toLowerCase())),
    );
    for (const actor of relatedActors) {
      const group = actorGroups.get(actor) ?? { observations: [], findingIds: new Set<string>(), cohorts: [] };
      group.findingIds.add(finding.id);
      actorGroups.set(actor, group);
    }
  }

  const synthesized = Array.from(actorGroups.entries())
    .map(([actor, group]) => {
      const relatedFindings = findings.filter((finding) => group.findingIds.has(finding.id));
      if (group.observations.length === 0 && relatedFindings.length === 0) return null;

      const sourceNames = unique(
        relatedFindings
          .flatMap((finding) => finding.evidenceSourceIds)
          .map((sourceId) => sourceIndex.get(sourceId)?.name)
          .filter((name): name is string => Boolean(name)),
      );

      const goals = unique(
        relatedFindings
          .filter((finding) => OPPORTUNITY_CATEGORIES.has(finding.category))
          .map((finding) => stripFindingPrefix(finding.statement))
          .slice(0, 4),
      );
      const painPoints = unique(
        relatedFindings
          .filter((finding) => RISK_CATEGORIES.has(finding.category) || finding.sentiment === "negative")
          .map((finding) => stripFindingPrefix(finding.statement))
          .slice(0, 4),
      );
      const behaviors = unique(
        relatedFindings
          .filter((finding) => BEHAVIOR_CATEGORIES.has(finding.category))
          .map((finding) => stripFindingPrefix(finding.statement))
          .concat(
            group.observations
              .filter((observation) => /\b(always|usually|typically|workflow|process)\b/i.test(observation.text))
              .map((observation) => observation.text),
          )
          .slice(0, 4),
      );
      const quote = group.observations.find((observation) => observation.text.length >= 24)?.text;
      const confidence = relatedFindings.length >= 4 || group.observations.length >= 4
        ? "high"
        : relatedFindings.length >= 2 || group.observations.length >= 2
          ? "medium"
          : "low";

      return {
        name: actor,
        role: mostCommon(group.cohorts) ?? "participant",
        goals: goals.length > 0 ? goals : ["Complete critical workflows with less friction."],
        painPoints,
        behaviors,
        source: sourceNames.join(", ") || "research",
        quote,
        confidence,
        evidenceFindingIds: relatedFindings.map((finding) => finding.id),
      } satisfies ResearchPersona;
    })
    .filter(Boolean) as ResearchPersona[];

  return mergePersonas(existingPersonas, synthesized);
}

function buildSummary(input: {
  findings: ResearchFinding[];
  themes: ResearchTheme[];
  personas: ResearchPersona[];
  opportunities: ResearchOpportunity[];
  risks: ResearchRisk[];
  contradictions: ResearchContradiction[];
  quality: ResearchDataQualitySnapshot;
  sources: ResearchSourceRecord[];
  observations: ResearchObservation[];
  quantitativeMetrics: ResearchStore["quantitativeMetrics"];
}): ResearchSummarySnapshot {
  const highConfidence = input.findings.filter((finding) => finding.confidence === "high").length;
  const topThemes = input.themes.slice(0, 3).map((theme) => theme.name);
  const topOpportunities = input.opportunities.slice(0, 3).map((opportunity) => opportunity.title);
  const topRisks = input.risks.slice(0, 3).map((risk) => risk.title);
  const nextActions = buildNextActions(input.opportunities, input.risks, input.contradictions, input.quality);
  const narrative = [
    `${input.findings.length} findings synthesized from ${input.sources.length} source${input.sources.length === 1 ? "" : "s"} and ${input.observations.length} raw observations.`,
    topThemes.length > 0 ? `Top themes: ${topThemes.join(", ")}.` : "No strong themes emerged yet.",
    input.opportunities.length > 0 ? `Best near-term opportunity: ${input.opportunities[0].title}.` : "No clear opportunity signal yet.",
    input.risks.length > 0 ? `Largest risk: ${input.risks[0].title}.` : "No major risk pattern yet.",
    `Research quality is ${input.quality.overallScore}/100 with ${input.quantitativeMetrics.length} quantitative metric${input.quantitativeMetrics.length === 1 ? "" : "s"}.`,
  ].join(" ");

  return {
    narrative,
    topThemes,
    topOpportunities,
    topRisks,
    contradictionCount: input.contradictions.length,
    nextActions,
    generatedAt: new Date().toISOString(),
    qualityScore: input.quality.overallScore,
    sampleSize: input.quality.sampleSize,
    quantitativeMetrics: input.quantitativeMetrics.length,
    coverage: {
      observations: input.observations.length,
      findings: input.findings.length,
      highConfidence,
      personas: input.personas.length,
      themes: input.themes.length,
      sources: input.sources.length,
      quantitativeMetrics: input.quantitativeMetrics.length,
    },
  };
}

function buildMethods(
  store: ResearchStore,
  quality: ResearchDataQualitySnapshot,
  contradictionCount: number,
): ResearchMethods {
  const limitations = unique([
    ...quality.notes,
    store.quantitativeMetrics.length === 0 ? "Quantitative input is missing; findings are primarily qualitative." : "",
    contradictionCount > 0 ? "Contradictions indicate cohort or context differences that deserve follow-up." : "",
    store.sources.length < 2 ? "Source count is low, which reduces triangulation depth." : "",
  ].filter(Boolean));

  return {
    analysisMode: "decision-grade",
    quantitativeApproach: "descriptive statistics + confidence intervals + cohort deltas",
    qualitativeApproach: "coded observations + evidence-backed theme synthesis",
    limitations,
  };
}

function mergeSourceRecords(sources: ResearchSourceRecord[]): ResearchSourceRecord[] {
  return [...sources].sort((a, b) => b.processedAt.localeCompare(a.processedAt) || a.name.localeCompare(b.name));
}

function scoreThemeGroup(group: ThemeGroup): number {
  const evidenceScore = Math.min(1, group.weightedEvidence / 12);
  const sourceScore = Math.min(1, group.sourceIds.size / 4);
  const diversityScore = Math.min(1, group.sourceKinds.size / 2);
  const qualityScore = group.findings.length === 0 ? 0 : (group.weightedSourceQuality / group.findings.length) / 100;
  const triangulationScore = group.methods.size >= 2 || group.sourceKinds.size >= 2 ? 1 : 0.5;

  return (evidenceScore * 0.25)
    + (sourceScore * 0.2)
    + (diversityScore * 0.2)
    + (qualityScore * 0.2)
    + (triangulationScore * 0.15);
}

function confidenceFromScore(score: number): ResearchFinding["confidence"] {
  if (score >= 0.72) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function buildNextActions(
  opportunities: ResearchOpportunity[],
  risks: ResearchRisk[],
  contradictions: ResearchContradiction[],
  quality: ResearchDataQualitySnapshot,
): string[] {
  const actions = [
    opportunities[0] ? `Prioritize ${opportunities[0].title.toLowerCase()} in the next product cycle.` : "",
    risks[0] ? `Mitigate ${risks[0].title.toLowerCase()} with a targeted design or onboarding change.` : "",
    contradictions[0] ? `Investigate the ${contradictions[0].topic.toLowerCase()} contradiction with follow-up interviews or segmented survey cuts.` : "",
    quality.overallScore < 70 ? "Increase research quality by adding more sources or better-completed survey data." : "",
    quality.sampleSize < 15 ? "Expand quantitative sample size before making irreversible roadmap decisions." : "",
  ].filter(Boolean);

  return unique(actions).slice(0, 4);
}

function mergePersonas(existing: ResearchPersona[], synthesized: ResearchPersona[]): ResearchPersona[] {
  const byName = new Map<string, ResearchPersona>();

  for (const persona of existing) {
    byName.set(persona.name.toLowerCase(), persona);
  }

  for (const persona of synthesized) {
    const key = persona.name.toLowerCase();
    const current = byName.get(key);
    if (!current) {
      byName.set(key, persona);
      continue;
    }

    byName.set(key, {
      ...current,
      ...persona,
      goals: unique([...(current.goals ?? []), ...(persona.goals ?? [])]).slice(0, 5),
      painPoints: unique([...(current.painPoints ?? []), ...(persona.painPoints ?? [])]).slice(0, 5),
      behaviors: unique([...(current.behaviors ?? []), ...(persona.behaviors ?? [])]).slice(0, 5),
      evidenceFindingIds: unique([...(current.evidenceFindingIds ?? []), ...(persona.evidenceFindingIds ?? [])]),
      confidence: strongerConfidence(current.confidence, persona.confidence),
      quote: current.quote ?? persona.quote,
      source: unique([current.source, persona.source].filter(Boolean)).join(", "),
    });
  }

  return Array.from(byName.values()).sort((a, b) => compareConfidence(b.confidence ?? "low", a.confidence ?? "low") || a.name.localeCompare(b.name));
}

function summarizeFindingStatements(findings: ResearchFinding[]): string {
  return findings
    .slice(0, 2)
    .map((finding) => stripFindingPrefix(finding.statement).toLowerCase())
    .join("; ");
}

function strongerConfidence(
  left: ResearchFinding["confidence"] | undefined,
  right: ResearchFinding["confidence"] | undefined,
): ResearchFinding["confidence"] | undefined {
  if (!left) return right;
  if (!right) return left;
  return compareConfidence(left, right) <= 0 ? left : right;
}

function compareConfidence(
  left: ResearchFinding["confidence"],
  right: ResearchFinding["confidence"],
): number {
  const rank = { high: 0, medium: 1, low: 2 };
  return rank[left] - rank[right];
}

function comparePriority(
  left: "high" | "medium" | "low",
  right: "high" | "medium" | "low",
): number {
  const rank = { high: 0, medium: 1, low: 2 };
  return rank[left] - rank[right];
}

function mostCommon(values: string[]): string | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
