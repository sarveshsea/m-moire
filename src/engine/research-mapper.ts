/**
 * ResearchMapper — Maps research insights to design spec requirements.
 *
 * Analyzes user research findings and generates concrete accessibility,
 * UX, and interaction requirements that should be added to component
 * and page specs.
 */

import { createLogger } from "./logger.js";
import type { ResearchInsight, ResearchPersona, ResearchTheme, ResearchStore } from "../research/engine.js";
import type { ComponentSpec, PageSpec, AnySpec } from "../specs/types.js";

const log = createLogger("research-mapper");

// ── Types ──────────────────────────────────────────────────

export interface SpecRequirement {
  source: "research";
  insightId: string;
  finding: string;
  requirement: string;
  category: "accessibility" | "ux" | "interaction" | "content" | "performance";
  priority: "must" | "should" | "could";
  targetSpecs: string[];
}

export interface ResearchMapping {
  requirements: SpecRequirement[];
  unmapped: ResearchInsight[];
  coverage: number; // 0-1 ratio of insights that map to specs
}

// ── Keyword → Requirement Rules ────────────────────────────

interface MappingRule {
  keywords: RegExp;
  category: SpecRequirement["category"];
  priority: SpecRequirement["priority"];
  generateRequirement: (finding: string) => string;
  targetPattern?: RegExp;
}

const MAPPING_RULES: MappingRule[] = [
  // Accessibility insights
  {
    keywords: /confus|unclear|hard to (read|find|see)|can'?t (read|see|find)|low contrast|small (text|font)/i,
    category: "accessibility",
    priority: "must",
    generateRequirement: (f) => `Improve readability: ensure minimum 4.5:1 contrast ratio and 16px body text. Research finding: "${truncate(f)}"`,
  },
  {
    keywords: /color.?blind|color.?deficien|distinguish|color.?only|can'?t tell.*apart/i,
    category: "accessibility",
    priority: "must",
    generateRequirement: (f) => `Add non-color indicators (icons, patterns, labels) — color-independent information. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /keyboard|tab (key|order|through)|focus|screen.?reader|assistive|voiceover|narrator/i,
    category: "accessibility",
    priority: "must",
    generateRequirement: (f) => `Ensure full keyboard navigation and screen reader support. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /touch|tap|finger|mobile.*(small|tiny|hard)|fat.?finger/i,
    category: "accessibility",
    priority: "must",
    generateRequirement: (f) => `Minimum 44x44px touch targets per WCAG 2.5.8. Finding: "${truncate(f)}"`,
  },

  // UX insights
  {
    keywords: /lost|where am i|navigate|navigation|breadcrumb|back button|find.*way/i,
    category: "ux",
    priority: "must",
    generateRequirement: (f) => `Add clear navigation landmarks and wayfinding (breadcrumbs, current location indicator). Finding: "${truncate(f)}"`,
    targetPattern: /page|layout|nav|header|sidebar/i,
  },
  {
    keywords: /slow|loading|wait|spinner|took too long|performance|lag/i,
    category: "performance",
    priority: "should",
    generateRequirement: (f) => `Add loading states and skeleton screens for perceived performance. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /overwhelming|too much|cluttered|information overload|too many/i,
    category: "ux",
    priority: "should",
    generateRequirement: (f) => `Reduce visual density: progressive disclosure, collapsible sections, clear hierarchy. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /error|mistake|wrong|undo|accident|recover/i,
    category: "interaction",
    priority: "must",
    generateRequirement: (f) => `Add clear error messages, undo support, and confirmation for destructive actions. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /search|filter|sort|find.*specific|look for/i,
    category: "interaction",
    priority: "should",
    generateRequirement: (f) => `Add search, filter, and sort capabilities for content discovery. Finding: "${truncate(f)}"`,
    targetPattern: /table|list|grid|catalog|directory/i,
  },
  {
    keywords: /inconsisten|different.*place|behave.*different|expect/i,
    category: "ux",
    priority: "should",
    generateRequirement: (f) => `Ensure consistent component behavior and placement across pages. Finding: "${truncate(f)}"`,
  },

  // Content insights
  {
    keywords: /jargon|technical|don'?t understand|confusing.*term|what does.*mean/i,
    category: "content",
    priority: "should",
    generateRequirement: (f) => `Use plain language; add tooltips or glossary for technical terms. Finding: "${truncate(f)}"`,
  },
  {
    keywords: /notification|alert|inform|aware|update|status/i,
    category: "interaction",
    priority: "should",
    generateRequirement: (f) => `Add aria-live regions for dynamic status updates and notifications. Finding: "${truncate(f)}"`,
  },
];

// ── Mapping Logic ──────────────────────────────────────────

/**
 * Map research insights to spec requirements.
 * Returns requirements that should be added to existing specs.
 */
export function mapResearchToSpecs(store: ResearchStore, specs: AnySpec[]): ResearchMapping {
  const requirements: SpecRequirement[] = [];
  const mapped = new Set<string>();

  for (const insight of store.insights) {
    for (const rule of MAPPING_RULES) {
      if (!rule.keywords.test(insight.finding)) continue;

      // Find target specs
      const targets = findTargetSpecs(insight, rule, specs);
      if (targets.length === 0) {
        // No specific target — apply to all components/pages
        targets.push("*");
      }

      requirements.push({
        source: "research",
        insightId: insight.id,
        finding: insight.finding,
        requirement: rule.generateRequirement(insight.finding),
        category: rule.category,
        priority: rule.priority,
        targetSpecs: targets,
      });

      mapped.add(insight.id);
      break; // First matching rule wins per insight
    }
  }

  const unmapped = store.insights.filter((i) => !mapped.has(i.id));
  const coverage = store.insights.length > 0 ? mapped.size / store.insights.length : 1;

  log.info({ total: store.insights.length, mapped: mapped.size, unmapped: unmapped.length }, "Research mapping complete");

  return { requirements, unmapped, coverage };
}

/** Find which specs an insight + rule should target. */
function findTargetSpecs(insight: ResearchInsight, rule: MappingRule, specs: AnySpec[]): string[] {
  const targets: string[] = [];

  for (const spec of specs) {
    // Match by rule's target pattern
    if (rule.targetPattern && rule.targetPattern.test(spec.name)) {
      targets.push(spec.name);
      continue;
    }

    // Match by insight tags overlapping with spec tags
    const specTags = "tags" in spec ? (spec as { tags: string[] }).tags : [];
    const overlap = insight.tags.some((t) => specTags.includes(t));
    if (overlap) {
      targets.push(spec.name);
      continue;
    }

    // Match by insight finding mentioning the spec name
    if (insight.finding.toLowerCase().includes(spec.name.toLowerCase())) {
      targets.push(spec.name);
    }
  }

  return targets;
}

/** Generate a research-backed accessibility checklist for a spec. */
export function generateA11yChecklist(spec: AnySpec, requirements: SpecRequirement[]): string[] {
  const relevant = requirements.filter(
    (r) => r.targetSpecs.includes(spec.name) || r.targetSpecs.includes("*"),
  );

  const checklist: string[] = [];

  for (const req of relevant) {
    const prefix = req.priority === "must" ? "[MUST]" : req.priority === "should" ? "[SHOULD]" : "[COULD]";
    checklist.push(`${prefix} ${req.requirement}`);
  }

  return checklist;
}

/** Map persona pain points to design requirements. */
export function mapPersonaRequirements(personas: ResearchPersona[]): SpecRequirement[] {
  const requirements: SpecRequirement[] = [];

  for (const persona of personas) {
    for (const painPoint of persona.painPoints) {
      for (const rule of MAPPING_RULES) {
        if (rule.keywords.test(painPoint)) {
          requirements.push({
            source: "research",
            insightId: `persona:${persona.name}`,
            finding: painPoint,
            requirement: rule.generateRequirement(painPoint),
            category: rule.category,
            priority: rule.priority,
            targetSpecs: ["*"],
          });
          break;
        }
      }
    }
  }

  return requirements;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
