import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { ComponentSpec, DataVizSpec, PageSpec } from "../specs/types.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export function registerInitCommand(program: Command, engine: MemoireEngine) {
  program
    .command("init")
    .description("Interactive onboarding — set up Mémoire for your project")
    .action(async () => {
      const root = engine.config.projectRoot;

      console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║            Welcome to Mémoire                        ║
  ║     AI-Native Design Intelligence Engine         ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝
`);

      // Step 1: Detect project
      console.log("  Step 1/5: Detecting your project...\n");
      await engine.init();
      const project = engine.project;

      console.log(`    Framework:  ${project?.framework ?? "not detected"}`);
      console.log(`    Language:   ${project?.language ?? "unknown"}`);
      console.log(`    Tailwind:   ${project?.styling.tailwind ? "yes" : "not yet"}`);
      console.log(`    shadcn/ui:  ${project?.shadcn.installed ? `yes (${project.shadcn.components.length} components)` : "not yet"}`);

      // Step 2: API Keys guide
      console.log(`\n  Step 2/5: API Keys & Connections\n`);
      console.log(`    Mémoire connects to these services. Here's how to set them up:\n`);
      console.log(`    FIGMA_TOKEN (required for Figma sync)`);
      console.log(`    ─────────────────────────────────────`);
      console.log(`    1. Open Figma → Settings → Account`);
      console.log(`    2. Scroll to "Personal Access Tokens"`);
      console.log(`    3. Click "Generate new token"`);
      console.log(`    4. Name it "Memoire", copy the token`);
      console.log(`    5. Add to your shell: export FIGMA_TOKEN="figd_xxxxx"`);
      console.log(``);
      console.log(`    FIGMA_FILE_KEY (optional, for default file)`);
      console.log(`    ─────────────────────────────────────────`);
      console.log(`    From your Figma URL: figma.com/design/[THIS_PART]/...`);
      console.log(`    export FIGMA_FILE_KEY="abc123def456"`);

      // Step 3: Setup directory structure
      console.log(`\n  Step 3/5: Setting up project structure...\n`);

      const dirs = [
        "specs/components",
        "specs/pages",
        "specs/dataviz",
        "specs/design",
        "specs/ia",
        "research/reports",
        "generated/components",
        "generated/pages",
        "generated/dataviz",
        "prototype",
        ".memoire",
        ".memoire/notes",
      ];

      for (const dir of dirs) {
        await mkdir(join(root, dir), { recursive: true });
        console.log(`    Created: ${dir}/`);
      }

      // Step 4: Create starter specs
      console.log(`\n  Step 4/5: Creating starter dashboard specs...\n`);
      const createdSpecs: string[] = [];

      const metricCard: ComponentSpec = {
        name: "MetricCard",
        type: "component",
        level: "molecule",
        composesSpecs: [],
        codeConnect: { props: {}, mapped: false },
        purpose: "Display a single KPI metric with title, value, and optional trend indicator",
        researchBacking: [],
        designTokens: { source: "none", mapped: false },
        variants: ["default", "compact", "highlighted"],
        props: {
          title: "string",
          value: "string",
          change: "string?",
          trend: "up | down | flat",
        },
        shadcnBase: ["Card", "Badge"],
        accessibility: { role: "article", ariaLabel: "required", keyboardNav: false },
        dataviz: null,
        tags: ["dashboard", "kpi"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (await engine.registry.getSpec(metricCard.name)) {
        console.log("    Retained spec: MetricCard (already exists)");
      } else {
        await engine.registry.saveSpec(metricCard);
        createdSpecs.push(metricCard.name);
        console.log("    Created spec: MetricCard (component)");
      }

      const activityChart: DataVizSpec = {
        name: "ActivityChart",
        type: "dataviz",
        purpose: "Show daily activity trend over the last 30 days",
        chartType: "area",
        library: "recharts",
        dataShape: { x: "date", y: "value", series: ["users", "sessions"] },
        interactions: ["hover-tooltip", "brush"],
        accessibility: { altText: "required", keyboardNav: true, dataTableFallback: true },
        responsive: {
          mobile: { height: 200, simplify: true },
          desktop: { height: 400 },
        },
        shadcnWrapper: "Card",
        sampleData: [
          { date: "Mon", users: 120, sessions: 340 },
          { date: "Tue", users: 150, sessions: 420 },
          { date: "Wed", users: 180, sessions: 510 },
          { date: "Thu", users: 140, sessions: 380 },
          { date: "Fri", users: 200, sessions: 580 },
          { date: "Sat", users: 90, sessions: 210 },
          { date: "Sun", users: 70, sessions: 160 },
        ],
        tags: ["dashboard", "analytics"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (await engine.registry.getSpec(activityChart.name)) {
        console.log("    Retained spec: ActivityChart (already exists)");
      } else {
        await engine.registry.saveSpec(activityChart);
        createdSpecs.push(activityChart.name);
        console.log("    Created spec: ActivityChart (dataviz)");
      }

      const dashboard: PageSpec = {
        name: "Dashboard",
        type: "page",
        purpose: "Main application dashboard showing KPIs and activity trends",
        researchBacking: [],
        layout: "dashboard",
        sections: [
          { name: "metrics-row", component: "MetricCard", repeat: 4, layout: "grid-4", props: {} },
          { name: "activity-chart", component: "ActivityChart", repeat: 1, layout: "full-width", props: {} },
        ],
        shadcnLayout: ["SidebarProvider", "SidebarInset"],
        responsive: { mobile: "stack", tablet: "grid-2", desktop: "grid-4" },
        meta: { title: "Dashboard", description: "Overview of key metrics" },
        tags: ["dashboard"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (await engine.registry.getSpec(dashboard.name)) {
        console.log("    Retained spec: Dashboard (already exists)");
      } else {
        await engine.registry.saveSpec(dashboard);
        createdSpecs.push(dashboard.name);
        console.log("    Created spec: Dashboard (page)");
      }

      // Step 5: Generate and build
      console.log(`\n  Step 5/5: Generating code from starter specs...\n`);

      if (createdSpecs.length === 0) {
        console.log("    Starter specs already present. Skipping regeneration.");
      } else {
        for (const specName of createdSpecs) {
          try {
            await engine.generateFromSpec(specName);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`    Skipped ${specName}: ${msg}`);
          }
        }
      }

      // Write onboarding complete marker
      await writeFile(
        join(root, ".memoire", "onboarded.json"),
        JSON.stringify({ completedAt: new Date().toISOString(), version: "0.1.0" })
      );

      console.log(`
  ╔══════════════════════════════════════════════════╗
  ║                                                  ║
  ║            Mémoire is ready!                         ║
  ║                                                  ║
  ╚══════════════════════════════════════════════════╝

  Your project now has:
    3 starter specs (MetricCard, ActivityChart, Dashboard)
    Generated shadcn components in generated/
    Research directory ready for data

  Figma Plugin:${(() => {
        const home = process.env.HOME || process.env.USERPROFILE || "";
        const homePlugin = join(home, ".memoire", "plugin", "manifest.json");
        const localPlugin = join(root, "plugin", "manifest.json");
        const pluginPath = existsSync(homePlugin) ? homePlugin : localPlugin;
        return `
    Import in Figma: Plugins → Development → Import from manifest
    Path: ${pluginPath}
    (macOS: Cmd+Shift+G in file picker to paste the path)`;
      })()}

  Next steps (one at a time):

    STEP 1 — Connect to Figma (guided):
 *   memi connect
       (walks you through token setup, file key, and plugin install)

    STEP 2 — Pull your design system:
 *   memi pull

    STEP 3 — Extract information architecture:
 *   memi ia extract MyApp

    STEP 4 — Launch the dashboard:
 *   memi dashboard

    STEP 5 — Create more specs:
 *   memi spec component MyComponent
 *   memi spec page MyPage
 *   memi spec dataviz MyChart
 *   memi spec design MyDesign
 *   memi ia create MySitemap

    STEP 6 — Generate code:
 *   memi generate

  Run \`memi status\` anytime to check progress.
  Run \`memi --help\` to see all commands.
`);
    });
}
