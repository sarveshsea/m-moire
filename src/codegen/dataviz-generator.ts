/**
 * DataViz Generator — Creates chart/graph components from DataViz specs.
 * Uses Recharts wrapped in shadcn Card components.
 */

import type { DataVizSpec } from "../specs/types.js";
import type { CodegenContext } from "./generator.js";

interface DataVizCode {
  chart: string;
  barrel: string;
}

const RECHARTS_COMPONENTS: Record<string, { import: string; component: string }> = {
  line: {
    import: `import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "LineChart",
  },
  bar: {
    import: `import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "BarChart",
  },
  area: {
    import: `import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "AreaChart",
  },
  pie: {
    import: `import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "PieChart",
  },
  donut: {
    import: `import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "PieChart",
  },
  scatter: {
    import: `import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"`,
    component: "ScatterChart",
  },
  radar: {
    import: `import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts"`,
    component: "RadarChart",
  },
  composed: {
    import: `import { ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"`,
    component: "ComposedChart",
  },
};

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function generateDataViz(spec: DataVizSpec, ctx: CodegenContext): DataVizCode {
  const rechartsConfig = RECHARTS_COMPONENTS[spec.chartType];
  if (!rechartsConfig && spec.library === "recharts") {
    throw new Error(`Unsupported chart type for recharts: ${spec.chartType}`);
  }

  const chart = buildChartComponent(spec, rechartsConfig);

  const barrel = [
    `export { ${spec.name} } from "./${spec.name}"`,
    `export type { ${spec.name}Props } from "./${spec.name}"`,
    "",
  ].join("\n");

  return { chart, barrel };
}

function buildChartComponent(
  spec: DataVizSpec,
  rechartsConfig: { import: string; component: string } | undefined
): string {
  const lines: string[] = [];

  // Imports
  lines.push(`"use client"`);
  lines.push("");
  lines.push(`import * as React from "react"`);

  if (rechartsConfig) {
    lines.push(rechartsConfig.import);
  }

  lines.push(`import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"`);
  lines.push(`import { cn } from "@/lib/utils"`);
  lines.push("");

  // Data type
  lines.push(`export interface ${spec.name}DataPoint {`);
  lines.push(`  ${spec.dataShape.x}: ${inferTsType(spec.dataShape.x)}`);
  lines.push(`  ${spec.dataShape.y}: number`);
  if (spec.dataShape.series) {
    for (const s of spec.dataShape.series) {
      lines.push(`  ${s}?: number`);
    }
  }
  lines.push("}");
  lines.push("");

  // Props
  lines.push(`export interface ${spec.name}Props {`);
  lines.push(`  data: ${spec.name}DataPoint[]`);
  lines.push(`  title?: string`);
  lines.push(`  description?: string`);
  lines.push(`  className?: string`);
  lines.push(`  height?: number`);
  lines.push("}");
  lines.push("");

  // Sample data
  if (spec.sampleData && spec.sampleData.length > 0) {
    lines.push(`const SAMPLE_DATA: ${spec.name}DataPoint[] = ${JSON.stringify(spec.sampleData, null, 2)}`);
    lines.push("");
  }

  // Component
  lines.push(`export function ${spec.name}({`);
  lines.push(`  data${spec.sampleData ? " = SAMPLE_DATA" : ""},`);
  lines.push(`  title,`);
  lines.push(`  description,`);
  lines.push(`  className,`);
  lines.push(`  height = ${spec.responsive.desktop.height},`);
  lines.push(`}: ${spec.name}Props) {`);

  // Chart body
  lines.push("  return (");
  lines.push(`    <Card className={cn("w-full", className)}>`);
  lines.push("      {(title || description) && (");
  lines.push("        <CardHeader>");
  lines.push("          {title && <CardTitle>{title}</CardTitle>}");
  lines.push("          {description && <CardDescription>{description}</CardDescription>}");
  lines.push("        </CardHeader>");
  lines.push("      )}");
  lines.push("      <CardContent>");
  lines.push(`        <ResponsiveContainer width="100%" height={height}>`);

  if (rechartsConfig) {
    lines.push(buildRechartsBody(spec, rechartsConfig));
  } else {
    lines.push(`          <div className="flex items-center justify-center h-full text-muted-foreground">`);
    lines.push(`            Chart type "${spec.chartType}" — implement with ${spec.library}`);
    lines.push(`          </div>`);
  }

  lines.push("        </ResponsiveContainer>");

  // Accessibility: data table fallback
  if (spec.accessibility.dataTableFallback) {
    lines.push("        <details className=\"mt-4\">");
    lines.push("          <summary className=\"text-sm text-muted-foreground cursor-pointer\">View data table</summary>");
    lines.push("          <table className=\"mt-2 w-full text-sm\">");
    lines.push("            <thead>");
    lines.push("              <tr>");
    lines.push(`                <th className="text-left p-1">${spec.dataShape.x}</th>`);
    lines.push(`                <th className="text-right p-1">${spec.dataShape.y}</th>`);
    lines.push("              </tr>");
    lines.push("            </thead>");
    lines.push("            <tbody>");
    lines.push("              {data.map((d, i) => (");
    lines.push("                <tr key={i}>");
    lines.push(`                  <td className="p-1">{String(d.${spec.dataShape.x})}</td>`);
    lines.push(`                  <td className="text-right p-1">{d.${spec.dataShape.y}}</td>`);
    lines.push("                </tr>");
    lines.push("              ))}");
    lines.push("            </tbody>");
    lines.push("          </table>");
    lines.push("        </details>");
  }

  lines.push("      </CardContent>");
  lines.push("    </Card>");
  lines.push("  )");
  lines.push("}");

  return lines.join("\n");
}

function buildRechartsBody(
  spec: DataVizSpec,
  config: { import: string; component: string }
): string {
  const lines: string[] = [];
  const indent = "          ";

  switch (spec.chartType) {
    case "line":
    case "area":
    case "bar": {
      const Element = spec.chartType === "line" ? "Line" : spec.chartType === "area" ? "Area" : "Bar";
      lines.push(`${indent}<${config.component} data={data}>`);
      lines.push(`${indent}  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />`);
      lines.push(`${indent}  <XAxis dataKey="${spec.dataShape.x}" className="text-xs" />`);
      lines.push(`${indent}  <YAxis className="text-xs" />`);

      if (spec.interactions.includes("hover-tooltip")) {
        lines.push(`${indent}  <Tooltip />`);
      }

      if (spec.dataShape.series && spec.dataShape.series.length > 0) {
        lines.push(`${indent}  <Legend />`);
        for (let i = 0; i < spec.dataShape.series.length; i++) {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          if (spec.chartType === "area") {
            lines.push(`${indent}  <${Element} type="monotone" dataKey="${spec.dataShape.series[i]}" fill="${color}" stroke="${color}" fillOpacity={0.3} />`);
          } else {
            lines.push(`${indent}  <${Element} ${spec.chartType === "bar" ? "" : 'type="monotone" '}dataKey="${spec.dataShape.series[i]}" ${spec.chartType === "bar" ? "fill" : "stroke"}="${color}" />`);
          }
        }
      } else {
        const color = CHART_COLORS[0];
        if (spec.chartType === "area") {
          lines.push(`${indent}  <${Element} type="monotone" dataKey="${spec.dataShape.y}" fill="${color}" stroke="${color}" fillOpacity={0.3} />`);
        } else {
          lines.push(`${indent}  <${Element} ${spec.chartType === "bar" ? "" : 'type="monotone" '}dataKey="${spec.dataShape.y}" ${spec.chartType === "bar" ? "fill" : "stroke"}="${color}" />`);
        }
      }
      lines.push(`${indent}</${config.component}>`);
      break;
    }

    case "pie":
    case "donut": {
      const innerRadius = spec.chartType === "donut" ? ' innerRadius={60}' : "";
      lines.push(`${indent}<PieChart>`);
      lines.push(`${indent}  <Pie data={data} dataKey="${spec.dataShape.y}" nameKey="${spec.dataShape.x}"${innerRadius} outerRadius={80} label>`);
      lines.push(`${indent}    {data.map((_, i) => (`);
      lines.push(`${indent}      <Cell key={i} fill={["${CHART_COLORS.join('", "')}""][i % ${CHART_COLORS.length}]} />`);
      lines.push(`${indent}    ))}`);
      lines.push(`${indent}  </Pie>`);
      if (spec.interactions.includes("hover-tooltip")) {
        lines.push(`${indent}  <Tooltip />`);
      }
      lines.push(`${indent}  <Legend />`);
      lines.push(`${indent}</PieChart>`);
      break;
    }

    default:
      lines.push(`${indent}<${config.component} data={data}>`);
      lines.push(`${indent}  <XAxis dataKey="${spec.dataShape.x}" />`);
      lines.push(`${indent}  <YAxis />`);
      lines.push(`${indent}  <Tooltip />`);
      lines.push(`${indent}</${config.component}>`);
  }

  return lines.join("\n");
}

function inferTsType(fieldName: string): string {
  const lower = fieldName.toLowerCase();
  if (lower.includes("date") || lower.includes("time")) return "string";
  if (lower.includes("name") || lower.includes("label") || lower.includes("category")) return "string";
  if (lower.includes("count") || lower.includes("amount") || lower.includes("value")) return "number";
  return "string";
}
