import { describe, expect, it } from "vitest";
import { AgentOrchestrator } from "../orchestrator.js";
import type { AnySpec, ComponentSpec, DesignSystem, PageSpec } from "../../specs/types.js";

function makeComponentSpec(name: string): ComponentSpec {
  const now = new Date().toISOString();
  return {
    name,
    type: "component",
    level: "molecule",
    purpose: `${name} component`,
    researchBacking: [],
    designTokens: { source: "none", mapped: false },
    variants: ["default"],
    props: {},
    shadcnBase: ["Card"],
    composesSpecs: [],
    codeConnect: { props: {}, mapped: false },
    accessibility: { ariaLabel: "optional", keyboardNav: false },
    dataviz: null,
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeEngine(initialSpecs: AnySpec[]) {
  const specs = [...initialSpecs];
  const generated: string[] = [];
  const saved: AnySpec[] = [];
  const designSystem: DesignSystem = {
    tokens: [],
    components: [],
    styles: [],
    lastSync: new Date().toISOString(),
  };

  const registry = {
    designSystem,
    async getAllSpecs() {
      return [...specs];
    },
    async getSpec(name: string) {
      return specs.find((spec) => spec.name === name) ?? null;
    },
    async saveSpec(spec: AnySpec) {
      const index = specs.findIndex((entry) => entry.name === spec.name);
      if (index >= 0) {
        specs[index] = spec;
      } else {
        specs.push(spec);
      }
      saved.push(spec);
    },
    removeToken() {},
  };

  return {
    engine: {
      registry,
      notes: { loaded: false, notes: [] },
      figma: { isConnected: false },
      project: { framework: "vite" },
      async generateFromSpec(name: string) {
        generated.push(name);
        return `generated/${name}.tsx`;
      },
    },
    generated,
    saved,
  };
}

describe("AgentOrchestrator compose targeting", () => {
  it("creates and generates only the requested page spec for page-layout intents", async () => {
    const { engine, generated, saved } = makeEngine([makeComponentSpec("ExistingCard")]);
    const orchestrator = new AgentOrchestrator(engine as never);

    const result = await orchestrator.execute("create a login page with email and password fields");

    expect(result.status).toBe("completed");
    expect(saved).toHaveLength(1);
    expect((saved[0] as PageSpec).name).toBe("LoginPage");
    expect((saved[0] as PageSpec).type).toBe("page");
    expect(generated).toEqual(["LoginPage"]);
  });

  it("still generates all specs for explicit code-generate intents", async () => {
    const { engine, generated } = makeEngine([
      makeComponentSpec("MetricCard"),
      makeComponentSpec("TrendBadge"),
    ]);
    const orchestrator = new AgentOrchestrator(engine as never);

    const result = await orchestrator.execute("generate code for all specs");

    expect(result.status).toBe("completed");
    expect(generated).toEqual(["MetricCard", "TrendBadge"]);
  });
});
