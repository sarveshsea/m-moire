/**
 * shadcn Mapper — Maps component specs to shadcn/ui primitives
 * and generates production-ready React + TypeScript components.
 */

import type { ComponentSpec } from "../specs/types.js";
import type { CodegenContext } from "./generator.js";

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
};

export function generateComponent(spec: ComponentSpec, ctx: CodegenContext): ComponentCode {
  const imports = buildImports(spec);
  const propsInterface = buildPropsInterface(spec);
  const componentBody = buildComponentBody(spec);
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
    const tsType = mapPropType(type);
    const optional = type.endsWith("?") ? "?" : "";
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

function buildComponentBody(spec: ComponentSpec): string {
  const hasCard = spec.shadcnBase.includes("Card");
  const hasBadge = spec.shadcnBase.includes("Badge");

  if (hasCard) {
    return buildCardComponent(spec, hasBadge);
  }

  // Default: simple div wrapper
  const lines = ["  return ("];
  lines.push(`    <div className={cn("${defaultClasses(spec)}", className)} {...props}>`);

  for (const [name] of Object.entries(spec.props)) {
    lines.push(`      {${name} && <span>{${name}}</span>}`);
  }

  lines.push("    </div>");
  lines.push("  )");
  return lines.join("\n");
}

function buildCardComponent(spec: ComponentSpec, hasBadge: boolean): string {
  const props = Object.keys(spec.props);
  const titleProp = props.find((p) => p.toLowerCase().includes("title"));
  const valueProp = props.find((p) => p.toLowerCase().includes("value") || p.toLowerCase().includes("metric"));
  const descProp = props.find((p) => p.toLowerCase().includes("desc") || p.toLowerCase().includes("subtitle"));

  const lines = ["  return ("];
  lines.push(`    <Card className={cn("${defaultClasses(spec)}", className)} {...props}>`);

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

function mapPropType(type: string): string {
  const clean = type.replace("?", "").trim();

  const mapping: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    "string[]": "string[]",
    "number[]": "number[]",
    ReactNode: "React.ReactNode",
  };

  return mapping[clean] ?? clean;
}
