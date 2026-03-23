import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";
import type { AnySpec } from "../specs/types.js";
import type { DesignToken } from "../engine/registry.js";
import type { ResearchStore } from "../research/engine.js";
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

export function registerPreviewCommand(program: Command, engine: ArkEngine) {
  program
    .command("preview")
    .description("Build and serve the Ark component preview gallery")
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

      console.log(`\n  Starting on http://localhost:${port}\n`);

      try {
        const child = spawn("npx", ["-y", "serve", previewDir, "-l", String(port), "-s", "--no-clipboard"], {
          stdio: "inherit",
          shell: true,
        });

        child.on("error", (err) => {
          console.log(`  npx serve failed (${err.message}), falling back to python3...`);
          spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
        });
      } catch {
        spawn("python3", ["-m", "http.server", String(port)], { cwd: previewDir, stdio: "inherit" });
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
<title>${projectName} — Ark Preview</title>
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
  Run <code>ark spec component MyComponent</code> then <code>ark generate</code>
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

<script>
function filter(type, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.card').forEach(card => {
    card.style.display = (type === 'all' || card.dataset.type === type) ? '' : 'none';
  });
}
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
<title>Ark Research</title>
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
    ${insights.length === 0 ? `<div class="empty-note">No insights yet. Run <code>ark research from-file</code> or <code>ark research from-stickies</code></div>` : ""}
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
    ${themes.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No themes yet. Run <code>ark research synthesize</code></div>` : ""}
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
    ${personas.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No personas yet. Run <code>ark research synthesize</code></div>` : ""}
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
