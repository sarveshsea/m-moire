import type { ParsedSheet } from "./excel-parser.js";
import type {
  ResearchBucket,
  ResearchCohortComparison,
  ResearchDataQualitySnapshot,
  ResearchInterval,
  ResearchQuantitativeMetric,
  ResearchStore,
} from "./engine.js";

interface NumericColumnProfile {
  index: number;
  header: string;
  values: number[];
  valuesByRow: Array<number | undefined>;
  missingCount: number;
  rowCount: number;
}

interface CategoricalProfile {
  index: number;
  header: string;
  valuesByRow: Array<string | undefined>;
}

export interface QuantitativeAnalysisResult {
  metrics: ResearchQuantitativeMetric[];
  quality: {
    sourceQualityScore: number;
    sampleSize: number;
    missingRate: number;
    notes: string[];
  };
}

const NUMERIC_HEADER_HINTS = ["rating", "score", "nps", "csat", "satisfaction", "time", "minutes", "hours", "count", "age", "revenue", "value"];

export function analyzeQuantitativeSheet(
  sheet: ParsedSheet,
  options?: {
    source: string;
    preferredCohortHeader?: string;
  },
): QuantitativeAnalysisResult {
  const numericColumns = detectNumericColumns(sheet);
  const cohortProfile = selectCohortProfile(sheet, options?.preferredCohortHeader);
  const metrics = numericColumns.map((column) => buildMetric(column, options?.source ?? sheet.sheetName, cohortProfile));

  const maxSampleSize = metrics.reduce((max, metric) => Math.max(max, metric.sampleSize), 0);
  const averageMissingRate = metrics.length === 0
    ? 1
    : metrics.reduce((sum, metric) => sum + metric.missingRate, 0) / metrics.length;
  const sampleSizeScore = clampScore((maxSampleSize / 40) * 100);
  const completenessScore = clampScore((1 - averageMissingRate) * 100);
  const structureScore = clampScore(
    numericColumns.length === 0
      ? 20
      : 55 + Math.min(35, numericColumns.length * 10) + (cohortProfile ? 10 : 0),
  );
  const sourceQualityScore = Math.round((sampleSizeScore * 0.4) + (completenessScore * 0.35) + (structureScore * 0.25));

  const notes = [
    `${numericColumns.length} numeric field${numericColumns.length === 1 ? "" : "s"} detected`,
    cohortProfile ? `cohort comparisons enabled via ${cohortProfile.header}` : "no cohort column suitable for segmentation",
    averageMissingRate > 0.2 ? `high missingness detected (${Math.round(averageMissingRate * 100)}%)` : `missingness ${Math.round(averageMissingRate * 100)}%`,
  ];

  return {
    metrics,
    quality: {
      sourceQualityScore,
      sampleSize: maxSampleSize,
      missingRate: averageMissingRate,
      notes,
    },
  };
}

export function assessResearchDataQuality(store: ResearchStore): ResearchDataQualitySnapshot {
  const sourceCount = store.sources.length;
  const uniqueSourceTypes = new Set(store.sources.map((source) => source.type)).size;
  const quantitativeMetrics = store.quantitativeMetrics ?? [];
  const maxSampleSize = quantitativeMetrics.reduce((max, metric) => Math.max(max, metric.sampleSize), 0);
  const avgMissingRate = quantitativeMetrics.length === 0
    ? 0.35
    : quantitativeMetrics.reduce((sum, metric) => sum + metric.missingRate, 0) / quantitativeMetrics.length;
  const structuredSources = store.sources.filter((source) => source.sourceKind === "quantitative" || source.sourceKind === "mixed").length;
  const triangulationSignals = store.themes.filter((theme) => (theme.sourceCount ?? 0) >= 2).length;

  const sampleSizeScore = clampScore((maxSampleSize / 60) * 100);
  const completenessScore = clampScore((1 - avgMissingRate) * 100);
  const sourceDiversityScore = clampScore((uniqueSourceTypes / 4) * 100);
  const triangulationScore = clampScore((triangulationSignals / Math.max(store.themes.length || 1, 1)) * 100);
  const structureScore = clampScore(
    store.sources.length === 0
      ? 20
      : 45 + Math.min(30, structuredSources * 12) + Math.min(25, quantitativeMetrics.length * 6),
  );

  const overallScore = Math.round(
    (sampleSizeScore * 0.22)
    + (completenessScore * 0.22)
    + (sourceDiversityScore * 0.18)
    + (triangulationScore * 0.2)
    + (structureScore * 0.18),
  );

  const notes: string[] = [];
  if (sourceCount < 2) notes.push("Low source diversity — most conclusions rely on a single source.");
  if (maxSampleSize < 15 && quantitativeMetrics.length > 0) notes.push("Quantitative sample size is still small for strong inference.");
  if (avgMissingRate > 0.2) notes.push("Missing data is high enough to weaken some numeric conclusions.");
  if (triangulationSignals === 0 && store.findings.length > 0) notes.push("Themes are not yet triangulated across multiple sources.");
  if (notes.length === 0) notes.push("Coverage, triangulation, and completeness are strong enough for directional product decisions.");

  return {
    overallScore,
    sampleSize: maxSampleSize,
    completenessScore,
    sourceDiversityScore,
    triangulationScore,
    structureScore,
    notes,
    generatedAt: new Date().toISOString(),
  };
}

function detectNumericColumns(sheet: ParsedSheet): NumericColumnProfile[] {
  return sheet.headers
    .map((header, index) => {
      const rawValues = sheet.rows.map((row) => row[index]);
      const nonEmptyValues = rawValues.filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
      const numericValues = nonEmptyValues
        .map(toNumeric)
        .filter((value): value is number => typeof value === "number");
      const ratio = nonEmptyValues.length === 0 ? 0 : numericValues.length / nonEmptyValues.length;
      const hinted = NUMERIC_HEADER_HINTS.some((hint) => header.toLowerCase().includes(hint));

      return {
        index,
        header,
        values: numericValues,
        valuesByRow: rawValues.map(toNumeric),
        missingCount: rawValues.length - numericValues.length,
        rowCount: rawValues.length,
        numericRatio: ratio,
        hinted,
      };
    })
    .filter((column) => {
      if (column.values.length < 3) return false;
      if (column.numericRatio >= 0.6) return true;
      return column.hinted && column.numericRatio >= 0.4;
    })
    .map(({ index, header, values, valuesByRow, missingCount, rowCount }) => ({
      index,
      header,
      values,
      valuesByRow,
      missingCount,
      rowCount,
    }));
}

function selectCohortProfile(sheet: ParsedSheet, preferredHeader?: string): CategoricalProfile | null {
  const headers = sheet.headers.map((header) => header.toLowerCase());
  const preferredIndex = preferredHeader
    ? headers.findIndex((header) => header.includes(preferredHeader.toLowerCase()))
    : -1;

  if (preferredIndex !== -1) {
    const profile = buildCategoricalProfile(sheet, preferredIndex);
    if (profile) return profile;
  }

  const candidateIndices = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) =>
      header.includes("role")
      || header.includes("segment")
      || header.includes("persona")
      || header.includes("plan")
      || header.includes("team"),
    )
    .map(({ index }) => index);

  for (const index of candidateIndices) {
    const profile = buildCategoricalProfile(sheet, index);
    if (profile) return profile;
  }

  return null;
}

function buildCategoricalProfile(sheet: ParsedSheet, index: number): CategoricalProfile | null {
  const values = sheet.rows
    .map((row) => toCategorical(row[index]))
    .filter((value): value is string => Boolean(value));
  const uniqueValues = Array.from(new Set(values));

  if (values.length < 4) return null;
  if (uniqueValues.length < 2 || uniqueValues.length > 6) return null;
  if (uniqueValues.some((value) => values.filter((candidate) => candidate === value).length < 2)) return null;

  return {
    index,
    header: sheet.headers[index] ?? `Column ${index + 1}`,
    valuesByRow: sheet.rows.map((row) => toCategorical(row[index])),
  };
}

function buildMetric(
  column: NumericColumnProfile,
  source: string,
  cohortProfile: CategoricalProfile | null,
): ResearchQuantitativeMetric {
  const sorted = [...column.values].sort((a, b) => a - b);
  const sampleSize = sorted.length;
  const mean = average(sorted);
  const median = percentile(sorted, 0.5);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);
  const stdDev = standardDeviation(sorted, mean);
  const interval95 = confidenceInterval95(mean, stdDev, sampleSize);
  const scaleType = detectScaleType(column.header, sorted);
  const buckets = buildBuckets(sorted, scaleType);
  const outlierCount = countOutliers(sorted, p25, p75);
  const cohortComparisons = cohortProfile
    ? buildCohortComparisons(column, cohortProfile, mean)
    : [];

  return {
    id: `${source}:${column.header}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    source,
    field: column.header,
    label: humanizeLabel(column.header),
    sampleSize,
    missingCount: column.missingCount,
    missingRate: column.rowCount === 0 ? 0 : column.missingCount / column.rowCount,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median,
    stdDev,
    p25,
    p75,
    confidenceInterval95: interval95,
    scaleType,
    buckets,
    nps: scaleType === "nps-0-10" ? buildNpsSummary(sorted) : undefined,
    outlierCount,
    cohortComparisons,
  };
}

function buildBuckets(values: number[], scaleType: ResearchQuantitativeMetric["scaleType"]): ResearchBucket[] {
  if (values.length === 0) return [];

  if (scaleType === "nps-0-10") {
    const detractors = values.filter((value) => value <= 6).length;
    const passives = values.filter((value) => value >= 7 && value <= 8).length;
    const promoters = values.filter((value) => value >= 9).length;
    return [
      { label: "Detractors", count: detractors, percentage: roundPercentage((detractors / values.length) * 100) },
      { label: "Passives", count: passives, percentage: roundPercentage((passives / values.length) * 100) },
      { label: "Promoters", count: promoters, percentage: roundPercentage((promoters / values.length) * 100) },
    ];
  }

  const min = values[0];
  const max = values[values.length - 1];
  const range = Math.max(max - min, 1);
  const lowThreshold = min + range / 3;
  const highThreshold = min + (range * 2) / 3;
  const low = values.filter((value) => value <= lowThreshold).length;
  const medium = values.filter((value) => value > lowThreshold && value <= highThreshold).length;
  const high = values.filter((value) => value > highThreshold).length;

  return [
    { label: "Low", count: low, percentage: roundPercentage((low / values.length) * 100) },
    { label: "Mid", count: medium, percentage: roundPercentage((medium / values.length) * 100) },
    { label: "High", count: high, percentage: roundPercentage((high / values.length) * 100) },
  ];
}

function buildNpsSummary(values: number[]): NonNullable<ResearchQuantitativeMetric["nps"]> {
  const promoters = values.filter((value) => value >= 9).length;
  const passives = values.filter((value) => value >= 7 && value <= 8).length;
  const detractors = values.filter((value) => value <= 6).length;
  const total = values.length || 1;
  const promoterPct = roundPercentage((promoters / total) * 100);
  const passivePct = roundPercentage((passives / total) * 100);
  const detractorPct = roundPercentage((detractors / total) * 100);

  return {
    promoterPct,
    passivePct,
    detractorPct,
    score: Math.round(promoterPct - detractorPct),
  };
}

function buildCohortComparisons(
  column: NumericColumnProfile,
  cohortProfile: CategoricalProfile,
  overallMean: number,
): ResearchCohortComparison[] {
  const groups = new Map<string, number[]>();

  for (let rowIndex = 0; rowIndex < column.rowCount; rowIndex++) {
    const cohort = cohortProfile.valuesByRow[rowIndex];
    const value = column.valuesByRow[rowIndex];
    if (!cohort || typeof value !== "number") continue;
    const group = groups.get(cohort) ?? [];
    group.push(value);
    groups.set(cohort, group);
  }

  return Array.from(groups.entries())
    .filter(([, values]) => values.length >= 2)
    .map(([cohort, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const mean = average(sorted);
      return {
        cohort,
        sampleSize: sorted.length,
        mean,
        median: percentile(sorted, 0.5),
        deltaFromOverall: mean - overallMean,
      };
    })
    .sort((a, b) => b.mean - a.mean)
    .slice(0, 6);
}

function detectScaleType(header: string, values: number[]): ResearchQuantitativeMetric["scaleType"] {
  const min = values[0];
  const max = values[values.length - 1];
  const integers = values.every((value) => Number.isInteger(value));
  const normalizedHeader = header.toLowerCase();

  if (integers && min >= 0 && max <= 10 && (normalizedHeader.includes("nps") || normalizedHeader.includes("recommend"))) {
    return "nps-0-10";
  }
  if (integers && min >= 1 && max <= 5) return "likert-1-5";
  if (integers && min >= 1 && max <= 7) return "likert-1-7";
  if (integers && min >= 0 && max <= 10) return "scale-0-10";
  return "continuous";
}

function confidenceInterval95(mean: number, stdDev: number, sampleSize: number): ResearchInterval | undefined {
  if (sampleSize < 2) return undefined;
  const margin = 1.96 * (stdDev / Math.sqrt(sampleSize));
  return {
    low: mean - margin,
    high: mean + margin,
  };
}

function countOutliers(values: number[], p25: number, p75: number): number {
  const iqr = p75 - p25;
  const lower = p25 - (1.5 * iqr);
  const upper = p75 + (1.5 * iqr);
  return values.filter((value) => value < lower || value > upper).length;
}

function percentile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sortedValues[lower];
  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function toNumeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .replace(/[$,%]/g, "")
    .replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toCategorical(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : undefined;
}

function humanizeLabel(header: string): string {
  return header
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
