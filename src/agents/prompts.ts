/**
 * Agent Prompts — Rich, structured prompts for Claude-powered design agents.
 *
 * Each prompt is designed to maximize Claude's reasoning by providing:
 *   1. Clear role and expertise framing
 *   2. Structured context (current state, constraints)
 *   3. Specific deliverables and output format
 *   4. Design system best practices
 *   5. shadcn/ui + Tailwind conventions
 */

import type { DesignToken, DesignSystem, DesignComponent } from "../engine/registry.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec } from "../specs/types.js";
import type { AgentContext } from "./orchestrator.js";

// ── Prompt Builder Helpers ───────────────────────────────

function tokenSummary(tokens: DesignToken[]): string {
  const byType = new Map<string, number>();
  for (const t of tokens) byType.set(t.type, (byType.get(t.type) || 0) + 1);
  return Array.from(byType.entries()).map(([k, v]) => `${v} ${k}`).join(", ");
}

function specSummary(specs: AnySpec[]): string {
  const byType = new Map<string, string[]>();
  for (const s of specs) {
    if (!byType.has(s.type)) byType.set(s.type, []);
    byType.get(s.type)!.push(s.name);
  }
  return Array.from(byType.entries()).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ");
}

function tokenTable(tokens: DesignToken[]): string {
  if (tokens.length === 0) return "(none)";
  return tokens
    .slice(0, 30)
    .map((t) => `  ${t.name}: ${JSON.stringify(Object.values(t.values)[0])} [${t.type}/${t.collection}]`)
    .join("\n");
}

// ── Color Prompts ────────────────────────────────────────

function colorAnalysis(intent: string, colorTokens: DesignToken[]): string {
  return `You are a Senior Color Systems Architect specializing in design system token architecture.

## Task
Analyze the current color token system and identify how to fulfill this request:
"${intent}"

## Current Color Tokens (${colorTokens.length} total)
${tokenTable(colorTokens)}

## Analysis Framework
1. **Semantic Mapping**: Which tokens serve as primary, secondary, accent, background, foreground, muted, destructive, etc.?
2. **Scale Coherence**: Do the colors follow a consistent lightness/saturation scale?
3. **Contrast Compliance**: Which pairs meet WCAG AA (4.5:1) and AAA (7:1) contrast ratios?
4. **Missing Gaps**: What semantic roles are missing? (e.g., no warning color, no success state)
5. **Dark Mode Readiness**: Are there paired light/dark values for each semantic token?

## shadcn/ui Color Convention
shadcn/ui expects these CSS variables:
- --background, --foreground (base)
- --card, --card-foreground
- --popover, --popover-foreground
- --primary, --primary-foreground
- --secondary, --secondary-foreground
- --muted, --muted-foreground
- --accent, --accent-foreground
- --destructive, --destructive-foreground
- --border, --input, --ring
- --chart-1 through --chart-5

## Output
Provide a structured analysis identifying:
1. Current coverage vs shadcn/ui expectations
2. Recommended additions/modifications to fulfill "${intent}"
3. Specific hex values with contrast ratios`;
}

function colorGeneration(intent: string, colorTokens: DesignToken[]): string {
  return `You are a Color Engineer generating design tokens for a shadcn/ui + Tailwind CSS system.

## Request
"${intent}"

## Current Palette
${tokenTable(colorTokens)}

## Requirements
1. Generate tokens as JSON objects: { name, collection, type: "color", values: { "Mode 1": "#hex" }, cssVariable: "--name" }
2. All colors must work in HSL format for Tailwind: "210 40% 98%"
3. Ensure WCAG AA contrast (4.5:1) between foreground/background pairs
4. Follow the 60-30-10 rule: 60% primary/neutral, 30% secondary, 10% accent
5. Support both light and dark modes

## Color Scale Convention
For each base hue, generate a full scale:
- 50 (lightest), 100, 200, 300, 400, 500 (mid), 600, 700, 800, 900, 950 (darkest)

## Output Format
Return an array of DesignToken objects ready for direct insertion into the design system.`;
}

// ── Spacing Prompts ──────────────────────────────────────

function spacingAnalysis(intent: string, spacingTokens: DesignToken[]): string {
  return `You are a Spatial Design Engineer analyzing spacing token architecture.

## Request: "${intent}"

## Current Spacing Tokens (${spacingTokens.length})
${tokenTable(spacingTokens)}

## Analysis
1. **Scale Type**: Is this a linear scale (4, 8, 12, 16...), geometric (2, 4, 8, 16...), or custom?
2. **Base Unit**: What's the base unit? (typically 4px or 8px for modern design systems)
3. **Gaps**: Which spacing values are missing for common use cases?
4. **Tailwind Mapping**: How do these map to Tailwind's spacing scale (0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24...)?

## Recommendation
The ideal spacing system uses a 4px base with these semantic tokens:
- space-xs: 4px (tight elements)
- space-sm: 8px (compact spacing)
- space-md: 16px (default spacing)
- space-lg: 24px (section spacing)
- space-xl: 32px (major sections)
- space-2xl: 48px (page-level)
- space-3xl: 64px (hero sections)`;
}

function spacingGeneration(intent: string, spacingTokens: DesignToken[]): string {
  return `You are a Spacing System Engineer. Generate spacing tokens for: "${intent}"

## Current State
${tokenTable(spacingTokens)}

## Generate
Output DesignToken[] with type: "spacing", values in px units.
Follow a geometric progression with 4px base unit.
Include both raw scale (1-20) and semantic names (xs, sm, md, lg, xl).`;
}

// ── Typography Prompts ───────────────────────────────────

function typographyAnalysis(intent: string, typoTokens: DesignToken[]): string {
  return `You are a Typography Architect designing type systems for web applications.

## Request: "${intent}"

## Current Typography Tokens (${typoTokens.length})
${tokenTable(typoTokens)}

## Type Scale Best Practices
1. **Major Third (1.25)**: 12, 15, 18.75, 23.4, 29.3 — warm, readable
2. **Perfect Fourth (1.333)**: 12, 16, 21.3, 28.4, 37.9 — strong hierarchy
3. **Minor Third (1.2)**: 12, 14.4, 17.3, 20.7, 24.9 — subtle, elegant

## Font Stack Conventions (shadcn/ui)
- --font-sans: system-ui, -apple-system, sans-serif
- --font-mono: 'SF Mono', 'Fira Code', monospace
- Line heights: tight (1.25), normal (1.5), relaxed (1.75)
- Font weights: normal (400), medium (500), semibold (600), bold (700)

## Semantic Typography Tokens
- text-xs: 12px/16px — captions, labels
- text-sm: 14px/20px — body small
- text-base: 16px/24px — body default
- text-lg: 18px/28px — lead text
- text-xl: 20px/28px — h4
- text-2xl: 24px/32px — h3
- text-3xl: 30px/36px — h2
- text-4xl: 36px/40px — h1`;
}

function typographyGeneration(intent: string, typoTokens: DesignToken[]): string {
  return `You are a Typography Engineer. Generate type scale tokens for: "${intent}"

## Current: ${tokenTable(typoTokens)}

Output DesignToken[] with type: "typography".
Include font-size, line-height, font-weight, and letter-spacing values.
Use rem units (1rem = 16px).`;
}

// ── Theme Prompts ────────────────────────────────────────

function themeAnalysis(intent: string, ds: DesignSystem): string {
  return `You are a Theme Systems Architect reviewing a design system for theme modification.

## Request: "${intent}"

## Current Design System
- Tokens: ${tokenSummary(ds.tokens)}
- Components: ${ds.components.map((c) => c.name).join(", ") || "(none)"}
- Styles: ${ds.styles.length} styles
- Last synced: ${ds.lastSync}

## Full Token List
${tokenTable(ds.tokens)}

## Theme Architecture Principles
1. **Token Layering**: Reference tokens → Semantic tokens → Component tokens
2. **Mode Support**: Every visual token needs light + dark mode values
3. **Consistency**: Tokens should follow naming conventions (--{category}-{property}-{variant})
4. **shadcn/ui Compatibility**: Must map to shadcn's CSS variable system

Analyze the current theme state and recommend changes for "${intent}".`;
}

function themeGeneration(intent: string, ds: DesignSystem): string {
  return `You are a Theme Builder generating a complete theme token set.

## Request: "${intent}"

## Existing tokens: ${ds.tokens.length}

Generate a complete theme with:
1. Color tokens (background, foreground, primary, secondary, accent, muted, destructive, border, input, ring, chart-1..5)
2. Both light and dark mode values
3. Radius tokens (sm, md, lg, xl, full)
4. Shadow tokens (sm, md, lg)

Output as DesignToken[] with multi-mode values: { "Light": "#val", "Dark": "#val" }`;
}

function themeModeUpdate(intent: string): string {
  return `Update all token modes to reflect the theme change: "${intent}".
Ensure light/dark mode pairs maintain WCAG AA contrast ratios.
Output the updated token values.`;
}

function themeCodegen(intent: string, specs: AnySpec[]): string {
  return `Regenerate component code for ${specs.length} specs after theme change: "${intent}".
Ensure all components use CSS variables (var(--token-name)) rather than hardcoded values.
Specs: ${specs.map((s) => s.name).join(", ")}`;
}

// ── Token General Prompts ────────────────────────────────

function tokenParse(intent: string, tokens: DesignToken[]): string {
  return `Parse this design token update request: "${intent}"

## Available Tokens (${tokens.length})
${tokenTable(tokens)}

Identify:
1. Which token(s) to modify
2. What the new value(s) should be
3. Whether this creates new tokens or modifies existing ones`;
}

function tokenApplication(tokenType: string, intent: string): string {
  return `Apply ${tokenType} token changes for: "${intent}".
Write the updated DesignToken objects and persist to the registry.
Validate all values match their declared type (color → hex/hsl, spacing → px/rem, etc.)`;
}

// ── Component Prompts ────────────────────────────────────

function componentAnalysis(intent: string, ds: DesignSystem, specs: AnySpec[]): string {
  return `You are a Component Architect analyzing requirements for a new shadcn/ui component.

## IMPORTANT: Check Code Connect First
Before designing a new component, verify it doesn't already exist in the codebase via Code Connect.
Call get_code_connect_map to check for existing Figma→code mappings.
If a mapped component already exists, use it instead of creating a duplicate.

## Request: "${intent}"

## Existing Components
${specs.filter((s) => s.type === "component").map((s) => {
  const cs = s as ComponentSpec;
  const ccStatus = cs.codeConnect?.mapped ? " [Code Connect: MAPPED]" : "";
  return `- ${cs.name}: ${cs.purpose} (base: ${cs.shadcnBase.join(", ")})${ccStatus}`;
}).join("\n") || "(none)"}

## Design Tokens Available
${tokenSummary(ds.tokens)}

## shadcn/ui Component Library
Available base components: Accordion, Alert, AlertDialog, Avatar, Badge, Breadcrumb, Button,
Calendar, Card, Carousel, Chart, Checkbox, Collapsible, Combobox, Command, ContextMenu,
DataTable, DatePicker, Dialog, Drawer, DropdownMenu, Form, HoverCard, Input, InputOTP,
Label, Menubar, NavigationMenu, Pagination, Popover, Progress, RadioGroup, Resizable,
ScrollArea, Select, Separator, Sheet, Sidebar, Skeleton, Slider, Sonner, Switch, Table,
Tabs, Textarea, Toast, Toggle, ToggleGroup, Tooltip

## Analysis Required
1. Which shadcn/ui base components best serve this need?
2. What custom props are needed beyond the base?
3. What variants should be supported?
4. What design tokens should it consume?
5. How does it relate to existing components?`;
}

function componentDesign(intent: string, ds: DesignSystem): string {
  return `You are a Component Architect designing a ComponentSpec.

## Request: "${intent}"

## Available Design Tokens
${tokenSummary(ds.tokens)}

## Output: ComponentSpec JSON
{
  name: "PascalCase",
  type: "component",
  purpose: "Clear one-line description",
  researchBacking: [],
  designTokens: { source: "figma" | "manual", mapped: true },
  variants: ["default", ...],
  props: { propName: "TypeScript type" },
  shadcnBase: ["shadcn/ui component names"],
  accessibility: { role: "ARIA role", ariaLabel: "description", keyboardNav: true },
  dataviz: null,
  tags: ["relevant", "tags"],
  createdAt: ISO8601,
  updatedAt: ISO8601
}

## Design Principles
- Composition over configuration (prefer composable props)
- Accessible by default (ARIA, keyboard, screen reader)
- Token-driven (all visual properties from design tokens)
- Variant-aware (support multiple visual variants)`;
}

function componentCodegen(intent: string): string {
  return `Generate shadcn/ui + Tailwind React component code.

## Request: "${intent}"

## Code Connect
Only generate code for UNMAPPED components. If a component has codeConnect.mapped === true,
the codebase already has the implementation — use the existing code at codeConnect.codebasePath.
After generation, establish Code Connect mapping with add_code_connect_map.

## Code Requirements
1. "use client" directive at top
2. Import from @/components/ui/* (shadcn/ui)
3. Use cn() utility from @/lib/utils for className merging
4. TypeScript interface for props (extending React.HTMLAttributes)
5. Forward ref pattern
6. All styling via Tailwind classes using CSS variables
7. Accessible: ARIA attributes, keyboard handlers
8. Export both named component and default`;
}

function componentIdentify(intent: string, specs: AnySpec[]): string {
  return `Identify which component to modify based on: "${intent}"

## Available Components
${specs.filter((s) => s.type === "component").map((s) => `- ${s.name}: ${s.purpose}`).join("\n") || "(none)"}

Return the component name and what modifications are needed.`;
}

function componentModify(intent: string): string {
  return `Modify the identified component spec based on: "${intent}"
Update props, variants, shadcnBase, or accessibility as needed.
Preserve existing spec structure — only modify what the intent requires.`;
}

// ── Page Layout Prompts ──────────────────────────────────

function pageAnalysis(intent: string, specs: AnySpec[]): string {
  return `You are a Layout Designer analyzing page layout requirements.

## Request: "${intent}"

## Available Components for Composition
${specs.filter((s) => s.type === "component").map((s) => `- ${s.name}: ${s.purpose}`).join("\n") || "(none)"}

## Available DataViz
${specs.filter((s) => s.type === "dataviz").map((s) => `- ${s.name}: ${s.purpose}`).join("\n") || "(none)"}

## Layout Types (shadcn/ui)
1. sidebar-main: AppSidebar + SidebarInset (most dashboard pages)
2. full-width: Container spanning viewport
3. centered: Flexbox centered, max-width container
4. dashboard: Sidebar + grid of cards/charts
5. split: Two-column grid
6. marketing: Hero sections with CTA flow

Recommend the best layout and section composition.`;
}

function pageDesign(intent: string, ds: DesignSystem, specs: AnySpec[]): string {
  return `Design a PageSpec for: "${intent}"

## Available Components
${specs.filter((s) => s.type === "component").map((s) => s.name).join(", ") || "(none)"}

## Output: PageSpec JSON
{
  name: "PageName",
  type: "page",
  purpose: "description",
  layout: "sidebar-main" | "full-width" | "centered" | "dashboard" | "split" | "marketing",
  sections: [
    { name: "section-name", component: "ComponentName", layout: "full-width" | "grid-2" | "grid-3" | "grid-4", repeat: 1, props: {} }
  ],
  shadcnLayout: ["SidebarProvider", "AppSidebar", ...],
  responsive: { mobile: "stack", tablet: "grid-2", desktop: "grid-4" },
  meta: { title: "Page Title", description: "Meta desc" },
  tags: [],
  createdAt: ISO8601,
  updatedAt: ISO8601
}`;
}

function pageCodegen(intent: string): string {
  return `Generate page layout code for: "${intent}"
Use shadcn/ui layout primitives (SidebarProvider, AppSidebar, SidebarInset).
Tailwind responsive classes: max-sm: (mobile), sm: (tablet), lg: (desktop).
Import all section components from their generated paths.`;
}

// ── DataViz Prompts ──────────────────────────────────────

function datavizAnalysis(intent: string): string {
  return `You are a Data Visualization Specialist.

## Request: "${intent}"

## Chart Type Selection Guide
- **Line**: Trends over time, continuous data
- **Bar**: Comparisons between categories
- **Area**: Volume/magnitude over time
- **Pie/Donut**: Part-to-whole relationships (max 6 slices)
- **Scatter**: Correlation between two variables
- **Radar**: Multi-dimensional comparison
- **Composed**: Multiple chart types overlaid

## Recharts Best Practices
1. Responsive container: <ResponsiveContainer width="100%" height={400}>
2. Tooltip + Legend always included
3. CartesianGrid with strokeDasharray="3 3"
4. Color palette: hsl(var(--chart-1)) through hsl(var(--chart-5))
5. Accessible: data table fallback via <details>

Recommend chart type, data shape, and interactions.`;
}

function datavizDesign(intent: string, ds: DesignSystem): string {
  return `Design a DataVizSpec for: "${intent}"

## Output: DataVizSpec JSON
{
  name: "ChartName",
  type: "dataviz",
  purpose: "description",
  chartType: "line" | "bar" | "area" | "pie" | "donut" | "scatter" | "radar" | "composed",
  library: "recharts",
  dataShape: { x: "fieldName", y: "fieldName", series: ["field1", "field2"], groupBy: "field" },
  interactions: ["hover-tooltip", "click", "zoom", "brush"],
  accessibility: { altText: "", keyboardNav: true, dataTableFallback: true },
  responsive: { mobile: { height: 200, simplify: true }, desktop: { height: 400 } },
  shadcnWrapper: "Card",
  sampleData: [...],
  tags: [],
  createdAt: ISO8601,
  updatedAt: ISO8601
}`;
}

function datavizCodegen(intent: string): string {
  return `Generate Recharts component code for: "${intent}"
Wrap in shadcn/ui Card. Use ResponsiveContainer.
Include sample data rendering. Accessible data table fallback.
Color tokens from CSS variables.`;
}

// ── Responsive Prompts ───────────────────────────────────

function responsiveAudit(intent: string, specs: AnySpec[]): string {
  return `Audit responsive design coverage for: "${intent}"

## Page Specs
${specs.filter((s) => s.type === "page").map((s) => {
  const ps = s as PageSpec;
  return `- ${ps.name}: mobile=${ps.responsive.mobile}, tablet=${ps.responsive.tablet}, desktop=${ps.responsive.desktop}`;
}).join("\n") || "(none)"}

Check:
1. All pages have mobile, tablet, desktop breakpoints defined
2. Grid columns reduce appropriately (grid-4 → grid-2 → stack)
3. Font sizes scale down on mobile
4. Touch targets are 44x44px minimum on mobile
5. No horizontal scroll on mobile`;
}

function responsiveUpdate(intent: string): string {
  return `Update responsive specs for: "${intent}"
Ensure Tailwind breakpoint classes:
- Default (mobile-first)
- sm: 640px (tablet)
- md: 768px
- lg: 1024px (desktop)
- xl: 1280px
- 2xl: 1536px`;
}

// ── Figma Sync Prompts ───────────────────────────────────

function figmaSync(scope: string, intent: string): string {
  return `Sync ${scope} to Figma for: "${intent}"

## Figma Plugin API
- figma.variables.getLocalVariableCollectionsAsync() → collections
- collection.variableIds → variable IDs
- figma.variables.getVariableByIdAsync(id) → variable
- variable.setValueForMode(modeId, value) → update value
- figma.variables.createVariable(name, collectionId, resolvedType) → new var

## Color Format
Figma uses {r, g, b, a} where each is 0-1 float.
Convert hex: r = parseInt(hex.slice(1,3), 16) / 255

## Sync Strategy
1. Match local tokens to Figma variables by name
2. Update existing variables with new values
3. Create new variables for tokens without Figma counterparts
4. Respect multi-mode structure (Light/Dark)`;
}

function figmaConnect(): string {
  return `Connect to Figma Desktop Bridge.
1. Start WebSocket server on port 9223-9232
2. Wait for Figma plugin to connect
3. Verify bridge-hello handshake
4. Return connection status`;
}

function figmaPull(): string {
  return `Pull the latest design system from Figma.
1. Extract all variable collections (tokens)
2. Extract all local components
3. Extract all local styles
4. Parse into DesignToken[], DesignComponent[], DesignStyle[]
5. Update local registry`;
}

function figmaDiff(): string {
  return `Compare local design system state with Figma state.
Identify:
- Tokens modified locally but not in Figma
- Tokens modified in Figma but not locally
- New tokens on either side
- Conflicting changes (modified on both sides)`;
}

function figmaComponentCreate(intent: string): string {
  return `Create a Figma component for: "${intent}"

Use the Figma Plugin API:
1. figma.createFrame() for the base
2. Set layout mode (AUTO_LAYOUT)
3. Add child elements (text, shapes, instances)
4. figma.createComponentFromNode(frame) to make it a component
5. Set component properties for variants

Ensure the component matches the spec's design tokens.`;
}

function figmaPageCompose(intent: string): string {
  return `Compose a page layout in Figma for: "${intent}"

1. Create a Frame per viewport (Desktop: 1440px, Tablet: 768px, Mobile: 375px)
2. Set auto-layout for responsive behavior
3. Instantiate component instances for each section
4. Apply spacing tokens between sections
5. Add dev annotations for handoff`;
}

// ── Audit Prompts ────────────────────────────────────────

function auditTokens(ds: DesignSystem): string {
  return `Audit design token system for consistency and completeness.

## Tokens (${ds.tokens.length})
${tokenTable(ds.tokens)}

## Check
1. Naming consistency: all tokens follow {category}/{property}/{variant} convention
2. Value validity: colors are valid hex/hsl, spacing is valid px/rem
3. Coverage: all shadcn/ui expected tokens are present
4. Mode parity: every token has values for all defined modes
5. No orphaned tokens (tokens not used by any component)`;
}

function auditSpecs(specs: AnySpec[]): string {
  return `Audit all specs for completeness and cross-reference validity.

## Specs (${specs.length})
${specSummary(specs)}

## Check
1. Every spec has a non-empty purpose
2. ComponentSpecs have at least one shadcnBase
3. PageSpec sections reference existing ComponentSpecs
4. ComponentSpec dataviz field references existing DataVizSpecs
5. No circular dependencies`;
}

function auditAccessibility(ds: DesignSystem, specs: AnySpec[]): string {
  return `Audit accessibility compliance.

## Design System: ${ds.tokens.length} tokens, ${ds.components.length} components
## Specs: ${specs.length}

## WCAG 2.1 Checks
1. **Color Contrast**: All fg/bg pairs meet AA (4.5:1 normal, 3:1 large text)
2. **Focus Indicators**: All interactive components have visible focus styles
3. **ARIA Labels**: All components have appropriate aria-label or aria-labelledby
4. **Keyboard Navigation**: All interactive elements reachable via Tab, operable via Enter/Space
5. **Screen Reader**: Semantic HTML, alt text, live regions for dynamic content
6. **Motion**: Prefers-reduced-motion respected for animations
7. **Touch Targets**: 44x44px minimum for mobile`;
}

function auditReport(intent: string): string {
  return `Generate a comprehensive design system audit report for: "${intent}"

## Report Structure
1. **Executive Summary**: Overall health score (0-100)
2. **Token Coverage**: Which token types are present/missing
3. **Component Quality**: Spec completeness scores
4. **Accessibility Score**: WCAG compliance percentage
5. **Figma Parity**: Local vs Figma sync status
6. **Recommendations**: Prioritized list of improvements`;
}

// ── Accessibility Prompts ────────────────────────────────

function a11yContrast(ds: DesignSystem): string {
  const colors = ds.tokens.filter((t) => t.type === "color");
  return `Check color contrast ratios for all color token pairs.

## Color Tokens
${tokenTable(colors)}

For each foreground/background pair, calculate contrast ratio.
Flag pairs below WCAG AA (4.5:1 for normal text, 3:1 for large text).
Suggest fixes for failing pairs.`;
}

function a11yAria(specs: AnySpec[]): string {
  const components = specs.filter((s) => s.type === "component") as ComponentSpec[];
  return `Check ARIA attributes for all component specs.

## Components
${components.map((c) => `- ${c.name}: role=${c.accessibility?.role || "none"}, ariaLabel=${c.accessibility?.ariaLabel || "MISSING"}`).join("\n") || "(none)"}

Ensure:
1. Every interactive component has an appropriate ARIA role
2. All components have aria-label or aria-labelledby
3. Dynamic content uses aria-live regions
4. Form inputs have associated labels`;
}

function a11yKeyboard(specs: AnySpec[]): string {
  const components = specs.filter((s) => s.type === "component") as ComponentSpec[];
  return `Check keyboard navigation for all components.

## Components
${components.map((c) => `- ${c.name}: keyboardNav=${c.accessibility?.keyboardNav ?? "UNKNOWN"}`).join("\n")}

Ensure:
1. All interactive elements are focusable (tabIndex)
2. Custom widgets implement WAI-ARIA keyboard patterns
3. Focus order is logical (DOM order matches visual order)
4. Escape closes modals/overlays
5. Arrow keys navigate lists/menus`;
}

// ── Init Prompts ─────────────────────────────────────────

function initTokens(intent: string): string {
  return `Scaffold a complete design token foundation for: "${intent}"

## Foundation Tokens
1. **Colors**: Primary, secondary, accent, background, foreground, muted, destructive, border, input, ring + 5 chart colors
2. **Spacing**: 4px base, geometric scale (0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24)
3. **Typography**: Font families (sans, mono), type scale (xs through 4xl), weights, line-heights
4. **Radius**: sm (2px), md (6px), lg (8px), xl (12px), full (9999px)
5. **Shadows**: sm, md, lg, xl

All tokens in shadcn/ui CSS variable format with light + dark mode values.`;
}

function initComponents(intent: string): string {
  return `Create base component specs for: "${intent}"

## Recommended Starter Components
1. **Button**: Primary action trigger (shadcnBase: ["Button"])
2. **Card**: Content container (shadcnBase: ["Card", "CardHeader", "CardContent"])
3. **Input**: Text input field (shadcnBase: ["Input", "Label"])
4. **Badge**: Status/tag indicator (shadcnBase: ["Badge"])
5. **Avatar**: User representation (shadcnBase: ["Avatar"])
6. **Table**: Data display (shadcnBase: ["Table"])

Each spec should have:
- At least 2 variants
- TypeScript props interface
- Accessibility attributes
- Relevant tags`;
}

function initCodegen(): string {
  return `Generate initial code for all scaffolded specs.
Create the generated/ directory structure:
- generated/components/{Name}/{Name}.tsx + index.ts
- generated/pages/{Name}/{Name}.tsx + index.ts
- generated/dataviz/{Name}/{Name}.tsx + index.ts`;
}

// ── General Prompts ──────────────────────────────────────

function generalAnalysis(intent: string, ctx: AgentContext): string {
  return `You are a Design Intelligence Agent analyzing a design system request.

## Request: "${intent}"

## Current State
- Design Tokens: ${tokenSummary(ctx.designSystem.tokens)}
- Specs: ${specSummary(ctx.specs)}
- Figma Connected: ${ctx.figmaConnected}
- Framework: ${ctx.projectFramework || "unknown"}

## Your Task
1. Classify what type of design operation this requires
2. Identify which parts of the design system are affected
3. Determine if Figma sync is needed
4. Propose a concrete action plan

Be specific. Name exact tokens, specs, and components.`;
}

function generalExecute(intent: string): string {
  return `Execute the design operation: "${intent}"

Follow the action plan from the analysis step.
Make concrete changes to specs, tokens, or code as needed.
Report what was changed and any follow-up actions required.`;
}

// ── Spec Validation & Codegen ────────────────────────────

function specValidation(specs: AnySpec[]): string {
  return `Validate ${specs.length} specs before code generation.

## Specs
${specSummary(specs)}

Check each spec for:
1. Required fields are non-empty
2. Type-specific fields are valid
3. Cross-references resolve
4. No naming conflicts`;
}

function specCodegen(spec: AnySpec): string {
  return `Generate code for spec "${spec.name}" (${spec.type}).

## Spec
${JSON.stringify(spec, null, 2)}

## Code Standards
- TypeScript strict mode
- "use client" directive
- shadcn/ui imports from @/components/ui/*
- cn() for className merging
- Tailwind CSS only
- CSS variables for all design tokens
- Barrel export (index.ts)`;
}

// ── Motion & Animation Prompts ────────────────────────────

function motionAnalysis(intent: string, specs: AnySpec[]): string {
  const components = specs.filter(s => s.type === "component").map(s => s.name);
  const pages = specs.filter(s => s.type === "page").map(s => s.name);
  return `You are a **Motion Design Specialist** analyzing animation needs.

Intent: "${intent}"

Existing components: ${components.join(", ") || "none"}
Existing pages: ${pages.join(", ") || "none"}

Classify every motion candidate using this decision tree:
- User interaction feedback → Micro-interaction (100-350ms)
- Navigation/state change → Macro-transition (300-500ms)
- Feature showcase/first impression → Hero animation (800-1200ms)
- Data presentation → Data viz animation (500ms+)
- Portfolio/marketing → Full video pipeline (30-60s)

For each candidate, specify:
1. Element name and type
2. Motion category (micro/macro/hero/dataviz/video)
3. Trigger (hover, click, scroll, load, intersection)
4. Duration range
5. Easing recommendation (ease-out for entrances, ease-in for exits, spring for interactions)
6. Accessibility: respect prefers-reduced-motion`;
}

function motionTokens(intent: string, ds: DesignSystem): string {
  const existingTokens = ds.tokens.filter(t => t.cssVariable.includes("motion"));
  return `You are a **Motion Token Engineer** creating a motion design token system.

Intent: "${intent}"

Existing motion tokens: ${existingTokens.length > 0 ? existingTokens.map(t => `${t.name}: ${JSON.stringify(t.values)}`).join("\n") : "none"}

Create a complete motion token set as CSS custom properties:

**Durations:**
- --motion-instant: 100ms (micro-feedback)
- --motion-fast: 160ms (hover states, toggles)
- --motion-normal: 240ms (standard transitions)
- --motion-slow: 400ms (page transitions, modals)
- --motion-slower: 600ms (hero reveals)
- --motion-cinematic: 1000ms (showcase animations)

**Easings (cubic-bezier):**
- --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1)
- --ease-in: cubic-bezier(0.55, 0.055, 0.675, 0.19)
- --ease-out: cubic-bezier(0.215, 0.61, 0.355, 1)
- --ease-in-out: cubic-bezier(0.645, 0.045, 0.355, 1)
- --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
- --ease-bounce: cubic-bezier(0.34, 1.3, 0.64, 1)

**Staggers:**
- --stagger-fast: 30ms
- --stagger-normal: 50ms
- --stagger-slow: 80ms

Output each as a DesignToken with type "other", collection "motion".`;
}

function motionSpecify(intent: string, components: string[]): string {
  return `You are a **Motion Spec Writer** creating animation specifications.

Intent: "${intent}"
Target components: ${components.join(", ") || "all"}

For each component, write a motion spec that includes:

1. **States**: idle, hover, active, focus, enter, exit, loading
2. **Transitions**: Which properties animate between states
3. **Timing**: Duration token + easing token for each transition
4. **Stagger**: If children animate, specify stagger delay
5. **Scroll triggers**: IntersectionObserver threshold for scroll-driven animations
6. **Reduced motion**: Fallback behavior (instant state change, no animation)

Format as a structured spec that maps directly to:
- Tailwind classes: transition-*, duration-*, ease-*
- CSS @keyframes for complex sequences
- Framer Motion variants for React components

Key rules:
- Entrance: always ease-out (decelerating into rest)
- Exit: always ease-in (accelerating away)
- Hover/interaction: ease-spring for satisfying feedback
- Never animate layout properties (width/height) — use transform/opacity
- GPU-only: transform, opacity, filter, clip-path`;
}

function motionCodegen(intent: string): string {
  return `You are a **Motion Code Generator** producing animation code.

Intent: "${intent}"

Generate production-ready motion code using:

1. **CSS approach** (preferred for simple transitions):
   - Tailwind transition utilities
   - CSS custom properties for tokens
   - @media (prefers-reduced-motion: reduce) override

2. **Framer Motion** (for complex sequences):
   - AnimatePresence for mount/unmount
   - variants object pattern
   - useInView for scroll triggers
   - layout animations for list reorder

3. **CSS @keyframes** (for hero/showcase):
   - Named keyframes with token-based timing
   - animation-play-state for scroll-driven control

Output format:
- "use client" directive
- Import from framer-motion if needed
- Tailwind classes for simple transitions
- Utility hook: useReducedMotion()
- All durations reference motion tokens`;
}

// ── Export ────────────────────────────────────────────────

export const AGENT_PROMPTS = {
  // Color
  colorAnalysis,
  colorGeneration,

  // Spacing
  spacingAnalysis,
  spacingGeneration,

  // Typography
  typographyAnalysis,
  typographyGeneration,

  // Theme
  themeAnalysis,
  themeGeneration,
  themeModeUpdate,
  themeCodegen,

  // Token
  tokenParse,
  tokenApplication,

  // Component
  componentAnalysis,
  componentDesign,
  componentCodegen,
  componentIdentify,
  componentModify,

  // Page
  pageAnalysis,
  pageDesign,
  pageCodegen,

  // DataViz
  datavizAnalysis,
  datavizDesign,
  datavizCodegen,

  // Responsive
  responsiveAudit,
  responsiveUpdate,

  // Figma
  figmaSync,
  figmaConnect,
  figmaPull,
  figmaDiff,
  figmaComponentCreate,
  figmaPageCompose,

  // Audit
  auditTokens,
  auditSpecs,
  auditAccessibility,
  auditReport,

  // Accessibility
  a11yContrast,
  a11yAria,
  a11yKeyboard,

  // Init
  initTokens,
  initComponents,
  initCodegen,

  // General
  generalAnalysis,
  generalExecute,

  // Spec
  specValidation,
  specCodegen,

  // Motion & Animation
  motionAnalysis,
  motionTokens,
  motionSpecify,
  motionCodegen,
};
