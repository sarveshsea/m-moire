import { describe, it, expect } from "vitest";
import { mapResearchToSpecs, generateA11yChecklist, mapPersonaRequirements } from "../research-mapper.js";
import type { ResearchStore, ResearchInsight, ResearchPersona } from "../../research/engine.js";

function makeInsight(overrides: Partial<ResearchInsight> = {}): ResearchInsight {
  return {
    id: `insight-${Date.now()}`,
    finding: "Users found the interface confusing",
    confidence: "high",
    source: "interview",
    evidence: ["User A said..."],
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStore(insights: ResearchInsight[] = []): ResearchStore {
  return { insights, personas: [], themes: [], sources: [] };
}

describe("mapResearchToSpecs", () => {
  it("maps accessibility insights to requirements", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Users can't read the small text on mobile devices" }),
      makeInsight({ id: "2", finding: "Color blind users can't distinguish error from success states" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0].category).toBe("accessibility");
    expect(result.requirements[1].category).toBe("accessibility");
    expect(result.coverage).toBe(1);
  });

  it("maps UX insights to requirements", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Users felt lost and couldn't navigate back to the dashboard" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].category).toBe("ux");
    expect(result.requirements[0].requirement).toContain("navigation");
  });

  it("maps performance insights", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "The page took too long to load and users abandoned" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.requirements[0].category).toBe("performance");
  });

  it("maps interaction insights", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Users wanted to search and filter the product list" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.requirements[0].category).toBe("interaction");
  });

  it("tracks unmapped insights", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Users liked the blue color" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.unmapped).toHaveLength(1);
    expect(result.coverage).toBe(0);
  });

  it("targets specific specs by name mention", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Users had trouble with the DataTable sort feature" }),
    ]);
    const specs = [{ name: "DataTable", type: "component" as const }] as any[];
    const result = mapResearchToSpecs(store, specs);
    expect(result.requirements[0].targetSpecs).toContain("DataTable");
  });

  it("targets specs by tag overlap", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Keyboard navigation was broken", tags: ["a11y"] }),
    ]);
    const specs = [{ name: "NavMenu", type: "component" as const, tags: ["a11y"] }] as any[];
    const result = mapResearchToSpecs(store, specs);
    expect(result.requirements[0].targetSpecs).toContain("NavMenu");
  });

  it("returns wildcard target when no specific spec matches", () => {
    const store = makeStore([
      makeInsight({ id: "1", finding: "Touch targets were too small on mobile" }),
    ]);
    const result = mapResearchToSpecs(store, []);
    expect(result.requirements[0].targetSpecs).toContain("*");
  });
});

describe("generateA11yChecklist", () => {
  it("generates checklist from relevant requirements", () => {
    const spec = { name: "Button", type: "component" as const } as any;
    const reqs = [
      { source: "research" as const, insightId: "1", finding: "x", requirement: "Add focus ring", category: "accessibility" as const, priority: "must" as const, targetSpecs: ["Button"] },
      { source: "research" as const, insightId: "2", finding: "y", requirement: "Add tooltip", category: "ux" as const, priority: "should" as const, targetSpecs: ["*"] },
      { source: "research" as const, insightId: "3", finding: "z", requirement: "Irrelevant", category: "ux" as const, priority: "could" as const, targetSpecs: ["OtherComponent"] },
    ];
    const checklist = generateA11yChecklist(spec, reqs);
    expect(checklist).toHaveLength(2); // Button + wildcard, not OtherComponent
    expect(checklist[0]).toContain("[MUST]");
    expect(checklist[1]).toContain("[SHOULD]");
  });
});

describe("mapPersonaRequirements", () => {
  it("maps persona pain points to requirements", () => {
    const personas: ResearchPersona[] = [{
      name: "Alex",
      role: "end-user",
      goals: ["Complete tasks quickly"],
      painPoints: [
        "Can't read small text on the dashboard",
        "I kept getting lost and couldn't navigate back",
      ],
      behaviors: ["Uses mobile primarily"],
      source: "interview",
    }];
    const reqs = mapPersonaRequirements(personas);
    expect(reqs.length).toBeGreaterThanOrEqual(2);
    expect(reqs.some((r) => r.category === "accessibility")).toBe(true);
    expect(reqs.some((r) => r.category === "ux")).toBe(true);
  });

  it("returns empty for personas with no matching pain points", () => {
    const personas: ResearchPersona[] = [{
      name: "Sam",
      role: "viewer",
      goals: ["Use the app"],
      painPoints: ["The logo is nice"],
      behaviors: [],
      source: "survey",
    }];
    const reqs = mapPersonaRequirements(personas);
    expect(reqs).toHaveLength(0);
  });
});
