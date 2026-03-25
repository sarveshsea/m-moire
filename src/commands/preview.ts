import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec } from "../specs/types.js";
import type { DesignToken } from "../engine/registry.js";
import type { ResearchStore } from "../research/engine.js";
import { PreviewApiServer } from "../preview/api-server.js";
import { writeFile, mkdir, readFile } from "fs/promises";
import { join, basename } from "path";
import { spawn } from "child_process";

/** Escape HTML entities */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escColor(val: string): string {
  const safe = val.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(safe)) return safe;
  if (/^(rgb|hsl)a?\([^)]+\)$/.test(safe)) return safe;
  if (/^[a-zA-Z]{1,20}$/.test(safe)) return safe;
  return "#000";
}

interface PreviewData {
  projectName: string;
  specs: AnySpec[];
  tokens: DesignToken[];
  research: ResearchStore | null;
  generatedAt: string;
}

export function registerPreviewCommand(program: Command, engine: MemoireEngine) {
  program
    .command("preview")
    .description("Build and serve the Memoire component preview gallery")
    .option("-p, --port <port>", "Preview server port", "5173")
    .option("--build-only", "Build the preview without serving")
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        console.error("\n  Invalid port. Must be 1024-65535.\n");
        process.exit(1);
      }

      await engine.init();

      const previewDir = join(engine.config.projectRoot, "preview");
      await mkdir(previewDir, { recursive: true });

      const specs = await engine.registry.getAllSpecs();
      const tokens = engine.registry.designSystem.tokens;

      let research: ResearchStore | null = null;
      try {
        const researchPath = join(engine.config.projectRoot, "research", "insights.json");
        const raw = await readFile(researchPath, "utf-8");
        research = JSON.parse(raw) as ResearchStore;
      } catch {
        // No research data yet
      }

      console.log("\n  Building preview gallery...\n");

      const projectName = basename(engine.config.projectRoot);
      const data: PreviewData = { projectName, specs, tokens, research, generatedAt: new Date().toISOString() };

      // Generate all 5 pages
      await writeFile(join(previewDir, "index.html"), generateHomePage(data));
      await writeFile(join(previewDir, "research.html"), generateResearchPage(data));
      await writeFile(join(previewDir, "specs.html"), generateSpecsPage(data));
      await writeFile(join(previewDir, "design-system.html"), generateSystemsPage(data));
      await writeFile(join(previewDir, "changelog.html"), generateChangelogPage(data));

      const components = specs.filter((s: AnySpec) => s.type === "component");
      const pages = specs.filter((s: AnySpec) => s.type === "page");
      const dataviz = specs.filter((s: AnySpec) => s.type === "dataviz");

      console.log(`  Preview built:`);
      console.log(`    ${components.length} components, ${pages.length} pages, ${dataviz.length} dataviz`);
      console.log(`    ${tokens.length} design tokens`);
      if (research) {
        console.log(`    ${research.insights.length} insights, ${research.themes.length} themes`);
      }

      if (opts.buildOnly) {
        console.log(`\n  Preview built at: ${previewDir}\n`);
        return;
      }

      const apiServer = new PreviewApiServer(engine, previewDir, port);
      try {
        const actualPort = await apiServer.start();
        console.log(`\n  memoire preview on http://localhost:${actualPort}\n`);

        process.on("SIGINT", () => {
          console.log("\n  Shutting down...");
          apiServer.stop();
          process.exit(0);
        });
      } catch (err) {
        console.error(`\n  API server failed: ${(err as Error).message}`);
        console.log("  Falling back to static server...\n");
        try {
          spawn("npx", ["-y", "serve", previewDir, "-l", String(port), "--no-clipboard"], { stdio: "inherit", shell: true });
        } catch {
          spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
        }
      }
    });
}

// ── Shared CSS + Layout ────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #111113; --bg-card: #19191c; --bg-hover: #222226;
  --fg: #ffffff; --fg-muted: #636369; --border: #2a2a2e;
  --accent: #a0a0a6; --accent-bright: #ffffff;
  --mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --radius: 4px;
  --green: #4ade80; --yellow: #facc15; --red: #f87171; --blue: #60a5fa;
}
body { font-family: var(--mono); font-size: 12px; background: var(--bg); color: var(--fg); line-height: 1.6; min-height: 100vh; }
a { color: var(--accent-bright); text-decoration: none; }
a:hover { text-decoration: underline; }

.hdr { display: flex; justify-content: center; align-items: center; padding: 14px 24px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg); z-index: 100; }
.hdr-nav { display: flex; gap: 2px; align-items: center; }
.hdr-nav a { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: var(--radius); color: var(--fg-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; text-decoration: none; transition: color 0.15s, background 0.15s; }
.hdr-nav a:hover { color: var(--fg); background: var(--bg-hover); text-decoration: none; }
.hdr-nav a.active { color: var(--fg); background: var(--bg-card); text-decoration: none; }
.hdr-nav a svg { width: 14px; height: 14px; opacity: 0.5; }
.hdr-nav a.active svg { opacity: 1; }

.main { max-width: 1200px; margin: 0 auto; padding: 32px 24px; }
.section { display: none; }
.section.active { display: block; }

.card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--fg-muted); margin-bottom: 12px; }
.card-value { font-size: 24px; font-weight: 600; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
@media (max-width: 768px) { .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; } }

.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
.tab { padding: 8px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--fg-muted); cursor: pointer; border-bottom: 2px solid transparent; background: none; border-top: none; border-left: none; border-right: none; font-family: var(--mono); }
.tab:hover { color: var(--fg); }
.tab.active { color: var(--fg); border-bottom-color: var(--fg); }
.tab-panel { display: none; }
.tab-panel.active { display: block; }

.badge { display: inline-block; padding: 2px 8px; border-radius: var(--radius); font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.badge-high { background: rgba(74, 222, 128, 0.15); color: var(--green); }
.badge-medium { background: rgba(250, 204, 21, 0.15); color: var(--yellow); }
.badge-low { background: rgba(160, 160, 166, 0.15); color: var(--fg-muted); }
.badge-atom { background: rgba(96, 165, 250, 0.15); color: var(--blue); }
.badge-molecule { background: rgba(74, 222, 128, 0.15); color: var(--green); }
.badge-organism { background: rgba(250, 204, 21, 0.15); color: var(--yellow); }
.badge-template { background: rgba(248, 113, 113, 0.15); color: var(--red); }

.tag { display: inline-block; padding: 2px 6px; background: var(--bg-hover); border-radius: var(--radius); font-size: 10px; color: var(--fg-muted); margin: 2px; }

.empty { text-align: center; padding: 48px 24px; color: var(--fg-muted); }
.empty code { background: var(--bg-hover); padding: 2px 6px; border-radius: var(--radius); }

.token-swatch { width: 32px; height: 32px; border-radius: var(--radius); border: 1px solid var(--border); display: inline-block; vertical-align: middle; margin-right: 8px; }

table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
th { color: var(--fg-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 400; }

.sidebar-layout { display: grid; grid-template-columns: 240px 1fr; gap: 0; min-height: calc(100vh - 60px); }
.sidebar { border-right: 1px solid var(--border); padding: 20px; }
.sidebar-section { margin-bottom: 24px; }
.sidebar-label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--fg-muted); margin-bottom: 8px; }
.sidebar-item { display: block; padding: 6px 8px; border-radius: var(--radius); color: var(--fg-muted); cursor: pointer; font-size: 11px; }
.sidebar-item:hover, .sidebar-item.active { color: var(--fg); background: var(--bg-hover); }
.sidebar-count { float: right; color: var(--fg-muted); font-size: 10px; }
.content-panel { padding: 24px; overflow-y: auto; }

.footer { padding: 24px; text-align: center; color: var(--fg-muted); font-size: 10px; border-top: 1px solid var(--border); margin-top: 48px; }


.stat-row { display: flex; gap: 12px; margin-bottom: 32px; }
.stat-box { flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center; }
.stat-box .val { font-size: 28px; font-weight: 600; margin-bottom: 4px; }
.stat-box .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: var(--fg-muted); }

.conf-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px; background: var(--bg-hover); }
.conf-bar .seg { height: 100%; }
.conf-bar .seg-high { background: var(--fg); }
.conf-bar .seg-med { background: var(--fg-muted); }
.conf-bar .seg-low { background: var(--bg-hover); }
.conf-legend { display: flex; gap: 16px; font-size: 11px; color: var(--fg-muted); margin-bottom: 32px; }
.conf-legend .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }

.freq-row { display: flex; align-items: center; margin-bottom: 8px; font-size: 12px; }
.freq-label { width: 200px; flex-shrink: 0; }
.freq-bar-wrap { flex: 1; height: 6px; background: var(--bg-hover); border-radius: 3px; margin: 0 12px; }
.freq-bar { height: 100%; background: var(--fg-muted); border-radius: 3px; }
.freq-count { width: 30px; text-align: right; color: var(--fg-muted); font-size: 11px; }

.finding-card { background: var(--bg-card); border: 1px solid var(--border); border-left: 3px solid var(--fg); border-radius: var(--radius); padding: 20px; margin-bottom: 12px; }
.finding-card .finding-text { font-size: 13px; font-weight: 500; margin-bottom: 8px; }
.finding-card .finding-meta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--fg-muted); }

.token-row { display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
.token-swatch-sm { width: 24px; height: 24px; border-radius: 3px; border: 1px solid var(--border); margin-right: 12px; flex-shrink: 0; }
.token-name { font-size: 12px; color: var(--fg-muted); margin-right: auto; }
.token-val { font-size: 12px; color: var(--fg-muted); }
.group-header { font-size: 13px; font-weight: 500; margin: 24px 0 8px; }
.group-sub { font-size: 11px; color: var(--fg-muted); margin: 16px 0 4px; padding-left: 8px; }

.sidebar-item-indent { padding-left: 24px; }
`;

function pageShell(title: string, activeNav: string, body: string): string {
  const navItems = [
    { label: "Home", href: "index.html", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 12l9-8 9 8M5 11v8a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-8"/></svg>` },
    { label: "Research", href: "research.html", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>` },
    { label: "Specs", href: "specs.html", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h8M8 11h8M8 15h4"/></svg>` },
    { label: "Systems", href: "design-system.html", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>` },
    { label: "Changelog", href: "changelog.html", icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>` },
  ];
  const nav = navItems.map(n =>
    `<a href="${n.href}"${n.label === activeNav ? ' class="active"' : ""}>${n.icon}${esc(n.label)}</a>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='6' fill='%23ffffff'/%3E%3C/svg%3E">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
  <header class="hdr">
    <nav class="hdr-nav">${nav}</nav>
  </header>
  ${body}
</body>
</html>`;
}

// ── Tab JS helper ────────────────────────────────────────

const TAB_JS = `
<script>
function switchTab(group, tabName) {
  document.querySelectorAll('[data-tab-group="' + group + '"] .tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('[data-tab-group="' + group + '"] .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('[data-tab-group="' + group + '"] .tab[data-tab="' + tabName + '"]').classList.add('active');
  document.querySelector('[data-tab-group="' + group + '"] .tab-panel[data-panel="' + tabName + '"]').classList.add('active');
}
</script>`;

// ── HOME PAGE ──────────────────────────────────────────────

function generateHomePage(data: PreviewData): string {
  const { specs, tokens, research } = data;
  const components = specs.filter(s => s.type === "component");
  const pages = specs.filter(s => s.type === "page");
  const dataviz = specs.filter(s => s.type === "dataviz");
  const colorTokens = tokens.filter(t => t.type === "color");
  const spacingTokens = tokens.filter(t => t.type === "spacing");

  const body = `
  <div class="main">
    <div style="margin-bottom: 48px;">
      <h1 style="font-size: 32px; font-weight: 300; letter-spacing: 2px; margin-bottom: 8px;">memoire</h1>
      <p style="color: var(--fg-muted); font-size: 13px;">Spec-driven design intelligence. Figma bridge. Research synthesis. Atomic design. Code generation.</p>
    </div>

    <div class="grid-4" style="margin-bottom: 32px;">
      <div class="card">
        <div class="card-title">Components</div>
        <div class="card-value">${components.length}</div>
      </div>
      <div class="card">
        <div class="card-title">Pages</div>
        <div class="card-value">${pages.length}</div>
      </div>
      <div class="card">
        <div class="card-title">Data Viz</div>
        <div class="card-value">${dataviz.length}</div>
      </div>
      <div class="card">
        <div class="card-title">Tokens</div>
        <div class="card-value">${tokens.length}</div>
      </div>
    </div>

    <div class="grid-3" style="margin-bottom: 32px;">
      <div class="card">
        <div class="card-title">Token Coverage</div>
        <div style="margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Color</span><span>${colorTokens.length}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Spacing</span><span>${spacingTokens.length}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Typography</span><span>${tokens.filter(t => t.type === "typography").length}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Radius</span><span>${tokens.filter(t => t.type === "radius").length}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="color: var(--fg-muted);">Shadow</span><span>${tokens.filter(t => t.type === "shadow").length}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Research</div>
        <div style="margin-top: 8px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Insights</span><span>${research?.insights.length ?? 0}</span></div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: var(--fg-muted);">Themes</span><span>${research?.themes.length ?? 0}</span></div>
          <div style="display: flex; justify-content: space-between;"><span style="color: var(--fg-muted);">Personas</span><span>${research?.personas.length ?? 0}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Quick Commands</div>
        <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px;">
          <code style="color: var(--fg-muted); font-size: 11px;">memi connect</code>
          <code style="color: var(--fg-muted); font-size: 11px;">memi pull</code>
          <code style="color: var(--fg-muted); font-size: 11px;">memi generate</code>
          <code style="color: var(--fg-muted); font-size: 11px;">memi doctor</code>
          <code style="color: var(--fg-muted); font-size: 11px;">memi compose "&lt;intent&gt;"</code>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom: 32px;">
      <div class="card-title">Architecture</div>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 12px; font-size: 11px; color: var(--fg-muted);">
        <span style="color: var(--fg);">engine</span> &rarr;
        <span>figma bridge</span> &rarr;
        <span>research</span> &rarr;
        <span>specs</span> &rarr;
        <span>codegen</span> &rarr;
        <span>preview</span>
      </div>
    </div>

    <div class="footer">memoire v0.1.0 -- built ${esc(data.generatedAt.split("T")[0])}</div>
  </div>`;

  return pageShell("memoire", "Home", body);
}

// ── RESEARCH PAGE (7 tabs) ─────────────────────────────────

function generateResearchPage(data: PreviewData): string {
  const r = data.research;
  const insights = r?.insights ?? [];
  const themes = r?.themes ?? [];
  const personas = r?.personas ?? [];
  const sources = r?.sources ?? [];
  const allTags = new Set<string>();
  for (const i of insights) { for (const t of i.tags) allTags.add(t); }
  const highConf = insights.filter(i => i.confidence === "high");
  const medConf = insights.filter(i => i.confidence === "medium");
  const lowConf = insights.filter(i => i.confidence === "low");
  const total = insights.length || 1;
  const highPct = Math.round((highConf.length / total) * 100);
  const medPct = Math.round((medConf.length / total) * 100);

  // Top themes by frequency (sorted)
  const sortedThemes = [...themes].sort((a, b) => b.frequency - a.frequency).slice(0, 8);
  const maxFreq = sortedThemes[0]?.frequency || 1;
  const themeFreqBars = sortedThemes.map(t =>
    `<div class="freq-row"><div class="freq-label">${esc(t.name)}</div><div class="freq-bar-wrap"><div class="freq-bar" style="width: ${Math.round((t.frequency / maxFreq) * 100)}%;"></div></div><div class="freq-count">${t.frequency}</div></div>`
  ).join("");

  // Key findings (high confidence) with left-border cards
  const keyFindings = highConf.slice(0, 8).map(i =>
    `<div class="finding-card"><div class="finding-text">${esc(i.finding)}</div><div class="finding-meta"><span>${esc(i.source)}</span><span class="badge badge-high">HIGH</span></div></div>`
  ).join("");

  // Insights table
  const insightRows = insights.slice(0, 60).map(i => `<tr><td style="max-width: 400px;">${esc(i.finding.slice(0, 200))}</td><td><span class="badge badge-${i.confidence}">${i.confidence}</span></td><td>${i.tags.map(t => `<span class="tag">${esc(t)}</span>`).join(" ")}</td><td style="color: var(--fg-muted);">${esc(i.source)}</td></tr>`).join("");

  // Personas
  const personaCards = personas.map(p => `<div class="card" style="margin-bottom: 16px;"><div style="display: flex; justify-content: space-between; margin-bottom: 12px;"><strong style="font-size: 14px;">${esc(p.name)}</strong><span style="color: var(--fg-muted); font-size: 11px;">${esc(p.role)}</span></div><div style="margin-bottom: 8px;"><div class="card-title">Goals</div>${p.goals.map(g => `<div style="color: var(--fg-muted); font-size: 11px; padding: 2px 0;">- ${esc(g)}</div>`).join("")}</div><div style="margin-bottom: 8px;"><div class="card-title">Pain Points</div>${p.painPoints.map(pp => `<div style="color: var(--fg-muted); font-size: 11px; padding: 2px 0;">- ${esc(pp)}</div>`).join("")}</div><div><div class="card-title">Behaviors</div>${p.behaviors.map(b => `<div style="color: var(--fg-muted); font-size: 11px; padding: 2px 0;">- ${esc(b)}</div>`).join("")}</div></div>`).join("");

  // Themes detail
  const themeCards = themes.map(t => {
    const relatedInsights = insights.filter(i => t.insights.includes(i.id)).slice(0, 5);
    return `<div class="card" style="margin-bottom: 16px;"><div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;"><strong>${esc(t.name)}</strong><span style="color: var(--fg-muted); font-size: 11px;">${t.insights.length} insights | freq: ${t.frequency}</span></div><p style="color: var(--fg-muted); font-size: 11px; margin-bottom: 12px;">${esc(t.description)}</p>${relatedInsights.length > 0 ? `<div class="card-title">Related Findings</div>${relatedInsights.map(i => `<div style="color: var(--fg-muted); font-size: 11px; padding: 4px 0; border-bottom: 1px solid var(--border);">${esc(i.finding.slice(0, 120))}</div>`).join("")}` : ""}</div>`;
  }).join("");

  // Sources table
  const sourceRows = sources.map(s => `<tr><td>${esc(s.name)}</td><td><span class="badge badge-low">${esc(s.type)}</span></td><td style="color: var(--fg-muted);">${esc(s.processedAt.split("T")[0])}</td></tr>`).join("");

  // Matrix: tag x confidence cross-tab
  const tagList = Array.from(allTags).slice(0, 20);
  const matrixRows = tagList.map(tag => {
    const tagged = insights.filter(i => i.tags.includes(tag));
    const h = tagged.filter(i => i.confidence === "high").length;
    const m = tagged.filter(i => i.confidence === "medium").length;
    const l = tagged.filter(i => i.confidence === "low").length;
    return `<tr><td>${esc(tag)}</td><td>${h || "-"}</td><td>${m || "-"}</td><td>${l || "-"}</td><td>${tagged.length}</td></tr>`;
  }).join("");

  const body = `
  <div class="main">
    <div data-tab-group="research">
      <div class="tabs">
        <button class="tab active" data-tab="overview" onclick="switchTab('research','overview')">Overview</button>
        <button class="tab" data-tab="personas" onclick="switchTab('research','personas')">Personas</button>
        <button class="tab" data-tab="themes" onclick="switchTab('research','themes')">Themes</button>
        <button class="tab" data-tab="insights" onclick="switchTab('research','insights')">Insights</button>
        <button class="tab" data-tab="matrix" onclick="switchTab('research','matrix')">Matrix</button>
        <button class="tab" data-tab="tags" onclick="switchTab('research','tags')">Tags</button>
        <button class="tab" data-tab="sources" onclick="switchTab('research','sources')">Sources</button>
      </div>

      <!-- OVERVIEW -->
      <div class="tab-panel active" data-panel="overview">
        ${insights.length > 0 ? `
        <div class="card" style="margin-bottom: 24px; padding: 24px;">
          <span style="font-size: 13px; font-weight: 600;">Research synthesis</span>
          <span style="color: var(--fg-muted);"> across ${sources.length} sources with ${insights.length} findings, ${themes.length} themes, and ${personas.length} personas identified.</span>
        </div>` : `
        <div class="card" style="margin-bottom: 24px; padding: 24px;">
          <span style="font-size: 13px; font-weight: 600;">No research data loaded.</span>
          <span style="color: var(--fg-muted);"> Run <code>memi research from-file &lt;path&gt;</code> to import data, then <code>memi research synthesize</code> to extract themes and personas.</span>
        </div>`}

        <div class="stat-row">
          <div class="stat-box"><div class="val">${insights.length}</div><div class="lbl">Insights</div></div>
          <div class="stat-box"><div class="val">${themes.length}</div><div class="lbl">Themes</div></div>
          <div class="stat-box"><div class="val">${personas.length}</div><div class="lbl">Personas</div></div>
          <div class="stat-box"><div class="val">${sources.length}</div><div class="lbl">Sources</div></div>
          <div class="stat-box"><div class="val">${highConf.length}</div><div class="lbl">High Confidence</div></div>
          <div class="stat-box"><div class="val">${allTags.size}</div><div class="lbl">Tags</div></div>
        </div>

        <div class="card-title">Confidence Distribution</div>
        <div class="conf-bar">
          <div class="seg seg-high" style="width: ${highPct}%;"></div>
          <div class="seg seg-med" style="width: ${medPct}%;"></div>
          <div class="seg seg-low" style="width: ${100 - highPct - medPct}%;"></div>
        </div>
        <div class="conf-legend">
          <span><span class="dot" style="background: var(--fg);"></span> High (${highConf.length})</span>
          <span><span class="dot" style="background: var(--fg-muted);"></span> Medium (${medConf.length})</span>
          <span><span class="dot" style="background: var(--bg-hover);"></span> Low (${lowConf.length})</span>
        </div>

        ${sortedThemes.length > 0 ? `
        <div class="card-title">Top Themes by Frequency</div>
        <div style="margin-bottom: 32px;">${themeFreqBars}</div>` : ""}

        ${highConf.length > 0 ? `
        <div class="card-title">Key Findings (High Confidence)</div>
        ${keyFindings}` : ""}
      </div>

      <!-- PERSONAS -->
      <div class="tab-panel" data-panel="personas">
        ${personas.length > 0 ? `<div class="grid-2">${personaCards}</div>` : '<div class="empty">No personas yet. Run <code>memi research synthesize</code></div>'}
      </div>

      <!-- THEMES -->
      <div class="tab-panel" data-panel="themes">
        ${themes.length > 0 ? themeCards : '<div class="empty">No themes extracted. Run <code>memi research synthesize</code></div>'}
      </div>

      <!-- INSIGHTS -->
      <div class="tab-panel" data-panel="insights">
        ${insights.length > 0 ? `<table><thead><tr><th>Finding</th><th>Confidence</th><th>Tags</th><th>Source</th></tr></thead><tbody>${insightRows}</tbody></table>` : '<div class="empty">No insights. Run <code>memi research from-file &lt;path&gt;</code></div>'}
      </div>

      <!-- MATRIX -->
      <div class="tab-panel" data-panel="matrix">
        ${tagList.length > 0 ? `<table><thead><tr><th>Tag</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th></tr></thead><tbody>${matrixRows}</tbody></table>` : '<div class="empty">No data for matrix view</div>'}
      </div>

      <!-- TAGS -->
      <div class="tab-panel" data-panel="tags">
        <div class="card-title" style="margin-bottom: 16px;">Tag Cloud (${allTags.size} unique)</div>
        <div style="line-height: 2.4;">${Array.from(allTags).map(t => `<span class="tag" style="font-size: 11px; padding: 4px 8px;">${esc(t)}</span>`).join(" ") || '<span class="empty">No tags</span>'}</div>
      </div>

      <!-- SOURCES -->
      <div class="tab-panel" data-panel="sources">
        ${sources.length > 0 ? `<table><thead><tr><th>Source</th><th>Type</th><th>Processed</th></tr></thead><tbody>${sourceRows}</tbody></table>` : '<div class="empty">No sources loaded</div>'}
      </div>
    </div>
  </div>
  ${TAB_JS}`;

  return pageShell("memoire / research", "Research", body);
}

// ── SPECS PAGE ──────────────────────────────────────────────

function generateSpecsPage(data: PreviewData): string {
  const { specs } = data;
  const components = specs.filter(s => s.type === "component") as ComponentSpec[];
  const pages = specs.filter(s => s.type === "page") as PageSpec[];
  const dataviz = specs.filter(s => s.type === "dataviz") as DataVizSpec[];
  const design = specs.filter(s => s.type === "design");
  const ia = specs.filter(s => s.type === "ia");

  const compRows = components.map(c => `
    <tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td><span class="badge badge-${c.level}">${c.level}</span></td>
      <td style="color: var(--fg-muted);">${c.shadcnBase.map(b => esc(b)).join(", ") || "--"}</td>
      <td style="color: var(--fg-muted);">${Object.keys(c.props).length} props</td>
      <td style="color: var(--fg-muted);">${esc(c.purpose.slice(0, 80))}</td>
    </tr>`).join("");

  const pageRows = pages.map(p => `
    <tr>
      <td><strong>${esc(p.name)}</strong></td>
      <td style="color: var(--fg-muted);">${esc(p.layout)}</td>
      <td style="color: var(--fg-muted);">${p.sections.length} sections</td>
      <td style="color: var(--fg-muted);">${esc(p.purpose.slice(0, 100))}</td>
    </tr>`).join("");

  const vizRows = dataviz.map(d => `
    <tr>
      <td><strong>${esc(d.name)}</strong></td>
      <td style="color: var(--fg-muted);">${esc(d.chartType)}</td>
      <td style="color: var(--fg-muted);">${esc(d.purpose.slice(0, 100))}</td>
    </tr>`).join("");

  const body = `
  <div class="main">
    <div class="grid-4" style="margin-bottom: 24px;">
      <div class="card"><div class="card-title">Components</div><div class="card-value">${components.length}</div></div>
      <div class="card"><div class="card-title">Pages</div><div class="card-value">${pages.length}</div></div>
      <div class="card"><div class="card-title">Data Viz</div><div class="card-value">${dataviz.length}</div></div>
      <div class="card"><div class="card-title">Other</div><div class="card-value">${design.length + ia.length}</div></div>
    </div>

    <div data-tab-group="specs">
      <div class="tabs">
        <button class="tab active" data-tab="components" onclick="switchTab('specs','components')">Components</button>
        <button class="tab" data-tab="pages" onclick="switchTab('specs','pages')">Pages</button>
        <button class="tab" data-tab="dataviz" onclick="switchTab('specs','dataviz')">Data Viz</button>
        <button class="tab" data-tab="all" onclick="switchTab('specs','all')">All Specs</button>
      </div>

      <div class="tab-panel active" data-panel="components">
        ${components.length > 0 ? `
        <table>
          <thead><tr><th>Name</th><th>Level</th><th>shadcn Base</th><th>Props</th><th>Purpose</th></tr></thead>
          <tbody>${compRows}</tbody>
        </table>` : '<div class="empty">No component specs. Run <code>memi spec component &lt;name&gt;</code></div>'}
      </div>

      <div class="tab-panel" data-panel="pages">
        ${pages.length > 0 ? `
        <table>
          <thead><tr><th>Name</th><th>Layout</th><th>Sections</th><th>Purpose</th></tr></thead>
          <tbody>${pageRows}</tbody>
        </table>` : '<div class="empty">No page specs. Run <code>memi spec page &lt;name&gt;</code></div>'}
      </div>

      <div class="tab-panel" data-panel="dataviz">
        ${dataviz.length > 0 ? `
        <table>
          <thead><tr><th>Name</th><th>Chart Type</th><th>Purpose</th></tr></thead>
          <tbody>${vizRows}</tbody>
        </table>` : '<div class="empty">No dataviz specs. Run <code>memi spec dataviz &lt;name&gt;</code></div>'}
      </div>

      <div class="tab-panel" data-panel="all">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Updated</th></tr></thead>
          <tbody>
            ${specs.map(s => `
            <tr>
              <td><strong>${esc(s.name)}</strong></td>
              <td><span class="badge badge-low">${esc(s.type)}</span></td>
              <td style="color: var(--fg-muted);">${esc(s.purpose.slice(0, 120))}</td>
              <td style="color: var(--fg-muted);">${esc(s.updatedAt?.split("T")[0] ?? "--")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>

    <div class="footer">memoire specs -- ${specs.length} total</div>
  </div>
  ${TAB_JS}`;

  return pageShell("memoire / specs", "Specs", body);
}

// ── SYSTEMS PAGE — sidebar Collections/Groups hierarchy ──────

function generateSystemsPage(data: PreviewData): string {
  const { tokens, specs } = data;
  const components = specs.filter(s => s.type === "component") as ComponentSpec[];

  // Group tokens by collection → type → subgroup
  interface TokenGroup { name: string; tokens: DesignToken[]; subgroups: Map<string, DesignToken[]>; }
  interface Collection { name: string; count: number; groups: Map<string, TokenGroup>; }

  const collections = new Map<string, Collection>();
  for (const t of tokens) {
    const collName = t.collection || "Ungrouped";
    if (!collections.has(collName)) {
      collections.set(collName, { name: collName, count: 0, groups: new Map() });
    }
    const coll = collections.get(collName)!;
    coll.count++;

    const groupName = t.type;
    if (!coll.groups.has(groupName)) {
      coll.groups.set(groupName, { name: groupName, tokens: [], subgroups: new Map() });
    }
    const group = coll.groups.get(groupName)!;
    group.tokens.push(t);

    // Extract subgroup from token name (e.g., "color/neutral/100" → "neutral")
    const parts = t.name.split("/");
    const sub = parts.length >= 3 ? parts[1] : parts.length >= 2 ? parts[0] : "default";
    if (!group.subgroups.has(sub)) {
      group.subgroups.set(sub, []);
    }
    group.subgroups.get(sub)!.push(t);
  }

  // Build sidebar HTML
  const collEntries = Array.from(collections.values());
  let sidebarHtml = "";
  let firstGroupId = "";
  let panelsHtml = "";

  for (const coll of collEntries) {
    sidebarHtml += `<div class="sidebar-section">
      <div class="sidebar-label">${esc(coll.name)} <span class="sidebar-count">${coll.count}</span></div>`;

    for (const [groupName, group] of Array.from(coll.groups)) {
      const groupId = `${coll.name}--${groupName}`.replace(/[^a-zA-Z0-9]/g, "-");
      if (!firstGroupId) firstGroupId = groupId;
      sidebarHtml += `<div class="sidebar-item" data-group="${groupId}" onclick="showGroup('${groupId}')">${esc(groupName)} <span class="sidebar-count">${group.tokens.length}</span></div>`;

      // Subgroup items in sidebar
      for (const [subName, subTokens] of Array.from(group.subgroups)) {
        if (group.subgroups.size > 1) {
          sidebarHtml += `<div class="sidebar-item sidebar-item-indent" data-group="${groupId}" onclick="showGroup('${groupId}')" style="font-size: 10px;">${esc(subName)} <span class="sidebar-count">${subTokens.length}</span></div>`;
        }
      }

      // Build content panel for this group
      let panelContent = "";

      if (groupName === "color") {
        // Color tokens with swatches organized by subgroup
        for (const [subName, subTokens] of Array.from(group.subgroups)) {
          panelContent += `<div class="group-sub">${esc(subName)} (${subTokens.length})</div>`;
          for (const t of subTokens) {
            const val = String(Object.values(t.values)[0] ?? "");
            panelContent += `<div class="token-row">
              <div class="token-swatch-sm" style="background: ${escColor(val)};"></div>
              <div class="token-name">${esc(t.name)}</div>
              <div class="token-val"><code>${esc(val)}</code></div>
            </div>`;
          }
        }
      } else if (groupName === "spacing") {
        for (const t of group.tokens) {
          const val = String(Object.values(t.values)[0] ?? "");
          const px = parseInt(val) || 0;
          panelContent += `<div class="token-row">
            <div style="width: ${Math.min(px, 200)}px; height: 12px; background: var(--accent); border-radius: 2px; margin-right: 12px; flex-shrink: 0;"></div>
            <div class="token-name">${esc(t.name)}</div>
            <div class="token-val"><code>${esc(val)}</code></div>
          </div>`;
        }
      } else if (groupName === "typography") {
        for (const t of group.tokens) {
          const val = String(Object.values(t.values)[0] ?? "");
          panelContent += `<div class="token-row">
            <div class="token-name">${esc(t.name)}</div>
            <div class="token-val" style="font-size: ${/^\d+/.test(val) ? val : "12px"}; white-space: nowrap;"><code>${esc(val)}</code></div>
          </div>`;
        }
      } else {
        // Generic token display for radius, shadow, other
        for (const t of group.tokens) {
          const val = String(Object.values(t.values)[0] ?? "");
          panelContent += `<div class="token-row">
            <div class="token-name">${esc(t.name)}</div>
            <div class="token-val"><code>${esc(val)}</code></div>
          </div>`;
        }
      }

      panelsHtml += `<div class="group-panel" id="panel-${groupId}" style="display: none;">
        <div class="group-header">${esc(coll.name)} / ${esc(groupName)}</div>
        <div style="color: var(--fg-muted); font-size: 11px; margin-bottom: 16px;">${group.tokens.length} tokens${group.subgroups.size > 1 ? ` across ${group.subgroups.size} groups` : ""}</div>
        ${panelContent}
      </div>`;
    }

    sidebarHtml += `</div>`;
  }

  // Components section in sidebar
  if (components.length > 0) {
    sidebarHtml += `<div class="sidebar-section">
      <div class="sidebar-label">Components <span class="sidebar-count">${components.length}</span></div>`;
    const compGroupId = "components-all";
    sidebarHtml += `<div class="sidebar-item" data-group="${compGroupId}" onclick="showGroup('${compGroupId}')">All <span class="sidebar-count">${components.length}</span></div>`;

    const byLevel: Record<string, ComponentSpec[]> = {};
    for (const c of components) {
      const lv = c.level || "atom";
      if (!byLevel[lv]) byLevel[lv] = [];
      byLevel[lv].push(c);
    }
    for (const [level, comps] of Object.entries(byLevel)) {
      sidebarHtml += `<div class="sidebar-item sidebar-item-indent" data-group="${compGroupId}" onclick="showGroup('${compGroupId}')" style="font-size: 10px;">${esc(level)} <span class="sidebar-count">${comps.length}</span></div>`;
    }

    let compPanel = "";
    for (const [level, comps] of Object.entries(byLevel)) {
      compPanel += `<div class="group-sub">${esc(level)} (${comps.length})</div>`;
      for (const c of comps) {
        compPanel += `<div class="card" style="margin-bottom: 8px; padding: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 12px;">${esc(c.name)}</strong>
            <span class="badge badge-${c.level}">${c.level}</span>
          </div>
          <div style="margin-top: 4px; color: var(--fg-muted); font-size: 10px;">
            ${c.shadcnBase.length > 0 ? `shadcn: ${c.shadcnBase.join(", ")}` : "custom"} | ${Object.keys(c.props).length} props
          </div>
        </div>`;
      }
    }

    panelsHtml += `<div class="group-panel" id="panel-${compGroupId}" style="display: none;">
      <div class="group-header">Components</div>
      <div style="color: var(--fg-muted); font-size: 11px; margin-bottom: 16px;">${components.length} component specs across ${Object.keys(byLevel).length} atomic levels</div>
      ${compPanel}
    </div>`;
    sidebarHtml += `</div>`;
  }

  // Layout section in sidebar
  sidebarHtml += `<div class="sidebar-section">
    <div class="sidebar-label">Architecture</div>
    <div class="sidebar-item" data-group="layout-atomic" onclick="showGroup('layout-atomic')">Atomic Design</div>
    <div class="sidebar-item" data-group="layout-breakpoints" onclick="showGroup('layout-breakpoints')">Breakpoints</div>
  </div>`;

  panelsHtml += `
  <div class="group-panel" id="panel-layout-atomic" style="display: none;">
    <div class="group-header">Atomic Design Hierarchy</div>
    <div style="margin-top: 16px; font-size: 11px; line-height: 2.4;">
      <div><span class="badge badge-atom">atom</span> Primitives -- Button, Badge, Input, Label <span style="color: var(--fg-muted);">(components/ui/)</span></div>
      <div><span class="badge badge-molecule">molecule</span> Composed atoms -- FormField, SearchBar <span style="color: var(--fg-muted);">(components/molecules/)</span></div>
      <div><span class="badge badge-organism">organism</span> Stateful groups -- LoginForm, Sidebar <span style="color: var(--fg-muted);">(components/organisms/)</span></div>
      <div><span class="badge badge-template">template</span> Page skeletons -- DashboardTemplate <span style="color: var(--fg-muted);">(components/templates/)</span></div>
    </div>
  </div>
  <div class="group-panel" id="panel-layout-breakpoints" style="display: none;">
    <div class="group-header">Responsive Breakpoints</div>
    <div style="margin-top: 16px; font-size: 11px; color: var(--fg-muted);">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 0; border-bottom: 1px solid var(--border);"><span>Mobile</span><span>&lt; 640px</span></div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px; padding: 8px 0; border-bottom: 1px solid var(--border);"><span>Tablet</span><span>640-1024px</span></div>
      <div style="display: flex; justify-content: space-between; padding: 8px 0;"><span>Desktop</span><span>&gt; 1024px</span></div>
    </div>
  </div>`;

  // Empty state
  if (tokens.length === 0 && components.length === 0) {
    sidebarHtml = `<div class="sidebar-section"><div class="sidebar-label">No Data</div><div class="sidebar-item" style="color: var(--fg-muted);">Run memi pull to load tokens</div></div>`;
    panelsHtml = `<div class="group-panel" id="panel-empty" style="display: block;"><div class="empty">No design tokens loaded. Run <code>memi pull</code> or <code>memi compose "init design system"</code></div></div>`;
    firstGroupId = "";
  }

  const body = `
  <div class="sidebar-layout">
    <div class="sidebar">${sidebarHtml}</div>
    <div class="content-panel">
      <div class="stat-row" style="margin-bottom: 24px;">
        <div class="stat-box"><div class="val">${tokens.length}</div><div class="lbl">Tokens</div></div>
        <div class="stat-box"><div class="val">${tokens.filter(t => t.type === "color").length}</div><div class="lbl">Colors</div></div>
        <div class="stat-box"><div class="val">${tokens.filter(t => t.type === "spacing").length}</div><div class="lbl">Spacing</div></div>
        <div class="stat-box"><div class="val">${tokens.filter(t => t.type === "typography").length}</div><div class="lbl">Typography</div></div>
        <div class="stat-box"><div class="val">${components.length}</div><div class="lbl">Components</div></div>
      </div>
      ${panelsHtml}
    </div>
  </div>
  <script>
  function showGroup(id) {
    document.querySelectorAll('.group-panel').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const panel = document.getElementById('panel-' + id);
    if (panel) panel.style.display = 'block';
    document.querySelectorAll('.sidebar-item[data-group="' + id + '"]').forEach(s => s.classList.add('active'));
  }
  ${firstGroupId ? `showGroup('${firstGroupId}');` : ""}
  </script>`;

  return pageShell("memoire / systems", "Systems", body);
}

// ── CHANGELOG PAGE ─────────────────────────────────────────

function generateChangelogPage(data: PreviewData): string {
  const body = `
  <div class="main">
    <div class="card-title" style="margin-bottom: 24px;">Engine Changelog</div>
    <div class="card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <strong>v0.1.0</strong>
        <span style="color: var(--fg-muted); font-size: 11px;">${data.generatedAt.split("T")[0]}</span>
      </div>
      <div style="margin-top: 8px; color: var(--fg-muted); font-size: 11px; line-height: 1.8;">
        <div>+ MemoireEngine core with Figma bridge, research, codegen</div>
        <div>+ 19 CLI commands (memi daemon, doctor, heartbeat, compose...)</div>
        <div>+ Agent orchestrator with 11 sub-agent types including motion-designer</div>
        <div>+ Workspace markdown system (SOUL.md, AGENTS.md, TOOLS.md, HEARTBEAT.md)</div>
        <div>+ Obsidian-style research synthesizer with knowledge graph</div>
        <div>+ Web researcher with cross-validation and entity extraction</div>
        <div>+ Self-healing loop for Figma canvas operations</div>
        <div>+ Atomic Design enforcement (atom/molecule/organism/template)</div>
        <div>+ Motion token system with easing curves and stagger patterns</div>
        <div>+ Gateway daemon with PID tracking and heartbeat monitoring</div>
      </div>
    </div>
    <div class="footer">memoire changelog</div>
  </div>`;

  return pageShell("memoire / changelog", "Changelog", body);
}
