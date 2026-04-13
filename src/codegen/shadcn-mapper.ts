/**
 * shadcn Mapper — Maps ComponentSpec objects to shadcn/ui primitives
 * and generates production-ready React + TypeScript components.
 *
 * Inputs:
 *   - ComponentSpec (from src/specs/types.ts)
 *   - CodegenContext containing the project context and design system tokens
 *
 * Outputs:
 *   - ComponentCode: { component: string (TSX), barrel: string (index.ts) }
 *
 * Key responsibilities:
 *   1. Resolve shadcnBase references to the correct shadcn import statements
 *   2. Build a typed props interface from spec.props declarations
 *   3. Build variant type unions and runtime variant class maps
 *   4. Compose component body using shadcn primitives (Card, Button, Input, etc.)
 *   5. Substitute design token hex values with Tailwind utility classes
 */

import type { ComponentSpec } from "../specs/types.js";
import type { CodegenContext } from "./generator.js";
import type { DesignToken } from "../engine/registry.js";

interface ComponentCode {
  component: string;
  barrel: string;
}

const SHADCN_IMPORTS: Record<string, string> = {
  Card: `import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"`,
  Button: `import { Button } from "@/components/ui/button"`,
  Badge: `import { Badge } from "@/components/ui/badge"`,
  Input: `import { Input } from "@/components/ui/input"`,
  Label: `import { Label } from "@/components/ui/label"`,
  Table: `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"`,
  Tabs: `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"`,
  Dialog: `import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"`,
  Select: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"`,
  Avatar: `import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"`,
  Separator: `import { Separator } from "@/components/ui/separator"`,
  Skeleton: `import { Skeleton } from "@/components/ui/skeleton"`,
  Tooltip: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"`,
  DropdownMenu: `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"`,
  Sheet: `import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"`,
  ScrollArea: `import { ScrollArea } from "@/components/ui/scroll-area"`,
  Switch: `import { Switch } from "@/components/ui/switch"`,
  Checkbox: `import { Checkbox } from "@/components/ui/checkbox"`,
  Textarea: `import { Textarea } from "@/components/ui/textarea"`,
  Progress: `import { Progress } from "@/components/ui/progress"`,
  Sidebar: `import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar"`,
  Slider: `import { Slider } from "@/components/ui/slider"`,
  RadioGroup: `import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"`,
  Popover: `import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"`,
  Accordion: `import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"`,
  Alert: `import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"`,
  Calendar: `import { Calendar } from "@/components/ui/calendar"`,
  Carousel: `import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel"`,
  Command: `import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"`,
  Toggle: `import { Toggle } from "@/components/ui/toggle"`,
  ToggleGroup: `import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"`,
  NavigationMenu: `import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from "@/components/ui/navigation-menu"`,
  Breadcrumb: `import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"`,
  Pagination: `import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"`,
};

/**
 * Generate a React + TypeScript component from a ComponentSpec.
 *
 * @param spec - The component spec describing props, variants, shadcn base, and design tokens.
 * @param ctx  - Codegen context providing the project path and design system registry.
 * @returns    ComponentCode with `component` (the .tsx source) and `barrel` (index.ts re-export).
 */
export function generateComponent(spec: ComponentSpec, ctx: CodegenContext): ComponentCode {
  const imports = buildImports(spec);
  const propsInterface = buildPropsInterface(spec);
  const tokens = ctx.designSystem?.tokens ?? [];
  const componentBody = buildComponentBody(spec, tokens, ctx);
  const variantTypes = buildVariantType(spec);

  // Build destructured props, handling empty props case
  const propNames = Object.keys(spec.props);
  const destructuredProps: string[] = [...propNames];
  if (spec.variants.length > 1) {
    destructuredProps.push(`variant = "default"`);
  }
  destructuredProps.push("className");
  destructuredProps.push("...props");

  const propsStr = destructuredProps.join(", ");

  const component = [
    `// Generated by Memoire · memi generate ${spec.name} · https://memoire.cv`,
    `"use client"`,
    "",
    ...imports,
    "",
    `import { cn } from "@/lib/utils"`,
    "",
    variantTypes,
    propsInterface,
    "",
    `export function ${spec.name}({ ${propsStr} }: ${spec.name}Props) {`,
    componentBody,
    "}",
    "",
  ].filter(Boolean).join("\n");

  const barrel = [
    `export { ${spec.name} } from "./${spec.name}"`,
    `export type { ${spec.name}Props } from "./${spec.name}"`,
    "",
  ].join("\n");

  return { component, barrel };
}

function buildImports(spec: ComponentSpec): string[] {
  const imports: string[] = [`import * as React from "react"`];

  for (const base of spec.shadcnBase) {
    const imp = SHADCN_IMPORTS[base];
    if (imp) imports.push(imp);
  }

  return imports;
}

function buildPropsInterface(spec: ComponentSpec): string {
  const lines: string[] = [`export interface ${spec.name}Props extends React.HTMLAttributes<HTMLDivElement> {`];

  for (const [name, type] of Object.entries(spec.props)) {
    const optional = type.endsWith("?") ? "?" : "";
    const tsType = mapPropType(type);
    lines.push(`  ${name}${optional}: ${tsType}`);
  }

  if (spec.variants.length > 1) {
    lines.push(`  variant?: ${spec.name}Variant`);
  }

  lines.push("}");
  return lines.join("\n");
}

function buildVariantType(spec: ComponentSpec): string {
  if (spec.variants.length <= 1) return "";

  const variants = spec.variants.map((v) => `"${v}"`).join(" | ");
  return `export type ${spec.name}Variant = ${variants}\n`;
}

function buildComponentBody(spec: ComponentSpec, tokens: DesignToken[] = [], ctx?: CodegenContext): string {
  const hasCard = spec.shadcnBase.includes("Card");
  const hasBadge = spec.shadcnBase.includes("Badge");
  const hasButton = spec.shadcnBase.includes("Button");
  const hasInput = spec.shadcnBase.includes("Input");
  const hasAvatar = spec.shadcnBase.includes("Avatar");
  const hasDialog = spec.shadcnBase.includes("Dialog");
  const tokenStyles = buildTokenStyles(spec, tokens);
  const variantLogic = buildVariantLogic(spec);

  if (hasCard) {
    return buildCardComponent(spec, hasBadge, tokenStyles, variantLogic, tokens);
  }

  if (hasButton) {
    return buildButtonComponent(spec, tokenStyles, variantLogic);
  }

  if (hasInput) {
    return buildInputComponent(spec, tokenStyles);
  }

  if (hasAvatar) {
    return buildAvatarComponent(spec, tokenStyles);
  }

  if (hasDialog) {
    return buildDialogComponent(spec, tokenStyles);
  }

  // Default: smart div wrapper with variant support
  const lines: string[] = [];
  if (variantLogic) lines.push(variantLogic, "");
  lines.push("  return (");
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  const defaultCls = substituteTokensInClasses(defaultClasses(spec), tokens);
  const hasVariants = spec.variants.length > 1;
  // Avoid emitting cn("", ...) when there are no base classes
  const cnArgs = [
    defaultCls ? `"${defaultCls}"` : null,
    hasVariants ? "variantClasses" : null,
    "className",
  ].filter(Boolean).join(", ");
  lines.push(`    <div className={cn(${cnArgs})}${styleAttr} {...props}>`);

  for (const [name, type] of Object.entries(spec.props)) {
    if (type === "boolean" || type === "boolean?") {
      lines.push(`      {${name} && <div className="text-sm">{${name}}</div>}`);
    } else if (type === "ReactNode" || type === "ReactNode?") {
      lines.push(`      {${name}}`);
    } else {
      lines.push(`      {${name} && <span className="text-sm">{${name}}</span>}`);
    }
  }

  lines.push("    </div>");
  lines.push("  )");
  return lines.join("\n");
}

/** Generate variant CSS class mapping logic. */
function buildVariantLogic(spec: ComponentSpec): string | null {
  if (spec.variants.length <= 1) return null;

  const variantMap: string[] = [];
  for (const v of spec.variants) {
    const classes = inferVariantClasses(v, spec);
    variantMap.push(`    "${v}": "${classes}",`);
  }

  return [
    `  const variantStyles: Record<${spec.name}Variant, string> = {`,
    ...variantMap,
    `  }`,
    `  const variantClasses = variantStyles[variant ?? "default"] ?? ""`,
  ].join("\n");
}

/** Infer Tailwind classes for a variant name. */
function inferVariantClasses(variant: string, spec: ComponentSpec): string {
  const v = variant.toLowerCase();

  // Common variant → Tailwind class mappings
  const map: Record<string, string> = {
    default: "",
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
    compact: "p-2 text-sm",
    large: "p-6 text-lg",
    small: "p-1 text-xs",
    success: "bg-green-500/10 text-green-700 border-green-200",
    warning: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
    error: "bg-red-500/10 text-red-700 border-red-200",
    info: "bg-blue-500/10 text-blue-700 border-blue-200",
    online: "bg-green-500",
    offline: "bg-gray-400",
    away: "bg-yellow-500",
    active: "bg-primary/10 font-medium",
    inactive: "opacity-60",
    disabled: "opacity-50 pointer-events-none",
    loading: "animate-pulse",
  };

  return map[v] ?? "";
}

function buildButtonComponent(spec: ComponentSpec, tokenStyles?: string, variantLogic?: string | null): string {
  const props = Object.keys(spec.props);
  const labelProp = props.find((p) => /label|text|children/i.test(p)) ?? props[0];
  const iconProp = props.find((p) => /icon/i.test(p));
  const disabledProp = props.find((p) => /disabled/i.test(p));

  const lines: string[] = [];
  if (variantLogic) lines.push(variantLogic, "");
  lines.push("  return (");
  const variantUnion = spec.variants.map((v: string) => `"${v}"`).join(" | ");
  const variantAttr = spec.variants.length > 1 ? ` variant={variant as ${variantUnion}}` : "";
  const disabledAttr = disabledProp ? ` disabled={${disabledProp}}` : "";
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  lines.push(`    <Button className={cn(className)}${variantAttr}${disabledAttr}${styleAttr} {...props}>`);
  if (iconProp) lines.push(`      {${iconProp} && <span className="mr-2">{${iconProp}}</span>}`);
  if (labelProp) lines.push(`      {${labelProp}}`);
  lines.push("    </Button>");
  lines.push("  )");
  return lines.join("\n");
}

function buildInputComponent(spec: ComponentSpec, tokenStyles?: string): string {
  const props = Object.keys(spec.props);
  const labelProp = props.find((p) => /label/i.test(p));
  const placeholderProp = props.find((p) => /placeholder|hint/i.test(p));
  const valueProp = props.find((p) => /value/i.test(p));
  const errorProp = props.find((p) => /error/i.test(p));

  const lines: string[] = [];
  lines.push("  return (");
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  lines.push(`    <div className={cn("grid gap-2", className)}${styleAttr} {...props}>`);
  if (labelProp) lines.push(`      {${labelProp} && <Label>{${labelProp}}</Label>}`);
  lines.push(`      <Input${placeholderProp ? ` placeholder={${placeholderProp}}` : ""}${valueProp ? ` value={${valueProp}}` : ""} />`);
  if (errorProp) lines.push(`      {${errorProp} && <p className="text-sm text-destructive">{${errorProp}}</p>}`);
  lines.push("    </div>");
  lines.push("  )");
  return lines.join("\n");
}

function buildAvatarComponent(spec: ComponentSpec, tokenStyles?: string): string {
  const props = Object.keys(spec.props);
  const srcProp = props.find((p) => /src|avatar|image|url/i.test(p));
  const nameProp = props.find((p) => /name|alt/i.test(p));

  const lines: string[] = [];
  lines.push("  return (");
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  lines.push(`    <Avatar className={cn(className)}${styleAttr} {...props}>`);
  if (srcProp) lines.push(`      <AvatarImage src={${srcProp}} alt={${nameProp ?? '""'}} />`);
  lines.push(`      <AvatarFallback>{${nameProp ? `${nameProp}?.slice(0, 2).toUpperCase()` : '"?"'}}</AvatarFallback>`);
  lines.push("    </Avatar>");
  lines.push("  )");
  return lines.join("\n");
}

function buildDialogComponent(spec: ComponentSpec, tokenStyles?: string): string {
  const props = Object.keys(spec.props);
  const titleProp = props.find((p) => /title/i.test(p));
  const descProp = props.find((p) => /desc|description/i.test(p));
  const triggerProp = props.find((p) => /trigger|label|button/i.test(p));
  const childrenProp = props.find((p) => /children|content|body/i.test(p));

  const lines: string[] = [];
  lines.push("  return (");
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  lines.push(`    <Dialog>`);
  lines.push(`      <DialogTrigger asChild>`);
  lines.push(`        <Button variant="outline">{${triggerProp ?? '"Open"'}}</Button>`);
  lines.push(`      </DialogTrigger>`);
  lines.push(`      <DialogContent className={cn(className)}${styleAttr}>`);
  lines.push(`        <DialogHeader>`);
  if (titleProp) lines.push(`          <DialogTitle>{${titleProp}}</DialogTitle>`);
  if (descProp) lines.push(`          <DialogDescription>{${descProp}}</DialogDescription>`);
  lines.push(`        </DialogHeader>`);
  if (childrenProp) lines.push(`        {${childrenProp}}`);
  lines.push(`      </DialogContent>`);
  lines.push(`    </Dialog>`);
  lines.push("  )");
  return lines.join("\n");
}

function buildCardComponent(spec: ComponentSpec, hasBadge: boolean, tokenStyles?: string, variantLogic?: string | null, tokens: DesignToken[] = []): string {
  const props = Object.keys(spec.props);
  const titleProp = props.find((p) => p.toLowerCase().includes("title"));
  const valueProp = props.find((p) => p.toLowerCase().includes("value") || p.toLowerCase().includes("metric"));
  const descProp = props.find((p) => p.toLowerCase().includes("desc") || p.toLowerCase().includes("subtitle"));

  const lines: string[] = [];
  if (variantLogic) lines.push(variantLogic, "");
  lines.push("  return (");
  const styleAttr = tokenStyles ? ` style={${tokenStyles}}` : "";
  const defaultCls = substituteTokensInClasses(defaultClasses(spec), tokens);
  const hasCardVariants = spec.variants.length > 1;
  const cardCnArgs = [
    defaultCls ? `"${defaultCls}"` : null,
    hasCardVariants ? "variantClasses" : null,
    "className",
  ].filter(Boolean).join(", ");
  lines.push(`    <Card className={cn(${cardCnArgs})}${styleAttr} {...props}>`);

  if (titleProp || descProp) {
    lines.push("      <CardHeader>");
    if (titleProp) {
      lines.push(`        <CardTitle>{${titleProp}}</CardTitle>`);
    }
    if (descProp) {
      lines.push(`        <CardDescription>{${descProp}}</CardDescription>`);
    }
    lines.push("      </CardHeader>");
  }

  lines.push("      <CardContent>");
  if (valueProp) {
    lines.push(`        <div className="text-2xl font-bold">{${valueProp}}</div>`);
  }

  // Render remaining props
  for (const name of props) {
    if (name === titleProp || name === valueProp || name === descProp) continue;
    if (hasBadge && (name.toLowerCase().includes("status") || name.toLowerCase().includes("tag"))) {
      lines.push(`        {${name} && <Badge>{${name}}</Badge>}`);
    } else {
      lines.push(`        {${name} && <span className="text-sm text-muted-foreground">{${name}}</span>}`);
    }
  }

  lines.push("      </CardContent>");
  lines.push("    </Card>");
  lines.push("  )");
  return lines.join("\n");
}

function defaultClasses(spec: ComponentSpec): string {
  const classes: string[] = [];

  if (spec.variants.length > 1) {
    classes.push("transition-all");
  }

  return classes.join(" ");
}

/**
 * Map a spec prop-type string to its TypeScript equivalent.
 *
 * Supported forms:
 *   "string"           → string
 *   "string?"          → string   (optional marker stripped; optionality is on the property key)
 *   "string[]"         → string[]
 *   "number[]?"        → number[]
 *   "'sm'|'md'|'lg'"   → "sm" | "md" | "lg"   (union literal string)
 *   "ReactNode"        → React.ReactNode
 *   Anything else      → passed through as-is
 */
function mapPropType(type: string): string {
  // Strip trailing "?" — optionality is expressed on the property key
  const clean = type.replace(/\?$/, "").trim();

  // Union literal: contains "|" and members are quoted strings → normalise quotes
  if (clean.includes("|")) {
    return clean
      .split("|")
      .map((part) => {
        const trimmed = part.trim();
        // Already a valid TS type (e.g. "string", "number")? keep it.
        if (/^[a-zA-Z_$][a-zA-Z0-9_$]*(\[\])?$/.test(trimmed)) return trimmed;
        // Strip single or double quotes and re-wrap with double quotes
        return `"${trimmed.replace(/^['"]|['"]$/g, "")}"`;
      })
      .join(" | ");
  }

  const mapping: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    "string[]": "string[]",
    "number[]": "number[]",
    "boolean[]": "boolean[]",
    ReactNode: "React.ReactNode",
    "ReactNode[]": "React.ReactNode[]",
  };

  return mapping[clean] ?? clean;
}

/**
 * Build a CSS variable style object from design tokens that match the component.
 * Returns a JS object literal string for use in style={...}, or undefined if no tokens match.
 */
function buildTokenStyles(spec: ComponentSpec, tokens: DesignToken[]): string | undefined {
  if (tokens.length === 0) return undefined;

  const name = spec.name.toLowerCase();
  const styles: string[] = [];

  // Find tokens whose name contains this component's name
  for (const token of tokens) {
    const tokenName = token.name.toLowerCase().replace(/[\s/]/g, "-");
    if (tokenName.includes(name) || name.includes(tokenName.split("-").pop() ?? "")) {
      const value = Object.values(token.values)[0];
      if (value !== undefined) {
        // Use CSS variable reference so it responds to theme changes
        styles.push(`"${token.cssVariable.replace("--", "")}": "var(${token.cssVariable})"`);
      }
    }
  }

  // Also inject radius tokens if component uses Card
  if (spec.shadcnBase.includes("Card")) {
    const radiusToken = tokens.find((t) => t.type === "radius" && t.name.toLowerCase().includes("card"));
    if (radiusToken) {
      styles.push(`borderRadius: "var(${radiusToken.cssVariable})"`);
    }
  }

  if (styles.length === 0) return undefined;
  return `{ ${styles.join(", ")} }`;
}

/**
 * Approximate mapping from common hex values to Tailwind utility classes.
 * Used by substituteTokensInClasses() to replace raw hex colour values
 * with Tailwind semantic classes when design tokens are available.
 */
const HEX_TO_TAILWIND: Record<string, string> = {
  // Blue scale
  "#3B82F6": "bg-blue-500",
  "#2563EB": "bg-blue-600",
  "#1D4ED8": "bg-blue-700",
  "#60A5FA": "bg-blue-400",
  "#93C5FD": "bg-blue-300",
  // Red / destructive
  "#EF4444": "bg-red-500",
  "#DC2626": "bg-red-600",
  // Green
  "#22C55E": "bg-green-500",
  "#16A34A": "bg-green-600",
  // Yellow / warning
  "#EAB308": "bg-yellow-500",
  "#CA8A04": "bg-yellow-600",
  // Neutral
  "#F9FAFB": "bg-gray-50",
  "#F3F4F6": "bg-gray-100",
  "#E5E7EB": "bg-gray-200",
  "#D1D5DB": "bg-gray-300",
  "#9CA3AF": "bg-gray-400",
  "#6B7280": "bg-gray-500",
  "#4B5563": "bg-gray-600",
  "#374151": "bg-gray-700",
  "#1F2937": "bg-gray-800",
  "#111827": "bg-gray-900",
  "#FFFFFF": "bg-white",
  "#000000": "bg-black",
};

/**
 * Given a set of design tokens and an inline class string that may contain
 * hex colour values, replace known hex values with their Tailwind equivalents.
 * Also maps token values (from the registry) to Tailwind classes.
 *
 * @param classes  - raw Tailwind class string, may contain hex values
 * @param tokens   - design system tokens from registry
 * @returns        - class string with hex values replaced by Tailwind classes
 */
// ── Storybook story generator ─────────────────────────────────

/**
 * Generate a Storybook 8 CSF3 story file for a ComponentSpec.
 * Produces a Default story plus one story per variant.
 * Taps into the 4.6M weekly Storybook download ecosystem.
 */
export function generateStory(spec: ComponentSpec): string {
  const variantNames = spec.variants ?? ["default"];

  const defaultProps = Object.entries(spec.props ?? {})
    .map(([key, type]) => {
      const t = String(type).replace("?", "").trim();
      const val =
        t === "string" ? `"${key}"` :
        t === "boolean" ? "false" :
        t === "number" ? "0" :
        t.startsWith("() =>") ? "() => {}" :
        `undefined`;
      return `  ${key}: ${val},`;
    })
    .join("\n");

  const variantStories = variantNames
    .filter((v) => v !== "default")
    .map((variant) => {
      const name = variant.charAt(0).toUpperCase() + variant.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return [
        `export const ${name}: Story = {`,
        `  args: {`,
        `    ...Default.args,`,
        `    variant: "${variant}",`,
        `  },`,
        `};`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    `// Generated by Memoire · memi generate ${spec.name} · https://memoire.cv`,
    `import type { Meta, StoryObj } from "@storybook/react";`,
    `import { ${spec.name} } from "./${spec.name}";`,
    ``,
    `const meta: Meta<typeof ${spec.name}> = {`,
    `  title: "${spec.level ? spec.level.charAt(0).toUpperCase() + spec.level.slice(1) + "/" : ""}${spec.name}",`,
    `  component: ${spec.name},`,
    `  tags: ["autodocs"],`,
    `  parameters: {`,
    `    docs: {`,
    `      description: {`,
    `        component: ${JSON.stringify(spec.purpose ?? "")},`,
    `      },`,
    `    },`,
    `  },`,
    `};`,
    ``,
    `export default meta;`,
    `type Story = StoryObj<typeof ${spec.name}>;`,
    ``,
    `export const Default: Story = {`,
    `  args: {`,
    defaultProps,
    `  },`,
    `};`,
    variantStories ? `\n${variantStories}` : "",
  ].filter(Boolean).join("\n");
}

export function substituteTokensInClasses(classes: string, tokens: DesignToken[]): string {
  let result = classes;

  // Build a reverse map from token value → Tailwind class using the registry
  for (const token of tokens) {
    const value = Object.values(token.values)[0];
    if (typeof value !== "string") continue;
    const hex = value.trim().toUpperCase();
    const twClass = HEX_TO_TAILWIND[hex];
    if (twClass) {
      // Replace any occurrence of the raw hex (case-insensitive) in the class string
      result = result.replace(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), twClass);
    }
  }

  // Also apply the static lookup table
  for (const [hex, twClass] of Object.entries(HEX_TO_TAILWIND)) {
    result = result.replace(new RegExp(hex.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), twClass);
  }

  return result;
}
