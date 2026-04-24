/**
 * Research Engine — canonical V2 mixed-methods store.
 *
 * Canonical persistence:
 *   research/store.v2.json
 *
 * Legacy migration:
 *   research/insights.json -> research/store.v2.json
 */

import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { MemoireEvent } from "../engine/core.js";
import { createLogger } from "../engine/logger.js";
import type { StickyNote } from "../figma/bridge.js";
import { clusterStickies, extractThemes, type ParsedResearch } from "../figma/stickies.js";
import {
  detectResearchSentiment,
  extractResearchEntities,
  extractResearchSignals,
  inferResearchCategory,
} from "./analysis.js";
import { parseExcel } from "./excel-parser.js";
import { analyzeQuantitativeSheet, assessResearchDataQuality } from "./quantitative.js";
import {
  generateResearchReportArtifacts,
  synthesizeResearch,
} from "./synthesis.js";
import type { TranscriptAnalysis } from "./transcript-parser.js";
import type { WebResearchResult } from "./web-researcher.js";

const STORE_FILENAME = "store.v2.json";
const LEGACY_STORE_FILENAME = "insights.json";

export interface ResearchConfig {
  outputDir: string;
  onEvent?: (event: MemoireEvent) => void;
}

export type ResearchConfidence = "high" | "medium" | "low";
export type ResearchSentiment = "positive" | "negative" | "neutral" | "mixed";
export type ResearchMethod = "qualitative" | "quantitative" | "mixed";
export type ResearchObservationKind = "survey-response" | "transcript-segment" | "sticky" | "web-finding";
export type ResearchSourceKind = "qualitative" | "quantitative" | "mixed";

export interface ResearchObservation {
  id: string;
  sourceId: string;
  kind: ResearchObservationKind;
  text: string;
  actor?: string;
  cohort?: string;
  timestamp?: string;
  numericFields?: Record<string, number>;
  tags: string[];
  entities: string[];
  sentiment: ResearchSentiment;
  createdAt: string;
}

export interface ResearchFinding {
  id: string;
  statement: string;
  category: string;
  confidence: ResearchConfidence;
  themeIds: string[];
  evidenceObservationIds: string[];
  evidenceSourceIds: string[];
  sourceTypeCount: number;
  method: ResearchMethod;
  caveats: string[];
  tags: string[];
  entities: string[];
  sentiment?: ResearchSentiment;
  signalTags: string[];
  createdAt: string;
  source?: string;
  evidence?: string[];
}

export interface ResearchTheme {
  id: string;
  name: string;
  description: string;
  findingIds: string[];
  frequency: number;
  sourceCount: number;
  sourceTypeCount: number;
  confidence: ResearchConfidence;
  signalTags: string[];
  positiveCount: number;
  negativeCount: number;
}

export interface ResearchSourceRecord {
  id: string;
  name: string;
  type: string;
  processedAt: string;
  itemCount?: number;
  qualityScore?: number;
  sampleSize?: number;
  missingRate?: number;
  sourceKind?: ResearchSourceKind;
  notes?: string[];
}

export interface ResearchInterval {
  low: number;
  high: number;
}

export interface ResearchBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface ResearchCohortComparison {
  cohort: string;
  sampleSize: number;
  mean: number;
  median: number;
  deltaFromOverall: number;
}

export interface ResearchQuantitativeMetric {
  id: string;
  source: string;
  field: string;
  label: string;
  sampleSize: number;
  missingCount: number;
  missingRate: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  confidenceInterval95?: ResearchInterval;
  scaleType: "nps-0-10" | "likert-1-5" | "likert-1-7" | "scale-0-10" | "continuous";
  buckets: ResearchBucket[];
  nps?: {
    promoterPct: number;
    passivePct: number;
    detractorPct: number;
    score: number;
  };
  outlierCount: number;
  cohortComparisons: ResearchCohortComparison[];
}

export interface ResearchDataQualitySnapshot {
  overallScore: number;
  sampleSize: number;
  completenessScore: number;
  sourceDiversityScore: number;
  triangulationScore: number;
  structureScore: number;
  notes: string[];
  generatedAt: string;
}

export interface ResearchPersona {
  name: string;
  role: string;
  goals: string[];
  painPoints: string[];
  behaviors: string[];
  source: string;
  quote?: string;
  confidence?: ResearchConfidence;
  evidenceFindingIds?: string[];
}

export interface ResearchOpportunity {
  title: string;
  summary: string;
  theme: string;
  priority: "high" | "medium" | "low";
  confidence: ResearchConfidence;
  evidenceFindingIds: string[];
  sourceCount: number;
}

export interface ResearchRisk {
  title: string;
  summary: string;
  theme: string;
  severity: "high" | "medium" | "low";
  evidenceFindingIds: string[];
  sourceCount: number;
}

export interface ResearchContradiction {
  topic: string;
  positiveFindingIds: string[];
  negativeFindingIds: string[];
  summary: string;
}

export interface ResearchMethods {
  analysisMode: "decision-grade";
  quantitativeApproach: string;
  qualitativeApproach: string;
  limitations: string[];
}

export interface ResearchSummarySnapshot {
  narrative: string;
  topThemes: string[];
  topOpportunities: string[];
  topRisks: string[];
  contradictionCount: number;
  nextActions: string[];
  generatedAt: string;
  qualityScore: number;
  sampleSize: number;
  quantitativeMetrics: number;
  coverage: {
    observations: number;
    findings: number;
    highConfidence: number;
    personas: number;
    themes: number;
    sources: number;
    quantitativeMetrics: number;
  };
}

export interface ResearchStore {
  version: 2;
  sources: ResearchSourceRecord[];
  observations: ResearchObservation[];
  findings: ResearchFinding[];
  themes: ResearchTheme[];
  personas: ResearchPersona[];
  quantitativeMetrics: ResearchQuantitativeMetric[];
  opportunities: ResearchOpportunity[];
  risks: ResearchRisk[];
  contradictions: ResearchContradiction[];
  quality: ResearchDataQualitySnapshot;
  summary?: ResearchSummarySnapshot;
  methods: ResearchMethods;
}

interface ResponseObservationContext {
  observationId: string;
  response: string;
  actor?: string;
  cohort?: string;
  rowNumber: number;
  numericFields: Record<string, number>;
}

interface SignalGroup {
  signal: string;
  category: string;
  sentiment: ResearchSentiment;
  observationIds: string[];
  examples: string[];
  sourceKinds: Set<ResearchSourceKind>;
}

const RESPONSE_HEADERS = ["response", "answer", "feedback", "comment", "quote", "note"];
const ACTOR_HEADERS = ["user", "participant", "name", "respondent", "customer"];
const COHORT_HEADERS = ["role", "title", "segment", "persona", "job", "team", "plan"];

export class ResearchEngine {
  private log = createLogger("research");
  private config: ResearchConfig;
  private store: ResearchStore = createEmptyStore();
  private observationCounter = 0;
  private findingCounter = 0;

  constructor(config: ResearchConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });

    const storePath = join(this.config.outputDir, STORE_FILENAME);
    const legacyPath = join(this.config.outputDir, LEGACY_STORE_FILENAME);

    try {
      const raw = await readFile(storePath, "utf-8");
      this.store = normalizeResearchStore(JSON.parse(raw));
      this.refreshComputedState();
      this.syncCounters();
      return;
    } catch {
      // ignore and attempt migration
    }

    try {
      const raw = await readFile(legacyPath, "utf-8");
      this.store = migrateLegacyStore(JSON.parse(raw));
      this.refreshComputedState();
      this.syncCounters();
      await this.save();
      return;
    } catch {
      this.store = createEmptyStore();
      this.refreshComputedState();
      this.syncCounters();
    }
  }

  async fromStickies(stickies: StickyNote[]): Promise<ParsedResearch> {
    this.emitEvent("info", `Processing ${stickies.length} stickies...`);

    const source = this.upsertSource({
      name: "figjam-stickies",
      type: "figjam-stickies",
      sourceKind: "qualitative",
      itemCount: stickies.length,
      sampleSize: stickies.length,
      notes: [],
    });
    this.purgeSourceData([source.id], [source.name]);

    const observationByStickyId = new Map<string, ResearchObservation>();
    for (const sticky of stickies) {
      const text = sticky.text.trim();
      if (!text) continue;
      const observation = this.addObservation({
        sourceId: source.id,
        kind: "sticky",
        text,
        tags: unique(["sticky", sticky.color ? normalizeTag(sticky.color) : ""].filter(Boolean)),
        entities: extractResearchEntities(text),
        sentiment: detectResearchSentiment(text),
      });
      observationByStickyId.set(sticky.id, observation);
    }

    const parsed = clusterStickies(stickies);
    const themes = extractThemes(parsed.clusters);

    for (const theme of themes) {
      const cluster = parsed.clusters.find((candidate) => candidate.id === theme.clusterId);
      const evidenceObservationIds = cluster
        ? cluster.stickies
            .map((sticky) => observationByStickyId.get(sticky.id)?.id)
            .filter((id): id is string => Boolean(id))
        : [];
      if (evidenceObservationIds.length === 0) continue;

      const statement = buildCategorizedStatement(theme.theme, inferResearchCategory(theme.evidence.join(" "), ["sticky"]));
      this.addFinding({
        statement,
        category: inferResearchCategory(theme.evidence.join(" "), ["sticky"]),
        confidence: evidenceObservationIds.length >= 5 ? "high" : evidenceObservationIds.length >= 3 ? "medium" : "low",
        evidenceObservationIds,
        evidenceSourceIds: [source.id],
        method: "qualitative",
        tags: ["sticky", "theme"],
        entities: extractResearchEntities(theme.evidence.join(" ")),
        sentiment: detectResearchSentiment(theme.evidence.join(" ")),
        signalTags: extractResearchSignals(theme.theme, ["sticky"], extractResearchEntities(theme.theme)),
        caveats: evidenceObservationIds.length < 3 ? ["Theme is based on a small sticky cluster."] : [],
      });
    }

    if (themes.length === 0) {
      for (const observation of Array.from(observationByStickyId.values()).slice(0, 5)) {
        this.addFinding({
          statement: buildCategorizedStatement(observation.text, inferResearchCategory(observation.text, ["sticky"])),
          category: inferResearchCategory(observation.text, ["sticky"]),
          confidence: "low",
          evidenceObservationIds: [observation.id],
          evidenceSourceIds: [source.id],
          method: "qualitative",
          tags: ["sticky", "raw"],
          entities: observation.entities,
          sentiment: observation.sentiment,
          signalTags: extractResearchSignals(observation.text, ["sticky"], observation.entities),
          caveats: ["Single sticky note with no supporting cluster."],
        });
      }
    }

    this.invalidateDerivedArtifacts();
    this.refreshComputedState();
    await this.save();
    this.emitEvent("success", `Processed ${stickies.length} stickies into ${themes.length} themes`);
    return parsed;
  }

  async fromFile(filePath: string): Promise<void> {
    this.emitEvent("info", `Processing file: ${filePath}`);

    const data = await parseExcel(filePath);
    const sourceType = filePath.toLowerCase().endsWith(".csv") ? "csv" : "excel";
    const source = this.upsertSource({
      name: filePath,
      type: sourceType,
      sourceKind: "mixed",
      itemCount: data.rows.length,
      notes: [],
    });
    this.purgeSourceData([source.id], [source.name]);

    const headers = data.headers.map((header) => header.toLowerCase());
    const responseIdx = findHeaderIndex(headers, RESPONSE_HEADERS);
    const actorIdx = findHeaderIndex(headers, ACTOR_HEADERS);
    const cohortIdx = findHeaderIndex(headers, COHORT_HEADERS);

    const rowContexts: ResponseObservationContext[] = [];
    for (const [index, row] of data.rows.entries()) {
      const numericFields = extractNumericFields(data.headers, row);
      const response = responseIdx === -1 ? "" : toText(row[responseIdx]);
      const actor = actorIdx === -1 ? undefined : toText(row[actorIdx]) || undefined;
      const cohort = cohortIdx === -1 ? undefined : toText(row[cohortIdx]) || undefined;
      const rowText = buildRowObservationText(data.headers, row, response);
      if (!rowText && Object.keys(numericFields).length === 0) {
        continue;
      }

      const observation = this.addObservation({
        sourceId: source.id,
        kind: "survey-response",
        text: rowText || response,
        actor,
        cohort,
        numericFields: Object.keys(numericFields).length > 0 ? numericFields : undefined,
        tags: unique(["survey", cohort ? normalizeTag(cohort) : ""].filter(Boolean)),
        entities: extractResearchEntities(rowText || response),
        sentiment: detectResearchSentiment(rowText || response || describeNumericFields(numericFields)),
      });

      if (response.length >= 12) {
        rowContexts.push({
          observationId: observation.id,
          response,
          actor,
          cohort,
          rowNumber: index + 2,
          numericFields,
        });
      }
    }

    const groupedSignals = buildSignalGroups(rowContexts);
    for (const group of groupedSignals.slice(0, 10)) {
      this.addFinding({
        statement: `Repeated survey signal: ${group.signal} appeared in ${group.observationIds.length} responses`,
        category: group.category,
        confidence: group.observationIds.length >= 5 ? "high" : group.observationIds.length >= 3 ? "medium" : "low",
        evidenceObservationIds: group.observationIds,
        evidenceSourceIds: [source.id],
        method: "qualitative",
        tags: ["survey", "pattern", normalizeTag(group.signal), group.category],
        entities: extractResearchEntities(group.examples.join(" ")),
        sentiment: group.sentiment,
        signalTags: [normalizeTag(group.signal)],
        caveats: group.observationIds.length < 3 ? ["Pattern is based on limited repeated evidence."] : [],
      });
    }

    if (groupedSignals.length === 0) {
      for (const context of rowContexts.slice(0, 5)) {
        const category = inferResearchCategory(context.response, ["survey"]);
        this.addFinding({
          statement: buildCategorizedStatement(context.response, category),
          category,
          confidence: deriveResponseConfidence(context.response, context.numericFields),
          evidenceObservationIds: [context.observationId],
          evidenceSourceIds: [source.id],
          method: "qualitative",
          tags: unique(["survey", category, context.cohort ? normalizeTag(context.cohort) : ""].filter(Boolean)),
          entities: extractResearchEntities(context.response),
          sentiment: detectResearchSentiment(context.response),
          signalTags: extractResearchSignals(context.response, [category, "survey"], extractResearchEntities(context.response)),
          caveats: ["Single response finding; look for repetition before over-weighting it."],
        });
      }
    }

    const quantitative = analyzeQuantitativeSheet(data, {
      source: source.name,
      preferredCohortHeader: cohortIdx === -1 ? undefined : data.headers[cohortIdx],
    });
    this.upsertQuantitativeMetrics(source.name, quantitative.metrics);

    for (const metric of quantitative.metrics) {
      const evidenceObservationIds = this.store.observations
        .filter((observation) => observation.sourceId === source.id && observation.numericFields && metric.field in observation.numericFields)
        .map((observation) => observation.id)
        .slice(0, 20);
      const caveats = [
        metric.sampleSize < 5 ? "Very small sample size." : "",
        metric.missingRate > 0.2 ? `High missingness (${Math.round(metric.missingRate * 100)}%).` : "",
      ].filter(Boolean);

      this.addFinding({
        statement: `Quantitative signal: ${metric.label} mean ${metric.mean.toFixed(2)} (median ${metric.median.toFixed(2)}, n=${metric.sampleSize})`,
        category: "quantitative-signal",
        confidence: deriveMetricConfidence(metric),
        evidenceObservationIds,
        evidenceSourceIds: [source.id],
        method: "quantitative",
        tags: ["survey", "quantitative", normalizeTag(metric.field)],
        entities: [],
        sentiment: deriveMetricSentiment(metric),
        signalTags: [normalizeTag(metric.label), normalizeTag(metric.field)],
        caveats,
      });

      if (metric.nps) {
        this.addFinding({
          statement: `NPS on ${metric.label}: ${metric.nps.score} (${metric.nps.promoterPct}% promoters, ${metric.nps.detractorPct}% detractors)`,
          category: "nps",
          confidence: deriveMetricConfidence(metric),
          evidenceObservationIds,
          evidenceSourceIds: [source.id],
          method: "quantitative",
          tags: ["survey", "quantitative", "nps", normalizeTag(metric.field)],
          entities: [],
          sentiment: metric.nps.score > 0 ? "positive" : metric.nps.score < 0 ? "negative" : "neutral",
          signalTags: ["nps", normalizeTag(metric.field)],
          caveats,
        });
      }

      for (const comparison of metric.cohortComparisons.filter((item) => item.sampleSize >= 5 && Math.abs(item.deltaFromOverall) >= 0.75)) {
        const cohortObservationIds = this.store.observations
          .filter((observation) =>
            observation.sourceId === source.id
            && observation.cohort === comparison.cohort
            && observation.numericFields
            && metric.field in observation.numericFields,
          )
          .map((observation) => observation.id)
          .slice(0, 20);
        this.addFinding({
          statement: `Cohort difference: ${comparison.cohort} is ${comparison.deltaFromOverall >= 0 ? "above" : "below"} the overall mean on ${metric.label} by ${Math.abs(comparison.deltaFromOverall).toFixed(2)} points`,
          category: "cohort-difference",
          confidence: comparison.sampleSize >= 12 ? "high" : "medium",
          evidenceObservationIds: cohortObservationIds,
          evidenceSourceIds: [source.id],
          method: "quantitative",
          tags: ["survey", "quantitative", "cohort-difference", normalizeTag(metric.field), normalizeTag(comparison.cohort)],
          entities: [],
          sentiment: metric.scaleType === "continuous" ? "neutral" : comparison.deltaFromOverall > 0 ? "positive" : "negative",
          signalTags: [normalizeTag(metric.field), normalizeTag(comparison.cohort), "cohort-difference"],
          caveats: comparison.sampleSize < 8 ? ["Cohort comparison is based on a small subgroup."] : [],
        });
      }
    }

    this.updateSource(source.id, {
      sourceKind: rowContexts.length > 0 && quantitative.metrics.length > 0
        ? "mixed"
        : quantitative.metrics.length > 0
          ? "quantitative"
          : "qualitative",
      qualityScore: quantitative.quality.sourceQualityScore,
      sampleSize: quantitative.quality.sampleSize || rowContexts.length,
      missingRate: quantitative.quality.missingRate,
      notes: [
        responseIdx !== -1 ? `${rowContexts.length} survey observations` : "no response column detected",
        ...quantitative.quality.notes,
      ],
    });

    this.invalidateDerivedArtifacts();
    this.refreshComputedState();
    await this.save();
    this.emitEvent("success", `Processed ${data.rows.length} rows from "${data.sheetName}"`);
  }

  async fromTranscript(filePath: string, label?: string): Promise<TranscriptAnalysis> {
    this.emitEvent("info", `Processing transcript: ${filePath}`);

    const text = await readFile(filePath, "utf-8");
    const { parseTranscript } = await import("./transcript-parser.js");
    const analysis = parseTranscript(text);
    const source = this.upsertSource({
      name: label ?? filePath,
      type: "transcript",
      sourceKind: "qualitative",
      itemCount: analysis.segments.length,
      sampleSize: analysis.speakers.length,
      notes: [],
    });
    this.purgeSourceData([source.id], [source.name]);

    const segmentObservationIds: string[] = [];
    for (const segment of analysis.segments) {
      const observation = this.addObservation({
        sourceId: source.id,
        kind: "transcript-segment",
        text: segment.text,
        actor: segment.speaker,
        cohort: segment.speaker,
        timestamp: segment.timestamp,
        tags: ["transcript", normalizeTag(segment.speaker)],
        entities: extractResearchEntities(segment.text),
        sentiment: detectResearchSentiment(segment.text),
      });
      segmentObservationIds.push(observation.id);
    }

    const observations = this.store.observations.filter((observation) => observation.sourceId === source.id);
    for (const insight of analysis.insights) {
      const evidenceObservationIds = observations
        .filter((observation) =>
          observation.actor === insight.speaker
          && (insight.timestamp ? observation.timestamp === insight.timestamp : true)
          && observation.text.includes(insight.quote.slice(0, Math.min(40, insight.quote.length))),
        )
        .map((observation) => observation.id);
      const fallbackObservationId = observations.find((observation) => observation.actor === insight.speaker)?.id;

      this.addFinding({
        statement: insight.finding,
        category: insight.category,
        confidence: insight.confidence,
        evidenceObservationIds: evidenceObservationIds.length > 0 ? evidenceObservationIds : fallbackObservationId ? [fallbackObservationId] : [],
        evidenceSourceIds: [source.id],
        method: "qualitative",
        tags: ["transcript", insight.category, insight.sentiment],
        entities: extractResearchEntities(`${insight.finding} ${insight.quote}`),
        sentiment: insight.sentiment,
        signalTags: extractResearchSignals(insight.finding, [insight.category, insight.sentiment], extractResearchEntities(insight.finding)),
        caveats: insight.confidence === "low" ? ["Single transcript segment without repeated corroboration."] : [],
      });
    }

    this.addFinding({
      statement: `Transcript sentiment mix: ${analysis.sentiment.positive} positive, ${analysis.sentiment.negative} negative, ${analysis.sentiment.mixed} mixed observations across ${analysis.speakers.length} speakers`,
      category: "sentiment",
      confidence: analysis.insights.length >= 12 ? "high" : "medium",
      evidenceObservationIds: segmentObservationIds.slice(0, 20),
      evidenceSourceIds: [source.id],
      method: "qualitative",
      tags: ["transcript", "sentiment"],
      entities: analysis.speakers.map((speaker) => speaker.name),
      sentiment: analysis.sentiment.negative > analysis.sentiment.positive
        ? "negative"
        : analysis.sentiment.positive > analysis.sentiment.negative
          ? "positive"
          : "neutral",
      signalTags: ["sentiment", "transcript-health"],
      caveats: analysis.speakers.length < 2 ? ["Single-speaker transcript."] : [],
    });

    this.updateSource(source.id, {
      qualityScore: clampScore((analysis.speakers.length / 5) * 100),
      notes: [
        `${analysis.speakers.length} speaker${analysis.speakers.length === 1 ? "" : "s"}`,
        `${analysis.topicFlow.length} topic${analysis.topicFlow.length === 1 ? "" : "s"} tracked`,
      ],
    });

    this.invalidateDerivedArtifacts();
    this.refreshComputedState();
    await this.save();
    this.emitEvent("success", analysis.summary);
    return analysis;
  }

  async fromUrls(topic: string, urls: string[]): Promise<WebResearchResult> {
    this.emitEvent("info", `Web research: "${topic}" from ${urls.length} URLs`);

    const { executeWebResearch } = await import("./web-researcher.js");
    const result = await executeWebResearch(topic, urls);

    const sourceIdByUrl = new Map<string, string>();
    for (const webSource of result.sources) {
      const source = this.upsertSource({
        name: webSource.url,
        type: "web",
        sourceKind: "qualitative",
        itemCount: 1,
        qualityScore: webSource.relevanceScore,
        notes: [webSource.title],
      });
      sourceIdByUrl.set(webSource.url, source.id);
      this.purgeSourceData([source.id], [source.name]);
      this.updateSource(source.id, {
        qualityScore: webSource.relevanceScore,
        notes: [webSource.title, `relevance ${webSource.relevanceScore}`],
      });
    }

    for (const webFinding of result.findings) {
      const primaryUrl = webFinding.sourceUrls[0];
      const primarySourceId = primaryUrl ? sourceIdByUrl.get(primaryUrl) : undefined;
      if (!primarySourceId) continue;

      const observation = this.addObservation({
        sourceId: primarySourceId,
        kind: "web-finding",
        text: webFinding.text,
        tags: ["web", webFinding.category],
        entities: webFinding.entities,
        sentiment: detectResearchSentiment(webFinding.text),
      });

      const evidenceSourceIds = webFinding.sourceUrls
        .map((url) => sourceIdByUrl.get(url))
        .filter((id): id is string => Boolean(id));

      this.addFinding({
        statement: buildCategorizedStatement(webFinding.text, webFinding.category),
        category: webFinding.category,
        confidence: webFinding.confidence,
        evidenceObservationIds: [observation.id],
        evidenceSourceIds: evidenceSourceIds.length > 0 ? evidenceSourceIds : [primarySourceId],
        method: "qualitative",
        tags: unique(["web", webFinding.category, ...webFinding.entities.map(normalizeTag)]),
        entities: webFinding.entities,
        sentiment: detectResearchSentiment(webFinding.text),
        signalTags: extractResearchSignals(webFinding.text, [webFinding.category], webFinding.entities),
        caveats: evidenceSourceIds.length < 2 ? ["Single-source web claim."] : [],
      });
    }

    this.invalidateDerivedArtifacts();
    this.refreshComputedState();
    await this.save();
    this.emitEvent("success", result.summary);
    return result;
  }

  async synthesize(): Promise<{ themes: ResearchTheme[]; summary: string }> {
    this.emitEvent("info", "Synthesizing research...");

    const synthesis = synthesizeResearch(this.store);
    this.store.findings = synthesis.findings;
    this.store.themes = synthesis.themes;
    this.store.personas = synthesis.personas;
    this.store.opportunities = synthesis.opportunities;
    this.store.risks = synthesis.risks;
    this.store.contradictions = synthesis.contradictions;
    this.store.summary = synthesis.summary;
    this.store.methods = synthesis.methods;
    this.store.quality = synthesis.quality;

    await this.save();
    this.emitEvent("success", synthesis.summary.narrative);
    return { themes: synthesis.themes, summary: synthesis.summary.narrative };
  }

  async generateReport(): Promise<string> {
    const synthesis = synthesizeResearch(this.store);
    this.store.findings = synthesis.findings;
    this.store.themes = synthesis.themes;
    this.store.personas = synthesis.personas;
    this.store.opportunities = synthesis.opportunities;
    this.store.risks = synthesis.risks;
    this.store.contradictions = synthesis.contradictions;
    this.store.summary = synthesis.summary;
    this.store.methods = synthesis.methods;
    this.store.quality = synthesis.quality;
    await this.save();

    const report = generateResearchReportArtifacts(this.store);
    const reportsDir = join(this.config.outputDir, "reports");
    await mkdir(reportsDir, { recursive: true });
    await writeFile(join(reportsDir, "report.md"), report.markdown);
    await writeFile(join(reportsDir, "report.json"), JSON.stringify(report.json, null, 2));
    return report.markdown;
  }

  assessQuality(): ResearchDataQualitySnapshot {
    this.refreshComputedState();
    return this.store.quality;
  }

  getFindings(): ResearchFinding[] {
    return this.store.findings;
  }

  getInsights(): ResearchFinding[] {
    return this.store.findings;
  }

  getStore(): ResearchStore {
    this.refreshComputedState();
    return this.store;
  }

  private refreshComputedState(): void {
    this.store.version = 2;
    this.store.quality = assessResearchDataQuality(this.store);
    this.store.methods = buildMethods(this.store);
  }

  private syncCounters(): void {
    this.observationCounter = getMaxId(this.store.observations.map((item) => item.id), "obs");
    this.findingCounter = getMaxId(this.store.findings.map((item) => item.id), "finding");
  }

  private nextObservationId(): string {
    return `obs-${++this.observationCounter}`;
  }

  private nextFindingId(): string {
    return `finding-${++this.findingCounter}`;
  }

  private addObservation(data: Omit<ResearchObservation, "id" | "createdAt" | "entities" | "sentiment"> & { entities?: string[]; sentiment?: ResearchSentiment }): ResearchObservation {
    const observation: ResearchObservation = {
      ...data,
      id: this.nextObservationId(),
      entities: data.entities ?? extractResearchEntities(data.text),
      sentiment: data.sentiment ?? detectResearchSentiment(data.text),
      createdAt: new Date().toISOString(),
      tags: unique(data.tags.filter(Boolean)),
    };
    this.store.observations.push(observation);
    return observation;
  }

  private addFinding(data: Omit<ResearchFinding, "id" | "createdAt" | "themeIds" | "sourceTypeCount" | "source" | "evidence">): ResearchFinding | null {
    const statement = data.statement.trim();
    if (!statement) return null;

    const dedupeKey = createHash("sha256")
      .update(statement.toLowerCase())
      .update(data.evidenceSourceIds.slice().sort().join("|"))
      .digest("hex")
      .slice(0, 16);
    const duplicate = this.store.findings.find((finding) => finding.id.endsWith(dedupeKey));
    if (duplicate) return null;

    const evidenceObservations = data.evidenceObservationIds
      .map((id) => this.store.observations.find((observation) => observation.id === id))
      .filter((observation): observation is ResearchObservation => Boolean(observation));
    const sourceNames = data.evidenceSourceIds
      .map((id) => this.store.sources.find((source) => source.id === id)?.name)
      .filter((name): name is string => Boolean(name));

    const finding: ResearchFinding = {
      ...data,
      id: `${this.nextFindingId()}-${dedupeKey}`,
      createdAt: new Date().toISOString(),
      themeIds: [],
      sourceTypeCount: new Set(
        data.evidenceSourceIds
          .map((id) => this.store.sources.find((source) => source.id === id)?.type)
          .filter(Boolean),
      ).size,
      tags: unique(data.tags.filter(Boolean)),
      entities: unique(data.entities.filter(Boolean)),
      signalTags: unique(data.signalTags.filter(Boolean)),
      caveats: unique(data.caveats.filter(Boolean)),
      source: sourceNames.join(", "),
      evidence: evidenceObservations.map((observation) => observation.text).slice(0, 8),
    };
    this.store.findings.push(finding);
    return finding;
  }

  private upsertSource(input: Omit<ResearchSourceRecord, "id" | "processedAt"> & { processedAt?: string }): ResearchSourceRecord {
    const id = makeSourceId(input.type, input.name);
    const existing = this.store.sources.find((source) => source.id === id);
    const next: ResearchSourceRecord = {
      id,
      name: input.name,
      type: input.type,
      processedAt: input.processedAt ?? new Date().toISOString(),
      itemCount: input.itemCount,
      qualityScore: input.qualityScore,
      sampleSize: input.sampleSize,
      missingRate: input.missingRate,
      sourceKind: input.sourceKind,
      notes: unique((input.notes ?? []).filter(Boolean)),
    };

    if (!existing) {
      this.store.sources.push(next);
      return next;
    }

    const merged: ResearchSourceRecord = {
      ...existing,
      ...next,
      notes: unique([...(existing.notes ?? []), ...(next.notes ?? [])]),
      processedAt: next.processedAt > existing.processedAt ? next.processedAt : existing.processedAt,
    };
    const index = this.store.sources.findIndex((source) => source.id === id);
    this.store.sources[index] = merged;
    return merged;
  }

  private updateSource(sourceId: string, patch: Partial<ResearchSourceRecord>): void {
    const index = this.store.sources.findIndex((source) => source.id === sourceId);
    if (index === -1) return;
    const current = this.store.sources[index];
    this.store.sources[index] = {
      ...current,
      ...patch,
      notes: patch.notes ? unique([...(current.notes ?? []), ...patch.notes.filter(Boolean)]) : current.notes,
    };
  }

  private upsertQuantitativeMetrics(sourceName: string, metrics: ResearchQuantitativeMetric[]): void {
    this.store.quantitativeMetrics = [
      ...this.store.quantitativeMetrics.filter((metric) => metric.source !== sourceName),
      ...metrics,
    ];
  }

  private purgeSourceData(sourceIds: string[], sourceNames: string[]): void {
    const sourceIdSet = new Set(sourceIds);
    const sourceNameSet = new Set(sourceNames);
    const removedObservationIds = new Set(
      this.store.observations
        .filter((observation) => sourceIdSet.has(observation.sourceId))
        .map((observation) => observation.id),
    );

    this.store.observations = this.store.observations.filter((observation) => !sourceIdSet.has(observation.sourceId));
    this.store.findings = this.store.findings.filter((finding) =>
      !finding.evidenceSourceIds.some((sourceId) => sourceIdSet.has(sourceId))
      && !finding.evidenceObservationIds.some((observationId) => removedObservationIds.has(observationId)),
    );
    this.store.quantitativeMetrics = this.store.quantitativeMetrics.filter((metric) => !sourceNameSet.has(metric.source));
  }

  private invalidateDerivedArtifacts(): void {
    this.store.findings = this.store.findings.map((finding) => ({ ...finding, themeIds: [] }));
    this.store.themes = [];
    this.store.personas = [];
    this.store.opportunities = [];
    this.store.risks = [];
    this.store.contradictions = [];
    this.store.summary = undefined;
  }

  private async save(): Promise<void> {
    this.refreshComputedState();
    await mkdir(this.config.outputDir, { recursive: true });
    await writeFile(join(this.config.outputDir, STORE_FILENAME), JSON.stringify(this.store, null, 2));
    await this.writeMarkdownNotes();
  }

  private async writeMarkdownNotes(): Promise<void> {
    const notesDir = join(this.config.outputDir, "notes");
    await mkdir(notesDir, { recursive: true });

    for (const observation of this.store.observations) {
      const lines = [
        "---",
        `id: ${observation.id}`,
        `type: observation`,
        `sourceId: ${observation.sourceId}`,
        `kind: ${observation.kind}`,
        `sentiment: ${observation.sentiment}`,
        `created: ${observation.createdAt}`,
        "---",
        "",
        `# Observation ${observation.id}`,
        "",
        observation.text,
        "",
        observation.actor ? `**Actor:** ${observation.actor}` : "",
        observation.cohort ? `**Cohort:** ${observation.cohort}` : "",
        observation.timestamp ? `**Timestamp:** ${observation.timestamp}` : "",
        observation.numericFields ? "## Numeric Fields" : "",
        ...(observation.numericFields
          ? Object.entries(observation.numericFields).map(([key, value]) => `- ${key}: ${value}`)
          : []),
        "",
      ].filter(Boolean);
      await writeFile(join(notesDir, `${observation.id}.md`), lines.join("\n"));
    }

    for (const finding of this.store.findings) {
      const lines = [
        "---",
        `id: ${finding.id}`,
        "type: finding",
        `category: ${finding.category}`,
        `confidence: ${finding.confidence}`,
        `method: ${finding.method}`,
        `created: ${finding.createdAt}`,
        "---",
        "",
        `# ${finding.statement}`,
        "",
        `**Confidence:** ${finding.confidence}`,
        `**Method:** ${finding.method}`,
        finding.source ? `**Sources:** ${finding.source}` : "",
        "",
        finding.caveats.length > 0 ? "## Caveats" : "",
        ...finding.caveats.map((caveat) => `- ${caveat}`),
        finding.evidenceObservationIds.length > 0 ? "" : "",
        finding.evidenceObservationIds.length > 0 ? "## Evidence Observations" : "",
        ...finding.evidenceObservationIds.map((observationId) => `- [[${observationId}]]`),
        "",
      ].filter(Boolean);
      await writeFile(join(notesDir, `${finding.id}.md`), lines.join("\n"));
    }

    for (const metric of this.store.quantitativeMetrics) {
      const lines = [
        "---",
        "type: quantitative-metric",
        `field: ${metric.field}`,
        `source: ${metric.source}`,
        `sampleSize: ${metric.sampleSize}`,
        "---",
        "",
        `# Quantitative Metric: ${metric.label}`,
        "",
        `- Mean: ${metric.mean.toFixed(2)}`,
        `- Median: ${metric.median.toFixed(2)}`,
        `- Std dev: ${metric.stdDev.toFixed(2)}`,
        `- Missing rate: ${(metric.missingRate * 100).toFixed(1)}%`,
        metric.confidenceInterval95 ? `- 95% CI: ${metric.confidenceInterval95.low.toFixed(2)}-${metric.confidenceInterval95.high.toFixed(2)}` : "",
        metric.nps ? `- NPS: ${metric.nps.score}` : "",
        metric.cohortComparisons.length > 0 ? "" : "",
        metric.cohortComparisons.length > 0 ? "## Cohorts" : "",
        ...metric.cohortComparisons.map((comparison) =>
          `- ${comparison.cohort}: mean ${comparison.mean.toFixed(2)}, delta ${comparison.deltaFromOverall >= 0 ? "+" : ""}${comparison.deltaFromOverall.toFixed(2)} (n=${comparison.sampleSize})`,
        ),
        "",
      ].filter(Boolean);
      await writeFile(join(notesDir, `metric-${slugify(metric.label)}.md`), lines.join("\n"));
    }

    if (this.store.summary) {
      const lines = [
        "---",
        "type: summary",
        `generated: ${this.store.summary.generatedAt}`,
        "---",
        "",
        "# Research Summary",
        "",
        this.store.summary.narrative,
        "",
        `Quality score: ${this.store.summary.qualityScore}/100`,
        `Largest sample size: ${this.store.summary.sampleSize}`,
        "",
        "## Next Actions",
        "",
        ...this.store.summary.nextActions.map((action) => `- ${action}`),
        "",
      ];
      await writeFile(join(notesDir, "summary.md"), lines.join("\n"));
    }
  }

  private emitEvent(type: MemoireEvent["type"], message: string): void {
    this.config.onEvent?.({
      type,
      source: "research",
      message,
      timestamp: new Date(),
    });
  }
}

function createEmptyStore(): ResearchStore {
  return {
    version: 2,
    sources: [],
    observations: [],
    findings: [],
    themes: [],
    personas: [],
    quantitativeMetrics: [],
    opportunities: [],
    risks: [],
    contradictions: [],
    quality: {
      overallScore: 0,
      sampleSize: 0,
      completenessScore: 0,
      sourceDiversityScore: 0,
      triangulationScore: 0,
      structureScore: 0,
      notes: ["No research data loaded yet."],
      generatedAt: new Date().toISOString(),
    },
    methods: {
      analysisMode: "decision-grade",
      quantitativeApproach: "descriptive statistics + confidence intervals + cohort deltas",
      qualitativeApproach: "coded observations + evidence-backed theme synthesis",
      limitations: ["No research data loaded yet."],
    },
  };
}

function normalizeResearchStore(input: unknown): ResearchStore {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const store: ResearchStore = {
    version: 2,
    sources: Array.isArray(value.sources) ? value.sources.map(normalizeSource) : [],
    observations: Array.isArray(value.observations) ? value.observations.map(normalizeObservation) : [],
    findings: Array.isArray(value.findings) ? value.findings.map(normalizeFinding) : [],
    themes: Array.isArray(value.themes) ? value.themes.map(normalizeTheme) : [],
    personas: Array.isArray(value.personas) ? value.personas.map(normalizePersona) : [],
    quantitativeMetrics: Array.isArray(value.quantitativeMetrics) ? value.quantitativeMetrics.map(normalizeMetric) : [],
    opportunities: Array.isArray(value.opportunities) ? value.opportunities.map(normalizeOpportunity) : [],
    risks: Array.isArray(value.risks) ? value.risks.map(normalizeRisk) : [],
    contradictions: Array.isArray(value.contradictions) ? value.contradictions.map(normalizeContradiction) : [],
    quality: normalizeQuality(value.quality),
    summary: normalizeSummary(value.summary),
    methods: normalizeMethods(value.methods),
  };
  return store;
}

function migrateLegacyStore(input: unknown): ResearchStore {
  const legacy = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const store = createEmptyStore();

  const sources = Array.isArray(legacy.sources) ? legacy.sources : [];
  for (const source of sources) {
    const normalized = source && typeof source === "object" ? source as Record<string, unknown> : {};
    store.sources.push({
      id: makeSourceId(String(normalized.type ?? "legacy"), String(normalized.name ?? "legacy-source")),
      name: String(normalized.name ?? "legacy-source"),
      type: String(normalized.type ?? "legacy"),
      processedAt: typeof normalized.processedAt === "string" ? normalized.processedAt : new Date().toISOString(),
      sourceKind: inferLegacySourceKind(normalized),
      notes: Array.isArray(normalized.notes) ? normalized.notes.map(String) : [],
      qualityScore: typeof normalized.qualityScore === "number" ? normalized.qualityScore : undefined,
      sampleSize: typeof normalized.sampleSize === "number" ? normalized.sampleSize : undefined,
      missingRate: typeof normalized.missingRate === "number" ? normalized.missingRate : undefined,
      itemCount: typeof normalized.itemCount === "number" ? normalized.itemCount : undefined,
    });
  }

  const sourceByName = new Map(store.sources.map((source) => [source.name, source]));
  const sourceByType = new Map(store.sources.map((source) => [source.type, source]));

  const legacyFindings = Array.isArray(legacy.insights) ? legacy.insights : [];
  for (const legacyFinding of legacyFindings) {
    const value = legacyFinding && typeof legacyFinding === "object" ? legacyFinding as Record<string, unknown> : {};
    const sourceName = typeof value.source === "string" ? value.source : "legacy-source";
    const source = sourceByName.get(sourceName)
      ?? sourceByType.get(typeof value.sourceType === "string" ? value.sourceType : "legacy")
      ?? ensureMigratedSource(store, sourceName, typeof value.sourceType === "string" ? value.sourceType : "legacy");
    const observation = {
      id: `obs-${store.observations.length + 1}`,
      sourceId: source.id,
      kind: inferLegacyObservationKind(value, source.type),
      text: Array.isArray(value.evidence) && typeof value.evidence[0] === "string"
        ? String(value.evidence[0])
        : String(value.finding ?? "Legacy finding"),
      actor: typeof value.actor === "string" ? value.actor : undefined,
      tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
      entities: Array.isArray(value.entities) ? value.entities.map(String) : extractResearchEntities(String(value.finding ?? "")),
      sentiment: isSentiment(value.sentiment) ? value.sentiment : detectResearchSentiment(String(value.finding ?? "")),
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    } satisfies ResearchObservation;
    store.observations.push(observation);
    store.findings.push({
      id: `finding-${store.findings.length + 1}`,
      statement: String(value.finding ?? "Legacy finding"),
      category: typeof value.category === "string" ? value.category : inferResearchCategory(String(value.finding ?? ""), Array.isArray(value.tags) ? value.tags.map(String) : []),
      confidence: isConfidence(value.confidence) ? value.confidence : "low",
      themeIds: [],
      evidenceObservationIds: [observation.id],
      evidenceSourceIds: [source.id],
      sourceTypeCount: 1,
      method: inferLegacyMethod(value, source.sourceKind),
      caveats: [],
      tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
      entities: Array.isArray(value.entities) ? value.entities.map(String) : observation.entities,
      sentiment: observation.sentiment,
      signalTags: Array.isArray(value.signalTags) ? value.signalTags.map(String) : extractResearchSignals(String(value.finding ?? ""), Array.isArray(value.tags) ? value.tags.map(String) : [], observation.entities),
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
      source: source.name,
      evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : [observation.text],
    });
  }

  if (Array.isArray(legacy.personas)) {
    store.personas = legacy.personas.map(normalizePersona);
  }

  const findingIdByLegacyId = new Map(
    legacyFindings.map((legacyFinding, index) => {
      const legacyId = legacyFinding && typeof legacyFinding === "object" && typeof (legacyFinding as Record<string, unknown>).id === "string"
        ? String((legacyFinding as Record<string, unknown>).id)
        : `legacy-${index}`;
      return [legacyId, store.findings[index]?.id ?? `finding-${index + 1}`];
    }),
  );

  if (Array.isArray(legacy.themes)) {
    store.themes = legacy.themes.map((theme, index) => {
      const value = theme && typeof theme === "object" ? theme as Record<string, unknown> : {};
      const findingIds = Array.isArray(value.insights)
        ? value.insights.map(String).map((id) => findingIdByLegacyId.get(id) ?? id)
        : [];
      return {
        id: `theme-${index + 1}`,
        name: String(value.name ?? `Theme ${index + 1}`),
        description: String(value.description ?? ""),
        findingIds,
        frequency: typeof value.frequency === "number" ? value.frequency : findingIds.length,
        sourceCount: typeof value.sourceCount === "number" ? value.sourceCount : 1,
        sourceTypeCount: 1,
        confidence: isConfidence(value.confidence) ? value.confidence : "low",
        signalTags: Array.isArray(value.signalTags) ? value.signalTags.map(String) : [normalizeTag(String(value.name ?? `theme-${index + 1}`))],
        positiveCount: typeof value.positiveCount === "number" ? value.positiveCount : 0,
        negativeCount: typeof value.negativeCount === "number" ? value.negativeCount : 0,
      } satisfies ResearchTheme;
    });
  }

  return store;
}

function normalizeObservation(input: unknown): ResearchObservation {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    id: typeof value.id === "string" ? value.id : "obs-1",
    sourceId: typeof value.sourceId === "string" ? value.sourceId : "source-unknown",
    kind: isObservationKind(value.kind) ? value.kind : "survey-response",
    text: typeof value.text === "string" ? value.text : "",
    actor: typeof value.actor === "string" ? value.actor : undefined,
    cohort: typeof value.cohort === "string" ? value.cohort : undefined,
    timestamp: typeof value.timestamp === "string" ? value.timestamp : undefined,
    numericFields: normalizeNumericFields(value.numericFields),
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    entities: Array.isArray(value.entities) ? value.entities.map(String) : extractResearchEntities(typeof value.text === "string" ? value.text : ""),
    sentiment: isSentiment(value.sentiment) ? value.sentiment : detectResearchSentiment(typeof value.text === "string" ? value.text : ""),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeFinding(input: unknown): ResearchFinding {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    id: typeof value.id === "string" ? value.id : "finding-1",
    statement: typeof value.statement === "string" ? value.statement : typeof value.finding === "string" ? value.finding : "",
    category: typeof value.category === "string" ? value.category : "general",
    confidence: isConfidence(value.confidence) ? value.confidence : "low",
    themeIds: Array.isArray(value.themeIds) ? value.themeIds.map(String) : [],
    evidenceObservationIds: Array.isArray(value.evidenceObservationIds) ? value.evidenceObservationIds.map(String) : [],
    evidenceSourceIds: Array.isArray(value.evidenceSourceIds) ? value.evidenceSourceIds.map(String) : [],
    sourceTypeCount: typeof value.sourceTypeCount === "number" ? value.sourceTypeCount : 1,
    method: isMethod(value.method) ? value.method : "qualitative",
    caveats: Array.isArray(value.caveats) ? value.caveats.map(String) : [],
    tags: Array.isArray(value.tags) ? value.tags.map(String) : [],
    entities: Array.isArray(value.entities) ? value.entities.map(String) : extractResearchEntities(typeof value.statement === "string" ? value.statement : ""),
    sentiment: isSentiment(value.sentiment) ? value.sentiment : undefined,
    signalTags: Array.isArray(value.signalTags) ? value.signalTags.map(String) : [],
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    source: typeof value.source === "string" ? value.source : undefined,
    evidence: Array.isArray(value.evidence) ? value.evidence.map(String) : undefined,
  };
}

function normalizeTheme(input: unknown): ResearchTheme {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    id: typeof value.id === "string" ? value.id : `theme-${Date.now().toString(36)}`,
    name: typeof value.name === "string" ? value.name : "Theme",
    description: typeof value.description === "string" ? value.description : "",
    findingIds: Array.isArray(value.findingIds)
      ? value.findingIds.map(String)
      : Array.isArray(value.insights)
        ? value.insights.map(String)
        : [],
    frequency: typeof value.frequency === "number" ? value.frequency : 0,
    sourceCount: typeof value.sourceCount === "number" ? value.sourceCount : 0,
    sourceTypeCount: typeof value.sourceTypeCount === "number" ? value.sourceTypeCount : 1,
    confidence: isConfidence(value.confidence) ? value.confidence : "low",
    signalTags: Array.isArray(value.signalTags) ? value.signalTags.map(String) : [],
    positiveCount: typeof value.positiveCount === "number" ? value.positiveCount : 0,
    negativeCount: typeof value.negativeCount === "number" ? value.negativeCount : 0,
  };
}

function normalizeSource(input: unknown): ResearchSourceRecord {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    id: typeof value.id === "string" ? value.id : makeSourceId(String(value.type ?? "unknown"), String(value.name ?? "unknown")),
    name: typeof value.name === "string" ? value.name : "unknown",
    type: typeof value.type === "string" ? value.type : "unknown",
    processedAt: typeof value.processedAt === "string" ? value.processedAt : new Date().toISOString(),
    itemCount: typeof value.itemCount === "number" ? value.itemCount : undefined,
    qualityScore: typeof value.qualityScore === "number" ? value.qualityScore : undefined,
    sampleSize: typeof value.sampleSize === "number" ? value.sampleSize : undefined,
    missingRate: typeof value.missingRate === "number" ? value.missingRate : undefined,
    sourceKind: isSourceKind(value.sourceKind) ? value.sourceKind : undefined,
    notes: Array.isArray(value.notes) ? value.notes.map(String) : [],
  };
}

function normalizeMetric(input: unknown): ResearchQuantitativeMetric {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    id: typeof value.id === "string" ? value.id : `metric-${Date.now().toString(36)}`,
    source: typeof value.source === "string" ? value.source : "unknown",
    field: typeof value.field === "string" ? value.field : "metric",
    label: typeof value.label === "string" ? value.label : "Metric",
    sampleSize: typeof value.sampleSize === "number" ? value.sampleSize : 0,
    missingCount: typeof value.missingCount === "number" ? value.missingCount : 0,
    missingRate: typeof value.missingRate === "number" ? value.missingRate : 0,
    min: typeof value.min === "number" ? value.min : 0,
    max: typeof value.max === "number" ? value.max : 0,
    mean: typeof value.mean === "number" ? value.mean : 0,
    median: typeof value.median === "number" ? value.median : 0,
    stdDev: typeof value.stdDev === "number" ? value.stdDev : 0,
    p25: typeof value.p25 === "number" ? value.p25 : 0,
    p75: typeof value.p75 === "number" ? value.p75 : 0,
    confidenceInterval95: normalizeInterval(value.confidenceInterval95),
    scaleType: isScaleType(value.scaleType) ? value.scaleType : "continuous",
    buckets: Array.isArray(value.buckets) ? value.buckets.map(normalizeBucket) : [],
    nps: normalizeNps(value.nps),
    outlierCount: typeof value.outlierCount === "number" ? value.outlierCount : 0,
    cohortComparisons: Array.isArray(value.cohortComparisons) ? value.cohortComparisons.map(normalizeCohortComparison) : [],
  };
}

function normalizePersona(input: unknown): ResearchPersona {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    name: typeof value.name === "string" ? value.name : "Persona",
    role: typeof value.role === "string" ? value.role : "participant",
    goals: Array.isArray(value.goals) ? value.goals.map(String) : [],
    painPoints: Array.isArray(value.painPoints) ? value.painPoints.map(String) : [],
    behaviors: Array.isArray(value.behaviors) ? value.behaviors.map(String) : [],
    source: typeof value.source === "string" ? value.source : "research",
    quote: typeof value.quote === "string" ? value.quote : undefined,
    confidence: isConfidence(value.confidence) ? value.confidence : undefined,
    evidenceFindingIds: Array.isArray(value.evidenceFindingIds)
      ? value.evidenceFindingIds.map(String)
      : Array.isArray(value.evidenceInsightIds)
        ? value.evidenceInsightIds.map(String)
        : undefined,
  };
}

function normalizeOpportunity(input: unknown): ResearchOpportunity {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    title: typeof value.title === "string" ? value.title : "Opportunity",
    summary: typeof value.summary === "string" ? value.summary : "",
    theme: typeof value.theme === "string" ? value.theme : "General",
    priority: isPriority(value.priority) ? value.priority : "low",
    confidence: isConfidence(value.confidence) ? value.confidence : "low",
    evidenceFindingIds: Array.isArray(value.evidenceFindingIds)
      ? value.evidenceFindingIds.map(String)
      : Array.isArray(value.evidenceInsightIds)
        ? value.evidenceInsightIds.map(String)
        : [],
    sourceCount: typeof value.sourceCount === "number" ? value.sourceCount : 0,
  };
}

function normalizeRisk(input: unknown): ResearchRisk {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    title: typeof value.title === "string" ? value.title : "Risk",
    summary: typeof value.summary === "string" ? value.summary : "",
    theme: typeof value.theme === "string" ? value.theme : "General",
    severity: isPriority(value.severity) ? value.severity : "low",
    evidenceFindingIds: Array.isArray(value.evidenceFindingIds)
      ? value.evidenceFindingIds.map(String)
      : Array.isArray(value.evidenceInsightIds)
        ? value.evidenceInsightIds.map(String)
        : [],
    sourceCount: typeof value.sourceCount === "number" ? value.sourceCount : 0,
  };
}

function normalizeContradiction(input: unknown): ResearchContradiction {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    topic: typeof value.topic === "string" ? value.topic : "General",
    positiveFindingIds: Array.isArray(value.positiveFindingIds)
      ? value.positiveFindingIds.map(String)
      : Array.isArray(value.positiveInsightIds)
        ? value.positiveInsightIds.map(String)
        : [],
    negativeFindingIds: Array.isArray(value.negativeFindingIds)
      ? value.negativeFindingIds.map(String)
      : Array.isArray(value.negativeInsightIds)
        ? value.negativeInsightIds.map(String)
        : [],
    summary: typeof value.summary === "string" ? value.summary : "",
  };
}

function normalizeQuality(input: unknown): ResearchDataQualitySnapshot {
  if (!input || typeof input !== "object") {
    return createEmptyStore().quality;
  }
  const value = input as Record<string, unknown>;
  return {
    overallScore: typeof value.overallScore === "number" ? value.overallScore : 0,
    sampleSize: typeof value.sampleSize === "number" ? value.sampleSize : 0,
    completenessScore: typeof value.completenessScore === "number" ? value.completenessScore : 0,
    sourceDiversityScore: typeof value.sourceDiversityScore === "number" ? value.sourceDiversityScore : 0,
    triangulationScore: typeof value.triangulationScore === "number" ? value.triangulationScore : 0,
    structureScore: typeof value.structureScore === "number" ? value.structureScore : 0,
    notes: Array.isArray(value.notes) ? value.notes.map(String) : [],
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : new Date().toISOString(),
  };
}

function normalizeSummary(input: unknown): ResearchSummarySnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  return {
    narrative: typeof value.narrative === "string" ? value.narrative : "",
    topThemes: Array.isArray(value.topThemes) ? value.topThemes.map(String) : [],
    topOpportunities: Array.isArray(value.topOpportunities) ? value.topOpportunities.map(String) : [],
    topRisks: Array.isArray(value.topRisks) ? value.topRisks.map(String) : [],
    contradictionCount: typeof value.contradictionCount === "number" ? value.contradictionCount : 0,
    nextActions: Array.isArray(value.nextActions) ? value.nextActions.map(String) : [],
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : new Date().toISOString(),
    qualityScore: typeof value.qualityScore === "number" ? value.qualityScore : 0,
    sampleSize: typeof value.sampleSize === "number" ? value.sampleSize : 0,
    quantitativeMetrics: typeof value.quantitativeMetrics === "number" ? value.quantitativeMetrics : 0,
    coverage: {
      observations: asNumber(value.coverage, "observations"),
      findings: asNumber(value.coverage, "findings"),
      highConfidence: asNumber(value.coverage, "highConfidence"),
      personas: asNumber(value.coverage, "personas"),
      themes: asNumber(value.coverage, "themes"),
      sources: asNumber(value.coverage, "sources"),
      quantitativeMetrics: asNumber(value.coverage, "quantitativeMetrics"),
    },
  };
}

function normalizeMethods(input: unknown): ResearchMethods {
  if (!input || typeof input !== "object") {
    return createEmptyStore().methods;
  }
  const value = input as Record<string, unknown>;
  return {
    analysisMode: "decision-grade",
    quantitativeApproach: typeof value.quantitativeApproach === "string"
      ? value.quantitativeApproach
      : "descriptive statistics + confidence intervals + cohort deltas",
    qualitativeApproach: typeof value.qualitativeApproach === "string"
      ? value.qualitativeApproach
      : "coded observations + evidence-backed theme synthesis",
    limitations: Array.isArray(value.limitations) ? value.limitations.map(String) : [],
  };
}

function normalizeNumericFields(input: unknown): Record<string, number> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const entries = Object.entries(input as Record<string, unknown>)
    .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
    .map(([key, value]) => [key, value as number] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeInterval(input: unknown): ResearchInterval | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (typeof value.low !== "number" || typeof value.high !== "number") return undefined;
  return { low: value.low, high: value.high };
}

function normalizeBucket(input: unknown): ResearchBucket {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    label: typeof value.label === "string" ? value.label : "Bucket",
    count: typeof value.count === "number" ? value.count : 0,
    percentage: typeof value.percentage === "number" ? value.percentage : 0,
  };
}

function normalizeCohortComparison(input: unknown): ResearchCohortComparison {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  return {
    cohort: typeof value.cohort === "string" ? value.cohort : "Unknown",
    sampleSize: typeof value.sampleSize === "number" ? value.sampleSize : 0,
    mean: typeof value.mean === "number" ? value.mean : 0,
    median: typeof value.median === "number" ? value.median : 0,
    deltaFromOverall: typeof value.deltaFromOverall === "number" ? value.deltaFromOverall : 0,
  };
}

function normalizeNps(input: unknown): ResearchQuantitativeMetric["nps"] | undefined {
  if (!input || typeof input !== "object") return undefined;
  const value = input as Record<string, unknown>;
  if (
    typeof value.promoterPct !== "number"
    || typeof value.passivePct !== "number"
    || typeof value.detractorPct !== "number"
    || typeof value.score !== "number"
  ) {
    return undefined;
  }
  return {
    promoterPct: value.promoterPct,
    passivePct: value.passivePct,
    detractorPct: value.detractorPct,
    score: value.score,
  };
}

function buildMethods(store: ResearchStore): ResearchMethods {
  const limitations = [...store.quality.notes];
  if (store.quantitativeMetrics.length === 0) {
    limitations.push("No quantitative metrics available yet.");
  }
  if (new Set(store.sources.map((source) => source.sourceKind).filter(Boolean)).size < 2) {
    limitations.push("Limited source-type diversity; add both qualitative and quantitative inputs for stronger triangulation.");
  }
  return {
    analysisMode: "decision-grade",
    quantitativeApproach: "descriptive statistics + confidence intervals + cohort deltas",
    qualitativeApproach: "coded observations + evidence-backed theme synthesis",
    limitations: unique(limitations.filter(Boolean)),
  };
}

function inferLegacySourceKind(source: Record<string, unknown>): ResearchSourceKind {
  if (typeof source.sourceKind === "string" && isSourceKind(source.sourceKind)) return source.sourceKind;
  const type = String(source.type ?? "").toLowerCase();
  if (type.includes("csv") || type.includes("excel")) return "mixed";
  return "qualitative";
}

function inferLegacyObservationKind(value: Record<string, unknown>, sourceType: string): ResearchObservationKind {
  if (sourceType.includes("web")) return "web-finding";
  if (sourceType.includes("transcript")) return "transcript-segment";
  if (sourceType.includes("figjam") || sourceType.includes("sticky")) return "sticky";
  return "survey-response";
}

function inferLegacyMethod(value: Record<string, unknown>, sourceKind: ResearchSourceKind | undefined): ResearchMethod {
  if (isMethod(value.method)) return value.method;
  if (sourceKind === "mixed") return "mixed";
  if (sourceKind === "quantitative") return "quantitative";
  return "qualitative";
}

function ensureMigratedSource(store: ResearchStore, name: string, type: string): ResearchSourceRecord {
  const source: ResearchSourceRecord = {
    id: makeSourceId(type, name),
    name,
    type,
    processedAt: new Date().toISOString(),
    sourceKind: type.includes("csv") || type.includes("excel") ? "mixed" : "qualitative",
    notes: [],
  };
  store.sources.push(source);
  return source;
}

function buildSignalGroups(rows: ResponseObservationContext[]): SignalGroup[] {
  const groups = new Map<string, SignalGroup>();

  for (const row of rows) {
    const category = inferResearchCategory(row.response, ["survey"]);
    const entities = extractResearchEntities(row.response);
    const signals = extractResearchSignals(row.response, [category, row.cohort ? normalizeTag(row.cohort) : ""], entities, 3);
    const sentiment = detectResearchSentiment(row.response);

    for (const signal of signals.slice(0, 2)) {
      if (!signal) continue;
      const label = signal.split(" ").map(capitalize).join(" ");
      const group = groups.get(label) ?? {
        signal: label,
        category,
        sentiment,
        observationIds: [],
        examples: [],
        sourceKinds: new Set<ResearchSourceKind>(["qualitative"]),
      };
      group.observationIds.push(row.observationId);
      if (group.examples.length < 5) group.examples.push(row.response);
      groups.set(label, group);
    }
  }

  return Array.from(groups.values())
    .filter((group) => group.observationIds.length >= 2)
    .sort((a, b) => b.observationIds.length - a.observationIds.length);
}

function buildRowObservationText(headers: string[], row: unknown[], response: string): string {
  if (response) return response;

  const textFields = headers
    .map((header, index) => ({ header, value: toText(row[index]) }))
    .filter(({ value }) => value.length > 0 && value.length < 140)
    .slice(0, 4);
  if (textFields.length > 0) {
    return textFields.map(({ header, value }) => `${header}: ${value}`).join(" | ");
  }

  return "";
}

function extractNumericFields(headers: string[], row: unknown[]): Record<string, number> {
  return Object.fromEntries(
    headers
      .map((header, index) => [header, toNumber(row[index])] as const)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function describeNumericFields(fields: Record<string, number>): string {
  return Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join(", ");
}

function buildCategorizedStatement(text: string, category: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ");
  const excerpt = cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
  const prefixMap: Record<string, string> = {
    "pain-point": "Pain point",
    "goal": "User goal",
    "behavior": "Behavior pattern",
    "need": "User need",
    "opinion": "User opinion",
    "feature-request": "Feature request",
    "workaround": "Workaround",
    "best-practice": "Best practice",
    "market-data": "Market signal",
    "technical-constraint": "Technical constraint",
    "regulatory": "Regulatory concern",
    "quantitative-signal": "Quantitative signal",
    "cohort-difference": "Cohort difference",
    "nps": "NPS signal",
    "general": "Research finding",
  };
  return `${prefixMap[category] ?? "Research finding"}: ${excerpt}`;
}

function findHeaderIndex(headers: string[], patterns: string[]): number {
  return headers.findIndex((header) => patterns.some((pattern) => header.includes(pattern)));
}

function deriveResponseConfidence(response: string, numericFields: Record<string, number>): ResearchConfidence {
  if (response.length > 180 || Object.keys(numericFields).length > 0) return "medium";
  if (response.length > 90) return "medium";
  return "low";
}

function deriveMetricConfidence(metric: ResearchQuantitativeMetric): ResearchConfidence {
  if (metric.sampleSize >= 30 && metric.missingRate <= 0.1) return "high";
  if (metric.sampleSize >= 12 && metric.missingRate <= 0.2) return "medium";
  return "low";
}

function deriveMetricSentiment(metric: ResearchQuantitativeMetric): ResearchSentiment {
  if (metric.scaleType === "continuous") return "neutral";
  const midpoint = midpointForScale(metric.scaleType);
  if (metric.mean >= midpoint + 0.5) return "positive";
  if (metric.mean <= midpoint - 0.5) return "negative";
  return "neutral";
}

function midpointForScale(scaleType: ResearchQuantitativeMetric["scaleType"]): number {
  if (scaleType === "nps-0-10" || scaleType === "scale-0-10") return 5;
  if (scaleType === "likert-1-5") return 3;
  if (scaleType === "likert-1-7") return 4;
  return 0;
}

function makeSourceId(type: string, name: string): string {
  return `source-${slugify(`${type}-${name}`)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function normalizeTag(value: string): string {
  return slugify(value);
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[$,%]/g, "").replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function getMaxId(ids: string[], prefix: string): number {
  return ids.reduce((max, id) => {
    const match = id.match(new RegExp(`^${prefix}-(\\d+)`));
    if (!match) return max;
    const value = Number(match[1]);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function asNumber(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  return typeof record[key] === "number" ? record[key] as number : 0;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isConfidence(value: unknown): value is ResearchConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isSentiment(value: unknown): value is ResearchSentiment {
  return value === "positive" || value === "negative" || value === "neutral" || value === "mixed";
}

function isMethod(value: unknown): value is ResearchMethod {
  return value === "qualitative" || value === "quantitative" || value === "mixed";
}

function isObservationKind(value: unknown): value is ResearchObservationKind {
  return value === "survey-response" || value === "transcript-segment" || value === "sticky" || value === "web-finding";
}

function isSourceKind(value: unknown): value is ResearchSourceKind {
  return value === "qualitative" || value === "quantitative" || value === "mixed";
}

function isPriority(value: unknown): value is "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low";
}

function isScaleType(value: unknown): value is ResearchQuantitativeMetric["scaleType"] {
  return value === "nps-0-10"
    || value === "likert-1-5"
    || value === "likert-1-7"
    || value === "scale-0-10"
    || value === "continuous";
}
