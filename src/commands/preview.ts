import type { Command } from "commander";
import type { NocheEngine } from "../engine/core.js";
import type { AnySpec } from "../specs/types.js";
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

/** Sanitize CSS color */
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

export function registerPreviewCommand(program: Command, engine: NocheEngine) {
  program
    .command("preview")
    .description("Build and serve the Noche component preview gallery")
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

      // Load research data if available
      let research: ResearchStore | null = null;
      try {
        const researchPath = join(engine.config.projectRoot, "research", "insights.json");
        const raw = await readFile(researchPath, "utf-8");
        research = JSON.parse(raw) as ResearchStore;
      } catch {
        // No research data yet
      }

      console.log("\n  Building preview gallery...\n");

      // Derive project name from directory name
      const projectName = basename(engine.config.projectRoot);

      const data: PreviewData = {
        projectName,
        specs,
        tokens,
        research,
        generatedAt: new Date().toISOString(),
      };

      const html = generatePreviewHTML(data);
      await writeFile(join(previewDir, "index.html"), html);

      // Generate research dashboard if data exists
      if (research && research.insights.length > 0) {
        const researchHtml = generateResearchDashboard(research, data.generatedAt);
        await writeFile(join(previewDir, "research.html"), researchHtml);
      }

      const components = specs.filter((s) => s.type === "component");
      const pages = specs.filter((s) => s.type === "page");
      const dataviz = specs.filter((s) => s.type === "dataviz");
      const design = specs.filter((s) => s.type === "design");
      const ia = specs.filter((s) => s.type === "ia");

      console.log(`  Preview built:`);
      console.log(`    ${components.length} components`);
      console.log(`    ${pages.length} pages`);
      console.log(`    ${dataviz.length} dataviz`);
      console.log(`    ${design.length} design specs`);
      console.log(`    ${ia.length} IA specs`);
      console.log(`    ${tokens.length} design tokens`);
      if (research) {
        console.log(`    ${research.insights.length} research insights`);
        console.log(`    ${research.themes.length} themes`);
      }

      if (opts.buildOnly) {
        console.log(`\n  Preview built at: ${join(previewDir, "index.html")}\n`);
        return;
      }

      // Start the interactive API server (replaces npx serve)
      const apiServer = new PreviewApiServer(engine, previewDir, port);
      try {
        const actualPort = await apiServer.start();
        console.log(`\n  Noche Preview (interactive) on http://localhost:${actualPort}`);
        console.log(`  API endpoints:        http://localhost:${actualPort}/api/`);
        console.log(`  WebSocket:            ws://localhost:${actualPort}`);
        console.log(`  Figma bridge:         ${engine.figma.isConnected ? "connected" : "not connected"}`);
        console.log(`\n  Features:`);
        console.log(`    - Edit tokens, specs, and components from the browser`);
        console.log(`    - Changes auto-sync to Figma when connected`);
        console.log(`    - Agent command palette (Cmd+K) for AI-powered design ops`);
        console.log(`    - Real-time updates via WebSocket\n`);

        // Keep process alive
        process.on("SIGINT", () => {
          console.log("\n  Shutting down preview server...");
          apiServer.stop();
          process.exit(0);
        });
      } catch (err) {
        console.error(`\n  Failed to start API server: ${(err as Error).message}`);
        console.log("  Falling back to static server...\n");

        try {
          const child = spawn("npx", ["-y", "serve", previewDir, "-l", String(port), "--no-clipboard"], {
            stdio: "inherit",
            shell: true,
          });

          child.on("error", (serveErr) => {
            console.log(`  npx serve failed (${serveErr.message}), falling back to python3...`);
            spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
          });
        } catch {
          spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
        }
      }
    });
}

function generatePreviewHTML(data: PreviewData): string {
  const specs = data.specs;
  const components = specs.filter((s) => s.type === "component");
  const pages = specs.filter((s) => s.type === "page");
  const dataviz = specs.filter((s) => s.type === "dataviz");
  const design = specs.filter((s) => s.type === "design");
  const ia = specs.filter((s) => s.type === "ia");
  const tokens = data.tokens;
  const colorTokens = tokens.filter((t) => t.type === "color");
  const projectName = esc(data.projectName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M25.5 15.5A9.5 9.5 0 0 1 12 25 9.5 9.5 0 0 1 9.5 6.5 12 12 0 1 0 25.5 15.5z' fill='%23e2e8f0'/%3E%3C/svg%3E">
<title>${projectName} — Noche Preview</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --bg-card: #111111;
  --bg-hover: #1a1a1a;
  --fg: #e0e0e0;
  --fg-muted: #666666;
  --border: #222222;
  --accent: #d4d4d4;
  --accent-bright: #ffffff;
  --accent-dim: #444444;
  --chart-1: #ffffff;
  --chart-2: #888888;
  --chart-3: #555555;
  --chart-4: #aaaaaa;
  --warn: #ffaa00;
  --error: #ff4444;
  --mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
  --radius: 3px;
}

body {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
  min-height: 100vh;
}

/* ── Header ──────────────────────────────── */
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  position: sticky;
  top: 0;
  z-index: 10;
}

.hdr-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.hdr-project {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--accent-bright);
}

.hdr-sep {
  color: var(--accent-dim);
  font-size: 14px;
  font-weight: 300;
}

.hdr-title {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--fg-muted);
}

.hdr-title span { color: var(--accent-bright); }

.hdr-stats {
  display: flex;
  gap: 16px;
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.hdr-stats .n { color: var(--accent-bright); font-weight: 700; margin-right: 3px; }

/* ── Filter Bar ──────────────────────────── */
.filters {
  display: flex;
  gap: 4px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.filter-btn {
  padding: 5px 14px;
  border: 1px solid var(--border);
  background: none;
  color: var(--fg-muted);
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  border-radius: 2px;
  transition: all 0.15s;
}

.filter-btn:hover { border-color: var(--accent); color: var(--fg); }
.filter-btn.active { background: var(--accent-dim); color: var(--accent-bright); border-color: var(--accent); font-weight: 700; }

/* ── Grid ────────────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
  padding: 24px;
}

/* ── Card ────────────────────────────────── */
.card {
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.15s;
}

.card:hover { border-color: var(--accent-dim); }

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.card-name {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.card-type {
  font-size: 9px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--fg-muted);
}

.card-type.component { border-color: var(--accent); color: var(--accent); }
.card-type.dataviz { border-color: var(--accent); color: var(--accent); }
.card-type.page { border-color: var(--accent); color: var(--accent); }
.card-type.design { border-color: var(--accent); color: var(--accent); }
.card-type.ia { border-color: var(--accent); color: var(--accent); }

.card-body { padding: 16px; }

.card-purpose {
  font-size: 11px;
  color: var(--fg-muted);
  margin-bottom: 12px;
  line-height: 1.5;
  font-family: var(--mono);
}

.card-section {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--fg-muted);
  margin-top: 12px;
  margin-bottom: 6px;
}

.card-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.tag {
  font-size: 9px;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--fg-muted);
  letter-spacing: 0.5px;
}

/* ── Component Preview ───────────────────── */
.comp-preview {
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 12px;
  background: var(--bg);
}

.comp-variants {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.variant {
  font-size: 10px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--accent);
}

.comp-props {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 12px;
  font-size: 10px;
}

.comp-props .k { color: var(--accent); }
.comp-props .v { color: var(--fg-muted); }

.shadcn-base {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.shadcn-chip {
  font-size: 9px;
  padding: 2px 8px;
  background: var(--accent-dim);
  border-radius: 2px;
  color: var(--accent);
  letter-spacing: 0.5px;
}

/* ── Chart Preview (SVG) ─────────────────── */
.chart-wrap {
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg);
  padding: 12px;
  position: relative;
}

.chart-wrap svg {
  width: 100%;
  height: 120px;
  display: block;
}

.chart-legend {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 10px;
}

.chart-legend span::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 1px;
  margin-right: 4px;
  vertical-align: middle;
}

.chart-legend .s1::before { background: var(--chart-1); }
.chart-legend .s2::before { background: var(--chart-2); }

.chart-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 16px;
  font-size: 10px;
  margin-top: 10px;
}

.chart-meta .k { color: var(--fg-muted); }
.chart-meta .v { color: var(--fg); }

/* ── Page Preview ────────────────────────── */
.page-layout {
  border: 1px solid var(--border);
  border-radius: 2px;
  background: var(--bg);
  padding: 8px;
  min-height: 100px;
}

.page-section {
  border: 1px dashed #333;
  border-radius: 2px;
  padding: 6px 10px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
}

.page-section .sec-name { color: var(--accent); font-weight: 600; }
.page-section .sec-meta { color: var(--fg-muted); }

.page-responsive {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  font-size: 10px;
}

.page-responsive .bp {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
}

.page-responsive .bp .bp-label { color: var(--fg-muted); font-size: 9px; }
.page-responsive .bp .bp-val { color: var(--fg); }

/* ── Design Preview ──────────────────────── */
.design-dims {
  font-size: 18px;
  font-weight: 700;
  color: var(--fg);
  margin-bottom: 8px;
}

.spacing-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.spacing-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  padding: 4px 8px;
  background: var(--bg);
  border-radius: 2px;
}

.spacing-item .target { color: var(--accent); min-width: 80px; }

.spacing-visual {
  height: 6px;
  background: var(--accent-dim);
  border-radius: 1px;
  flex: 1;
  position: relative;
}

.spacing-visual .fill {
  height: 100%;
  background: var(--accent);
  border-radius: 1px;
}

/* ── Color Swatches ──────────────────────── */
.color-bar {
  display: flex;
  gap: 2px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 2px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: transform 0.1s;
  position: relative;
}

.swatch:hover { transform: scale(1.3); z-index: 1; }

/* ── Empty State ─────────────────────────── */
.empty {
  text-align: center;
  padding: 80px 24px;
  color: var(--fg-muted);
  font-size: 12px;
  line-height: 2;
}

.empty code {
  background: var(--bg-card);
  padding: 2px 8px;
  border-radius: 2px;
  color: var(--accent);
}

/* ── IA Tree ─────────────────────────────── */
.ia-node {
  padding: 3px 0 3px var(--indent, 0px);
  border-left: 1px solid var(--border);
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ia-node .ia-type {
  font-size: 8px;
  padding: 1px 5px;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ia-node .ia-label { font-weight: 600; }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-project">${projectName}</div>
    <span class="hdr-sep">/</span>
    <div class="hdr-title"><span>ARK</span> PREVIEW</div>
  </div>
  <div class="hdr-stats">
    <span><span class="n">${specs.length}</span>SPECS</span>
    <span><span class="n">${components.length}</span>COMPONENTS</span>
    <span><span class="n">${dataviz.length}</span>DATAVIZ</span>
    <span><span class="n">${pages.length}</span>PAGES</span>
    <span><span class="n">${tokens.length}</span>TOKENS</span>
    ${data.research ? `<a href="research.html" style="color:var(--accent);text-decoration:none;border:1px solid var(--accent-dim);padding:2px 10px;border-radius:2px;font-size:10px;letter-spacing:1px;transition:all 0.15s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--accent-dim)'">${data.research.insights.length} RESEARCH</a>` : ""}
  </div>
</div>

${colorTokens.length > 0 ? `<div class="color-bar">${colorTokens.map((t) => {
  const val = String(Object.values(t.values)[0] || "#000");
  return `<div class="swatch" style="background:${escColor(val)}" title="${esc(t.name)}: ${esc(val)}"></div>`;
}).join("")}</div>` : ""}

<div class="filters">
  <button class="filter-btn active" onclick="filter('all',this)">ALL (${specs.length})</button>
  <button class="filter-btn" onclick="filter('component',this)">COMPONENTS (${components.length})</button>
  <button class="filter-btn" onclick="filter('dataviz',this)">DATAVIZ (${dataviz.length})</button>
  <button class="filter-btn" onclick="filter('page',this)">PAGES (${pages.length})</button>
  <button class="filter-btn" onclick="filter('design',this)">DESIGN (${design.length})</button>
  <button class="filter-btn" onclick="filter('ia',this)">IA (${ia.length})</button>
</div>

<div class="grid" id="grid">
${specs.length === 0 ? `<div class="empty" style="grid-column:1/-1">
  No specs yet.<br>
  Run <code>noche spec component MyComponent</code> then <code>noche generate</code>
</div>` : ""}

${components.map((s) => {
  if (s.type !== "component") return "";
  return `<div class="card" data-type="component">
  <div class="card-head">
    <span class="card-name">${esc(s.name)}</span>
    <span class="card-type component">COMPONENT</span>
  </div>
  <div class="card-body">
    <div class="card-purpose">${esc(s.purpose)}</div>
    <div class="comp-preview">
      <div class="card-section">VARIANTS</div>
      <div class="comp-variants">
        ${s.variants.map((v: string) => `<span class="variant">${esc(v)}</span>`).join("")}
      </div>
      <div class="card-section">PROPS</div>
      <div class="comp-props">
        ${Object.entries(s.props).map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${esc(String(v))}</span>`).join("")}
      </div>
      ${s.shadcnBase.length > 0 ? `<div class="card-section">SHADCN BASE</div>
      <div class="shadcn-base">
        ${s.shadcnBase.map((b: string) => `<span class="shadcn-chip">${esc(b)}</span>`).join("")}
      </div>` : ""}
    </div>
    ${s.tags.length > 0 ? `<div class="card-tags">${s.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
  </div>
</div>`;
}).join("\n")}

${dataviz.map((s) => {
  if (s.type !== "dataviz") return "";
  const samples = s.sampleData || [];
  const series = s.dataShape.series || ["y"];
  const maxVal = Math.max(...samples.flatMap((d: Record<string, unknown>) => series.map((k: string) => Number(d[k]) || 0)), 1);
  const w = 300;
  const h = 120;
  const pad = 4;
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

  // Build SVG paths for each series
  const paths = series.map((seriesKey: string, si: number) => {
    const points = samples.map((d: Record<string, unknown>, i: number) => {
      const x = pad + (i / Math.max(samples.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - ((Number(d[seriesKey]) || 0) / maxVal) * (h - pad * 2);
      return `${x},${y}`;
    });
    const line = `M${points.join(" L")}`;
    const area = `${line} L${pad + ((samples.length - 1) / Math.max(samples.length - 1, 1)) * (w - pad * 2)},${h - pad} L${pad},${h - pad} Z`;
    return { line, area, color: colors[si % colors.length], key: seriesKey };
  });

  return `<div class="card" data-type="dataviz">
  <div class="card-head">
    <span class="card-name">${esc(s.name)}</span>
    <span class="card-type dataviz">${esc(s.chartType).toUpperCase()}</span>
  </div>
  <div class="card-body">
    <div class="card-purpose">${esc(s.purpose)}</div>
    ${samples.length > 0 ? `<div class="chart-wrap">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        ${paths.map((p: { area: string; line: string; color: string }) => `<path d="${p.area}" fill="${p.color}" opacity="0.15"/>
        <path d="${p.line}" fill="none" stroke="${p.color}" stroke-width="2"/>`).join("\n        ")}
        ${samples.map((_: unknown, i: number) => {
          const x = pad + (i / Math.max(samples.length - 1, 1)) * (w - pad * 2);
          return `<line x1="${x}" y1="${pad}" x2="${x}" y2="${h - pad}" stroke="#222" stroke-width="0.5"/>`;
        }).join("\n        ")}
      </svg>
      <div class="chart-legend">
        ${paths.map((p: { key: string }, i: number) => `<span class="s${i + 1}">${esc(p.key)}</span>`).join("")}
      </div>
    </div>` : `<div style="padding:20px; text-align:center; color:var(--fg-muted); border:1px dashed var(--border); border-radius:2px">No sample data</div>`}
    <div class="chart-meta">
      <span class="k">Library</span><span class="v">${esc(s.library)}</span>
      <span class="k">X Axis</span><span class="v">${esc(s.dataShape.x)}</span>
      <span class="k">Y Axis</span><span class="v">${esc(s.dataShape.y)}</span>
      <span class="k">Interactions</span><span class="v">${s.interactions.map((i: string) => esc(i)).join(", ")}</span>
    </div>
    ${s.tags.length > 0 ? `<div class="card-tags">${s.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
  </div>
</div>`;
}).join("\n")}

${pages.map((s) => {
  if (s.type !== "page") return "";
  return `<div class="card" data-type="page">
  <div class="card-head">
    <span class="card-name">${esc(s.name)}</span>
    <span class="card-type page">${esc(s.layout).toUpperCase()}</span>
  </div>
  <div class="card-body">
    <div class="card-purpose">${esc(s.purpose)}</div>
    <div class="page-layout">
      ${s.sections.map((sec) => `<div class="page-section">
        <span class="sec-name">${esc(sec.name)}</span>
        <span class="sec-meta">${esc(sec.component)}${sec.repeat > 1 ? ` &times;${sec.repeat}` : ""} &middot; ${esc(sec.layout)}</span>
      </div>`).join("")}
      ${s.sections.length === 0 ? `<div style="text-align:center; padding:12px; color:var(--fg-muted); font-size:10px">No sections defined</div>` : ""}
    </div>
    <div class="page-responsive">
      <div class="bp"><span class="bp-label">MOBILE </span><span class="bp-val">${esc(s.responsive.mobile)}</span></div>
      <div class="bp"><span class="bp-label">TABLET </span><span class="bp-val">${esc(s.responsive.tablet)}</span></div>
      <div class="bp"><span class="bp-label">DESKTOP </span><span class="bp-val">${esc(s.responsive.desktop)}</span></div>
    </div>
    ${s.tags.length > 0 ? `<div class="card-tags">${s.tags.map((t: string) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
  </div>
</div>`;
}).join("\n")}

${design.map((s) => {
  if (s.type !== "design") return "";
  return `<div class="card" data-type="design">
  <div class="card-head">
    <span class="card-name">${esc(s.name)}</span>
    <span class="card-type design">DESIGN</span>
  </div>
  <div class="card-body">
    <div class="card-purpose">${esc(s.purpose)}</div>
    ${s.dimensions ? `<div class="design-dims">${esc(String(s.dimensions.width))} &times; ${esc(String(s.dimensions.height))}</div>` : ""}
    ${s.spacing.length > 0 ? `<div class="card-section">SPACING</div>
    <div class="spacing-list">
      ${s.spacing.map((sp) => {
        const totalPx = (sp.padding?.top ?? 0) + (sp.padding?.right ?? 0) + (sp.padding?.bottom ?? 0) + (sp.padding?.left ?? 0) + (sp.gap ?? 0);
        const pct = Math.min(totalPx / 100, 1) * 100;
        return `<div class="spacing-item">
          <span class="target">${esc(sp.target)}</span>
          <div class="spacing-visual"><div class="fill" style="width:${pct}%"></div></div>
          <span>${totalPx}${esc(sp.unit)}</span>
        </div>`;
      }).join("")}
    </div>` : ""}
    ${s.interactions.length > 0 ? `<div class="card-section">INTERACTIONS (${s.interactions.length})</div>
    ${s.interactions.map((ix) => `<div style="font-size:10px; padding:3px 0; color:var(--fg-muted)">
      <span style="color:var(--accent)">${esc(ix.trigger)}</span> on ${esc(ix.target)} &rarr; ${esc(ix.action)}
    </div>`).join("")}` : ""}
    ${s.linkedSpecs.length > 0 ? `<div class="card-section">LINKED SPECS</div>
    <div class="card-tags">${s.linkedSpecs.map((l: string) => `<span class="tag">${esc(l)}</span>`).join("")}</div>` : ""}
  </div>
</div>`;
}).join("\n")}

${ia.map((s) => {
  if (s.type !== "ia") return "";
  const renderNode = (n: { label: string; type: string; children?: unknown[] }, depth: number): string => {
    const kids = (n.children || []) as Array<{ label: string; type: string; children?: unknown[] }>;
    return `<div class="ia-node" style="--indent:${depth * 16}px; padding-left:${depth * 16 + 8}px">
      <span class="ia-type">${esc(n.type)}</span>
      <span class="ia-label">${esc(n.label)}</span>
    </div>${kids.map((c) => renderNode(c, depth + 1)).join("")}`;
  };
  return `<div class="card" data-type="ia">
  <div class="card-head">
    <span class="card-name">${esc(s.name)}</span>
    <span class="card-type ia">IA</span>
  </div>
  <div class="card-body">
    <div class="card-purpose">${esc(s.purpose)}</div>
    <div class="comp-preview" style="max-height:300px; overflow-y:auto">
      ${(s.root as { children?: unknown[] }).children
        ? ((s.root as { children: Array<{ label: string; type: string; children?: unknown[] }> }).children).map((c) => renderNode(c, 0)).join("")
        : `<div style="color:var(--fg-muted); text-align:center; padding:12px">Empty IA tree</div>`}
    </div>
    ${s.flows.length > 0 ? `<div class="card-section">FLOWS (${s.flows.length})</div>
    ${s.flows.slice(0, 5).map((f) => `<div style="font-size:10px; padding:2px 0; color:var(--fg-muted)">
      ${esc(f.from)} &rarr; ${esc(f.to)} <span style="color:var(--accent)">${esc(f.trigger)}</span>
    </div>`).join("")}` : ""}
  </div>
</div>`;
}).join("\n")}

</div>

<!-- ── Agent Command Palette (Cmd+K) ────────── -->
<div id="cmd-palette" class="cmd-palette hidden">
  <div class="cmd-overlay" onclick="closePalette()"></div>
  <div class="cmd-modal">
    <div class="cmd-header">
      <span class="cmd-icon">&#9670;</span>
      <input id="cmd-input" class="cmd-input" type="text" placeholder="Ask Claude to modify your design system..." autocomplete="off" spellcheck="false" />
      <kbd class="cmd-kbd">ESC</kbd>
    </div>
    <div id="cmd-suggestions" class="cmd-suggestions">
      <div class="cmd-group-label">QUICK ACTIONS</div>
      <button class="cmd-item" onclick="runAgent('Update color palette to a warm earth-tone theme')"><span class="cmd-item-icon">&#9632;</span> Update color palette</button>
      <button class="cmd-item" onclick="runAgent('Add spacing tokens based on 8px grid')"><span class="cmd-item-icon">&#9644;</span> Generate spacing scale</button>
      <button class="cmd-item" onclick="runAgent('Create a typography system with Inter font')"><span class="cmd-item-icon">T</span> Setup typography system</button>
      <button class="cmd-item" onclick="runAgent('Create a new Card component with title, description, and action')"><span class="cmd-item-icon">&#9724;</span> Create component</button>
      <button class="cmd-item" onclick="runAgent('Audit design system for accessibility')"><span class="cmd-item-icon">&#10003;</span> Accessibility audit</button>
      <button class="cmd-item" onclick="runAgent('Sync all changes to Figma')"><span class="cmd-item-icon">&#8644;</span> Sync to Figma</button>
      <div class="cmd-group-label">DESIGN SYSTEM</div>
      <button class="cmd-item" onclick="runAgent('Add dark mode to all color tokens')"><span class="cmd-item-icon">&#9789;</span> Add dark mode</button>
      <button class="cmd-item" onclick="runAgent('Generate a complete shadcn/ui token foundation')"><span class="cmd-item-icon">&#9881;</span> Initialize token system</button>
      <button class="cmd-item" onclick="runAgent('Generate code for all specs')"><span class="cmd-item-icon">&lt;/&gt;</span> Generate all code</button>
    </div>
    <div id="cmd-status" class="cmd-status hidden"></div>
  </div>
</div>

<!-- ── Edit Panel (slide-in from right) ─────── -->
<div id="edit-panel" class="edit-panel hidden">
  <div class="edit-header">
    <span id="edit-title">Edit</span>
    <button class="edit-close" onclick="closeEditPanel()">&times;</button>
  </div>
  <div id="edit-body" class="edit-body"></div>
  <div class="edit-footer">
    <button id="edit-save" class="edit-save" onclick="saveEdit()">SAVE &amp; SYNC</button>
    <button class="edit-cancel" onclick="closeEditPanel()">CANCEL</button>
  </div>
</div>

<!-- ── Toast Notifications ──────────────────── -->
<div id="toast-container" class="toast-container"></div>

<!-- ── Figma Connection Status Bar ──────────── -->
<div id="figma-bar" class="figma-bar">
  <span id="figma-dot" class="figma-dot"></span>
  <span id="figma-status">Figma: checking...</span>
  <button class="figma-sync-btn" onclick="runAgent('Sync all changes to Figma')">SYNC</button>
</div>

<!-- ── Agent Activity Log ──────────────────── -->
<div id="agent-log" class="agent-log hidden">
  <div class="agent-log-header">
    <span>AGENT ACTIVITY</span>
    <button onclick="toggleAgentLog()" style="background:none;border:none;color:var(--fg-muted);cursor:pointer;font-family:var(--mono)">&times;</button>
  </div>
  <div id="agent-log-body" class="agent-log-body"></div>
</div>
<button id="agent-log-toggle" class="agent-log-toggle" onclick="toggleAgentLog()">&#9670; AGENT LOG</button>

<style>
/* ── Command Palette ──────────────────────── */
.cmd-palette { position:fixed; top:0; left:0; right:0; bottom:0; z-index:100; display:flex; align-items:flex-start; justify-content:center; padding-top:15vh; }
.cmd-palette.hidden { display:none; }
.cmd-overlay { position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); }
.cmd-modal { position:relative; width:600px; max-width:90vw; background:var(--bg-card); border:1px solid var(--border); border-radius:6px; overflow:hidden; box-shadow:0 20px 60px rgba(0,0,0,0.5); }
.cmd-header { display:flex; align-items:center; padding:12px 16px; border-bottom:1px solid var(--border); gap:10px; }
.cmd-icon { color:var(--accent-bright); font-size:14px; }
.cmd-input { flex:1; background:none; border:none; color:var(--fg); font-family:var(--mono); font-size:13px; outline:none; }
.cmd-input::placeholder { color:var(--fg-muted); }
.cmd-kbd { font-size:9px; padding:2px 6px; border:1px solid var(--border); border-radius:2px; color:var(--fg-muted); font-family:var(--mono); }
.cmd-suggestions { max-height:300px; overflow-y:auto; padding:4px; }
.cmd-group-label { font-size:9px; letter-spacing:1.5px; text-transform:uppercase; color:var(--fg-muted); padding:8px 12px 4px; }
.cmd-item { display:flex; align-items:center; gap:10px; width:100%; padding:8px 12px; background:none; border:none; color:var(--fg); font-family:var(--mono); font-size:11px; cursor:pointer; border-radius:3px; text-align:left; }
.cmd-item:hover { background:var(--bg-hover); }
.cmd-item-icon { width:18px; text-align:center; color:var(--accent); font-size:12px; }
.cmd-status { padding:12px 16px; border-top:1px solid var(--border); font-size:10px; color:var(--fg-muted); }
.cmd-status.hidden { display:none; }

/* ── Edit Panel ───────────────────────────── */
.edit-panel { position:fixed; top:0; right:0; bottom:0; width:420px; max-width:90vw; background:var(--bg-card); border-left:1px solid var(--border); z-index:50; display:flex; flex-direction:column; transform:translateX(0); transition:transform 0.2s; }
.edit-panel.hidden { transform:translateX(100%); pointer-events:none; }
.edit-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); font-size:11px; font-weight:700; letter-spacing:0.5px; }
.edit-close { background:none; border:none; color:var(--fg-muted); font-size:18px; cursor:pointer; font-family:var(--mono); }
.edit-body { flex:1; overflow-y:auto; padding:16px; }
.edit-footer { display:flex; gap:8px; padding:12px 16px; border-top:1px solid var(--border); }
.edit-save { flex:1; padding:8px; background:var(--accent-bright); color:var(--bg); border:none; font-family:var(--mono); font-size:10px; font-weight:700; letter-spacing:1px; cursor:pointer; border-radius:2px; }
.edit-save:hover { opacity:0.9; }
.edit-cancel { padding:8px 16px; background:none; border:1px solid var(--border); color:var(--fg-muted); font-family:var(--mono); font-size:10px; cursor:pointer; border-radius:2px; }

/* ── Edit Form Fields ─────────────────────── */
.edit-field { margin-bottom:14px; }
.edit-label { display:block; font-size:9px; letter-spacing:1px; text-transform:uppercase; color:var(--fg-muted); margin-bottom:4px; }
.edit-input { width:100%; padding:6px 10px; background:var(--bg); border:1px solid var(--border); border-radius:2px; color:var(--fg); font-family:var(--mono); font-size:11px; outline:none; }
.edit-input:focus { border-color:var(--accent); }
.edit-color-row { display:flex; align-items:center; gap:8px; }
.edit-color-swatch { width:32px; height:32px; border-radius:2px; border:1px solid var(--border); cursor:pointer; }
.edit-color-input { flex:1; }

/* ── Toast ────────────────────────────────── */
.toast-container { position:fixed; bottom:60px; right:20px; z-index:200; display:flex; flex-direction:column; gap:6px; }
.toast { padding:8px 16px; background:var(--bg-card); border:1px solid var(--border); border-radius:3px; font-family:var(--mono); font-size:10px; color:var(--fg); animation:slideIn 0.2s ease; max-width:350px; }
.toast.success { border-color:var(--accent-bright); }
.toast.error { border-color:var(--error); color:var(--error); }
.toast.synced { border-left:3px solid var(--accent-bright); }
@keyframes slideIn { from { transform:translateX(20px); opacity:0; } to { transform:translateX(0); opacity:1; } }

/* ── Figma Bar ────────────────────────────── */
.figma-bar { position:fixed; bottom:0; left:0; right:0; display:flex; align-items:center; gap:8px; padding:6px 16px; background:var(--bg-card); border-top:1px solid var(--border); font-size:10px; color:var(--fg-muted); z-index:40; }
.figma-dot { width:6px; height:6px; border-radius:50%; background:var(--fg-muted); }
.figma-dot.connected { background:#4ade80; box-shadow:0 0 6px #4ade80; }
.figma-sync-btn { margin-left:auto; padding:3px 10px; background:none; border:1px solid var(--border); color:var(--fg-muted); font-family:var(--mono); font-size:9px; letter-spacing:1px; cursor:pointer; border-radius:2px; }
.figma-sync-btn:hover { border-color:var(--accent); color:var(--fg); }

/* ── Agent Log ────────────────────────────── */
.agent-log { position:fixed; bottom:28px; left:16px; width:380px; max-height:300px; background:var(--bg-card); border:1px solid var(--border); border-radius:3px; z-index:45; display:flex; flex-direction:column; }
.agent-log.hidden { display:none; }
.agent-log-header { display:flex; align-items:center; justify-content:space-between; padding:6px 12px; border-bottom:1px solid var(--border); font-size:9px; letter-spacing:1.5px; color:var(--fg-muted); }
.agent-log-body { flex:1; overflow-y:auto; padding:8px 12px; max-height:250px; }
.agent-log-entry { padding:3px 0; font-size:10px; border-bottom:1px solid #1a1a1a; }
.agent-log-entry .step-name { color:var(--accent); }
.agent-log-entry .step-status { color:var(--fg-muted); margin-left:6px; }
.agent-log-entry .step-status.completed { color:#4ade80; }
.agent-log-entry .step-status.failed { color:var(--error); }
.agent-log-entry .step-status.running { color:var(--warn); }
.agent-log-toggle { position:fixed; bottom:32px; left:16px; padding:4px 12px; background:var(--bg-card); border:1px solid var(--border); border-radius:2px; font-family:var(--mono); font-size:9px; color:var(--fg-muted); cursor:pointer; z-index:44; letter-spacing:0.5px; }
.agent-log-toggle:hover { border-color:var(--accent); color:var(--fg); }

/* ── Editable cards ───────────────────────── */
.card[data-editable] { cursor:pointer; }
.card[data-editable]:hover .card-edit-btn { opacity:1; }
.card-edit-btn { position:absolute; top:8px; right:48px; padding:2px 8px; background:var(--bg); border:1px solid var(--border); border-radius:2px; font-family:var(--mono); font-size:9px; color:var(--fg-muted); cursor:pointer; opacity:0; transition:opacity 0.15s; letter-spacing:0.5px; }
.card-edit-btn:hover { border-color:var(--accent); color:var(--fg); }
.card-head { position:relative; }

/* ── Editable swatches ────────────────────── */
.swatch[data-editable] { cursor:pointer; }
.swatch[data-editable]:hover { box-shadow:0 0 0 2px var(--accent-bright); }
</style>

<script>
// ── State ──────────────────────────────────
const API_BASE = window.location.origin;
let ws = null;
let currentEdit = null;
let agentLogVisible = false;

// ── WebSocket Connection ───────────────────
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host);

  ws.onopen = () => {
    console.log('[Noche] WebSocket connected');
    ws.send(JSON.stringify({ type: 'request-state' }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    console.log('[Noche] WebSocket disconnected, reconnecting...');
    setTimeout(connectWs, 2000);
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'design-system-updated':
      if (msg.data && msg.data.action === 'token-updated') {
        showToast('Token updated: ' + (msg.data.token?.name || ''), 'success');
      }
      checkFigmaStatus();
      break;
    case 'spec-updated':
      showToast('Spec updated: ' + (msg.data?.spec?.name || ''), 'success');
      break;
    case 'figma-synced':
      showToast('Synced to Figma: ' + (msg.data?.token || msg.data?.scope || ''), 'synced');
      break;
    case 'agent-status':
      updateAgentLog(msg.data?.task);
      break;
    case 'agent-result':
      updateAgentLog(msg.data?.task);
      if (msg.data?.task?.status === 'completed') {
        showToast('Agent completed: ' + (msg.data.task.intent || ''), 'success');
      } else if (msg.data?.task?.status === 'failed') {
        showToast('Agent failed: ' + (msg.data.task.error || ''), 'error');
      }
      break;
    case 'error':
      showToast(msg.data?.message || 'Error', 'error');
      break;
  }
}

// ── Filter ─────────────────────────────────
function filter(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.card').forEach(card => {
    card.style.display = (type === 'all' || card.dataset.type === type) ? '' : 'none';
  });
}

// ── Command Palette ────────────────────────
function openPalette() {
  document.getElementById('cmd-palette').classList.remove('hidden');
  const input = document.getElementById('cmd-input');
  input.value = '';
  input.focus();
}

function closePalette() {
  document.getElementById('cmd-palette').classList.add('hidden');
  document.getElementById('cmd-status').classList.add('hidden');
}

async function runAgent(intent) {
  if (!intent) intent = document.getElementById('cmd-input').value.trim();
  if (!intent) return;

  const status = document.getElementById('cmd-status');
  status.classList.remove('hidden');
  status.innerHTML = '<span style="color:var(--warn)">&#9670;</span> Running agent: ' + escHtml(intent) + '...';

  // Show agent log
  if (!agentLogVisible) toggleAgentLog();

  try {
    const res = await fetch(API_BASE + '/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: intent,
        options: { autoSync: true }
      })
    });
    const data = await res.json();
    if (data.task) {
      status.innerHTML = '<span style="color:#4ade80">&#10003;</span> Agent started: ' + escHtml(data.task.id);
      setTimeout(closePalette, 1500);
    } else {
      status.innerHTML = '<span style="color:var(--error)">&#10007;</span> ' + (data.error || 'Failed to start agent');
    }
  } catch (err) {
    status.innerHTML = '<span style="color:var(--error)">&#10007;</span> ' + err.message;
  }
}

// ── Edit Panel ─────────────────────────────
function openEditPanel(type, name, data) {
  currentEdit = { type, name, data };
  const panel = document.getElementById('edit-panel');
  const title = document.getElementById('edit-title');
  const body = document.getElementById('edit-body');

  panel.classList.remove('hidden');

  if (type === 'token') {
    title.textContent = 'Edit Token: ' + name;
    body.innerHTML = buildTokenEditForm(data);
  } else if (type === 'spec') {
    title.textContent = 'Edit Spec: ' + name;
    body.innerHTML = buildSpecEditForm(data);
  }
}

function closeEditPanel() {
  document.getElementById('edit-panel').classList.add('hidden');
  currentEdit = null;
}

function buildTokenEditForm(token) {
  const modeEntries = Object.entries(token.values || {});
  let html = '<div class="edit-field"><label class="edit-label">Name</label><input class="edit-input" id="edit-token-name" value="' + escAttr(token.name) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Type</label><input class="edit-input" value="' + escAttr(token.type) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Collection</label><input class="edit-input" value="' + escAttr(token.collection) + '" readonly /></div>';

  for (const [mode, val] of modeEntries) {
    const strVal = String(val);
    if (token.type === 'color' && /^#[0-9a-fA-F]{3,8}$/.test(strVal)) {
      html += '<div class="edit-field"><label class="edit-label">Value (' + escHtml(mode) + ')</label>';
      html += '<div class="edit-color-row">';
      html += '<input type="color" class="edit-color-swatch" value="' + escAttr(strVal) + '" oninput="this.nextElementSibling.value=this.value" />';
      html += '<input class="edit-input edit-color-input" data-mode="' + escAttr(mode) + '" value="' + escAttr(strVal) + '" oninput="this.previousElementSibling.value=this.value" />';
      html += '</div></div>';
    } else {
      html += '<div class="edit-field"><label class="edit-label">Value (' + escHtml(mode) + ')</label>';
      html += '<input class="edit-input" data-mode="' + escAttr(mode) + '" value="' + escAttr(strVal) + '" /></div>';
    }
  }

  html += '<div class="edit-field"><label class="edit-label">CSS Variable</label><input class="edit-input" value="' + escAttr(token.cssVariable || '') + '" readonly /></div>';
  return html;
}

function buildSpecEditForm(spec) {
  let html = '<div class="edit-field"><label class="edit-label">Name</label><input class="edit-input" value="' + escAttr(spec.name) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Type</label><input class="edit-input" value="' + escAttr(spec.type) + '" readonly /></div>';
  html += '<div class="edit-field"><label class="edit-label">Purpose</label><textarea class="edit-input" id="edit-spec-purpose" rows="3">' + escHtml(spec.purpose) + '</textarea></div>';

  if (spec.type === 'component') {
    html += '<div class="edit-field"><label class="edit-label">Variants (comma-separated)</label><input class="edit-input" id="edit-spec-variants" value="' + escAttr((spec.variants || []).join(', ')) + '" /></div>';
    html += '<div class="edit-field"><label class="edit-label">shadcn Base (comma-separated)</label><input class="edit-input" id="edit-spec-shadcn" value="' + escAttr((spec.shadcnBase || []).join(', ')) + '" /></div>';
    html += '<div class="edit-field"><label class="edit-label">Props (JSON)</label><textarea class="edit-input" id="edit-spec-props" rows="5">' + escHtml(JSON.stringify(spec.props || {}, null, 2)) + '</textarea></div>';
  }

  if (spec.type === 'page') {
    html += '<div class="edit-field"><label class="edit-label">Layout</label><select class="edit-input" id="edit-spec-layout">';
    for (const l of ['sidebar-main','full-width','centered','dashboard','split','marketing']) {
      html += '<option' + (spec.layout === l ? ' selected' : '') + '>' + l + '</option>';
    }
    html += '</select></div>';
  }

  if (spec.type === 'dataviz') {
    html += '<div class="edit-field"><label class="edit-label">Chart Type</label><select class="edit-input" id="edit-spec-charttype">';
    for (const ct of ['line','bar','area','pie','donut','scatter','radar','composed']) {
      html += '<option' + (spec.chartType === ct ? ' selected' : '') + '>' + ct + '</option>';
    }
    html += '</select></div>';
  }

  html += '<div class="edit-field"><label class="edit-label">Tags (comma-separated)</label><input class="edit-input" id="edit-spec-tags" value="' + escAttr((spec.tags || []).join(', ')) + '" /></div>';
  return html;
}

async function saveEdit() {
  if (!currentEdit) return;

  try {
    if (currentEdit.type === 'token') {
      const token = { ...currentEdit.data };
      // Collect updated values from form
      const modeInputs = document.querySelectorAll('#edit-body [data-mode]');
      for (const input of modeInputs) {
        token.values[input.dataset.mode] = input.value;
      }
      const res = await fetch(API_BASE + '/api/tokens', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Token saved & syncing to Figma...', 'success');
        closeEditPanel();
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    } else if (currentEdit.type === 'spec') {
      const spec = { ...currentEdit.data };
      const purposeEl = document.getElementById('edit-spec-purpose');
      if (purposeEl) spec.purpose = purposeEl.value;

      if (spec.type === 'component') {
        const variantsEl = document.getElementById('edit-spec-variants');
        if (variantsEl) spec.variants = variantsEl.value.split(',').map(s => s.trim()).filter(Boolean);
        const shadcnEl = document.getElementById('edit-spec-shadcn');
        if (shadcnEl) spec.shadcnBase = shadcnEl.value.split(',').map(s => s.trim()).filter(Boolean);
        const propsEl = document.getElementById('edit-spec-props');
        if (propsEl) { try { spec.props = JSON.parse(propsEl.value); } catch {} }
      }
      if (spec.type === 'page') {
        const layoutEl = document.getElementById('edit-spec-layout');
        if (layoutEl) spec.layout = layoutEl.value;
      }
      if (spec.type === 'dataviz') {
        const ctEl = document.getElementById('edit-spec-charttype');
        if (ctEl) spec.chartType = ctEl.value;
      }
      const tagsEl = document.getElementById('edit-spec-tags');
      if (tagsEl) spec.tags = tagsEl.value.split(',').map(s => s.trim()).filter(Boolean);

      const res = await fetch(API_BASE + '/api/specs/' + encodeURIComponent(spec.name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec)
      });
      const data = await res.json();
      if (data.ok) {
        showToast('Spec saved!', 'success');
        closeEditPanel();
      } else {
        showToast('Failed: ' + (data.error || 'Unknown error'), 'error');
      }
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ── Toast ──────────────────────────────────
function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || '');
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Agent Log ──────────────────────────────
function toggleAgentLog() {
  const log = document.getElementById('agent-log');
  const btn = document.getElementById('agent-log-toggle');
  agentLogVisible = !agentLogVisible;
  log.classList.toggle('hidden', !agentLogVisible);
  btn.style.display = agentLogVisible ? 'none' : '';
}

function updateAgentLog(task) {
  if (!task) return;
  const body = document.getElementById('agent-log-body');
  let entry = document.getElementById('agent-task-' + task.id);
  if (!entry) {
    entry = document.createElement('div');
    entry.id = 'agent-task-' + task.id;
    entry.className = 'agent-log-entry';
    body.prepend(entry);
  }
  let html = '<div style="color:var(--accent);margin-bottom:4px;font-size:11px">' + escHtml(task.intent) + '</div>';
  for (const step of (task.steps || [])) {
    html += '<div style="padding-left:12px;font-size:10px"><span class="step-name">' + escHtml(step.name) + '</span>';
    html += '<span class="step-status ' + step.status + '">' + step.status;
    if (step.detail) html += ' — ' + escHtml(step.detail);
    html += '</span></div>';
  }
  if (task.status === 'completed') html += '<div style="color:#4ade80;font-size:9px;margin-top:3px">&#10003; COMPLETED</div>';
  if (task.status === 'failed') html += '<div style="color:var(--error);font-size:9px;margin-top:3px">&#10007; FAILED: ' + escHtml(task.error || '') + '</div>';
  entry.innerHTML = html;
  body.scrollTop = 0;
}

// ── Figma Status ───────────────────────────
async function checkFigmaStatus() {
  try {
    const res = await fetch(API_BASE + '/api/figma/status');
    const data = await res.json();
    const dot = document.getElementById('figma-dot');
    const status = document.getElementById('figma-status');
    if (data.connected) {
      dot.classList.add('connected');
      const clientCount = (data.clients || []).length;
      status.textContent = 'Figma: connected (' + clientCount + ' plugin' + (clientCount !== 1 ? 's' : '') + ')';
    } else {
      dot.classList.remove('connected');
      status.textContent = 'Figma: not connected';
    }
  } catch {
    document.getElementById('figma-dot').classList.remove('connected');
    document.getElementById('figma-status').textContent = 'Figma: offline';
  }
}

// ── Make Cards Editable ────────────────────
function makeCardsEditable() {
  // Color swatches
  document.querySelectorAll('.swatch').forEach(swatch => {
    swatch.setAttribute('data-editable', 'true');
    swatch.addEventListener('click', async () => {
      const name = swatch.getAttribute('title')?.split(':')[0]?.trim();
      if (!name) return;
      try {
        const res = await fetch(API_BASE + '/api/tokens');
        const data = await res.json();
        const token = (data.tokens || []).find(t => t.name === name);
        if (token) openEditPanel('token', name, token);
      } catch (err) { showToast('Failed to load token', 'error'); }
    });
  });

  // Spec cards
  document.querySelectorAll('.card').forEach(card => {
    const nameEl = card.querySelector('.card-name');
    if (!nameEl) return;
    const name = nameEl.textContent.trim();
    const type = card.dataset.type;
    card.setAttribute('data-editable', 'true');

    // Add edit button
    const head = card.querySelector('.card-head');
    if (head) {
      const btn = document.createElement('button');
      btn.className = 'card-edit-btn';
      btn.textContent = 'EDIT';
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const res = await fetch(API_BASE + '/api/specs/' + encodeURIComponent(name));
          const data = await res.json();
          if (data.spec) openEditPanel('spec', name, data.spec);
          else showToast('Spec not found', 'error');
        } catch (err) { showToast('Failed to load spec', 'error'); }
      });
      head.appendChild(btn);
    }
  });
}

// ── Keyboard Shortcuts ─────────────────────
document.addEventListener('keydown', (e) => {
  // Cmd+K or Ctrl+K — open command palette
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    openPalette();
  }
  // Escape — close panels
  if (e.key === 'Escape') {
    closePalette();
    closeEditPanel();
  }
  // Enter in command palette — run agent
  if (e.key === 'Enter' && !document.getElementById('cmd-palette').classList.contains('hidden')) {
    e.preventDefault();
    runAgent();
  }
});

// ── Helpers ────────────────────────────────
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Init ───────────────────────────────────
connectWs();
checkFigmaStatus();
setInterval(checkFigmaStatus, 10000);
makeCardsEditable();
</script>
</body>
</html>`;
}

function generateResearchDashboard(research: ResearchStore, generatedAt: string): string {
  const { insights, themes, personas, sources } = research;
  const highConf = insights.filter(i => i.confidence === "high");
  const medConf = insights.filter(i => i.confidence === "medium");
  const lowConf = insights.filter(i => i.confidence === "low");

  // Tag frequency for the tag cloud
  const tagFreq = new Map<string, number>();
  for (const i of insights) {
    for (const t of i.tags) {
      tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
    }
  }
  const sortedTags = [...tagFreq.entries()].sort((a, b) => b[1] - a[1]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M25.5 15.5A9.5 9.5 0 0 1 12 25 9.5 9.5 0 0 1 9.5 6.5 12 12 0 1 0 25.5 15.5z' fill='%23e2e8f0'/%3E%3C/svg%3E">
<title>Noche Research</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #0a0a0a;
  --bg-card: #111111;
  --bg-hover: #1a1a1a;
  --bg-surface: #161616;
  --fg: #e0e0e0;
  --fg-muted: #666666;
  --fg-dim: #444444;
  --border: #222222;
  --accent: #d4d4d4;
  --accent-bright: #ffffff;
  --accent-dim: #444444;
  --high: #ffffff;
  --medium: #888888;
  --low: #444444;
  --mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --radius: 3px;
}

body {
  font-family: var(--mono);
  font-size: 12px;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.6;
  min-height: 100vh;
}

/* ── Header ──────────────────────────── */
.hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  position: sticky;
  top: 0;
  z-index: 10;
}

.hdr-left { display: flex; align-items: center; gap: 16px; }

.hdr-title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.hdr-title span { color: var(--accent-bright); }

.hdr-back {
  font-size: 10px;
  color: var(--fg-muted);
  text-decoration: none;
  border: 1px solid var(--border);
  padding: 3px 10px;
  border-radius: var(--radius);
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: all 0.15s;
}

.hdr-back:hover { border-color: var(--accent); color: var(--fg); }

.hdr-meta {
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
}

/* ── Stats Bar ───────────────────────── */
.stats-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
}

.stat {
  flex: 1;
  padding: 16px 24px;
  border-right: 1px solid var(--border);
  text-align: center;
}

.stat:last-child { border-right: none; }

.stat-val {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent-bright);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.stat-label {
  font-size: 9px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-top: 6px;
}

/* ── Layout ──────────────────────────── */
.content {
  display: grid;
  grid-template-columns: 280px 1fr;
  min-height: calc(100vh - 120px);
}

/* ── Sidebar ─────────────────────────── */
.sidebar {
  border-right: 1px solid var(--border);
  padding: 20px;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
  position: sticky;
  top: 56px;
}

.sidebar-section {
  margin-bottom: 24px;
}

.sidebar-heading {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--fg-muted);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

/* ── Source List ──────────────────────── */
.source-item {
  padding: 6px 0;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.02);
  display: flex;
  align-items: center;
  gap: 8px;
}

.source-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-dim);
  flex-shrink: 0;
}

.source-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-type {
  font-size: 9px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* ── Tag Cloud ───────────────────────── */
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  font-size: 10px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--fg-muted);
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.5px;
}

.tag:hover { border-color: var(--accent); color: var(--fg); }
.tag.active { background: var(--accent-dim); color: var(--accent-bright); border-color: var(--accent); }

.tag .tag-count {
  font-size: 8px;
  color: var(--fg-dim);
  margin-left: 3px;
}

/* ── Confidence Bar ──────────────────── */
.conf-bar {
  display: flex;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 8px;
  gap: 2px;
}

.conf-bar .seg {
  height: 100%;
  border-radius: 1px;
}

.conf-bar .seg.high { background: var(--high); }
.conf-bar .seg.medium { background: var(--medium); }
.conf-bar .seg.low { background: var(--low); }

.conf-legend {
  display: flex;
  gap: 12px;
  margin-top: 6px;
  font-size: 9px;
  color: var(--fg-muted);
}

.conf-legend span::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 1px;
  margin-right: 4px;
  vertical-align: middle;
}

.conf-legend .ch::before { background: var(--high); }
.conf-legend .cm::before { background: var(--medium); }
.conf-legend .cl::before { background: var(--low); }

/* ── Main Panel ──────────────────────── */
.main {
  padding: 20px 24px;
  overflow-y: auto;
}

/* ── Tabs ────────────────────────────── */
.tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  background: none;
  color: var(--fg-muted);
  font-family: var(--mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.tab-btn:hover { color: var(--fg); }
.tab-btn.active { color: var(--accent-bright); border-bottom-color: var(--accent); }

.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* ── Themes Grid ─────────────────────── */
.themes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.theme-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  padding: 16px;
  transition: border-color 0.15s;
}

.theme-card:hover { border-color: var(--accent-dim); }

.theme-name {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 4px;
  letter-spacing: 0.5px;
}

.theme-desc {
  font-size: 11px;
  color: var(--fg-muted);
  margin-bottom: 10px;
  font-family: var(--sans);
  line-height: 1.5;
}

.theme-freq {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-bright);
  line-height: 1;
}

.theme-freq-label {
  font-size: 9px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* ── Insight Cards ───────────────────── */
.insight-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.insight {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  padding: 14px 16px;
  transition: border-color 0.15s;
  cursor: default;
}

.insight:hover { border-color: var(--accent-dim); }

.insight-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 6px;
}

.insight-conf {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  margin-top: 4px;
  flex-shrink: 0;
}

.insight-conf.high { background: var(--high); }
.insight-conf.medium { background: var(--medium); }
.insight-conf.low { background: var(--low); }

.insight-finding {
  font-size: 12px;
  font-weight: 600;
  flex: 1;
  line-height: 1.5;
}

.insight-meta {
  display: flex;
  gap: 12px;
  font-size: 10px;
  color: var(--fg-muted);
  margin-top: 6px;
  padding-left: 18px;
}

.insight-evidence {
  margin-top: 8px;
  padding-left: 18px;
}

.insight-evidence details {
  font-size: 10px;
  color: var(--fg-muted);
}

.insight-evidence summary {
  cursor: pointer;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--fg-dim);
  padding: 2px 0;
}

.insight-evidence summary:hover { color: var(--fg-muted); }

.insight-evidence blockquote {
  border-left: 2px solid var(--border);
  padding: 4px 0 4px 12px;
  margin: 4px 0;
  font-family: var(--sans);
  font-size: 11px;
  color: var(--fg-muted);
  line-height: 1.5;
}

.insight-tags {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  padding-left: 18px;
}

.insight-tag {
  font-size: 9px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 2px;
  color: var(--fg-dim);
  letter-spacing: 0.5px;
}

/* ── Persona Cards ───────────────────── */
.persona-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.persona-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  overflow: hidden;
}

.persona-head {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.persona-name { font-size: 13px; font-weight: 700; }

.persona-role {
  font-size: 10px;
  color: var(--fg-muted);
  font-family: var(--sans);
}

.persona-body { padding: 14px 16px; }

.persona-section {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--fg-muted);
  margin-top: 10px;
  margin-bottom: 4px;
}

.persona-section:first-child { margin-top: 0; }

.persona-list {
  list-style: none;
  font-size: 11px;
  font-family: var(--sans);
  color: var(--fg);
  line-height: 1.8;
}

.persona-list li::before {
  content: '—';
  color: var(--fg-dim);
  margin-right: 6px;
}

/* ── Empty ───────────────────────────── */
.empty-note {
  text-align: center;
  padding: 40px;
  color: var(--fg-muted);
  font-size: 11px;
}

/* ── Scrollbar ───────────────────────── */
::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #444; }

/* ── Responsive ──────────────────────── */
@media (max-width: 768px) {
  .content { grid-template-columns: 1fr; }
  .sidebar { position: static; max-height: none; border-right: none; border-bottom: 1px solid var(--border); }
  .stats-bar { flex-wrap: wrap; }
  .stat { min-width: 50%; }
}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <a href="index.html" class="hdr-back">&larr; Gallery</a>
    <div class="hdr-title"><span>ARK</span> RESEARCH</div>
  </div>
  <div class="hdr-meta">UPDATED ${esc(new Date(generatedAt).toLocaleString())}</div>
</div>

<div class="stats-bar">
  <div class="stat">
    <div class="stat-val">${insights.length}</div>
    <div class="stat-label">Insights</div>
  </div>
  <div class="stat">
    <div class="stat-val">${themes.length}</div>
    <div class="stat-label">Themes</div>
  </div>
  <div class="stat">
    <div class="stat-val">${highConf.length}</div>
    <div class="stat-label">High Confidence</div>
  </div>
  <div class="stat">
    <div class="stat-val">${sources.length}</div>
    <div class="stat-label">Sources</div>
  </div>
  <div class="stat">
    <div class="stat-val">${personas.length}</div>
    <div class="stat-label">Personas</div>
  </div>
</div>

<div class="content">

<!-- Sidebar -->
<div class="sidebar">

  <div class="sidebar-section">
    <div class="sidebar-heading">Confidence</div>
    <div class="conf-bar">
      ${highConf.length > 0 ? `<div class="seg high" style="flex:${highConf.length}"></div>` : ""}
      ${medConf.length > 0 ? `<div class="seg medium" style="flex:${medConf.length}"></div>` : ""}
      ${lowConf.length > 0 ? `<div class="seg low" style="flex:${lowConf.length}"></div>` : ""}
    </div>
    <div class="conf-legend">
      <span class="ch">${highConf.length} High</span>
      <span class="cm">${medConf.length} Med</span>
      <span class="cl">${lowConf.length} Low</span>
    </div>
  </div>

  <div class="sidebar-section">
    <div class="sidebar-heading">Tags</div>
    <div class="tag-cloud">
      ${sortedTags.map(([tag, count]) =>
        `<span class="tag" onclick="filterByTag('${esc(tag)}',this)">${esc(tag)}<span class="tag-count">${count}</span></span>`
      ).join("")}
    </div>
  </div>

  <div class="sidebar-section">
    <div class="sidebar-heading">Sources</div>
    ${sources.map(s => {
      const name = s.name.split("/").pop() || s.name;
      return `<div class="source-item">
        <div class="source-dot"></div>
        <span class="source-name" title="${esc(s.name)}">${esc(name)}</span>
        <span class="source-type">${esc(s.type)}</span>
      </div>`;
    }).join("")}
    ${sources.length === 0 ? `<div class="empty-note">No sources yet</div>` : ""}
  </div>

</div>

<!-- Main -->
<div class="main">

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('insights',this)">Insights (${insights.length})</button>
  <button class="tab-btn" onclick="switchTab('themes',this)">Themes (${themes.length})</button>
  ${personas.length > 0 ? `<button class="tab-btn" onclick="switchTab('personas',this)">Personas (${personas.length})</button>` : ""}
</div>

<!-- Insights Tab -->
<div class="tab-panel active" id="tab-insights">
  <div class="insight-list" id="insightList">
    ${insights.map(i => `<div class="insight" data-tags="${esc(i.tags.join(","))}" data-confidence="${i.confidence}">
      <div class="insight-header">
        <div class="insight-conf ${i.confidence}" title="${i.confidence} confidence"></div>
        <div class="insight-finding">${esc(i.finding)}</div>
      </div>
      <div class="insight-meta">
        <span>${esc(i.source.split("/").pop() || i.source)}</span>
        <span>${esc(i.confidence)}</span>
        <span>${esc(new Date(i.createdAt).toLocaleDateString())}</span>
      </div>
      ${i.evidence.length > 0 ? `<div class="insight-evidence">
        <details>
          <summary>${i.evidence.length} evidence point${i.evidence.length !== 1 ? "s" : ""}</summary>
          ${i.evidence.slice(0, 5).map(e => `<blockquote>${esc(e)}</blockquote>`).join("")}
          ${i.evidence.length > 5 ? `<div style="font-size:9px;color:var(--fg-dim);padding:4px 0">+${i.evidence.length - 5} more</div>` : ""}
        </details>
      </div>` : ""}
      ${i.tags.length > 0 ? `<div class="insight-tags">${i.tags.map(t => `<span class="insight-tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>`).join("\n    ")}
    ${insights.length === 0 ? `<div class="empty-note">No insights yet. Run <code>noche research from-file</code> or <code>noche research from-stickies</code></div>` : ""}
  </div>
</div>

<!-- Themes Tab -->
<div class="tab-panel" id="tab-themes">
  <div class="themes-grid">
    ${themes.map(t => {
      const relatedInsights = insights.filter(i => t.insights.includes(i.id));
      return `<div class="theme-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
          <div>
            <div class="theme-name">${esc(t.name)}</div>
            <div class="theme-desc">${esc(t.description)}</div>
          </div>
          <div style="text-align:right">
            <div class="theme-freq">${t.frequency}</div>
            <div class="theme-freq-label">findings</div>
          </div>
        </div>
        ${relatedInsights.slice(0, 3).map(i => `<div style="font-size:10px;padding:4px 0;border-top:1px solid var(--border);color:var(--fg-muted);font-family:var(--sans)">
          <span style="color:var(--${i.confidence})">&bull;</span> ${esc(i.finding.substring(0, 80))}${i.finding.length > 80 ? "..." : ""}
        </div>`).join("")}
        ${relatedInsights.length > 3 ? `<div style="font-size:9px;color:var(--fg-dim);padding-top:4px">+${relatedInsights.length - 3} more insights</div>` : ""}
      </div>`;
    }).join("\n    ")}
    ${themes.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No themes yet. Run <code>noche research synthesize</code></div>` : ""}
  </div>
</div>

<!-- Personas Tab -->
<div class="tab-panel" id="tab-personas">
  <div class="persona-grid">
    ${personas.map(p => `<div class="persona-card">
      <div class="persona-head">
        <div class="persona-name">${esc(p.name)}</div>
        <div class="persona-role">${esc(p.role)}</div>
      </div>
      <div class="persona-body">
        ${p.goals.length > 0 ? `<div class="persona-section">Goals</div>
        <ul class="persona-list">${p.goals.map(g => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
        ${p.painPoints.length > 0 ? `<div class="persona-section">Pain Points</div>
        <ul class="persona-list">${p.painPoints.map(pp => `<li>${esc(pp)}</li>`).join("")}</ul>` : ""}
        ${p.behaviors.length > 0 ? `<div class="persona-section">Behaviors</div>
        <ul class="persona-list">${p.behaviors.map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>`).join("\n    ")}
    ${personas.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No personas yet. Run <code>noche research synthesize</code></div>` : ""}
  </div>
</div>

</div>
</div>

<script>
function switchTab(name, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
}

let activeTag = null;
function filterByTag(tag, el) {
  if (activeTag === tag) {
    activeTag = null;
    el.classList.remove('active');
    document.querySelectorAll('.insight').forEach(i => i.style.display = '');
    return;
  }

  activeTag = tag;
  document.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');

  document.querySelectorAll('.insight').forEach(i => {
    const tags = i.dataset.tags.split(',');
    i.style.display = tags.includes(tag) ? '' : 'none';
  });

  // Switch to insights tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab-btn').classList.add('active');
  document.getElementById('tab-insights').classList.add('active');
}
</script>
</body>
</html>`;
}
