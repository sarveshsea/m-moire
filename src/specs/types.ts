/**
 * Spec Type Definitions — The foundation of Ark's spec-driven approach.
 * Every component, page, and dataviz starts as a spec.
 */

import { z } from "zod";

// ── Component Spec ──────────────────────────────────────────────

export const ComponentSpecSchema = z.object({
  name: z.string(),
  type: z.literal("component"),
  purpose: z.string().describe("What this component does and why it exists"),
  researchBacking: z.array(z.string()).default([]).describe("References to research findings"),
  designTokens: z.object({
    source: z.enum(["figma", "manual", "none"]).default("none"),
    mapped: z.boolean().default(false),
  }).default({}),
  variants: z.array(z.string()).default(["default"]),
  props: z.record(z.string()).default({}).describe("Prop name → type string"),
  shadcnBase: z.array(z.string()).default([]).describe("Which shadcn components to build on"),
  accessibility: z.object({
    role: z.string().optional(),
    ariaLabel: z.enum(["required", "optional", "none"]).default("optional"),
    keyboardNav: z.boolean().default(false),
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
    altText: z.enum(["required", "optional"]).default("required"),
    keyboardNav: z.boolean().default(true),
    dataTableFallback: z.boolean().default(true),
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
