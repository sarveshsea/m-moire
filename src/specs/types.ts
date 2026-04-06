/**
 * Spec Type Definitions — The foundation of Mémoire's spec-driven approach.
 * Every component, page, and dataviz starts as a spec.
 */

import { z } from "zod";

// ── WCAG Helpers ────────────────────────────────────────────────

/**
 * Parse a CSS length string to a px number.
 * Supports: "16px", "1rem", "0.125rem". Returns NaN for unrecognised units.
 */
function parsePxValue(val: string): number {
  const trimmed = val.trim().toLowerCase();
  const remMatch = trimmed.match(/^([\d.]+)rem$/);
  if (remMatch) return parseFloat(remMatch[1]) * 16;
  const pxMatch = trimmed.match(/^([\d.]+)px$/);
  if (pxMatch) return parseFloat(pxMatch[1]);
  return NaN;
}

/**
 * Parse a pixel dimension string like "24x24" or "44x44".
 * Returns null when the format is unrecognised.
 */
function parsePixelDimension(val: string): { w: number; h: number } | null {
  const m = val.trim().toLowerCase().match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

/**
 * WA-201 helper — parse any valid touchTarget value into pixel dimensions
 * and WCAG compliance booleans.
 *
 * @param value - "default" | "min-24" | "min-44" | "WxH" (e.g. "32x32")
 */
export function parseTouchTarget(value: string): {
  w: number;
  h: number;
  meetsAA: boolean;
  meetsAAA: boolean;
} {
  // Named aliases
  if (value === "default" || value === "min-24") {
    return { w: 24, h: 24, meetsAA: true, meetsAAA: false };
  }
  if (value === "min-44") {
    return { w: 44, h: 44, meetsAA: true, meetsAAA: true };
  }
  // Pixel dimension strings like "32x32"
  const dims = parsePixelDimension(value);
  if (dims) {
    const meetsAA = dims.w >= 24 && dims.h >= 24;
    const meetsAAA = dims.w >= 44 && dims.h >= 44;
    return { ...dims, meetsAA, meetsAAA };
  }
  // Fallback — unknown format treated as non-compliant
  return { w: 0, h: 0, meetsAA: false, meetsAAA: false };
}

/**
 * WA-201 — touchTarget Zod schema.
 * Accepts named aliases ("default", "min-24", "min-44") and pixel strings
 * ("24x24", "44x44", "32x32"). Rejects any dimension below 24px.
 */
const TouchTargetSchema = z
  .union([
    // Named aliases — always valid
    z.enum(["default", "min-24", "min-44"]),
    // Pixel dimension strings — validated against WCAG 2.5.8 AA (24px minimum)
    z.string().refine(
      (val) => {
        const dims = parsePixelDimension(val);
        if (!dims) return false; // must match WxH format to be accepted here
        return dims.w >= 24 && dims.h >= 24;
      },
      {
        message: "touchTarget must be at least 24\u00d724px to meet WCAG 2.5.8 AA",
      }
    ),
  ])
  .describe(
    "WCAG 2.5.8 AA requires \u226524\u00d724px; WCAG 2.5.5 AAA requires \u226544\u00d744px. " +
    "Accepts: \"default\", \"min-24\", \"min-44\", or pixel strings like \"32x32\"."
  );

/**
 * WA-202 — focusStyle values (unchanged enum members) plus sibling fields.
 * focusWidth: CSS length \u22652px per WCAG 2.4.11.
 * focusContrastRatio: min 3:1 per WCAG 2.4.11.
 */
const FocusWidthSchema = z
  .string()
  .refine(
    (val) => {
      const px = parsePxValue(val);
      return !isNaN(px) && px >= 2;
    },
    { message: "Focus indicator must be at least 2px wide to meet WCAG 2.4.11" }
  )
  .describe("CSS length for focus ring width — min 2px per WCAG 2.4.11 (e.g. \"2px\", \"0.125rem\")");

/**
 * WA-203 — colorContrast assertion block.
 * Declarative intent field; the audit command verifies the actual ratio.
 */
const ColorContrastSchema = z
  .object({
    foreground: z.string().optional().describe("Foreground colour (hex or CSS variable)"),
    background: z.string().optional().describe("Background colour (hex or CSS variable)"),
    minimumLevel: z.enum(["AA", "AAA"]).default("AA").describe("Required WCAG contrast level"),
    assertedRatio: z.number().optional().describe("Documented contrast ratio — verified by audit command"),
  })
  .optional()
  .describe("WCAG 1.4.3/1.4.6 colour-contrast assertion — for documentation; verified at audit time");

// ── Component Spec ──────────────────────────────────────────────

export const AtomicLevelSchema = z.enum(["atom", "molecule", "organism", "template"]).describe(
  "Atomic Design level — atoms are primitives, molecules compose atoms, organisms compose molecules, templates define page layouts"
);

export type AtomicLevel = z.infer<typeof AtomicLevelSchema>;

export const CodeConnectSchema = z.object({
  figmaNodeId: z.string().optional().describe("Figma component node ID"),
  codebasePath: z.string().optional().describe("Path to codebase component (e.g., src/components/ui/button.tsx)"),
  props: z.record(z.string()).default({}).describe("Figma property → code prop mapping"),
  mapped: z.boolean().default(false),
}).describe("Code Connect mapping between Figma component and codebase");

export const ComponentSpecSchema = z.object({
  name: z.string(),
  type: z.literal("component"),
  level: AtomicLevelSchema.default("atom").describe("Atomic Design level"),
  purpose: z.string().describe("What this component does and why it exists"),
  researchBacking: z.array(z.string()).default([]).describe("References to research findings"),
  designTokens: z.object({
    source: z.enum(["figma", "manual", "none"]).default("none"),
    mapped: z.boolean().default(false),
  }).default({}),
  variants: z.array(z.string()).default(["default"]),
  props: z.record(z.string()).default({}).describe("Prop name → type string"),
  shadcnBase: z.array(z.string()).default([]).describe("Which shadcn components to build on"),
  composesSpecs: z.array(z.string()).default([]).describe("Names of component specs this composes (for molecules/organisms)"),
  codeConnect: CodeConnectSchema.default({}).describe("Code Connect mapping to Figma"),
  accessibility: z.object({
    role: z.string().optional().describe("ARIA role (e.g. 'button', 'dialog', 'tablist')"),
    ariaLabel: z.enum(["required", "optional", "none"]).default("optional").describe("Whether aria-label is required for this component"),
    keyboardNav: z.boolean().default(false).describe("Whether component needs keyboard navigation beyond Tab"),
    // WA-202: focusStyle keeps the same enum values; focusWidth and focusContrastRatio are new
    focusStyle: z.enum(["outline", "ring", "custom", "none"]).default("outline").describe("Focus indicator style — must meet WCAG 2.4.11"),
    focusWidth: FocusWidthSchema.default("2px").describe("Focus ring width — min 2px per WCAG 2.4.11"),
    focusContrastRatio: z.number().min(3, "Focus indicator contrast ratio must be at least 3:1 to meet WCAG 2.4.11").optional().describe("Contrast ratio of focus indicator against adjacent background — min 3:1 per WCAG 2.4.11"),
    // WA-201: touchTarget replaced with rich union validator
    touchTarget: TouchTargetSchema.default("default").describe("Minimum touch target size — 24px for AA (WCAG 2.5.8), 44px for AAA (WCAG 2.5.5)"),
    reducedMotion: z.boolean().default(false).describe("Whether component has animations that need prefers-reduced-motion handling"),
    liveRegion: z.enum(["off", "polite", "assertive"]).default("off").describe("aria-live behavior for dynamic content updates"),
    colorIndependent: z.boolean().default(true).describe("Whether info is conveyed without relying solely on color (WCAG 1.4.1)"),
    // WA-203: declarative colour-contrast assertion
    colorContrast: ColorContrastSchema,
  }).default({}),
  dataviz: z.string().nullable().default(null).describe("Linked dataviz spec name if this is a chart wrapper"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;

// ── Page Spec ───────────────────────────────────────────────────

export const SectionSchema = z.object({
  name: z.string(),
  component: z.string().describe("Component spec name"),
  repeat: z.number().default(1),
  layout: z.enum([
    "full-width", "half", "third", "quarter",
    "grid-2", "grid-3", "grid-4",
    "stack", "inline",
  ]).default("full-width"),
  props: z.record(z.unknown()).default({}),
});

export const PageSpecSchema = z.object({
  name: z.string(),
  type: z.literal("page"),
  purpose: z.string(),
  researchBacking: z.array(z.string()).default([]),
  layout: z.enum([
    "sidebar-main", "full-width", "centered",
    "split", "dashboard", "marketing",
  ]).default("full-width"),
  sections: z.array(SectionSchema).default([]),
  shadcnLayout: z.array(z.string()).default([]).describe("shadcn layout components used"),
  responsive: z.object({
    mobile: z.string().default("stack"),
    tablet: z.string().default("grid-2"),
    desktop: z.string().default("grid-4"),
  }).default({}),
  meta: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).default({}),
  accessibility: z.object({
    landmarks: z.boolean().default(true).describe("Whether page uses semantic landmarks (main, nav, aside, header, footer)"),
    skipLink: z.boolean().default(true).describe("Whether page includes 'Skip to main content' link"),
    headingHierarchy: z.boolean().default(true).describe("Whether heading levels are sequential (h1 > h2 > h3)"),
    pageTitle: z.string().optional().describe("Accessible page title — must be unique and descriptive (WCAG 2.4.2)"),
    language: z.string().default("en").describe("Page lang attribute (WCAG 3.1.1)"),
    consistentNav: z.boolean().default(true).describe("Navigation appears in same order across pages (WCAG 3.2.3)"),
    consistentHelp: z.boolean().default(true).describe("Help mechanisms in same relative position (WCAG 3.2.6 — new in 2.2)"),
  }).default({}),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type PageSpec = z.infer<typeof PageSpecSchema>;

// ── DataViz Spec ────────────────────────────────────────────────

export const DataVizSpecSchema = z.object({
  name: z.string(),
  type: z.literal("dataviz"),
  purpose: z.string(),
  chartType: z.enum([
    "line", "bar", "area", "pie", "donut",
    "scatter", "radar", "treemap", "funnel",
    "heatmap", "sankey", "gauge", "sparkline",
    "composed", "custom",
  ]),
  library: z.enum(["recharts", "d3", "visx", "custom"]).default("recharts"),
  dataShape: z.object({
    x: z.string().describe("X-axis data type"),
    y: z.string().describe("Y-axis data type"),
    series: z.array(z.string()).optional().describe("Multi-series field names"),
    groupBy: z.string().optional(),
  }),
  interactions: z.array(z.enum([
    "hover-tooltip", "click", "zoom", "brush",
    "pan", "legend-toggle", "crosshair",
    "drill-down", "export",
  ])).default(["hover-tooltip"]),
  accessibility: z.object({
    altText: z.enum(["required", "optional"]).default("required").describe("Whether chart has descriptive alt text (WCAG 1.1.1)"),
    keyboardNav: z.boolean().default(true).describe("Whether chart supports keyboard interaction (focus data points, navigate series)"),
    dataTableFallback: z.boolean().default(true).describe("Whether a <details> table alternative is rendered for screen readers"),
    patternFill: z.boolean().default(false).describe("Whether series use patterns in addition to colors for color-blind users (WCAG 1.4.1)"),
    announceUpdates: z.boolean().default(false).describe("Whether data changes are announced via aria-live region"),
    highContrastMode: z.boolean().default(false).describe("Whether chart supports a high-contrast rendering mode"),
  }).default({}),
  responsive: z.object({
    mobile: z.object({
      height: z.number().default(200),
      simplify: z.boolean().default(true),
    }).default({}),
    desktop: z.object({
      height: z.number().default(400),
    }).default({}),
  }).default({}),
  shadcnWrapper: z.string().default("Card").describe("shadcn component wrapping the chart"),
  sampleData: z.array(z.record(z.unknown())).optional().describe("Sample data for preview"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type DataVizSpec = z.infer<typeof DataVizSpecSchema>;

// ── Design Spec ─────────────────────────────────────────────────

export const SpacingNoteSchema = z.object({
  target: z.string().describe("Element or area this applies to"),
  padding: z.object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  }).optional(),
  margin: z.object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  }).optional(),
  gap: z.number().optional(),
  unit: z.enum(["px", "rem", "em"]).default("px"),
});

export const InteractionNoteSchema = z.object({
  trigger: z.enum(["click", "hover", "focus", "scroll", "drag", "long-press", "swipe", "keypress"]),
  target: z.string().describe("Element that triggers the interaction"),
  action: z.string().describe("What happens when triggered"),
  animation: z.object({
    type: z.enum(["fade", "slide", "scale", "rotate", "spring", "none"]).default("none"),
    duration: z.number().default(200).describe("Duration in ms"),
    easing: z.string().default("ease-out"),
  }).optional(),
  state: z.string().optional().describe("State change: e.g. 'expanded', 'selected', 'disabled'"),
});

export const DimensionSchema = z.object({
  width: z.union([z.number(), z.string()]).describe("Width in px or responsive value like '100%'"),
  height: z.union([z.number(), z.string()]).describe("Height in px or responsive value"),
  minWidth: z.union([z.number(), z.string()]).optional(),
  maxWidth: z.union([z.number(), z.string()]).optional(),
  minHeight: z.union([z.number(), z.string()]).optional(),
  maxHeight: z.union([z.number(), z.string()]).optional(),
});

export const DesignSpecSchema = z.object({
  name: z.string(),
  type: z.literal("design"),
  purpose: z.string(),
  sourceNodeId: z.string().optional().describe("Figma node ID this spec was extracted from"),
  dimensions: DimensionSchema.optional(),
  spacing: z.array(SpacingNoteSchema).default([]),
  interactions: z.array(InteractionNoteSchema).default([]),
  typography: z.array(z.object({
    element: z.string().describe("Element name or selector"),
    fontFamily: z.string().optional(),
    fontSize: z.number().optional(),
    fontWeight: z.union([z.number(), z.string()]).optional(),
    lineHeight: z.union([z.number(), z.string()]).optional(),
    letterSpacing: z.number().optional(),
    color: z.string().optional(),
  })).default([]),
  colors: z.array(z.object({
    name: z.string(),
    value: z.string().describe("Hex, HSL, or CSS variable"),
    usage: z.string().optional().describe("Where this color is used"),
  })).default([]),
  borderRadius: z.record(z.number()).default({}).describe("Element → radius in px"),
  shadows: z.array(z.object({
    element: z.string(),
    value: z.string().describe("CSS box-shadow value"),
  })).default([]),
  breakpoints: z.object({
    mobile: z.object({ width: z.number(), notes: z.string().optional() }).optional(),
    tablet: z.object({ width: z.number(), notes: z.string().optional() }).optional(),
    desktop: z.object({ width: z.number(), notes: z.string().optional() }).optional(),
  }).optional(),
  notes: z.array(z.string()).default([]).describe("Freeform design notes"),
  linkedSpecs: z.array(z.string()).default([]).describe("Related component/page spec names"),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type DesignSpec = z.infer<typeof DesignSpecSchema>;

// ── IA (Information Architecture) Spec ──────────────────────────

export interface IANode {
  id: string;
  label: string;
  type: "page" | "section" | "frame" | "group" | "overlay" | "modal" | "external";
  figmaNodeId?: string;
  linkedPageSpec?: string;
  children: IANode[];
  notes?: string;
}

export const IANodeSchema: z.ZodType<IANode> = z.lazy(() =>
  z.object({
    id: z.string().describe("Unique identifier (Figma page/frame ID or generated)"),
    label: z.string().describe("Display name"),
    type: z.enum(["page", "section", "frame", "group", "overlay", "modal", "external"]),
    figmaNodeId: z.string().optional().describe("Linked Figma node ID"),
    linkedPageSpec: z.string().optional().describe("Name of a PageSpec this maps to"),
    children: z.array(z.lazy(() => IANodeSchema)).default([]),
    notes: z.string().optional(),
  }) as unknown as z.ZodType<IANode>
);

export const IAFlowSchema = z.object({
  from: z.string().describe("Source node ID"),
  to: z.string().describe("Target node ID"),
  label: z.string().optional().describe("Transition label (e.g. 'click CTA')"),
  trigger: z.enum(["click", "navigate", "redirect", "scroll", "auto", "back"]).default("navigate"),
  condition: z.string().optional().describe("Guard condition (e.g. 'authenticated')"),
});

export type IAFlow = z.infer<typeof IAFlowSchema>;

export const IASpecSchema = z.object({
  name: z.string(),
  type: z.literal("ia"),
  purpose: z.string(),
  sourceFileKey: z.string().optional().describe("Figma file key this IA was extracted from"),
  root: IANodeSchema.describe("Root of the site/app hierarchy"),
  flows: z.array(IAFlowSchema).default([]).describe("Navigation flows between nodes"),
  entryPoints: z.array(z.string()).default([]).describe("Node IDs that serve as entry points"),
  globals: z.array(z.object({
    label: z.string(),
    nodeId: z.string().optional(),
    linkedPageSpec: z.string().optional(),
  })).default([]).describe("Global nav items (header, footer, sidebar links)"),
  notes: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
});

export type IASpec = z.infer<typeof IASpecSchema>;

// ── Union Type ──────────────────────────────────────────────────

export type AnySpec = ComponentSpec | PageSpec | DataVizSpec | DesignSpec | IASpec;

export function isComponentSpec(spec: AnySpec): spec is ComponentSpec {
  return spec.type === "component";
}

export function isPageSpec(spec: AnySpec): spec is PageSpec {
  return spec.type === "page";
}

export function isDataVizSpec(spec: AnySpec): spec is DataVizSpec {
  return spec.type === "dataviz";
}

export function isDesignSpec(spec: AnySpec): spec is DesignSpec {
  return spec.type === "design";
}

export function isIASpec(spec: AnySpec): spec is IASpec {
  return spec.type === "ia";
}
