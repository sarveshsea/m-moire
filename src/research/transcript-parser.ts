/**
 * Transcript Parser — Processes interview transcripts, meeting notes,
 * and user testing sessions into structured research insights.
 *
 * Supports formats:
 * - Plain text transcripts
 * - Timestamped transcripts (HH:MM:SS or MM:SS format)
 * - Speaker-labeled transcripts ("Speaker: text" or "Q: / A:" format)
 * - Markdown meeting notes
 */

import { createLogger } from "../engine/logger.js";

const log = createLogger("transcript");

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp?: string;
  startSeconds?: number;
}

export interface TranscriptInsight {
  finding: string;
  quote: string;
  speaker: string;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  category: "pain-point" | "goal" | "behavior" | "need" | "opinion" | "feature-request" | "workaround" | "context";
  confidence: "high" | "medium" | "low";
  timestamp?: string;
}

export interface TranscriptAnalysis {
  segments: TranscriptSegment[];
  insights: TranscriptInsight[];
  speakers: { name: string; segmentCount: number; wordCount: number }[];
  sentiment: { positive: number; negative: number; neutral: number; mixed: number };
  topicFlow: { topic: string; firstMention: number; frequency: number }[];
  summary: string;
}

// Timestamp patterns
const TIMESTAMP_RE = /^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*)/;
const SPEAKER_RE = /^([A-Z][a-zA-Z\s]*?|[QA]|Interviewer|Participant|Moderator|User|Respondent)[\s]*[:—–-]\s*/;

// Sentiment words
const POSITIVE_WORDS = new Set([
  "love", "great", "amazing", "excellent", "awesome", "perfect", "easy", "helpful",
  "enjoy", "fantastic", "wonderful", "good", "nice", "like", "prefer", "happy",
  "convenient", "intuitive", "smooth", "fast", "reliable", "clear", "simple",
  "beautiful", "impressive", "satisfied", "delighted", "appreciate", "excited"
]);

const NEGATIVE_WORDS = new Set([
  "hate", "terrible", "awful", "bad", "horrible", "difficult", "confusing",
  "frustrating", "annoying", "slow", "broken", "ugly", "complicated", "hard",
  "painful", "impossible", "worst", "disappointed", "angry", "stuck", "lost",
  "bug", "crash", "error", "fail", "missing", "unclear", "overwhelming",
  "clunky", "unusable", "tedious", "inconsistent", "unreliable"
]);

// Category detection patterns
const CATEGORY_PATTERNS: [RegExp, TranscriptInsight["category"]][] = [
  [/\b(frustrat|annoy|difficult|hard to|struggle|can't find|doesn't work|broken|pain|hate|worst)\b/i, "pain-point"],
  [/\b(want|wish|hope|would be nice|need|looking for|trying to|goal|aim)\b/i, "goal"],
  [/\b(usually|always|every time|habit|routine|tend to|normally|typically|my process)\b/i, "behavior"],
  [/\b(need|require|must have|essential|critical|important|necessary)\b/i, "need"],
  [/\b(think|feel|believe|opinion|prefer|rather|personally)\b/i, "opinion"],
  [/\b(feature|add|should have|would love|request|suggest|idea|could you)\b/i, "feature-request"],
  [/\b(workaround|hack|instead i|way around|alternative|trick)\b/i, "workaround"],
];

export function parseTranscript(text: string): TranscriptAnalysis {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const segments = parseSegments(lines);
  const speakers = analyzeSpeakers(segments);
  const insights = extractInsights(segments);
  const sentiment = aggregateSentiment(insights);
  const topicFlow = extractTopicFlow(segments);

  const summary = buildSummary(segments, insights, speakers, sentiment);

  log.info({ segments: segments.length, insights: insights.length, speakers: speakers.length }, "Transcript parsed");

  return { segments, insights, speakers, sentiment, topicFlow, summary };
}

function parseSegments(lines: string[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let currentSpeaker = "Unknown";
  let currentTimestamp: string | undefined;
  let buffer: string[] = [];

  for (const line of lines) {
    let remaining = line.trim();

    // Extract timestamp if present
    const tsMatch = remaining.match(TIMESTAMP_RE);
    if (tsMatch) {
      remaining = remaining.slice(tsMatch[0].length);
      currentTimestamp = tsMatch[1];
    }

    // Check for speaker label
    const spMatch = remaining.match(SPEAKER_RE);
    if (spMatch) {
      // Flush previous buffer
      if (buffer.length > 0) {
        segments.push({
          speaker: currentSpeaker,
          text: buffer.join(" ").trim(),
          timestamp: currentTimestamp,
          startSeconds: currentTimestamp ? parseTimestamp(currentTimestamp) : undefined,
        });
        buffer = [];
      }
      currentSpeaker = normalizeSpeaker(spMatch[1]);
      remaining = remaining.slice(spMatch[0].length);
    }

    if (remaining.trim()) {
      buffer.push(remaining.trim());
    }
  }

  // Flush remaining
  if (buffer.length > 0) {
    segments.push({
      speaker: currentSpeaker,
      text: buffer.join(" ").trim(),
      timestamp: currentTimestamp,
      startSeconds: currentTimestamp ? parseTimestamp(currentTimestamp) : undefined,
    });
  }

  return segments;
}

function normalizeSpeaker(raw: string): string {
  const trimmed = raw.trim();
  if (/^[Qq]$/i.test(trimmed) || /^interviewer$/i.test(trimmed) || /^moderator$/i.test(trimmed)) return "Interviewer";
  if (/^[Aa]$/i.test(trimmed) || /^participant$/i.test(trimmed) || /^user$/i.test(trimmed) || /^respondent$/i.test(trimmed)) return "Participant";
  return trimmed;
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function analyzeSpeakers(segments: TranscriptSegment[]): TranscriptAnalysis["speakers"] {
  const map = new Map<string, { count: number; words: number }>();
  for (const seg of segments) {
    const entry = map.get(seg.speaker) ?? { count: 0, words: 0 };
    entry.count++;
    entry.words += seg.text.split(/\s+/).length;
    map.set(seg.speaker, entry);
  }
  return Array.from(map.entries())
    .map(([name, stats]) => ({ name, segmentCount: stats.count, wordCount: stats.words }))
    .sort((a, b) => b.wordCount - a.wordCount);
}

function scoreSentiment(text: string): TranscriptInsight["sentiment"] {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0, neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  if (pos > 0 && neg > 0) return "mixed";
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

function categorizeSegment(text: string): TranscriptInsight["category"] {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return "context";
}

function extractInsights(segments: TranscriptSegment[]): TranscriptInsight[] {
  const insights: TranscriptInsight[] = [];

  for (const seg of segments) {
    // Skip very short segments
    if (seg.text.length < 30) continue;

    // Split into sentences for finer-grained analysis
    const sentences = seg.text.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);

    for (const sentence of sentences) {
      const category = categorizeSegment(sentence);
      // Skip generic context unless it's long and substantive
      if (category === "context" && sentence.length < 80) continue;

      const sentiment = scoreSentiment(sentence);
      // Skip neutral context
      if (category === "context" && sentiment === "neutral") continue;

      // Build a finding summary
      const finding = buildFinding(sentence, category);

      insights.push({
        finding,
        quote: sentence.length > 200 ? sentence.slice(0, 197) + "..." : sentence,
        speaker: seg.speaker,
        sentiment,
        category,
        confidence: sentence.length > 100 ? "medium" : "low",
        timestamp: seg.timestamp,
      });
    }
  }

  // Boost confidence for repeated themes
  const categoryCount = new Map<string, number>();
  for (const i of insights) {
    categoryCount.set(i.category, (categoryCount.get(i.category) ?? 0) + 1);
  }
  for (const i of insights) {
    if ((categoryCount.get(i.category) ?? 0) >= 3 && i.confidence === "low") {
      i.confidence = "medium";
    }
    if ((categoryCount.get(i.category) ?? 0) >= 5) {
      i.confidence = "high";
    }
  }

  return insights;
}

function buildFinding(sentence: string, category: TranscriptInsight["category"]): string {
  const prefixes: Record<string, string> = {
    "pain-point": "Pain point: ",
    "goal": "User goal: ",
    "behavior": "Behavior pattern: ",
    "need": "User need: ",
    "opinion": "User opinion: ",
    "feature-request": "Feature request: ",
    "workaround": "Workaround: ",
    "context": "",
  };
  // Trim to a reasonable finding length
  const trimmed = sentence.length > 150 ? sentence.slice(0, 147) + "..." : sentence;
  return `${prefixes[category]}${trimmed}`;
}

function aggregateSentiment(insights: TranscriptInsight[]): TranscriptAnalysis["sentiment"] {
  const counts = { positive: 0, negative: 0, neutral: 0, mixed: 0 };
  for (const i of insights) counts[i.sentiment]++;
  return counts;
}

function extractTopicFlow(segments: TranscriptSegment[]): TranscriptAnalysis["topicFlow"] {
  // Extract noun phrases / key terms that repeat
  const termFreq = new Map<string, { first: number; count: number }>();
  const stopWords = new Set(["the", "and", "for", "that", "this", "with", "from", "have", "are", "was", "were", "been", "being", "would", "could", "should", "about", "their", "they", "them", "there", "what", "when", "where", "which", "just", "like", "also", "very", "really", "some", "more", "than", "into", "only", "other", "then", "each", "much", "well", "back", "even", "here", "over"]);

  for (let i = 0; i < segments.length; i++) {
    const words = segments[i].text.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));

    // Extract bigrams as topics
    for (let j = 0; j < words.length - 1; j++) {
      const bigram = `${words[j]} ${words[j + 1]}`;
      const entry = termFreq.get(bigram) ?? { first: i, count: 0 };
      entry.count++;
      termFreq.set(bigram, entry);
    }
  }

  return Array.from(termFreq.entries())
    .filter(([_, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([topic, data]) => ({
      topic,
      firstMention: data.first,
      frequency: data.count,
    }));
}

function buildSummary(
  segments: TranscriptSegment[],
  insights: TranscriptInsight[],
  speakers: TranscriptAnalysis["speakers"],
  sentiment: TranscriptAnalysis["sentiment"],
): string {
  const totalWords = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const painPoints = insights.filter(i => i.category === "pain-point").length;
  const goals = insights.filter(i => i.category === "goal").length;
  const featureReqs = insights.filter(i => i.category === "feature-request").length;

  const lines = [
    `Transcript: ${segments.length} segments, ${totalWords} words, ${speakers.length} speakers.`,
    `Extracted ${insights.length} insights (${painPoints} pain points, ${goals} goals, ${featureReqs} feature requests).`,
    `Sentiment: ${sentiment.positive} positive, ${sentiment.negative} negative, ${sentiment.mixed} mixed, ${sentiment.neutral} neutral.`,
  ];

  return lines.join(" ");
}
