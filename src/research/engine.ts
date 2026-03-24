/**
 * Research Engine — Transforms raw qualitative/quantitative data
 * into structured, actionable research artifacts.
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";
import { createLogger } from "../engine/logger.js";
import type { NocheEvent } from "../engine/core.js";
import { parseExcel } from "./excel-parser.js";
import { clusterStickies, extractThemes, type ParsedResearch } from "../figma/stickies.js";
import type { StickyNote } from "../figma/bridge.js";

export interface ResearchConfig {
  outputDir: string;
  onEvent?: (event: NocheEvent) => void;
}

export interface ResearchInsight {
  id: string;
  finding: string;
  confidence: "high" | "medium" | "low";
  source: string;
  evidence: string[];
  tags: string[];
  createdAt: string;
}

export interface ResearchPersona {
  name: string;
  role: string;
  goals: string[];
  painPoints: string[];
  behaviors: string[];
  source: string;
}

export interface ResearchTheme {
  name: string;
  description: string;
  insights: string[]; // insight IDs
  frequency: number;
}

export interface ResearchStore {
  insights: ResearchInsight[];
  personas: ResearchPersona[];
  themes: ResearchTheme[];
  sources: { name: string; type: string; processedAt: string }[];
}

export class ResearchEngine {
  private log = createLogger("research");
  private config: ResearchConfig;
  private store: ResearchStore = {
    insights: [],
    personas: [],
    themes: [],
    sources: [],
  };
  private insightCounter = 0;

  constructor(config: ResearchConfig) {
    this.config = config;
  }

  async load(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });

    try {
      const raw = await readFile(join(this.config.outputDir, "insights.json"), "utf-8");
      this.store = JSON.parse(raw);
      this.insightCounter = this.store.insights.length;
    } catch {
      // Fresh start
    }
  }

  /**
   * Process FigJam stickies into research insights.
   */
  async fromStickies(stickies: StickyNote[]): Promise<ParsedResearch> {
    this.emitEvent("info", `Processing ${stickies.length} stickies...`);

    const parsed = clusterStickies(stickies);
    const themes = extractThemes(parsed.clusters);

    // Convert themes to insights
    for (const theme of themes) {
      this.addInsight({
        finding: `Theme: ${theme.theme}`,
        confidence: theme.evidence.length >= 5 ? "high" : theme.evidence.length >= 3 ? "medium" : "low",
        source: "figjam-stickies",
        evidence: theme.evidence,
        tags: ["stickies", "qualitative"],
      });
    }

    // Also capture individual noteworthy stickies
    for (const sticky of stickies) {
      if (sticky.text.length > 50) {
        this.addInsight({
          finding: sticky.text,
          confidence: "low",
          source: "figjam-sticky",
          evidence: [sticky.text],
          tags: ["stickies", "raw-note"],
        });
      }
    }

    await this.save();
    this.emitEvent("success", `Processed ${stickies.length} stickies into ${themes.length} themes`);

    return parsed;
  }

  /**
   * Process an Excel/CSV file into research data.
   */
  async fromFile(filePath: string): Promise<void> {
    this.emitEvent("info", `Processing file: ${filePath}`);

    const data = await parseExcel(filePath);

    // Each row becomes potential evidence
    // Headers hint at the data type
    const headers = data.headers.map((h) => h.toLowerCase());

    // Detect common research data patterns
    const hasResponseCol = headers.some((h) =>
      h.includes("response") || h.includes("answer") || h.includes("feedback") || h.includes("comment")
    );
    const hasRatingCol = headers.some((h) =>
      h.includes("rating") || h.includes("score") || h.includes("nps") || h.includes("satisfaction")
    );
    const hasUserCol = headers.some((h) =>
      h.includes("user") || h.includes("participant") || h.includes("name") || h.includes("respondent")
    );

    if (hasResponseCol) {
      const responseIdx = headers.findIndex((h) =>
        h.includes("response") || h.includes("answer") || h.includes("feedback") || h.includes("comment")
      );

      const responses = data.rows
        .map((row) => String(row[responseIdx] ?? ""))
        .filter((r) => r.length > 10);

      this.addInsight({
        finding: `${responses.length} qualitative responses collected from "${data.sheetName}"`,
        confidence: responses.length > 20 ? "high" : "medium",
        source: filePath,
        evidence: responses.slice(0, 20),
        tags: ["survey", "qualitative"],
      });
    }

    if (hasRatingCol) {
      const ratingIdx = headers.findIndex((h) =>
        h.includes("rating") || h.includes("score") || h.includes("nps") || h.includes("satisfaction")
      );

      const ratings = data.rows
        .map((row) => Number(row[ratingIdx]))
        .filter((r) => !isNaN(r));

      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        const min = Math.min(...ratings);
        const max = Math.max(...ratings);

        this.addInsight({
          finding: `Average rating: ${avg.toFixed(1)} (range: ${min}-${max}, n=${ratings.length})`,
          confidence: ratings.length > 30 ? "high" : "medium",
          source: filePath,
          evidence: [`Mean: ${avg.toFixed(2)}`, `Min: ${min}`, `Max: ${max}`, `N: ${ratings.length}`],
          tags: ["survey", "quantitative"],
        });
      }
    }

    this.store.sources.push({
      name: filePath,
      type: "excel",
      processedAt: new Date().toISOString(),
    });

    await this.save();
    this.emitEvent("success", `Processed ${data.rows.length} rows from "${data.sheetName}"`);
  }

  /**
   * Synthesize all research into unified themes and personas.
   */
  async synthesize(): Promise<{ themes: ResearchTheme[]; summary: string }> {
    this.emitEvent("info", "Synthesizing research...");

    // Group insights by tags
    const tagGroups = new Map<string, ResearchInsight[]>();
    for (const insight of this.store.insights) {
      for (const tag of insight.tags) {
        const group = tagGroups.get(tag) ?? [];
        group.push(insight);
        tagGroups.set(tag, group);
      }
    }

    // Generate themes from tag groups
    const themes: ResearchTheme[] = [];
    for (const [tag, insights] of tagGroups) {
      if (insights.length >= 2) {
        themes.push({
          name: tag,
          description: `${insights.length} findings related to "${tag}"`,
          insights: insights.map((i) => i.id),
          frequency: insights.length,
        });
      }
    }

    themes.sort((a, b) => b.frequency - a.frequency);
    this.store.themes = themes;

    await this.save();

    const summary = [
      `Synthesized ${this.store.insights.length} insights into ${themes.length} themes`,
      `from ${this.store.sources.length} sources.`,
      themes.length > 0 ? `Top theme: "${themes[0].name}" (${themes[0].frequency} findings)` : "",
    ].filter(Boolean).join(" ");

    this.emitEvent("success", summary);
    return { themes, summary };
  }

  /**
   * Generate a formatted markdown research report.
   */
  async generateReport(): Promise<string> {
    const lines: string[] = [
      "# Research Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Sources: ${this.store.sources.length}`,
      `Total Insights: ${this.store.insights.length}`,
      `Themes: ${this.store.themes.length}`,
      "",
      "---",
      "",
    ];

    // Themes section
    if (this.store.themes.length > 0) {
      lines.push("## Themes", "");
      for (const theme of this.store.themes) {
        lines.push(`### ${theme.name}`);
        lines.push(`${theme.description}`);
        lines.push(`Frequency: ${theme.frequency} findings`);
        lines.push("");
      }
    }

    // High-confidence insights
    const highConf = this.store.insights.filter((i) => i.confidence === "high");
    if (highConf.length > 0) {
      lines.push("## Key Findings (High Confidence)", "");
      for (const insight of highConf) {
        lines.push(`- **${insight.finding}**`);
        lines.push(`  Source: ${insight.source}`);
        if (insight.evidence.length > 0) {
          lines.push(`  Evidence: "${insight.evidence[0]}"`);
        }
        lines.push("");
      }
    }

    // All insights
    lines.push("## All Insights", "");
    for (const insight of this.store.insights) {
      lines.push(`- [${insight.confidence}] ${insight.finding} (${insight.source})`);
    }

    // Sources
    lines.push("", "## Sources", "");
    for (const source of this.store.sources) {
      lines.push(`- ${source.name} (${source.type}, processed ${source.processedAt})`);
    }

    const report = lines.join("\n");
    const reportPath = join(this.config.outputDir, "reports", "report.md");
    await mkdir(join(this.config.outputDir, "reports"), { recursive: true });
    await writeFile(reportPath, report);

    return report;
  }

  getInsights(): ResearchInsight[] {
    return this.store.insights;
  }

  getStore(): ResearchStore {
    return this.store;
  }

  // ── Private ──────────────────────────────────────────────

  private addInsight(data: Omit<ResearchInsight, "id" | "createdAt">): ResearchInsight {
    const insight: ResearchInsight = {
      ...data,
      id: `insight-${++this.insightCounter}`,
      createdAt: new Date().toISOString(),
    };
    this.store.insights.push(insight);
    return insight;
  }

  private async save(): Promise<void> {
    await mkdir(this.config.outputDir, { recursive: true });
    await writeFile(
      join(this.config.outputDir, "insights.json"),
      JSON.stringify(this.store, null, 2)
    );
    await this.writeMarkdownNotes();
  }

  /**
   * Write individual markdown note files for each insight,
   * Obsidian/Notion-style with frontmatter and wikilinks.
   */
  private async writeMarkdownNotes(): Promise<void> {
    const notesDir = join(this.config.outputDir, "notes");
    await mkdir(notesDir, { recursive: true });

    // Write insight notes
    for (const insight of this.store.insights) {
      const slug = insight.id;
      const confidence = insight.confidence;
      const icon = confidence === "high" ? "■" : confidence === "medium" ? "◧" : "□";
      const lines = [
        "---",
        `id: ${insight.id}`,
        `confidence: ${confidence}`,
        `source: ${insight.source}`,
        `tags: [${insight.tags.map(t => `"${t}"`).join(", ")}]`,
        `created: ${insight.createdAt}`,
        "---",
        "",
        `# ${icon} ${insight.finding}`,
        "",
        `**Confidence:** ${confidence}`,
        `**Source:** ${insight.source}`,
        "",
      ];

      if (insight.evidence.length > 0) {
        lines.push("## Evidence", "");
        for (const e of insight.evidence) {
          lines.push(`> ${e}`, "");
        }
      }

      if (insight.tags.length > 0) {
        lines.push("## Tags", "");
        lines.push(insight.tags.map(t => `\`${t}\``).join(" "), "");
      }

      // Wikilinks to related themes
      const relatedThemes = this.store.themes.filter(th => th.insights.includes(insight.id));
      if (relatedThemes.length > 0) {
        lines.push("## Related Themes", "");
        for (const theme of relatedThemes) {
          lines.push(`- [[theme-${theme.name}]]`);
        }
        lines.push("");
      }

      await writeFile(join(notesDir, `${slug}.md`), lines.join("\n"));
    }

    // Write theme notes
    for (const theme of this.store.themes) {
      const lines = [
        "---",
        `type: theme`,
        `name: ${theme.name}`,
        `frequency: ${theme.frequency}`,
        "---",
        "",
        `# ${theme.name}`,
        "",
        theme.description,
        "",
        "## Linked Insights", "",
      ];

      for (const insightId of theme.insights) {
        const insight = this.store.insights.find(i => i.id === insightId);
        if (insight) {
          lines.push(`- [[${insightId}]] — ${insight.finding}`);
        }
      }
      lines.push("");

      await writeFile(join(notesDir, `theme-${theme.name}.md`), lines.join("\n"));
    }

    // Write persona notes
    for (const persona of this.store.personas) {
      const slug = persona.name.toLowerCase().replace(/\s+/g, "-");
      const lines = [
        "---",
        `type: persona`,
        `name: ${persona.name}`,
        `role: ${persona.role}`,
        "---",
        "",
        `# ${persona.name}`,
        "",
        `**Role:** ${persona.role}`,
        `**Source:** ${persona.source}`,
        "",
      ];

      if (persona.goals.length > 0) {
        lines.push("## Goals", "");
        persona.goals.forEach(g => lines.push(`- ${g}`));
        lines.push("");
      }
      if (persona.painPoints.length > 0) {
        lines.push("## Pain Points", "");
        persona.painPoints.forEach(p => lines.push(`- ${p}`));
        lines.push("");
      }
      if (persona.behaviors.length > 0) {
        lines.push("## Behaviors", "");
        persona.behaviors.forEach(b => lines.push(`- ${b}`));
        lines.push("");
      }

      await writeFile(join(notesDir, `persona-${slug}.md`), lines.join("\n"));
    }

    this.log.info({ notes: this.store.insights.length + this.store.themes.length + this.store.personas.length }, "Markdown notes written");
  }

  private emitEvent(type: NocheEvent["type"], message: string): void {
    this.config.onEvent?.({
      type,
      source: "research",
      message,
      timestamp: new Date(),
    });
  }
}
