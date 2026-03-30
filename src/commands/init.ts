import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { ComponentSpec, DataVizSpec, PageSpec } from "../specs/types.js";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import ora from "ora";
import { ui } from "../tui/format.js";

export function registerInitCommand(program: Command, engine: MemoireEngine) {
  program
    .command("init")
    .description("Interactive onboarding — set up Mémoire for your project")
    .action(async () => {
      const root = engine.config.projectRoot;

      // ── Brand ───────────────────────────────────────
      console.log(ui.brand("AI-Native Design Intelligence Engine"));

      // ── Detect ──────────────────────────────────────
      const detect = ora({ text: "Detecting project...", indent: 2, color: "cyan" }).start();
      await engine.init();
      const project = engine.project;

      const parts: string[] = [];
      if (project?.framework) parts.push(project.framework);
      if (project?.language) parts.push(project.language);
      if (project?.styling.tailwind) parts.push("tailwind");
      if (project?.shadcn.installed) parts.push(`shadcn (${project.shadcn.components.length})`);

      detect.stop();
      console.log(ui.dots("DETECT", parts.length > 0 ? parts.join(" + ") : "no framework detected"));

      // ── Keys guide ──────────────────────────────────
      console.log(ui.section("KEYS"));
      console.log();
      console.log(ui.dots("FIGMA_TOKEN", "required for sync"));
      console.log(ui.instructions([
        '1. Open Figma > Settings > Account',
        '2. Scroll to "Personal Access Tokens"',
        '3. Generate new token named "Memoire"',
        '4. export FIGMA_TOKEN="figd_xxxxx"',
      ]));
      console.log();
      console.log(ui.dots("FIGMA_FILE_KEY", "optional default"));
      console.log("  From URL: figma.com/design/[THIS_PART]/...");
      console.log('  export FIGMA_FILE_KEY="abc123def456"');

      // ── Structure ───────────────────────────────────
      console.log(ui.section("STRUCTURE"));

      const dirGroups: [string, string[]][] = [
        ["specs/", ["components", "pages", "dataviz", "design", "ia"]],
        ["research/", ["reports"]],
        ["generated/", ["components", "pages", "dataviz"]],
        ["prototype/", []],
        [".memoire/", ["notes"]],
      ];

      for (const [parent, children] of dirGroups) {
        const fullChildren = children.map((c) => parent + c);
        const allPaths = [parent, ...fullChildren];
        for (const dir of allPaths) {
          await mkdir(join(root, dir), { recursive: true });
        }
        const desc = children.length > 0 ? ui.dim("  " + children.join(", ")) : "";
        console.log(ui.ok(parent + desc));
      }

      // ── Starter specs ───────────────────────────────
      console.log(ui.section("SPECS"));
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
        accessibility: { role: "article", ariaLabel: "required", keyboardNav: false, focusStyle: "outline", touchTarget: "default", reducedMotion: false, liveRegion: "off", colorIndependent: true },
        dataviz: null,
        tags: ["dashboard", "kpi"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (await engine.registry.getSpec(metricCard.name)) {
        console.log(ui.skip("MetricCard" + ui.dim("  already exists")));
      } else {
        await engine.registry.saveSpec(metricCard);
        createdSpecs.push(metricCard.name);
        console.log(ui.ok("MetricCard" + ui.dim("  component")));
      }

      const activityChart: DataVizSpec = {
        name: "ActivityChart",
        type: "dataviz",
        purpose: "Show daily activity trend over the last 30 days",
        chartType: "area",
        library: "recharts",
        dataShape: { x: "date", y: "value", series: ["users", "sessions"] },
        interactions: ["hover-tooltip", "brush"],
        accessibility: { altText: "required", keyboardNav: true, dataTableFallback: true, patternFill: false, announceUpdates: false, highContrastMode: false },
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
        console.log(ui.skip("ActivityChart" + ui.dim("  already exists")));
      } else {
        await engine.registry.saveSpec(activityChart);
        createdSpecs.push(activityChart.name);
        console.log(ui.ok("ActivityChart" + ui.dim("  dataviz")));
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
        accessibility: { language: "en", landmarks: true, skipLink: true, headingHierarchy: true, consistentNav: true, consistentHelp: true },
        meta: { title: "Dashboard", description: "Overview of key metrics" },
        tags: ["dashboard"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (await engine.registry.getSpec(dashboard.name)) {
        console.log(ui.skip("Dashboard" + ui.dim("  already exists")));
      } else {
        await engine.registry.saveSpec(dashboard);
        createdSpecs.push(dashboard.name);
        console.log(ui.ok("Dashboard" + ui.dim("  page")));
      }

      // ── Codegen ─────────────────────────────────────
      console.log(ui.section("CODEGEN"));

      if (createdSpecs.length === 0) {
        console.log(ui.skip("Starter specs already present"));
      } else {
        for (const specName of createdSpecs) {
          const gen = ora({ text: specName, indent: 2, color: "cyan" }).start();
          try {
            await engine.generateFromSpec(specName);
            gen.stop();
            console.log(ui.ok(specName));
          } catch (err) {
            gen.stop();
            const msg = err instanceof Error ? err.message : String(err);
            console.log(ui.warn(specName + ui.dim("  " + msg)));
          }
        }
      }

      // ── Onboarding marker ───────────────────────────
      await writeFile(
        join(root, ".memoire", "onboarded.json"),
        JSON.stringify({ completedAt: new Date().toISOString(), version: "0.1.0" })
      );

      // ── Ready ───────────────────────────────────────
      console.log();
      console.log(ui.rule());
      console.log();
      console.log(ui.ready("READY"));
      console.log("  " + createdSpecs.length + " specs created" + ui.dim(" · ") + "shadcn components generated");
      console.log("  Research directory ready for data");

      // Plugin info
      const home = process.env.HOME || process.env.USERPROFILE || "";
      const homePlugin = join(home, ".memoire", "plugin", "manifest.json");
      const localPlugin = join(root, "plugin", "manifest.json");
      const pluginPath = existsSync(homePlugin) ? homePlugin : localPlugin;

      console.log();
      console.log(ui.dots("Plugin", pluginPath));
      console.log("  Import in Figma: Plugins > Development > Import from manifest");

      // Next steps
      console.log(ui.section("NEXT"));
      console.log(ui.guide("memi connect", "guided Figma setup"));
      console.log(ui.guide("memi pull", "sync design system"));
      console.log(ui.guide("memi ia extract app", "extract page tree"));
      console.log(ui.guide("memi dashboard", "launch dashboard"));
      console.log(ui.guide("memi spec component Name", "create a spec"));
      console.log(ui.guide("memi generate", "generate code"));
      console.log();
      console.log("  " + ui.dim("memi status") + "    " + ui.dim("check progress"));
      console.log("  " + ui.dim("memi --help") + "    " + ui.dim("all commands"));
      console.log();
    });
}
