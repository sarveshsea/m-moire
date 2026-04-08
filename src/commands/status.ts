import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { hasAI, getTracker } from "../ai/index.js";
import { ui } from "../tui/format.js";
import { formatElapsed } from "../utils/format.js";

export interface StatusPayload {
  project: {
    framework: string;
    language: string;
    tailwind: boolean;
    tailwindVersion?: string;
    shadcnInstalled: boolean;
    shadcnComponents: number;
  };
  figma: {
    connected: boolean;
    tokens: number;
    components: number;
    styles: number;
    lastSync: string;
  };
  specs: {
    components: number;
    pages: number;
    dataviz: number;
    generated: number;
    total: number;
  };
  research: {
    insights: number;
    themes: number;
    sources: number;
    highConfidence: number;
  };
  ai: {
    apiKey: boolean;
    calls: number;
    usage: string | null;
    mode: string;
  };
  notes: {
    builtIn: number;
    installed: number;
    total: number;
  };
}

export function registerStatusCommand(program: Command, engine: MemoireEngine) {
  program
    .command("status")
    .description("Show project status")
    .option("--json", "Output status as JSON")
    .action(async (opts: { json?: boolean }) => {
      const start = Date.now();
      const payload = await collectStatus(engine);

      if (opts.json) {
        console.log(JSON.stringify({ ok: true, elapsed: formatElapsed(Date.now() - start), data: payload }, null, 2));
        return;
      }

      printStatus(payload);
    });
}

export async function collectStatus(engine: MemoireEngine): Promise<StatusPayload> {
  await engine.init();
  await engine.research.load();
  if (!engine.notes.loaded) await engine.notes.loadAll();

  const project = engine.project;
  const specs = await engine.registry.getAllSpecs();
  const ds = engine.registry.designSystem;
  const research = engine.research.getStore();

  const components = specs.filter((s) => s.type === "component");
  const pages = specs.filter((s) => s.type === "page");
  const dataviz = specs.filter((s) => s.type === "dataviz");
  const generated = specs.filter((s) => engine.registry.getGenerationState(s.name));
  const highConfidence = research.insights.filter((i) => i.confidence === "high").length;

  const allNotes = engine.notes.notes;
  const builtInCount = allNotes.filter((n) => n.builtIn).length;
  const installedCount = allNotes.filter((n) => !n.builtIn).length;

  const tracker = getTracker();

  return {
    project: {
      framework: project?.framework ?? "not detected",
      language: project?.language ?? "unknown",
      tailwind: project?.styling.tailwind ?? false,
      tailwindVersion: project?.styling.tailwindVersion,
      shadcnInstalled: project?.shadcn.installed ?? false,
      shadcnComponents: project?.shadcn.components.length ?? 0,
    },
    figma: {
      connected: engine.figma.isConnected,
      tokens: ds.tokens.length,
      components: ds.components.length,
      styles: ds.styles.length,
      lastSync: ds.lastSync,
    },
    specs: {
      components: components.length,
      pages: pages.length,
      dataviz: dataviz.length,
      generated: generated.length,
      total: specs.length,
    },
    research: {
      insights: research.insights.length,
      themes: research.themes.length,
      sources: research.sources.length,
      highConfidence,
    },
    ai: {
      apiKey: hasAI(),
      calls: tracker?.callCount ?? 0,
      usage: tracker?.summary ?? null,
      mode: tracker ? "direct-api" : "agent-cli",
    },
    notes: {
      builtIn: builtInCount,
      installed: installedCount,
      total: allNotes.length,
    },
  };
}

function printStatus(p: StatusPayload): void {
  console.log(ui.brand("STATUS"));

  // ── Project ───────────────────────────────────────
  console.log(ui.section("PROJECT"));
  console.log(ui.dots("Framework", p.project.framework));
  console.log(ui.dots("Language", p.project.language));
  console.log(ui.dots("Tailwind", p.project.tailwind ? (p.project.tailwindVersion ?? "yes") : "no"));
  console.log(ui.dots("shadcn", p.project.shadcnInstalled ? `yes (${p.project.shadcnComponents})` : "no"));

  // ── Figma ─────────────────────────────────────────
  console.log(ui.section("FIGMA"));
  console.log(ui.dots("Connected", p.figma.connected ? ui.green("yes") : "no"));
  console.log(ui.dots("Tokens", String(p.figma.tokens)));
  console.log(ui.dots("Components", String(p.figma.components)));
  console.log(ui.dots("Styles", String(p.figma.styles)));
  console.log(ui.dots("Last sync", p.figma.lastSync || ui.dim("never")));

  // ── Specs ─────────────────────────────────────────
  console.log(ui.section("SPECS"));
  console.log(ui.dots("Components", String(p.specs.components)));
  console.log(ui.dots("Pages", String(p.specs.pages)));
  console.log(ui.dots("DataViz", String(p.specs.dataviz)));
  console.log(ui.dots("Generated", `${p.specs.generated} / ${p.specs.total}  ${ui.progress(p.specs.generated, p.specs.total, 12)}`));

  // ── Research ──────────────────────────────────────
  console.log(ui.section("RESEARCH"));
  console.log(ui.dots("Insights", String(p.research.insights)));
  console.log(ui.dots("Themes", String(p.research.themes)));
  console.log(ui.dots("Sources", String(p.research.sources)));
  if (p.research.highConfidence > 0) {
    console.log(ui.dots("High confidence", String(p.research.highConfidence)));
  }

  // ── AI ────────────────────────────────────────────
  console.log(ui.section("AI"));
  console.log(ui.dots("API key", p.ai.apiKey ? ui.green("set") : ui.dim("not set")));
  if (p.ai.usage) {
    console.log(ui.dots("Calls", String(p.ai.calls)));
    console.log(ui.dots("Usage", p.ai.usage));
  } else {
    console.log(ui.dots("Mode", ui.dim("agent-cli")));
  }

  // ── Notes ─────────────────────────────────────────
  console.log(ui.section("NOTES"));
  console.log(ui.dots("Built-in", String(p.notes.builtIn)));
  console.log(ui.dots("Installed", String(p.notes.installed)));
  console.log(ui.dots("Total", String(p.notes.total)));
  console.log();

  // ── Next step ─────────────────────────────────────
  const next = deriveNextStep(p);
  console.log("  " + ui.dim("Next step:") + "  " + next);
  console.log();
}

function deriveNextStep(p: StatusPayload): string {
  const hasToken = p.ai.apiKey || p.figma.tokens > 0 || p.figma.connected;
  const hasSpecs = p.specs.total > 0;
  const hasGenerated = p.specs.generated > 0;
  const allGenerated = hasSpecs && p.specs.generated >= p.specs.total;

  if (!hasToken && p.figma.tokens === 0 && !p.figma.connected) {
    return "Run: memi setup";
  }
  if (!hasSpecs) {
    return "Run: memi pull, then memi spec component <Name>";
  }
  if (!hasGenerated) {
    return "Run: memi generate";
  }
  if (allGenerated) {
    return "Run: memi sync --live to keep in sync";
  }
  return "Run: memi preview to view";
}
