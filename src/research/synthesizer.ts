/**
 * Research Synthesizer — Combines insights from multiple sources
 * into a coherent research narrative with personas and journey maps.
 */

import type { ResearchInsight, ResearchPersona, ResearchTheme, ResearchStore } from "./engine.js";
import { getAI } from "../ai/index.js";
import { createLogger } from "../engine/logger.js";

const log = createLogger("synthesizer");

export interface SynthesisResult {
  themes: ResearchTheme[];
  personas: ResearchPersona[];
  keyFindings: ResearchInsight[];
  gaps: string[];
  recommendations: string[];
  aiPowered?: boolean;
}

/**
 * Synthesize all research data into a coherent output.
 * Uses AI when available for deeper semantic analysis.
 */
export async function synthesizeResearch(store: ResearchStore): Promise<SynthesisResult> {
  const ai = getAI();
  if (ai && store.insights.length > 0) {
    try {
      return await aiSynthesize(store);
    } catch (err) {
      log.warn({ err }, "AI synthesis failed, falling back to heuristic");
    }
  }
  return heuristicSynthesize(store);
}

async function aiSynthesize(store: ResearchStore): Promise<SynthesisResult> {
  const ai = getAI()!;
  const insightSummaries = store.insights.slice(0, 50).map(i => ({
    id: i.id,
    finding: i.finding,
    confidence: i.confidence,
    tags: i.tags,
    evidenceCount: i.evidence.length,
  }));

  const result = await ai.completeJSON<{
    themes: Array<{ name: string; description: string; insightIds: string[]; frequency: number }>;
    personas: Array<{ name: string; role: string; goals: string[]; painPoints: string[]; behaviors: string[] }>;
    gaps: string[];
    recommendations: string[];
  }>({
    system: [
      "You are a UX research synthesis engine.",
      "Analyze the research insights and produce a structured synthesis.",
      `There are ${store.insights.length} insights from ${store.sources.length} sources.`,
      "Return JSON with: themes, personas, gaps, recommendations.",
    ].join("\n"),
    messages: [{
      role: "user",
      content: `Synthesize these research insights:\n${JSON.stringify(insightSummaries, null, 2)}`,
    }],
    model: "fast",
  });

  return {
    themes: result.themes.map(t => ({
      name: t.name,
      description: t.description,
      insights: t.insightIds,
      frequency: t.frequency,
    })),
    personas: result.personas.map(p => ({
      ...p,
      source: "AI-synthesized from research data",
    })),
    keyFindings: rankInsights(store.insights),
    gaps: result.gaps,
    recommendations: result.recommendations,
    aiPowered: true,
  };
}

function heuristicSynthesize(store: ResearchStore): SynthesisResult {
  const themes = identifyThemes(store.insights);
  const personas = inferPersonas(store.insights);
  const keyFindings = rankInsights(store.insights);
  const gaps = identifyGaps(store);
  const recommendations = generateRecommendations(themes, keyFindings);

  return {
    themes,
    personas,
    keyFindings,
    gaps,
    recommendations,
  };
}

function identifyThemes(insights: ResearchInsight[]): ResearchTheme[] {
  // Group by tags and find recurring patterns
  const tagCounts = new Map<string, ResearchInsight[]>();

  for (const insight of insights) {
    for (const tag of insight.tags) {
      const group = tagCounts.get(tag) ?? [];
      group.push(insight);
      tagCounts.set(tag, group);
    }
  }

  return Array.from(tagCounts.entries())
    .filter(([_, group]) => group.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([tag, group]) => ({
      name: tag,
      description: `${group.length} findings related to "${tag}"`,
      insights: group.map((i) => i.id),
      frequency: group.length,
    }));
}

function inferPersonas(insights: ResearchInsight[]): ResearchPersona[] {
  // Filter to qualitative/interview/survey insights
  const qualitative = insights.filter((i) =>
    i.tags.includes("qualitative") || i.tags.includes("survey") || i.tags.includes("interview")
  );

  if (qualitative.length < 3) return [];

  // Step 1: Extract key noun phrases from each insight
  const insightPhrases = new Map<string, string[]>();
  for (const insight of qualitative) {
    insightPhrases.set(insight.id, extractNounPhrases(insight.finding));
  }

  // Step 2: Build co-occurrence and cluster insights by shared phrases
  const clusters = clusterInsightsByPhrases(qualitative, insightPhrases);

  // Step 3: Assign unclustered insights to nearest cluster
  const clusteredIds = new Set(clusters.flatMap(c => c.insights.map(i => i.id)));
  const unclustered = qualitative.filter(i => !clusteredIds.has(i.id));
  assignUnclusteredInsights(unclustered, clusters, insightPhrases);

  // Step 4: Filter clusters with fewer than 3 insights
  const viableClusters = clusters.filter(c => c.insights.length >= 3);

  // Step 5: Limit to 2-5 personas, take the largest clusters
  const topClusters = viableClusters
    .sort((a, b) => b.insights.length - a.insights.length)
    .slice(0, 5);

  // Ensure we have at least 2 — if only 1 cluster, try splitting it
  if (topClusters.length < 2 && viableClusters.length === 1) {
    const split = splitClusterBySegment(viableClusters[0]);
    if (split.length >= 2) {
      topClusters.length = 0;
      topClusters.push(...split.slice(0, 5));
    }
  }

  if (topClusters.length === 0) return [];

  // Step 6: Generate a persona from each cluster
  return topClusters.map((cluster, idx) => generatePersonaFromCluster(cluster, idx));
}

// ── Multi-Persona Clustering Types & Helpers ─────────────────────

interface PersonaCluster {
  keywords: string[];
  insights: ResearchInsight[];
  dominantSentiment: string;
  dominantCategory: string;
}

/** Stop words excluded from noun phrase extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "of", "in", "to",
  "for", "with", "on", "at", "from", "by", "about", "as", "into",
  "through", "during", "before", "after", "above", "below", "between",
  "out", "off", "over", "under", "again", "further", "then", "once",
  "and", "but", "or", "nor", "not", "so", "very", "just", "than",
  "too", "also", "that", "this", "these", "those", "it", "its",
  "they", "them", "their", "we", "our", "you", "your", "i", "me", "my",
  "he", "she", "his", "her", "all", "each", "every", "both", "few",
  "more", "most", "other", "some", "such", "no", "only", "own", "same",
  "which", "who", "whom", "what", "when", "where", "how", "if", "while",
]);

/** Role patterns that hint at user segments */
const ROLE_PATTERNS: Array<[RegExp, string]> = [
  [/\bas a designer\b/i, "designer"],
  [/\bas a developer\b/i, "developer"],
  [/\bas a manager\b/i, "manager"],
  [/\bas a researcher\b/i, "researcher"],
  [/\bas an? engineer\b/i, "engineer"],
  [/\bas an? analyst\b/i, "analyst"],
  [/\bas an? admin\b/i, "admin"],
  [/\bas a product\b/i, "product"],
  [/\bas a stakeholder\b/i, "stakeholder"],
  [/\bas a team lead\b/i, "team-lead"],
];

/** Skill level patterns */
const SKILL_PATTERNS: Array<[RegExp, string]> = [
  [/\bbeginner\b/i, "beginner"],
  [/\bnew to\b/i, "beginner"],
  [/\bnovice\b/i, "beginner"],
  [/\bintermediate\b/i, "intermediate"],
  [/\badvanced\b/i, "advanced"],
  [/\bexpert\b/i, "expert"],
  [/\bpower user\b/i, "expert"],
  [/\bexperienced\b/i, "advanced"],
];

/** Behavior patterns */
const BEHAVIOR_PATTERNS: Array<[RegExp, string]> = [
  [/\bfrequent(ly)?\b/i, "frequent-user"],
  [/\bdaily\b/i, "frequent-user"],
  [/\binfrequent(ly)?\b/i, "infrequent-user"],
  [/\boccasional(ly)?\b/i, "infrequent-user"],
  [/\brare(ly)?\b/i, "infrequent-user"],
  [/\bmobile\b/i, "mobile-user"],
  [/\bphone\b/i, "mobile-user"],
  [/\bdesktop\b/i, "desktop-user"],
  [/\blaptop\b/i, "desktop-user"],
  [/\bcollaborat/i, "collaborative"],
  [/\bteam\b/i, "collaborative"],
  [/\bsolo\b/i, "solo-worker"],
  [/\bindependent(ly)?\b/i, "solo-worker"],
];

/** Goal patterns */
const GOAL_PATTERNS: Array<[RegExp, string]> = [
  [/\bproductiv/i, "productivity"],
  [/\befficienc/i, "productivity"],
  [/\bfast(er)?\b/i, "productivity"],
  [/\bspeed\b/i, "productivity"],
  [/\bcreativ/i, "creativity"],
  [/\binspir/i, "creativity"],
  [/\bexplor/i, "creativity"],
  [/\bcollaborat/i, "collaboration"],
  [/\bshar(e|ing)\b/i, "collaboration"],
  [/\btogether\b/i, "collaboration"],
  [/\blearn/i, "learning"],
  [/\bunderstand/i, "learning"],
  [/\bfigure out\b/i, "learning"],
  [/\bautomat/i, "automation"],
  [/\bscal/i, "scalability"],
  [/\bgrow/i, "scalability"],
];

/**
 * Extract 1-3 word noun phrases from a text, filtering stop words.
 */
function extractNounPhrases(text: string): string[] {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ");
  const words = cleaned.split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const phrases: string[] = [];

  // Single meaningful words
  for (const word of words) {
    phrases.push(word);
  }

  // Bigrams
  for (let i = 0; i < words.length - 1; i++) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
  }

  // Trigrams
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }

  return phrases;
}

/**
 * Detect segment signals from an insight's text (roles, skills, behaviors, goals).
 */
function detectSegmentSignals(text: string): string[] {
  const signals: string[] = [];
  const lower = text.toLowerCase();

  for (const [pattern, label] of ROLE_PATTERNS) {
    if (pattern.test(lower)) signals.push(`role:${label}`);
  }
  for (const [pattern, label] of SKILL_PATTERNS) {
    if (pattern.test(lower)) signals.push(`skill:${label}`);
  }
  for (const [pattern, label] of BEHAVIOR_PATTERNS) {
    if (pattern.test(lower)) signals.push(`behavior:${label}`);
  }
  for (const [pattern, label] of GOAL_PATTERNS) {
    if (pattern.test(lower)) signals.push(`goal:${label}`);
  }

  return signals;
}

/**
 * Detect the sentiment of an insight based on keyword presence.
 */
function detectSentiment(text: string): "positive" | "negative" | "neutral" {
  const lower = text.toLowerCase();
  const positiveWords = ["love", "great", "easy", "helpful", "enjoy", "good", "excellent", "happy", "like", "useful", "intuitive", "efficient"];
  const negativeWords = ["pain", "frustrat", "difficult", "confus", "slow", "hard", "annoying", "hate", "bad", "complex", "overwhelm", "broken", "fail"];

  let posScore = 0;
  let negScore = 0;
  for (const w of positiveWords) { if (lower.includes(w)) posScore++; }
  for (const w of negativeWords) { if (lower.includes(w)) negScore++; }

  if (posScore > negScore) return "positive";
  if (negScore > posScore) return "negative";
  return "neutral";
}

/**
 * Compute keyword overlap between two sets of phrases.
 */
function phraseOverlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const phrase of a) {
    if (setB.has(phrase)) count++;
  }
  return count;
}

/**
 * Cluster insights that share 2+ key phrases into PersonaClusters.
 */
function clusterInsightsByPhrases(
  insights: ResearchInsight[],
  insightPhrases: Map<string, string[]>,
): PersonaCluster[] {
  const clusters: PersonaCluster[] = [];
  const assigned = new Set<string>();

  // First pass: cluster by segment signals (role, skill, behavior, goal)
  const signalGroups = new Map<string, ResearchInsight[]>();
  for (const insight of insights) {
    const signals = detectSegmentSignals(insight.finding);
    for (const signal of signals) {
      const group = signalGroups.get(signal) ?? [];
      group.push(insight);
      signalGroups.set(signal, group);
    }
  }

  // Create clusters from strong signal groups (3+ insights with same signal)
  const usedSignals = new Set<string>();
  for (const [signal, group] of Array.from(signalGroups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    if (group.length < 3) continue;
    // Avoid over-clustering: only use insights not yet assigned
    const available = group.filter(i => !assigned.has(i.id));
    if (available.length < 3) continue;

    const clusterKeywords = collectClusterKeywords(available, insightPhrases);
    const sentiments = available.map(i => detectSentiment(i.finding));
    const categories = available.flatMap(i => i.tags);

    clusters.push({
      keywords: [signal, ...clusterKeywords.slice(0, 10)],
      insights: available,
      dominantSentiment: majorityVote(sentiments),
      dominantCategory: majorityVote(categories),
    });

    for (const i of available) assigned.add(i.id);
    usedSignals.add(signal);
  }

  // Second pass: cluster remaining insights by phrase co-occurrence
  const remaining = insights.filter(i => !assigned.has(i.id));
  if (remaining.length >= 3) {
    // Build adjacency: two insights are connected if they share 2+ phrases
    const adjacency = new Map<string, Set<string>>();
    for (const insight of remaining) {
      adjacency.set(insight.id, new Set());
    }

    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const phrasesA = insightPhrases.get(remaining[i].id) ?? [];
        const phrasesB = insightPhrases.get(remaining[j].id) ?? [];
        if (phraseOverlap(phrasesA, phrasesB) >= 2) {
          adjacency.get(remaining[i].id)!.add(remaining[j].id);
          adjacency.get(remaining[j].id)!.add(remaining[i].id);
        }
      }
    }

    // Simple greedy clustering: pick the most-connected node, pull its neighbors
    const phraseAssigned = new Set<string>();
    const remainingIds = new Set(remaining.map(i => i.id));

    while (remainingIds.size > 0) {
      // Find the node with most connections among unassigned
      let bestId = "";
      let bestCount = -1;
      for (const id of remainingIds) {
        const neighbors = adjacency.get(id)!;
        const activeNeighbors = [...neighbors].filter(n => remainingIds.has(n));
        if (activeNeighbors.length > bestCount) {
          bestCount = activeNeighbors.length;
          bestId = id;
        }
      }

      if (bestCount < 1) break; // No more connected components

      // Collect the cluster: seed + its active neighbors
      const clusterIds = new Set<string>([bestId]);
      for (const neighbor of adjacency.get(bestId)!) {
        if (remainingIds.has(neighbor)) clusterIds.add(neighbor);
      }

      const clusterInsights = remaining.filter(i => clusterIds.has(i.id));
      const clusterKeywords = collectClusterKeywords(clusterInsights, insightPhrases);
      const sentiments = clusterInsights.map(i => detectSentiment(i.finding));
      const categories = clusterInsights.flatMap(i => i.tags);

      clusters.push({
        keywords: clusterKeywords.slice(0, 10),
        insights: clusterInsights,
        dominantSentiment: majorityVote(sentiments),
        dominantCategory: majorityVote(categories),
      });

      for (const id of clusterIds) {
        remainingIds.delete(id);
        phraseAssigned.add(id);
      }
    }
  }

  return clusters;
}

/**
 * Assign unclustered insights to the nearest cluster by keyword overlap.
 */
function assignUnclusteredInsights(
  unclustered: ResearchInsight[],
  clusters: PersonaCluster[],
  insightPhrases: Map<string, string[]>,
): void {
  if (clusters.length === 0) return;

  for (const insight of unclustered) {
    const phrases = insightPhrases.get(insight.id) ?? [];
    let bestCluster: PersonaCluster | null = null;
    let bestOverlap = 0;

    for (const cluster of clusters) {
      const overlap = phraseOverlap(phrases, cluster.keywords);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestCluster = cluster;
      }
    }

    // Also check tag overlap
    if (!bestCluster) {
      for (const cluster of clusters) {
        const tagOverlap = insight.tags.filter(t => cluster.dominantCategory === t).length;
        if (tagOverlap > bestOverlap) {
          bestOverlap = tagOverlap;
          bestCluster = cluster;
        }
      }
    }

    if (bestCluster && bestOverlap > 0) {
      bestCluster.insights.push(insight);
    }
  }
}

/**
 * Collect the most frequent keywords across a set of insights.
 */
function collectClusterKeywords(
  insights: ResearchInsight[],
  insightPhrases: Map<string, string[]>,
): string[] {
  const freq = new Map<string, number>();
  for (const insight of insights) {
    const phrases = insightPhrases.get(insight.id) ?? [];
    const seen = new Set<string>();
    for (const phrase of phrases) {
      if (!seen.has(phrase)) {
        freq.set(phrase, (freq.get(phrase) ?? 0) + 1);
        seen.add(phrase);
      }
    }
  }

  return Array.from(freq.entries())
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([phrase]) => phrase);
}

/**
 * Return the most common value in an array (majority vote).
 */
function majorityVote(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = v;
    }
  }
  return best;
}

/**
 * Try to split a single large cluster by detected segment signals.
 */
function splitClusterBySegment(cluster: PersonaCluster): PersonaCluster[] {
  const subGroups = new Map<string, ResearchInsight[]>();

  for (const insight of cluster.insights) {
    const signals = detectSegmentSignals(insight.finding);
    const key = signals.length > 0 ? signals[0] : "_default";
    const group = subGroups.get(key) ?? [];
    group.push(insight);
    subGroups.set(key, group);
  }

  // If we only got one group or _default, try splitting by sentiment
  if (subGroups.size <= 1) {
    subGroups.clear();
    for (const insight of cluster.insights) {
      const sentiment = detectSentiment(insight.finding);
      const group = subGroups.get(sentiment) ?? [];
      group.push(insight);
      subGroups.set(sentiment, group);
    }
  }

  const result: PersonaCluster[] = [];
  for (const [key, insights] of subGroups) {
    if (insights.length >= 3) {
      const sentiments = insights.map(i => detectSentiment(i.finding));
      const categories = insights.flatMap(i => i.tags);
      result.push({
        keywords: key === "_default" ? cluster.keywords : [key, ...cluster.keywords.slice(0, 5)],
        insights,
        dominantSentiment: majorityVote(sentiments),
        dominantCategory: majorityVote(categories),
      });
    }
  }

  return result;
}

/** Persona name templates based on dominant traits */
const PERSONA_NAME_MAP: Record<string, string> = {
  "role:designer": "Creative Designer",
  "role:developer": "Technical Builder",
  "role:manager": "Strategic Manager",
  "role:researcher": "Insight Seeker",
  "role:engineer": "Systems Engineer",
  "role:analyst": "Data Analyst",
  "role:admin": "System Admin",
  "role:product": "Product Visionary",
  "role:stakeholder": "Business Stakeholder",
  "role:team-lead": "Team Lead",
  "skill:beginner": "Newcomer",
  "skill:intermediate": "Growing Practitioner",
  "skill:advanced": "Power User",
  "skill:expert": "Domain Expert",
  "behavior:frequent-user": "Daily Driver",
  "behavior:infrequent-user": "Casual Browser",
  "behavior:mobile-user": "Mobile-First User",
  "behavior:desktop-user": "Desktop Powerhouse",
  "behavior:collaborative": "Team Collaborator",
  "behavior:solo-worker": "Independent Operator",
  "goal:productivity": "Efficiency Seeker",
  "goal:creativity": "Creative Explorer",
  "goal:collaboration": "Collaboration Champion",
  "goal:learning": "Continuous Learner",
  "goal:automation": "Automation Advocate",
  "goal:scalability": "Growth Strategist",
};

/** Fallback persona names by index */
const FALLBACK_NAMES = [
  "Primary User",
  "Secondary User",
  "Tertiary User",
  "Emerging Segment",
  "Niche User",
];

/**
 * Generate a ResearchPersona from a PersonaCluster.
 */
function generatePersonaFromCluster(cluster: PersonaCluster, index: number): ResearchPersona {
  // Determine persona name from dominant keywords
  let name = FALLBACK_NAMES[index] ?? `User Segment ${index + 1}`;
  for (const keyword of cluster.keywords) {
    if (PERSONA_NAME_MAP[keyword]) {
      name = PERSONA_NAME_MAP[keyword];
      break;
    }
  }

  // Determine role from cluster keywords
  const roleSignal = cluster.keywords.find(k => k.startsWith("role:"));
  const role = roleSignal
    ? roleSignal.replace("role:", "").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    : deriveRoleFromKeywords(cluster.keywords);

  // Extract goals — insights containing want/need/goal language
  const goals = cluster.insights
    .filter(i => {
      const lower = i.finding.toLowerCase();
      return lower.includes("want") || lower.includes("need") || lower.includes("goal") ||
        lower.includes("wish") || lower.includes("hope") || lower.includes("looking for") ||
        lower.includes("prefer");
    })
    .map(i => i.finding)
    .slice(0, 5);

  // Extract pain points — insights with frustration/difficulty language
  const painPoints = cluster.insights
    .filter(i => {
      const lower = i.finding.toLowerCase();
      return lower.includes("pain") || lower.includes("frustrat") || lower.includes("difficult") ||
        lower.includes("confus") || lower.includes("slow") || lower.includes("annoying") ||
        lower.includes("struggle") || lower.includes("problem") || lower.includes("issue") ||
        lower.includes("hard to");
    })
    .map(i => i.finding)
    .slice(0, 5);

  // Extract behaviors from cluster signals and insight text
  const behaviors: string[] = [];
  for (const keyword of cluster.keywords) {
    if (keyword.startsWith("behavior:")) {
      behaviors.push(keyword.replace("behavior:", "").replace(/-/g, " "));
    }
    if (keyword.startsWith("skill:")) {
      behaviors.push(`${keyword.replace("skill:", "")} skill level`);
    }
  }
  // Add sentiment-based behavior
  if (cluster.dominantSentiment === "positive") {
    behaviors.push("Generally satisfied with current experience");
  } else if (cluster.dominantSentiment === "negative") {
    behaviors.push("Experiencing notable friction in current workflow");
  }
  // Pad with generic behavior if empty
  if (behaviors.length === 0) {
    behaviors.push("Behavior patterns derived from qualitative analysis");
  }

  // Pick the best representative quote: longest high-confidence insight, or longest overall
  const highConfInsights = cluster.insights.filter(i => i.confidence === "high");
  const quotePool = highConfInsights.length > 0 ? highConfInsights : cluster.insights;
  const bestQuote = quotePool.sort((a, b) => b.finding.length - a.finding.length)[0];

  return {
    name,
    role,
    goals: goals.length > 0 ? goals : [`Achieve ${cluster.dominantCategory || "core"} objectives effectively`],
    painPoints: painPoints.length > 0 ? painPoints : ["No specific pain points identified in this segment"],
    behaviors: behaviors.slice(0, 5),
    source: `Clustered from ${cluster.insights.length} qualitative insights (${cluster.dominantSentiment} sentiment)`,
    quote: bestQuote?.finding,
  };
}

/**
 * Derive a role description from cluster keywords when no explicit role signal exists.
 */
function deriveRoleFromKeywords(keywords: string[]): string {
  // Use the top non-signal keywords to form a role description
  const meaningful = keywords
    .filter(k => !k.includes(":"))
    .filter(k => k.split(" ").length >= 2)
    .slice(0, 2);

  if (meaningful.length > 0) {
    return `User focused on ${meaningful.join(" and ")}`;
  }
  return "Derived from research data";
}

function rankInsights(insights: ResearchInsight[]): ResearchInsight[] {
  return [...insights].sort((a, b) => {
    const confidenceOrder = { high: 3, medium: 2, low: 1 };
    const aScore = confidenceOrder[a.confidence] + a.evidence.length * 0.5;
    const bScore = confidenceOrder[b.confidence] + b.evidence.length * 0.5;
    return bScore - aScore;
  });
}

function identifyGaps(store: ResearchStore): string[] {
  const gaps: string[] = [];

  if (store.insights.filter((i) => i.tags.includes("quantitative")).length === 0) {
    gaps.push("No quantitative data — consider adding survey scores or analytics");
  }

  if (store.insights.filter((i) => i.tags.includes("qualitative")).length === 0) {
    gaps.push("No qualitative data — consider interviews or open-ended survey responses");
  }

  if (store.sources.length < 2) {
    gaps.push("Single data source — triangulate with additional sources for stronger findings");
  }

  const highConf = store.insights.filter((i) => i.confidence === "high");
  if (highConf.length === 0) {
    gaps.push("No high-confidence findings — more data or stronger evidence needed");
  }

  return gaps;
}

function generateRecommendations(
  themes: ResearchTheme[],
  keyFindings: ResearchInsight[]
): string[] {
  const recs: string[] = [];

  if (themes.length > 0) {
    recs.push(`Focus on top theme: "${themes[0].name}" (${themes[0].frequency} supporting findings)`);
  }

  const highFindings = keyFindings.filter((f) => f.confidence === "high");
  if (highFindings.length > 0) {
    recs.push(`${highFindings.length} high-confidence findings should drive design decisions`);
  }

  if (themes.length > 3) {
    recs.push("Multiple themes identified — consider prioritizing by user impact");
  }

  return recs;
}
