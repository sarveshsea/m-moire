/**
 * MCP Tool registrations for Mémoire.
 *
 * Each tool wraps an existing engine method and returns structured
 * CallToolResult payloads. Errors are caught and returned as
 * { isError: true } per MCP convention.
 */

import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoireEngine } from "../engine/core.js";
import { AgentOrchestrator } from "../agents/orchestrator.js";
import { DesignAnalyzer } from "../agents/design-analyzer.js";
import { getAI, getTracker } from "../ai/index.js";
import { ComponentSpecSchema, PageSpecSchema, DataVizSpecSchema } from "../specs/types.js";

function requireFigma(engine: MemoireEngine): void {
  if (!engine.figma.isConnected) {
    throw new Error("Figma not connected. Start the daemon (`memi daemon start`) or connect (`memi connect`) first.");
  }
}

export function registerTools(server: McpServer, engine: MemoireEngine): void {
  // ── pull_design_system ──────────────────────────────────
  server.tool(
    "pull_design_system",
    "Pull the full design system (tokens, components, styles) from the connected Figma file into the local registry",
    {},
    async () => {
      requireFigma(engine);
      await engine.pullDesignSystem();
      const ds = engine.registry.designSystem;
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            tokens: ds.tokens.length,
            components: ds.components.length,
            styles: ds.styles.length,
            lastSync: ds.lastSync,
          }, null, 2),
        }],
      };
    },
  );

  // ── get_specs ───────────────────────────────────────────
  server.tool(
    "get_specs",
    "List all specs in the project (component, page, dataviz, design, ia)",
    {},
    async () => {
      const specs = await engine.registry.getAllSpecs();
      return {
        content: [{
          type: "text",
          text: JSON.stringify(specs.map((s) => ({
            name: s.name,
            type: s.type,
            purpose: "purpose" in s ? s.purpose : undefined,
          })), null, 2),
        }],
      };
    },
  );

  // ── get_spec ────────────────────────────────────────────
  server.tool(
    "get_spec",
    "Get a single spec by name with full details",
    { name: z.string().describe("Spec name") },
    async ({ name }) => {
      const spec = await engine.registry.getSpec(name);
      if (!spec) {
        return { isError: true, content: [{ type: "text" as const, text: `Spec "${name}" not found` }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(spec, null, 2) }] };
    },
  );

  // ── create_spec ─────────────────────────────────────────
  server.tool(
    "create_spec",
    "Create or update a spec. Pass a JSON string matching ComponentSpec, PageSpec, or DataVizSpec schema.",
    { spec: z.string().describe("JSON string of the spec object") },
    async ({ spec: specJson }) => {
      try {
        const raw = JSON.parse(specJson);
        let parsed;
        switch (raw.type) {
          case "component": parsed = ComponentSpecSchema.parse(raw); break;
          case "page": parsed = PageSpecSchema.parse(raw); break;
          case "dataviz": parsed = DataVizSpecSchema.parse(raw); break;
          default: return { isError: true, content: [{ type: "text" as const, text: `Unknown spec type: ${raw.type}. Must be component, page, or dataviz.` }] };
        }
        await engine.registry.saveSpec(parsed);
        return { content: [{ type: "text" as const, text: `Spec "${parsed.name}" saved (${parsed.type})` }] };
      } catch (err) {
        return { isError: true, content: [{ type: "text" as const, text: `Failed to create spec: ${(err as Error).message}` }] };
      }
    },
  );

  // ── generate_code ───────────────────────────────────────
  server.tool(
    "generate_code",
    "Generate code from a spec. Returns the entry file path and list of generated files.",
    { specName: z.string().describe("Name of the spec to generate code for") },
    async ({ specName }) => {
      const entryFile = await engine.generateFromSpec(specName);
      const gen = engine.registry.getGenerationState(specName);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            entryFile,
            files: gen?.files ?? [],
            generatedAt: gen?.generatedAt,
          }, null, 2),
        }],
      };
    },
  );

  // ── get_tokens ──────────────────────────────────────────
  server.tool(
    "get_tokens",
    "Get all design tokens from the local registry (colors, spacing, typography, etc.)",
    {},
    async () => ({
      content: [{
        type: "text" as const,
        text: JSON.stringify(engine.registry.designSystem.tokens, null, 2),
      }],
    }),
  );

  // ── update_token ────────────────────────────────────────
  server.tool(
    "update_token",
    "Update a design token value in the registry and optionally push to Figma",
    {
      name: z.string().describe("Token name to update"),
      values: z.record(z.union([z.string(), z.number()])).describe("Mode-value pairs, e.g. { \"Light\": \"#FF0000\" }"),
      pushToFigma: z.boolean().default(false).describe("Whether to push the change to Figma"),
    },
    async ({ name, values, pushToFigma }) => {
      const token = engine.registry.designSystem.tokens.find((t) => t.name === name);
      if (!token) {
        return { isError: true, content: [{ type: "text" as const, text: `Token "${name}" not found` }] };
      }
      const updated = { ...token, values: { ...token.values, ...values } };
      engine.registry.updateToken(name, updated);

      if (pushToFigma && engine.figma.isConnected) {
        await engine.figma.pushTokens([{ name: updated.name, values: updated.values }]);
      }

      return { content: [{ type: "text" as const, text: `Token "${name}" updated` }] };
    },
  );

  // ── capture_screenshot ──────────────────────────────────
  server.tool(
    "capture_screenshot",
    "Capture a screenshot of a Figma node (or the full page if no nodeId given)",
    {
      nodeId: z.string().optional().describe("Figma node ID to capture. Omit for full page."),
      format: z.enum(["PNG", "SVG"]).default("PNG"),
      scale: z.number().default(2),
    },
    async ({ nodeId, format, scale }) => {
      requireFigma(engine);
      const result = await engine.figma.captureScreenshot(nodeId, format, scale);
      return {
        content: [{
          type: "image" as const,
          data: result.base64,
          mimeType: format === "SVG" ? "image/svg+xml" : "image/png",
        }],
      };
    },
  );

  // ── get_selection ───────────────────────────────────────
  server.tool(
    "get_selection",
    "Get the current Figma selection (selected nodes with properties, styles, layout info)",
    {},
    async () => {
      requireFigma(engine);
      const selection = await engine.figma.getSelection();
      return { content: [{ type: "text" as const, text: JSON.stringify(selection, null, 2) }] };
    },
  );

  // ── compose ─────────────────────────────────────────────
  server.tool(
    "compose",
    "Run the agent orchestrator with a natural language intent. Classifies, plans, and executes design tasks.",
    {
      intent: z.string().describe("Natural language design intent, e.g. 'create a dashboard with KPI cards'"),
      dryRun: z.boolean().default(false).describe("If true, return the plan without executing"),
    },
    async ({ intent, dryRun }) => {
      const orchestrator = new AgentOrchestrator(engine);
      const result = await orchestrator.execute(intent, { dryRun });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── run_audit ───────────────────────────────────────────
  server.tool(
    "run_audit",
    "Run a design system audit via the agent orchestrator",
    {
      focus: z.string().optional().describe("Optional focus area, e.g. 'accessibility', 'token coverage', 'naming'"),
    },
    async ({ focus }) => {
      const intent = focus ? `design-audit focusing on ${focus}` : "design-audit";
      const orchestrator = new AgentOrchestrator(engine);
      const result = await orchestrator.execute(intent);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── get_research ────────────────────────────────────────
  server.tool(
    "get_research",
    "Get the research store (insights, personas, themes, sources)",
    {},
    async () => {
      await engine.research.load();
      const store = engine.research.getStore();
      return { content: [{ type: "text" as const, text: JSON.stringify(store, null, 2) }] };
    },
  );

  // ── figma_execute ───────────────────────────────────────
  server.tool(
    "figma_execute",
    "Execute arbitrary Figma Plugin API code on the connected plugin (sandboxed). Returns the result.",
    { code: z.string().describe("JavaScript code to execute in the Figma plugin sandbox") },
    async ({ code }) => {
      requireFigma(engine);
      const result = await engine.figma.execute(code);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── analyze_design ──────────────────────────────────────
  server.tool(
    "analyze_design",
    "Analyze a Figma screenshot using AI vision — checks quality, consistency, accessibility, and optionally spec compliance",
    {
      nodeId: z.string().optional().describe("Figma node ID to capture and analyze. Omit for current page."),
      mode: z.enum(["general", "accessibility", "spec-compliance"]).default("general").describe("Analysis mode"),
      specName: z.string().optional().describe("Spec name to check compliance against (for spec-compliance mode)"),
    },
    async ({ nodeId, mode, specName }) => {
      requireFigma(engine);
      const ai = getAI();
      if (!ai) {
        return { isError: true, content: [{ type: "text" as const, text: "ANTHROPIC_API_KEY not set — AI vision requires an API key" }] };
      }

      const screenshot = await engine.figma.captureScreenshot(nodeId, "PNG", 2);
      const analyzer = new DesignAnalyzer(ai);

      let analysis;
      switch (mode) {
        case "accessibility":
          analysis = await analyzer.auditAccessibility(screenshot.base64);
          break;
        case "spec-compliance": {
          if (!specName) {
            return { isError: true, content: [{ type: "text" as const, text: "specName required for spec-compliance mode" }] };
          }
          const spec = await engine.registry.getSpec(specName);
          if (!spec) {
            return { isError: true, content: [{ type: "text" as const, text: `Spec "${specName}" not found` }] };
          }
          analysis = await analyzer.checkSpecCompliance(screenshot.base64, JSON.stringify(spec, null, 2), engine.registry.designSystem);
          break;
        }
        default:
          analysis = await analyzer.analyzeDesign(screenshot.base64);
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(analysis, null, 2) }] };
    },
  );

  // ── get_page_tree ───────────────────────────────────────
  server.tool(
    "get_page_tree",
    "Get the Figma page tree structure (pages, frames, components) up to a given depth",
    { depth: z.number().default(2).describe("Max depth to traverse (default 2)") },
    async ({ depth }) => {
      requireFigma(engine);
      const tree = await engine.figma.getPageTree(depth);
      return { content: [{ type: "text" as const, text: JSON.stringify(tree, null, 2) }] };
    },
  );

  // ── measure_text ───────────────────────────────────────
  server.tool(
    "measure_text",
    "Measure text dimensions using Pretext — predict height, line count, overflow, and breakpoint behavior without a browser",
    {
      text: z.string().describe("The text to measure"),
      maxWidth: z.number().describe("Maximum width in pixels for line wrapping"),
      font: z.string().default("16px sans-serif").describe("CSS font string (e.g., '16px Inter', 'bold 14px sans-serif')"),
      lineHeight: z.number().optional().describe("Line height in px (default: fontSize * 1.5)"),
      containerHeight: z.number().optional().describe("If set, checks whether text fits in this container height"),
      checkBreakpoints: z.boolean().default(false).describe("If true, test text at mobile/tablet/desktop widths"),
    },
    async ({ text, maxWidth, font, lineHeight, containerHeight, checkBreakpoints: doBreakpoints }) => {
      const { getTextMeasurer } = await import("../engine/text-measurer.js");
      const measurer = getTextMeasurer();

      const result: Record<string, unknown> = {};

      // Basic measurement
      const measurement = measurer.measureDetailed(text, { maxWidth, font, lineHeight });
      result.height = measurement.height;
      result.lineCount = measurement.lineCount;
      result.lines = measurement.lines;

      // Overflow check
      if (containerHeight !== undefined) {
        const overflow = measurer.checkOverflow(text, { maxWidth, font, lineHeight, containerHeight });
        result.overflow = overflow;
      }

      // Breakpoint analysis
      if (doBreakpoints) {
        const breakpoints = measurer.checkBreakpoints(text, { font, lineHeight, containerHeight });
        result.breakpoints = breakpoints;
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── sync_design_tokens ─────────────────────────────────
  server.tool(
    "sync_design_tokens",
    "Map design system tokens to a Tailwind config patch object. Groups tokens by type (color, spacing, typography, radius, shadow) and returns a ready-to-merge Tailwind theme extension.",
    {},
    async () => {
      const tokens = engine.registry.designSystem.tokens;
      const patch: Record<string, Record<string, string>> = {
        colors: {},
        spacing: {},
        fontSize: {},
        borderRadius: {},
        boxShadow: {},
      };

      for (const token of tokens) {
        // Derive a Tailwind-friendly key from the token name
        // e.g. "Colors/Primary" → "primary", "Spacing/XS" → "xs"
        const parts = token.name.split("/");
        const key = (parts[parts.length - 1] ?? token.name)
          .replace(/\s+/g, "-")
          .toLowerCase();

        // Pick first mode value as the default, or use the CSS variable
        const firstValue = Object.values(token.values)[0];
        const value = token.cssVariable
          ? `var(${token.cssVariable})`
          : String(firstValue ?? "");

        switch (token.type) {
          case "color":
            patch.colors[key] = value;
            break;
          case "spacing":
            patch.spacing[key] = value;
            break;
          case "typography":
            patch.fontSize[key] = value;
            break;
          case "radius":
            patch.borderRadius[key] = value;
            break;
          case "shadow":
            patch.boxShadow[key] = value;
            break;
          // "other" tokens are skipped — no standard Tailwind mapping
        }
      }

      // Remove empty groups
      for (const group of Object.keys(patch)) {
        if (Object.keys(patch[group]).length === 0) {
          delete patch[group];
        }
      }

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify(patch, null, 2),
        }],
      };
    },
  );

  // ── get_ai_usage ──────────────────────────────────────
  server.tool(
    "get_ai_usage",
    "Get AI token usage and cost estimates for the current session",
    {},
    async () => {
      const tracker = getTracker();
      if (!tracker) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ calls: 0, inputTokens: 0, outputTokens: 0, estimatedCost: "$0.0000", summary: "No AI client initialized" }, null, 2) }] };
      }
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            calls: tracker.callCount,
            inputTokens: tracker.totalInput,
            outputTokens: tracker.totalOutput,
            estimatedCost: `$${tracker.totalCost.toFixed(4)}`,
            summary: tracker.summary,
          }, null, 2),
        }],
      };
    },
  );
}
