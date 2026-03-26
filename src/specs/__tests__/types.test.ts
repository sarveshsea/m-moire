import { describe, it, expect } from "vitest";
import {
  ComponentSpecSchema,
  PageSpecSchema,
  DataVizSpecSchema,
  AtomicLevelSchema,
} from "../types.js";

describe("AtomicLevelSchema", () => {
  it("accepts valid levels", () => {
    for (const level of ["atom", "molecule", "organism", "template"]) {
      expect(AtomicLevelSchema.parse(level)).toBe(level);
    }
  });

  it("rejects invalid level", () => {
    expect(() => AtomicLevelSchema.parse("page")).toThrow();
    expect(() => AtomicLevelSchema.parse("widget")).toThrow();
  });
});

describe("ComponentSpecSchema", () => {
  const validComponent = {
    name: "MetricCard",
    type: "component" as const,
    purpose: "Displays a single KPI metric",
  };

  it("accepts a valid minimal component spec", () => {
    const result = ComponentSpecSchema.parse(validComponent);
    expect(result.name).toBe("MetricCard");
    expect(result.type).toBe("component");
    expect(result.level).toBe("atom"); // default
    expect(result.variants).toEqual(["default"]);
    expect(result.shadcnBase).toEqual([]);
    expect(result.composesSpecs).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it("accepts a fully specified component spec", () => {
    const full = {
      ...validComponent,
      level: "molecule" as const,
      researchBacking: ["user-interviews-q1"],
      designTokens: { source: "figma" as const, mapped: true },
      variants: ["default", "compact", "expanded"],
      props: { title: "string", value: "number" },
      shadcnBase: ["Card", "Badge"],
      composesSpecs: ["StatusBadge", "TrendIndicator"],
      codeConnect: {
        figmaNodeId: "1234:5678",
        codebasePath: "src/components/molecules/MetricCard.tsx",
        props: { label: "title" },
        mapped: true,
      },
      accessibility: {
        role: "article",
        ariaLabel: "required" as const,
        keyboardNav: true,
      },
      dataviz: null,
      tags: ["dashboard", "kpi"],
    };
    const result = ComponentSpecSchema.parse(full);
    expect(result.level).toBe("molecule");
    expect(result.variants).toHaveLength(3);
    expect(result.props).toEqual({ title: "string", value: "number" });
    expect(result.shadcnBase).toEqual(["Card", "Badge"]);
    expect(result.composesSpecs).toEqual(["StatusBadge", "TrendIndicator"]);
  });

  it("rejects missing required fields", () => {
    // missing name
    expect(() => ComponentSpecSchema.parse({ type: "component", purpose: "test" })).toThrow();
    // missing type
    expect(() => ComponentSpecSchema.parse({ name: "Foo", purpose: "test" })).toThrow();
    // missing purpose
    expect(() => ComponentSpecSchema.parse({ name: "Foo", type: "component" })).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() =>
      ComponentSpecSchema.parse({ ...validComponent, type: "page" })
    ).toThrow();
  });

  it("rejects invalid atomic level", () => {
    expect(() =>
      ComponentSpecSchema.parse({ ...validComponent, level: "page" })
    ).toThrow();
    expect(() =>
      ComponentSpecSchema.parse({ ...validComponent, level: "widget" })
    ).toThrow();
  });

  it("accepts empty shadcnBase array for atoms", () => {
    const result = ComponentSpecSchema.parse({
      ...validComponent,
      level: "atom",
      shadcnBase: [],
    });
    expect(result.shadcnBase).toEqual([]);
  });

  it("defaults composesSpecs to empty array", () => {
    const result = ComponentSpecSchema.parse(validComponent);
    expect(result.composesSpecs).toEqual([]);
  });

  it("accepts composesSpecs for molecules", () => {
    const result = ComponentSpecSchema.parse({
      ...validComponent,
      level: "molecule",
      composesSpecs: ["Button", "Badge"],
    });
    expect(result.composesSpecs).toEqual(["Button", "Badge"]);
  });

  it("sets default timestamps", () => {
    const result = ComponentSpecSchema.parse(validComponent);
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    // Should be valid ISO strings
    expect(() => new Date(result.createdAt)).not.toThrow();
    expect(() => new Date(result.updatedAt)).not.toThrow();
  });
});

describe("PageSpecSchema", () => {
  const validPage = {
    name: "Dashboard",
    type: "page" as const,
    purpose: "Main analytics dashboard",
  };

  it("accepts a valid minimal page spec", () => {
    const result = PageSpecSchema.parse(validPage);
    expect(result.name).toBe("Dashboard");
    expect(result.type).toBe("page");
    expect(result.layout).toBe("full-width");
    expect(result.sections).toEqual([]);
    expect(result.tags).toEqual([]);
  });

  it("accepts a page spec with sections", () => {
    const result = PageSpecSchema.parse({
      ...validPage,
      layout: "dashboard",
      sections: [
        { name: "header", component: "DashboardHeader", layout: "full-width" },
        { name: "metrics", component: "MetricGrid", layout: "grid-4", repeat: 4 },
      ],
    });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].layout).toBe("full-width");
    expect(result.sections[1].repeat).toBe(4);
  });

  it("rejects missing required fields", () => {
    expect(() => PageSpecSchema.parse({ type: "page", purpose: "test" })).toThrow();
    expect(() => PageSpecSchema.parse({ name: "Foo", purpose: "test" })).toThrow();
  });

  it("rejects wrong type literal", () => {
    expect(() =>
      PageSpecSchema.parse({ ...validPage, type: "component" })
    ).toThrow();
  });

  it("applies responsive defaults", () => {
    const result = PageSpecSchema.parse(validPage);
    expect(result.responsive.mobile).toBe("stack");
    expect(result.responsive.tablet).toBe("grid-2");
    expect(result.responsive.desktop).toBe("grid-4");
  });
});

describe("DataVizSpecSchema", () => {
  const validDataViz = {
    name: "RevenueChart",
    type: "dataviz" as const,
    purpose: "Displays monthly revenue trends",
    chartType: "line" as const,
    dataShape: { x: "date", y: "number" },
  };

  it("accepts a valid minimal dataviz spec", () => {
    const result = DataVizSpecSchema.parse(validDataViz);
    expect(result.name).toBe("RevenueChart");
    expect(result.chartType).toBe("line");
    expect(result.library).toBe("recharts");
    expect(result.interactions).toEqual(["hover-tooltip"]);
    expect(result.shadcnWrapper).toBe("Card");
  });

  it("accepts all chart types", () => {
    const chartTypes = [
      "line", "bar", "area", "pie", "donut",
      "scatter", "radar", "treemap", "funnel",
      "heatmap", "sankey", "gauge", "sparkline",
      "composed", "custom",
    ] as const;
    for (const chartType of chartTypes) {
      const result = DataVizSpecSchema.parse({ ...validDataViz, chartType });
      expect(result.chartType).toBe(chartType);
    }
  });

  it("rejects invalid chart type", () => {
    expect(() =>
      DataVizSpecSchema.parse({ ...validDataViz, chartType: "histogram" })
    ).toThrow();
  });

  it("rejects missing dataShape", () => {
    const { dataShape, ...noShape } = validDataViz;
    expect(() => DataVizSpecSchema.parse(noShape)).toThrow();
  });

  it("accepts sample data", () => {
    const result = DataVizSpecSchema.parse({
      ...validDataViz,
      sampleData: [
        { month: "Jan", revenue: 10000 },
        { month: "Feb", revenue: 12000 },
      ],
    });
    expect(result.sampleData).toHaveLength(2);
  });

  it("applies accessibility defaults", () => {
    const result = DataVizSpecSchema.parse(validDataViz);
    expect(result.accessibility.altText).toBe("required");
    expect(result.accessibility.keyboardNav).toBe(true);
    expect(result.accessibility.dataTableFallback).toBe(true);
  });
});
