/**
 * Sticky Note Parser — Converts FigJam stickies into structured research data.
 * Clusters by spatial proximity and color, then synthesizes themes.
 */

import type { StickyNote } from "./bridge.js";

export interface StickyCluster {
  id: string;
  label: string;
  color?: string;
  stickies: StickyNote[];
  centroid: { x: number; y: number };
  theme?: string;
}

export interface ParsedResearch {
  clusters: StickyCluster[];
  unclustered: StickyNote[];
  totalStickies: number;
  summary: string;
}

/**
 * Parse stickies into clusters based on spatial proximity and color.
 */
export function clusterStickies(
  stickies: StickyNote[],
  options: {
    proximityThreshold?: number;
    minClusterSize?: number;
  } = {}
): ParsedResearch {
  const threshold = options.proximityThreshold ?? 500;
  const minSize = options.minClusterSize ?? 2;

  if (stickies.length === 0) {
    return {
      clusters: [],
      unclustered: [],
      totalStickies: 0,
      summary: "No stickies found",
    };
  }

  // Step 1: Group by color first (affinity mapping convention)
  const colorGroups = new Map<string, StickyNote[]>();
  const noColor: StickyNote[] = [];

  for (const sticky of stickies) {
    const colorKey = sticky.color ?? "none";
    if (colorKey === "none") {
      noColor.push(sticky);
    } else {
      const group = colorGroups.get(colorKey) ?? [];
      group.push(sticky);
      colorGroups.set(colorKey, group);
    }
  }

  // Step 2: Within each color group, sub-cluster by spatial proximity
  const clusters: StickyCluster[] = [];
  let clusterId = 0;

  for (const [color, group] of colorGroups) {
    const subClusters = spatialCluster(group, threshold);
    for (const sub of subClusters) {
      if (sub.length >= minSize) {
        clusters.push({
          id: `cluster-${++clusterId}`,
          label: `Group ${clusterId}`,
          color,
          stickies: sub,
          centroid: calculateCentroid(sub),
        });
      }
    }
  }

  // Step 3: Cluster colorless stickies spatially
  const noColorClusters = spatialCluster(noColor, threshold);
  for (const sub of noColorClusters) {
    if (sub.length >= minSize) {
      clusters.push({
        id: `cluster-${++clusterId}`,
        label: `Group ${clusterId}`,
        stickies: sub,
        centroid: calculateCentroid(sub),
      });
    }
  }

  // Stickies that didn't make it into any cluster
  const clusteredIds = new Set(
    clusters.flatMap((c) => c.stickies.map((s) => s.id))
  );
  const unclustered = stickies.filter((s) => !clusteredIds.has(s.id));

  const summary = [
    `${stickies.length} stickies parsed into ${clusters.length} clusters`,
    unclustered.length > 0 ? ` (${unclustered.length} unclustered)` : "",
    colorGroups.size > 0 ? `. Colors used: ${colorGroups.size}` : "",
  ].join("");

  return {
    clusters,
    unclustered,
    totalStickies: stickies.length,
    summary,
  };
}

/**
 * Extract text themes from clusters for research synthesis.
 */
export function extractThemes(clusters: StickyCluster[]): {
  theme: string;
  evidence: string[];
  clusterId: string;
}[] {
  return clusters.map((cluster) => {
    const texts = cluster.stickies.map((s) => s.text).filter(Boolean);

    // Extract most common words (naive keyword extraction)
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been",
      "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "could", "should", "may", "might", "can", "to", "of",
      "in", "for", "on", "with", "at", "by", "from", "it", "this",
      "that", "and", "or", "but", "not", "i", "we", "they", "my",
    ]);

    for (const text of texts) {
      const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !stopWords.has(w));
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }

    const topWords = [...wordCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    const theme = topWords.length > 0
      ? topWords.join(", ")
      : cluster.label;

    return {
      theme,
      evidence: texts.slice(0, 10),
      clusterId: cluster.id,
    };
  });
}

// ── Spatial Clustering ──────────────────────────────────────

function spatialCluster(stickies: StickyNote[], threshold: number): StickyNote[][] {
  if (stickies.length === 0) return [];

  const visited = new Set<string>();
  const clusters: StickyNote[][] = [];

  for (const sticky of stickies) {
    if (visited.has(sticky.id)) continue;

    const cluster: StickyNote[] = [];
    const queue = [sticky];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      cluster.push(current);

      // Find neighbors within threshold
      for (const other of stickies) {
        if (visited.has(other.id)) continue;
        const dist = distance(current.position, other.position);
        if (dist <= threshold) {
          queue.push(other);
        }
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function calculateCentroid(stickies: StickyNote[]): { x: number; y: number } {
  const sum = stickies.reduce(
    (acc, s) => ({ x: acc.x + s.position.x, y: acc.y + s.position.y }),
    { x: 0, y: 0 }
  );
  return {
    x: sum.x / stickies.length,
    y: sum.y / stickies.length,
  };
}
