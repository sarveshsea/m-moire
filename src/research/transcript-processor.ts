/**
 * TranscriptProcessor — Parse interview transcripts into structured research data.
 *
 * Heuristic-first: speaker detection via label patterns, theme extraction via
 * TF-IDF on nouns, quote detection via first-person pronouns and sentence length.
 * AI enhances when available but is never required.
 */

import { createLogger } from "../engine/logger.js";

const log = createLogger("transcript-processor");

// ── Types ──────────────────────────────────────────────────

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp?: string;
  sentiment?: "positive" | "negative" | "neutral";
}

export interface TranscriptTheme {
  name: string;
  frequency: number;
  quotes: string[];
  sentiment: "positive" | "negative" | "neutral" | "mixed";
}

export interface ProcessedTranscript {
  speakers: string[];
  segments: TranscriptSegment[];
  themes: TranscriptTheme[];
  insights: ProcessedTranscriptInsight[];
  quotes: string[];
  summary: string;
  wordCount: number;
  duration?: string;
}

export interface ProcessedTranscriptInsight {
  id: string;
  finding: string;
  confidence: "high" | "medium" | "low";
  source: string;
  evidence: string[];
  tags: string[];
  createdAt: string;
}

// ── Speaker Detection ──────────────────────────────────────

/**
 * Detect speaker-labeled segments in transcript text.
 *
 * Supports formats:
 *   "Speaker Name: text..."
 *   "[00:15] Speaker Name: text..."
 *   "Speaker Name (role): text..."
 *   "Q: text..." / "A: text..."
 */
const SPEAKER_PATTERNS = [
  // [timestamp] Speaker: text
  /^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([A-Z][a-zA-Z\s.'-]+?):\s*(.+)$/,
  // Speaker (role): text
  /^([A-Z][a-zA-Z\s.'-]+?)\s*\([^)]+\):\s*(.+)$/,
  // Speaker: text (most common)
  /^([A-Z][a-zA-Z\s.'-]{1,30}):\s*(.+)$/,
  // Q/A format
  /^([QA]):\s*(.+)$/,
];

export function parseSegments(text: string): TranscriptSegment[] {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const segments: TranscriptSegment[] = [];
  let currentSpeaker = "Unknown";
  let currentTimestamp: string | undefined;
  let currentText: string[] = [];

  function flush() {
    if (currentText.length > 0) {
      const fullText = currentText.join(" ").trim();
      if (fullText) {
        segments.push({
          speaker: currentSpeaker,
          text: fullText,
          timestamp: currentTimestamp,
          sentiment: detectSentiment(fullText),
        });
      }
      currentText = [];
    }
  }

  for (const line of lines) {
    let matched = false;
    for (const pattern of SPEAKER_PATTERNS) {
      const m = line.match(pattern);
      if (m) {
        flush();
        if (m.length === 4) {
          // Timestamp pattern
          currentTimestamp = m[1];
          currentSpeaker = m[2].trim();
          currentText = [m[3]];
        } else {
          currentTimestamp = undefined;
          currentSpeaker = m[1].trim();
          currentText = [m[2]];
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Continuation of previous speaker
      currentText.push(line);
    }
  }
  flush();

  return segments;
}

// ── Sentiment Detection (heuristic) ────────────────────────

const POSITIVE_WORDS = new Set([
  "love", "great", "easy", "helpful", "amazing", "excellent", "good", "like",
  "enjoy", "useful", "clear", "intuitive", "fast", "simple", "nice", "happy",
  "perfect", "wonderful", "fantastic", "smooth", "convenient",
]);

const NEGATIVE_WORDS = new Set([
  "confusing", "hard", "difficult", "frustrating", "hate", "slow", "broken",
  "annoying", "terrible", "awful", "complicated", "unclear", "lost", "bad",
  "ugly", "painful", "worst", "impossible", "useless", "clunky",
]);

function detectSentiment(text: string): "positive" | "negative" | "neutral" {
  const words = text.toLowerCase().split(/\W+/);
  let pos = 0;
  let neg = 0;
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  if (pos > neg && pos >= 2) return "positive";
  if (neg > pos && neg >= 1) return "negative";
  return "neutral";
}

// ── Theme Extraction (TF-IDF on nouns) ─────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now", "and", "but", "or", "if", "while", "about", "up",
  "it", "its", "it's", "i", "me", "my", "we", "our", "you", "your",
  "he", "she", "they", "them", "his", "her", "their", "this", "that",
  "these", "those", "what", "which", "who", "whom", "thing", "things",
  "like", "get", "got", "go", "going", "went", "come", "came", "make",
  "made", "take", "took", "know", "knew", "think", "thought", "say",
  "said", "see", "saw", "want", "wanted", "look", "looked", "use",
  "find", "give", "tell", "work", "call", "try", "ask", "seem",
  "feel", "really", "actually", "basically", "yeah", "okay", "right",
  "well", "also", "even", "still", "already", "much", "many",
]);

export function extractThemes(segments: TranscriptSegment[], minFrequency = 2): TranscriptTheme[] {
  const wordFreq = new Map<string, number>();
  const wordQuotes = new Map<string, string[]>();

  for (const seg of segments) {
    const words = seg.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    const seen = new Set<string>();
    for (const word of words) {
      if (!seen.has(word)) {
        wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1);
        seen.add(word);
      }
      // Track quotes containing this word
      if (!wordQuotes.has(word)) wordQuotes.set(word, []);
      const quotes = wordQuotes.get(word)!;
      if (quotes.length < 3 && seg.text.length > 30) {
        quotes.push(seg.text);
      }
    }
  }

  // Sort by frequency, take top themes
  const sorted = [...wordFreq.entries()]
    .filter(([, freq]) => freq >= minFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  return sorted.map(([word, freq]) => {
    const quotes = wordQuotes.get(word) ?? [];
    const sentiments = quotes.map((q) => detectSentiment(q));
    const posCt = sentiments.filter((s) => s === "positive").length;
    const negCt = sentiments.filter((s) => s === "negative").length;
    const sentiment = posCt > negCt ? "positive" : negCt > posCt ? "negative" : posCt > 0 && negCt > 0 ? "mixed" : "neutral";

    return { name: word, frequency: freq, quotes, sentiment };
  });
}

// ── Quote Detection ────────────────────────────────────────

const FIRST_PERSON = /\b(i|i'm|i've|i'd|i'll|my|me|we|we're|we've|our)\b/i;

export function extractQuotes(segments: TranscriptSegment[], minLength = 15): string[] {
  const quotes: string[] = [];

  for (const seg of segments) {
    const sentences = seg.text.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
    for (const sentence of sentences) {
      if (sentence.split(/\s+/).length >= minLength && FIRST_PERSON.test(sentence)) {
        quotes.push(`"${sentence}" - ${seg.speaker}`);
        if (quotes.length >= 20) return quotes;
      }
    }
  }

  return quotes;
}

// ── Insight Generation ─────────────────────────────────────

export function generateInsights(themes: TranscriptTheme[], segments: TranscriptSegment[], source: string): ProcessedTranscriptInsight[] {
  const insights: ProcessedTranscriptInsight[] = [];

  // Generate insights from negative themes (pain points)
  const negativeThemes = themes.filter((t) => t.sentiment === "negative" || t.sentiment === "mixed");
  for (const theme of negativeThemes.slice(0, 5)) {
    insights.push({
      id: `transcript-${source}-${theme.name}-${Date.now().toString(36)}`,
      finding: `Users expressed frustration with "${theme.name}" (mentioned ${theme.frequency} times across interviews)`,
      confidence: theme.frequency >= 4 ? "high" : theme.frequency >= 2 ? "medium" : "low",
      source,
      evidence: theme.quotes,
      tags: ["interview", "pain-point", theme.name],
      createdAt: new Date().toISOString(),
    });
  }

  // Generate insights from positive themes (strengths)
  const positiveThemes = themes.filter((t) => t.sentiment === "positive");
  for (const theme of positiveThemes.slice(0, 3)) {
    insights.push({
      id: `transcript-${source}-${theme.name}-${Date.now().toString(36)}`,
      finding: `Users responded positively to "${theme.name}" (mentioned ${theme.frequency} times)`,
      confidence: theme.frequency >= 3 ? "high" : "medium",
      source,
      evidence: theme.quotes,
      tags: ["interview", "strength", theme.name],
      createdAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ── Main Processor ─────────────────────────────────────────

export function processTranscript(text: string, source = "interview"): ProcessedTranscript {
  const segments = parseSegments(text);
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const themes = extractThemes(segments);
  const quotes = extractQuotes(segments);
  const insights = generateInsights(themes, segments, source);
  const wordCount = text.split(/\s+/).length;

  // Build summary
  const negCount = segments.filter((s) => s.sentiment === "negative").length;
  const posCount = segments.filter((s) => s.sentiment === "positive").length;
  const topThemes = themes.slice(0, 3).map((t) => t.name).join(", ");
  const summary = `${speakers.length} speaker${speakers.length !== 1 ? "s" : ""}, ${segments.length} segments, ${wordCount} words. ` +
    `Top themes: ${topThemes || "none detected"}. ` +
    `Sentiment: ${posCount} positive, ${negCount} negative, ${segments.length - posCount - negCount} neutral.`;

  log.info({ speakers: speakers.length, segments: segments.length, themes: themes.length, insights: insights.length }, "Transcript processed");

  return { speakers, segments, themes, insights, quotes, summary, wordCount };
}
