import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
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

export function registerPreviewCommand(program: Command, engine: MemoireEngine) {
  program
    .command("preview")
    .description("Build and serve the Mémoire component preview gallery")
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
        console.log(`\n  Mémoire Preview (interactive) on http://localhost:${actualPort}`);
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
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='6' fill='%23ffffff'/%3E%3C/svg%3E">
<title>mémoire</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #111113;
  --bg-card: #19191c;
  --bg-hover: #222226;
  --fg: #ffffff;
  --fg-muted: #636369;
  --border: #2a2a2e;
  --accent: #a0a0a6;
  --accent-bright: #ffffff;
  --accent-dim: #1e1e22;
  --chart-1: #ffffff;
  --chart-2: #a0a0a6;
  --chart-3: #636369;
  --chart-4: #d0d0d4;
  --warn: #a0a0a6;
  --error: #f87171;
  --mono: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Cascadia Code', monospace;
  --radius: 4px;
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
  align-items: center;
  gap: 10px;
}
.hdr-moon { flex-shrink: 0; }
.hdr-nav { display: flex; gap: 2px; position: absolute; left: 50%; transform: translateX(-50%); }
.hdr-nav-link {
  padding: 6px 14px; font-family: var(--mono); font-size: 10px; letter-spacing: 1px;
  text-transform: uppercase; color: var(--fg-muted); text-decoration: none;
  border: 1px solid transparent; border-radius: 2px; transition: all 0.15s; cursor: pointer;
}
.hdr-nav-link:hover { color: var(--fg); border-color: var(--border); }
.hdr-nav-link.active { color: var(--accent-bright); border-color: var(--accent-dim); background: var(--accent-dim); }
.nav-nested {
  display: inline-block; margin-left: 10px; padding: 2px 8px; font-size: 9px;
  color: var(--fg-muted); border-left: 1px solid var(--border); cursor: pointer;
  transition: color 0.15s;
}
.nav-nested:hover { color: var(--accent-bright); }


.section-panel { display: none; }
.section-panel.active { display: block; }

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

/* ── Screens Section ─────────────────────── */
.screens-section { padding: 24px; }
.screens-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.screens-label { font-family: var(--mono); font-size: 18px; font-weight: 700; letter-spacing: 3px; color: var(--accent-bright); text-transform: uppercase; white-space: nowrap; }
.screens-subtitle { font-family: var(--mono); font-size: 11px; color: var(--fg-muted); white-space: nowrap; }
.screens-line { flex: 1; height: 1px; background: var(--border); }
.screens-count { font-family: var(--mono); font-size: 10px; letter-spacing: 1px; color: var(--fg-muted); white-space: nowrap; }
.screens-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 20px; }
.screen-card {
  border: 1px solid var(--border); border-radius: 4px; background: var(--bg-card);
  text-decoration: none; color: var(--fg); transition: all 0.25s; overflow: hidden;
}
.screen-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }
.screen-thumb {
  width: 100%; height: 200px; overflow: hidden; position: relative;
  background: #F7F3EE; border-bottom: 1px solid var(--border);
}
.screen-thumb iframe {
  width: 1440px; height: 900px; border: none; pointer-events: none;
  transform: scale(0.28); transform-origin: top left;
}
.screen-info { padding: 14px 16px; display: flex; align-items: center; gap: 10px; }
.screen-name { font-family: var(--mono); font-size: 13px; font-weight: 600; flex: 1; }
.screen-desc { display: none; }
.screen-badge {
  font-family: var(--mono); font-size: 9px; letter-spacing: 1px; padding: 2px 8px;
  border: 1px solid var(--accent-dim); border-radius: 2px; color: var(--accent);
  white-space: nowrap; flex-shrink: 0;
}
.screens-extras {
  display: flex; gap: 12px; flex-wrap: wrap; padding-top: 12px;
  border-top: 1px solid var(--border);
}
.screen-extra {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px;
  font-family: var(--mono); font-size: 11px; color: var(--fg-muted);
  border: 1px solid var(--border); border-radius: 3px; text-decoration: none;
  transition: all 0.15s;
}
.screen-extra:hover { border-color: var(--accent-dim); color: var(--accent); }
.screen-extra svg { stroke: currentColor; }
@media (max-width: 1024px) { .screens-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .screens-grid { grid-template-columns: 1fr; } .screens-extras { flex-direction: column; } }

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

/* ── Design System Section ──────────────── */
.sys-section { padding: 24px; }
.sys-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; }
.sys-title { font-family: var(--mono); font-size: 16px; font-weight: 700; letter-spacing: 2px; color: var(--accent-bright); }
.sys-sub { font-family: var(--mono); font-size: 11px; color: var(--fg-muted); }
.sys-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
@media (max-width: 768px) { .sys-grid { grid-template-columns: 1fr; } }
.sys-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 20px; }
.sys-card-label { font-family: var(--mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--fg-muted); margin-bottom: 14px; }
.sys-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.sys-swatch { width: 48px; height: 48px; border-radius: 4px; border: 1px solid var(--border); position: relative; cursor: pointer; transition: transform 0.15s; }
.sys-swatch:hover { transform: scale(1.15); z-index: 1; }
.sys-swatch span { position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 8px; color: var(--fg-muted); white-space: nowrap; font-family: var(--mono); opacity: 0; transition: opacity 0.15s; }
.sys-swatch:hover span { opacity: 1; }
.sys-type-list { display: flex; flex-direction: column; gap: 10px; }
.sys-type-row { display: flex; align-items: baseline; gap: 16px; }
.sys-type-name { font-family: var(--mono); font-size: 10px; color: var(--fg-muted); letter-spacing: 1px; text-transform: uppercase; min-width: 70px; }
.sys-type-val { color: var(--fg); }
.sys-spacing { display: flex; flex-direction: column; gap: 6px; }
.sys-sp { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 10px; color: var(--fg-muted); }
.sys-sp-bar { height: 8px; background: var(--accent); border-radius: 1px; min-width: 4px; }
.sys-sp span { color: var(--accent-bright); min-width: 30px; }
.sys-radius-grid { display: flex; gap: 16px; flex-wrap: wrap; align-items: end; }
.sys-radius-item { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.sys-radius-box { width: 40px; height: 40px; border: 2px solid var(--accent); background: var(--accent-dim); }
.sys-radius-item span { font-family: var(--mono); font-size: 9px; color: var(--fg-muted); }
.sys-components { }
.sys-comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; padding: 0 24px 24px; }
.sys-comp { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.sys-comp-demo { padding: 20px; display: flex; align-items: center; justify-content: center; background: #F7F3EE; min-height: 80px; }
.sys-comp-name { padding: 10px 14px; font-family: var(--mono); font-size: 10px; color: var(--fg-muted); letter-spacing: 0.5px; border-top: 1px solid var(--border); }

/* ── Research Section ───────────────────── */
.research-section { padding: 24px; }
.res-nav { display: flex; gap: 2px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.res-nav-btn { font-family: var(--mono); font-size: 10px; letter-spacing: 1px; text-transform: uppercase; padding: 10px 16px; background: none; border: none; color: var(--fg-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
.res-nav-btn:hover { color: var(--fg); }
.res-nav-btn.active { color: var(--accent-bright); border-bottom-color: var(--accent); }
.res-panel { display: none; }
.res-panel.active { display: block; }
.spec-panel { display: none; }
.spec-panel.active { display: block; }

/* Overview Stats */
.res-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
.res-stat { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 16px; text-align: center; }
.res-stat-num { font-family: var(--mono); font-size: 28px; font-weight: 700; color: var(--accent-bright); line-height: 1; }
.res-stat-label { font-family: var(--mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--fg-muted); margin-top: 8px; }

/* Confidence Bar */
.res-conf-bar { display: flex; height: 6px; border-radius: 3px; overflow: hidden; margin-bottom: 24px; background: var(--border); }
.res-conf-seg { transition: width 0.3s; }
.res-conf-legend { display: flex; gap: 16px; margin-top: 8px; font-family: var(--mono); font-size: 9px; }
.res-conf-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }

/* Themes */
.res-themes { margin-bottom: 24px; }
.res-theme-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.res-theme-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 16px; }
.res-theme-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.res-theme-name { font-family: var(--mono); font-size: 13px; font-weight: 600; color: var(--accent-bright); }
.res-theme-freq { font-family: var(--mono); font-size: 9px; color: var(--fg-muted); background: var(--accent-dim); padding: 2px 8px; border-radius: 10px; }
.res-theme-desc { font-family: var(--mono); font-size: 11px; color: var(--fg-muted); line-height: 1.5; margin-bottom: 10px; }
.res-theme-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.res-theme-fill { height: 100%; background: var(--accent); border-radius: 2px; }

/* Insights */
.res-insights { }
.res-insight { padding: 14px 16px; border-left: 2px solid var(--accent-dim); margin-bottom: 10px; background: var(--bg-card); border-radius: 0 4px 4px 0; cursor: pointer; transition: border-color 0.15s; }
.res-insight:hover { border-left-color: var(--accent-bright); }
.res-insight-text { font-family: var(--mono); font-size: 12px; color: var(--fg); line-height: 1.6; margin-bottom: 8px; }
.res-insight-meta { display: flex; gap: 12px; font-family: var(--mono); font-size: 9px; align-items: center; flex-wrap: wrap; }
.res-src { color: var(--fg-muted); letter-spacing: 0.5px; }
.res-conf-badge { text-transform: uppercase; letter-spacing: 1px; padding: 1px 8px; border-radius: 10px; font-size: 8px; font-weight: 600; }
.res-conf-high { background: rgba(45, 80, 22, 0.3); color: #7ec85a; border: 1px solid rgba(45, 80, 22, 0.5); }
.res-conf-medium { background: rgba(157, 131, 62, 0.2); color: var(--accent-bright); border: 1px solid var(--accent-dim); }
.res-conf-low { background: rgba(255, 68, 68, 0.15); color: #ff6b6b; border: 1px solid rgba(255, 68, 68, 0.3); }
.res-insight-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.res-tag { font-family: var(--mono); font-size: 8px; letter-spacing: 0.5px; padding: 2px 8px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 2px; color: var(--fg-muted); }
.res-evidence { display: none; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
.res-evidence.open { display: block; }
.res-ev-item { font-family: var(--mono); font-size: 10px; color: var(--fg-muted); line-height: 1.6; padding: 4px 0 4px 12px; border-left: 1px solid var(--border); margin-bottom: 4px; }

/* Personas */
.res-persona-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; margin-bottom: 24px; }
.res-persona { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; padding: 20px; }
.res-persona-name { font-family: var(--mono); font-size: 14px; font-weight: 700; color: var(--fg); margin-bottom: 4px; }
.res-persona-role { font-family: var(--mono); font-size: 10px; color: var(--fg-muted); line-height: 1.5; margin-bottom: 12px; }
.res-persona-quote { font-family: var(--mono); font-size: 11px; color: var(--accent-bright); font-style: italic; padding: 10px 14px; background: var(--accent-dim); border-radius: 3px; margin-bottom: 14px; line-height: 1.5; }
.res-persona-section { font-family: var(--mono); font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--fg-muted); margin: 12px 0 8px; }
.res-persona-list { list-style: none; padding: 0; }
.res-persona-list li { font-family: var(--mono); font-size: 10px; color: var(--fg-muted); line-height: 1.6; padding: 2px 0 2px 12px; border-left: 1px solid var(--border); margin-bottom: 2px; }
.res-persona-list li.pain { border-left-color: #ff4444; }
.res-persona-list li.goal { border-left-color: #7ec85a; }
.res-persona-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.res-persona-tool { font-family: var(--mono); font-size: 8px; padding: 2px 8px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 2px; color: var(--fg-muted); }
.res-persona-frust { margin-top: 10px; }
.res-frust-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; }
.res-frust-fill { height: 100%; border-radius: 2px; }

/* Product Spec */
.res-spec { margin-bottom: 24px; }
.res-spec-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; margin-bottom: 12px; overflow: hidden; }
.res-spec-head { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.15s; }
.res-spec-head:hover { background: var(--bg-hover); }
.res-spec-title { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--fg); letter-spacing: 0.5px; }
.res-spec-badge { font-family: var(--mono); font-size: 9px; color: var(--fg-muted); background: var(--bg-hover); padding: 2px 10px; border-radius: 10px; border: 1px solid var(--border); }
.res-spec-body { display: none; padding: 0 16px 16px; }
.res-spec-body.open { display: block; }
.res-spec-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.res-spec-table th { font-family: var(--mono); font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: var(--fg-muted); text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.res-spec-table td { font-family: var(--mono); font-size: 11px; color: var(--fg); padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
.res-spec-table tr:last-child td { border-bottom: none; }
.res-spec-table td.muted { color: var(--fg-muted); font-size: 10px; }
.res-spec-warn { font-family: var(--mono); font-size: 10px; color: #ffaa00; padding: 8px 12px; background: rgba(255, 170, 0, 0.08); border: 1px solid rgba(255, 170, 0, 0.2); border-radius: 3px; margin-top: 10px; }
.res-spec-items { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 0; }
.res-spec-item { font-family: var(--mono); font-size: 10px; padding: 4px 10px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 3px; color: var(--fg-muted); }
.res-spec-sub { font-family: var(--mono); font-size: 10px; font-weight: 600; color: var(--accent-bright); margin: 12px 0 8px; letter-spacing: 0.5px; }
.res-spec-dep { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-family: var(--mono); font-size: 10px; }
.res-spec-dep-arrow { color: var(--accent); }
.res-spec-dep-target { color: var(--fg-muted); }

/* Sources */
.res-sources { margin-top: 24px; }
.res-source { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px; margin-bottom: 6px; }
.res-source-type { font-family: var(--mono); font-size: 8px; letter-spacing: 1px; text-transform: uppercase; padding: 2px 8px; border-radius: 2px; color: var(--fg-muted); border: 1px solid var(--border); }
.res-source-name { font-family: var(--mono); font-size: 11px; color: var(--fg); }
.res-source-date { font-family: var(--mono); font-size: 9px; color: var(--fg-muted); margin-left: auto; }
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-project">mémoire</div>
  </div>
  <div class="hdr-nav">
    <a href="#screens" class="hdr-nav-link active" onclick="showSection('screens',this)">Screens</a>
    <a href="#research" class="hdr-nav-link" onclick="showSection('research',this)">Research</a>
    <a href="#specs" class="hdr-nav-link" onclick="showSection('specs',this)">Specs</a>
    <a href="#system" class="hdr-nav-link" onclick="showSection('system',this)">Systems</a>
    <a href="#changelog" class="hdr-nav-link" onclick="showSection('changelog',this)">Changelog</a>
  </div>
  <div class="hdr-stats">
    <span><span class="n" id="stat-userflows">0</span>USERFLOWS</span>
    <span><span class="n" id="stat-specs">0</span>SPECS</span>
    <span><span class="n" id="stat-tokens">60</span>SYSTEMS</span>
  </div>
</div>

<!-- ── Screens Section ────────────────────────── -->
<div id="section-screens" class="section-panel active">
<div class="screens-section">
  <div class="screens-header">
    <div class="screens-label">DIBS</div>
    <div class="screens-subtitle">Agency Production Bidding &mdash; AICP-Compliant Estimation</div>
    <div class="screens-line"></div>
    <div class="screens-count" id="screens-count">0 USERFLOWS</div>
  </div>
  <div class="screens-grid">
    <a href="dibs.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Project Setup</div>
        <div class="screen-desc">Production type, brief, template selection</div>
        <div class="screen-badge">STEP 1</div>
      </div>
    </a>
    <a href="dibs.html#step2" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Smart Estimator</div>
        <div class="screen-desc">AI pre-filled line items, 9 AICP categories</div>
        <div class="screen-badge">STEP 2</div>
      </div>
    </a>
    <a href="dibs.html#step3" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Timeline</div>
        <div class="screen-desc">Gantt chart, milestones, shoot day planning</div>
        <div class="screen-badge">STEP 3</div>
      </div>
    </a>
    <a href="dibs.html#step4" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Bid Summary</div>
        <div class="screen-desc">Budget breakdown, comparison, export to AICP PDF</div>
        <div class="screen-badge">STEP 4</div>
      </div>
    </a>
    <a href="dibs-dashboard.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-dashboard.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Dashboard</div>
        <div class="screen-desc">Active bids, pipeline stats, recent activity</div>
        <div class="screen-badge">OVERVIEW</div>
      </div>
    </a>
    <a href="dibs-dashboard.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-dashboard.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Line Items & Compare</div>
        <div class="screen-desc">Budget breakdown, comparison, all in dashboard</div>
        <div class="screen-badge">WIDGETS</div>
      </div>
    </a>
    <a href="dibs-rates.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-rates.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Rate Cards</div>
        <div class="screen-desc">Union rates, crew benchmarks, equipment pricing</div>
        <div class="screen-badge">RATES</div>
      </div>
    </a>
    <a href="dibs-collab.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-collab.html" tabindex="-1"></iframe></div>
      <div class="screen-info">
        <div class="screen-name">Collaboration</div>
        <div class="screen-desc">Real-time co-editing, comments, version history</div>
        <div class="screen-badge">COLLAB</div>
      </div>
    </a>
  </div>

</div>
</div>

<!-- ── Design System Section ─────────────────── -->
<div id="section-system" class="section-panel">
<div class="sys-section">
  <div class="sys-header">
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M25.5 15.5A9.5 9.5 0 0 1 12 25 9.5 9.5 0 0 1 9.5 6.5 12 12 0 1 0 25.5 15.5z" fill="#C4A35A"/></svg>
    <span class="sys-title">Dibs Design System</span>
    <span class="sys-sub">Tokens, primitives, components</span>
  </div>

  <div class="sys-grid">
    <div class="sys-card">
      <div class="sys-card-label">COLORS</div>
      <div class="sys-swatches">
        <div class="sys-swatch" style="background:#9D833E" title="Gold / Primary"><span>#9D833E</span></div>
        <div class="sys-swatch" style="background:#C4A35A" title="Gold Light"><span>#C4A35A</span></div>
        <div class="sys-swatch" style="background:#3D3520" title="Gold Dark"><span>#3D3520</span></div>
        <div class="sys-swatch" style="background:#F7F3EE" title="Paper"><span>#F7F3EE</span></div>
        <div class="sys-swatch" style="background:#1a1a1a" title="Dark BG"><span>#1a1a1a</span></div>
        <div class="sys-swatch" style="background:#E8DDD0" title="Warm Border"><span>#E8DDD0</span></div>
        <div class="sys-swatch" style="background:#D4A017" title="Amber Accent"><span>#D4A017</span></div>
        <div class="sys-swatch" style="background:#2D5016" title="Success"><span>#2D5016</span></div>
        <div class="sys-swatch" style="background:#ff4444" title="Error"><span>#ff4444</span></div>
      </div>
    </div>

    <div class="sys-card">
      <div class="sys-card-label">TYPOGRAPHY</div>
      <div class="sys-type-list">
        <div class="sys-type-row"><span class="sys-type-name">Display</span><span class="sys-type-val" style="font-size:28px;font-weight:700">Inter 28/700</span></div>
        <div class="sys-type-row"><span class="sys-type-name">Heading</span><span class="sys-type-val" style="font-size:20px;font-weight:600">Inter 20/600</span></div>
        <div class="sys-type-row"><span class="sys-type-name">Body</span><span class="sys-type-val" style="font-size:14px">Inter 14/400</span></div>
        <div class="sys-type-row"><span class="sys-type-name">Caption</span><span class="sys-type-val" style="font-size:12px;color:var(--fg-muted)">Inter 12/400</span></div>
        <div class="sys-type-row"><span class="sys-type-name">Mono</span><span class="sys-type-val" style="font-size:12px;font-family:var(--mono)">JetBrains Mono 12</span></div>
      </div>
    </div>

    <div class="sys-card">
      <div class="sys-card-label">SPACING</div>
      <div class="sys-spacing">
        <div class="sys-sp"><div class="sys-sp-bar" style="width:4px"></div><span>4px</span> xs</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:8px"></div><span>8px</span> sm</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:12px"></div><span>12px</span> md</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:16px"></div><span>16px</span> base</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:24px"></div><span>24px</span> lg</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:32px"></div><span>32px</span> xl</div>
        <div class="sys-sp"><div class="sys-sp-bar" style="width:48px"></div><span>48px</span> 2xl</div>
      </div>
    </div>

    <div class="sys-card">
      <div class="sys-card-label">RADIUS</div>
      <div class="sys-radius-grid">
        <div class="sys-radius-item"><div class="sys-radius-box" style="border-radius:2px"></div><span>2px</span></div>
        <div class="sys-radius-item"><div class="sys-radius-box" style="border-radius:4px"></div><span>4px</span></div>
        <div class="sys-radius-item"><div class="sys-radius-box" style="border-radius:8px"></div><span>8px</span></div>
        <div class="sys-radius-item"><div class="sys-radius-box" style="border-radius:12px"></div><span>12px</span></div>
        <div class="sys-radius-item"><div class="sys-radius-box" style="border-radius:50%"></div><span>full</span></div>
      </div>
    </div>
  </div>

  <div class="sys-components">
    <div class="sys-card-label" style="padding:24px 24px 12px">COMPONENTS</div>
    <div class="sys-comp-grid">
      <div class="sys-comp">
        <div class="sys-comp-demo"><button style="background:#9D833E;color:#fff;border:none;padding:10px 24px;border-radius:4px;font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:0.5px;cursor:pointer">Continue to Estimator</button></div>
        <div class="sys-comp-name">Button / Primary</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><button style="background:transparent;color:#9D833E;border:1px solid #9D833E;padding:10px 24px;border-radius:4px;font-family:var(--mono);font-size:12px;cursor:pointer">Save Draft</button></div>
        <div class="sys-comp-name">Button / Outline</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="background:#fff;border:1px solid #E8DDD0;border-radius:8px;padding:16px;width:200px"><div style="font-size:10px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">TOTAL BUDGET</div><div style="font-size:22px;font-weight:700;color:#1a1a1a">$487,250</div></div></div>
        <div class="sys-comp-name">Metric Card</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;gap:8px"><span style="background:#F7F3EE;border:2px solid #9D833E;border-radius:4px;padding:6px 16px;font-size:11px;font-weight:600;color:#9D833E">Performance Spot</span><span style="background:transparent;border:1px solid #E8DDD0;border-radius:4px;padding:6px 16px;font-size:11px;color:#666">Lifestyle</span></div></div>
        <div class="sys-comp-name">Template Chip</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;align-items:center;gap:12px;background:#FFF8E7;border:1px solid #D4A017;border-radius:6px;padding:12px 16px;width:280px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A017" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span style="font-size:12px;color:#92400E">Confirm talent count — SAG rates applied</span></div></div>
        <div class="sys-comp-name">Attention Card</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;align-items:center;gap:10px"><div style="width:60px;height:60px;position:relative"><svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="none" stroke="#E8DDD0" stroke-width="4"/><circle cx="30" cy="30" r="26" fill="none" stroke="#9D833E" stroke-width="4" stroke-dasharray="120" stroke-dashoffset="32" transform="rotate(-90 30 30)"/></svg><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:13px;font-weight:700;color:#1a1a1a">73%</span></div><div style="font-size:11px;color:#666">7 of 9 categories<br>complete</div></div></div>
        <div class="sys-comp-name">Progress Ring</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="background:#fff;border:1px solid #E8DDD0;border-radius:6px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;width:260px"><div><div style="font-size:13px;font-weight:600;color:#1a1a1a">Crew & Labor</div><div style="font-size:10px;color:#888">38 / 52 items</div></div><div style="display:flex;align-items:center;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="#2D5016" stroke="none"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span style="font-size:15px;font-weight:700;color:#1a1a1a">$142,800</span></div></div></div>
        <div class="sys-comp-name">Category Row</div>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;gap:4px;align-items:end;height:40px"><div style="width:8px;height:30px;background:#9D833E;border-radius:2px 2px 0 0"></div><div style="width:8px;height:20px;background:#C4A35A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:35px;background:#6B5A2A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:15px;background:#D4B86A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:25px;background:#9D833E;border-radius:2px 2px 0 0"></div></div></div>
        <div class="sys-comp-name">Bar Chart</div>
      </div>
    </div>
  </div>

</div>
</div>

<!-- ── Research Section ──────────────────────── -->
<div id="section-research" class="section-panel">
<div class="research-section">
  <div class="sys-header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <span class="sys-title">Dibs Research</span>
    <span class="sys-sub">${data.research ? data.research.insights.length + ' insights / ' + data.research.themes.length + ' themes / ' + (data.research.personas?.length || 0) + ' personas / ' + (data.research.sources?.length || 0) + ' sources' : 'No research data'}</span>
  </div>

  ${data.research ? (() => {
    const r = data.research;
    const highCount = r.insights.filter((i: { confidence: string }) => i.confidence === 'high').length;
    const medCount = r.insights.filter((i: { confidence: string }) => i.confidence === 'medium').length;
    const lowCount = r.insights.filter((i: { confidence: string }) => i.confidence === 'low').length;
    const totalIns = r.insights.length;
    const maxFreq = Math.max(...r.themes.map((t: { frequency: number }) => t.frequency), 1);

    return `
  <!-- Research Sub-Navigation -->
  <div class="res-nav">
    <button class="res-nav-btn active" onclick="showResPanel('overview',this)">Overview</button>
    <button class="res-nav-btn" onclick="showResPanel('personas',this)">Personas</button>
    <button class="res-nav-btn" onclick="showResPanel('themes',this)">Themes</button>
    <button class="res-nav-btn" onclick="showResPanel('insights',this)">Insights</button>
  </div>

  <!-- ── Overview Panel ──────── -->
  <div id="res-overview" class="res-panel active">
    <div class="res-stats">
      <div class="res-stat"><div class="res-stat-num">${totalIns}</div><div class="res-stat-label">Insights</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.themes.length}</div><div class="res-stat-label">Themes</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.personas?.length || 0}</div><div class="res-stat-label">Personas</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.sources?.length || 0}</div><div class="res-stat-label">Sources</div></div>
      <div class="res-stat"><div class="res-stat-num">${highCount}</div><div class="res-stat-label">High Confidence</div></div>
      <div class="res-stat"><div class="res-stat-num">5</div><div class="res-stat-label">JTBD Identified</div></div>
    </div>

    <div class="sys-card-label">CONFIDENCE DISTRIBUTION</div>
    <div class="res-conf-bar">
      <div class="res-conf-seg" style="width:${(highCount/totalIns*100).toFixed(1)}%;background:#7ec85a"></div>
      <div class="res-conf-seg" style="width:${(medCount/totalIns*100).toFixed(1)}%;background:#C4A35A"></div>
      <div class="res-conf-seg" style="width:${(lowCount/totalIns*100).toFixed(1)}%;background:#ff6b6b"></div>
    </div>
    <div class="res-conf-legend">
      <span><span class="res-conf-dot" style="background:#7ec85a"></span>High (${highCount})</span>
      <span><span class="res-conf-dot" style="background:#C4A35A"></span>Medium (${medCount})</span>
      <span><span class="res-conf-dot" style="background:#ff6b6b"></span>Low (${lowCount})</span>
    </div>

    <div style="margin-top:24px">
      <div class="sys-card-label">TOP THEMES BY FREQUENCY</div>
      ${[...r.themes].sort((a: { frequency: number }, b: { frequency: number }) => b.frequency - a.frequency).slice(0, 6).map((t: { name: string; description: string; frequency: number }) => `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <span style="font-family:var(--mono);font-size:11px;color:var(--accent-bright);min-width:140px">${esc(t.name)}</span>
        <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${(t.frequency/maxFreq*100).toFixed(0)}%;background:var(--accent);border-radius:3px"></div>
        </div>
        <span style="font-family:var(--mono);font-size:10px;color:var(--fg-muted);min-width:20px;text-align:right">${t.frequency}</span>
      </div>`).join("")}
    </div>

    <div style="margin-top:24px">
      <div class="sys-card-label">KEY FINDINGS (HIGH CONFIDENCE)</div>
      ${r.insights.filter((i: { confidence: string }) => i.confidence === 'high').slice(0, 5).map((ins: { finding: string; source: string }) => `
      <div class="res-insight" style="cursor:default">
        <div class="res-insight-text">${esc(ins.finding)}</div>
        <div class="res-insight-meta">
          <span class="res-src">${esc(ins.source)}</span>
          <span class="res-conf-badge res-conf-high">HIGH</span>
        </div>
      </div>`).join("")}
    </div>
  </div>

  <!-- ── Personas Panel ──────── -->
  <div id="res-personas" class="res-panel">
    <div class="res-persona-grid">
      ${(r.personas || []).map((p: { name: string; role: string; quote?: string; goals: string[]; painPoints: string[]; behaviors: string[]; tools?: string[]; frustration?: number; experience?: string; bidVolume?: string }) => `
      <div class="res-persona">
        <div class="res-persona-name">${esc(p.name)}</div>
        <div class="res-persona-role">${esc(p.role)}</div>
        ${p.quote ? `<div class="res-persona-quote">"${esc(p.quote)}"</div>` : ''}
        ${p.experience ? `<div style="display:flex;gap:16px;margin-bottom:12px;font-family:var(--mono);font-size:9px;color:var(--fg-muted)"><span>EXP: ${esc(p.experience)}</span>${p.bidVolume ? `<span>VOL: ${esc(p.bidVolume)}</span>` : ''}</div>` : ''}
        ${p.frustration ? `<div class="res-persona-frust"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-family:var(--mono);font-size:9px;letter-spacing:1px;color:var(--fg-muted)">FRUSTRATION</span><span style="font-family:var(--mono);font-size:9px;color:${p.frustration > 80 ? '#ff6b6b' : p.frustration > 60 ? '#ffaa00' : '#7ec85a'}">${p.frustration}%</span></div><div class="res-frust-bar"><div class="res-frust-fill" style="width:${p.frustration}%;background:${p.frustration > 80 ? '#ff6b6b' : p.frustration > 60 ? '#ffaa00' : '#7ec85a'}"></div></div></div>` : ''}
        <div class="res-persona-section">Goals</div>
        <ul class="res-persona-list">${p.goals.map((g: string) => `<li class="goal">${esc(g)}</li>`).join('')}</ul>
        <div class="res-persona-section">Pain Points</div>
        <ul class="res-persona-list">${p.painPoints.map((pp: string) => `<li class="pain">${esc(pp)}</li>`).join('')}</ul>
        <div class="res-persona-section">Behaviors</div>
        <ul class="res-persona-list">${p.behaviors.map((b: string) => `<li>${esc(b)}</li>`).join('')}</ul>
        ${p.tools ? `<div class="res-persona-section">Tools</div><div class="res-persona-tools">${p.tools.map((t: string) => `<span class="res-persona-tool">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`).join("")}
    </div>
  </div>

  <!-- ── Themes Panel ──────── -->
  <div id="res-themes" class="res-panel">
    <div class="res-theme-grid">
      ${r.themes.map((t: { name: string; description: string; frequency: number; insights: string[] }) => `
      <div class="res-theme-card">
        <div class="res-theme-head">
          <div class="res-theme-name">${esc(t.name)}</div>
          <span class="res-theme-freq">${t.frequency} insights</span>
        </div>
        <div class="res-theme-desc">${esc(t.description)}</div>
        <div class="res-theme-bar"><div class="res-theme-fill" style="width:${(t.frequency/maxFreq*100).toFixed(0)}%"></div></div>
      </div>`).join("")}
    </div>
  </div>

  <!-- ── Insights Panel ──────── -->
  <div id="res-insights" class="res-panel">
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <button class="filter-btn active" onclick="filterInsights('all',this)" style="font-size:9px;padding:4px 12px">ALL (${totalIns})</button>
      <button class="filter-btn" onclick="filterInsights('high',this)" style="font-size:9px;padding:4px 12px">HIGH (${highCount})</button>
      <button class="filter-btn" onclick="filterInsights('medium',this)" style="font-size:9px;padding:4px 12px">MEDIUM (${medCount})</button>
    </div>
    ${r.insights.map((ins: { id: string; finding: string; source: string; confidence: string; tags: string[]; evidence: string[] }, idx: number) => `
    <div class="res-insight" data-conf="${ins.confidence}" onclick="toggleEvidence(${idx})">
      <div style="display:flex;gap:8px;align-items:flex-start">
        <span style="font-family:var(--mono);font-size:9px;color:var(--fg-muted);min-width:18px;padding-top:2px">${idx + 1}.</span>
        <div style="flex:1">
          <div class="res-insight-text">${esc(ins.finding)}</div>
          <div class="res-insight-meta">
            <span class="res-src">${esc(ins.source)}</span>
            <span class="res-conf-badge res-conf-${ins.confidence}">${ins.confidence.toUpperCase()}</span>
          </div>
          ${ins.tags ? `<div class="res-insight-tags">${ins.tags.map((t: string) => `<span class="res-tag">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="res-evidence" id="ev-${idx}">
            ${ins.evidence.map((e: string) => `<div class="res-ev-item">${esc(e)}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>`).join("")}
  </div>

`;
  })() : `<div style="padding:24px;color:var(--fg-muted)">No research data available. Run <code>memoire research</code> to generate insights.</div>`}
</div>
</div>

<!-- ── Specs Section ─────────────────────────── -->
<div id="section-specs" class="section-panel">
<div class="research-section">
  <div class="sys-header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
    <span class="sys-title">Product Specifications</span>
    <span class="sys-sub">AICP bid form data model + research sources</span>
  </div>

  <div class="res-nav">
    <button class="res-nav-btn active" onclick="showSpecPanel('product-spec',this)">Product Spec</button>
    <button class="res-nav-btn" onclick="showSpecPanel('sources',this)">Sources</button>
  </div>

  <!-- ── Product Spec Panel ──────── -->
  <div id="spec-product-spec" class="spec-panel active">
    <div style="margin-bottom:16px;font-family:var(--mono);font-size:11px;color:var(--fg-muted);line-height:1.6">
      Complete data model for the AICP bid form — 6 layers of input from atomic line items to global parameters and validation rules.
    </div>

    <!-- Core Line Item Schema -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">1. Core Line Item Schema (Atomic Level)</span>
        <span class="res-spec-badge">6 required + 4 conditional</span>
      </div>
      <div class="res-spec-body">
        <div class="res-spec-sub">Required Fields</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>Description</th><th>Example</th></tr>
          <tr><td>Description</td><td class="muted">What the cost is</td><td class="muted">Director of Photography</td></tr>
          <tr><td>Category</td><td class="muted">Section assignment</td><td class="muted">Section B - Production</td></tr>
          <tr><td>Unit Type</td><td class="muted">Days / Hours / Weeks / Flat / Qty</td><td class="muted">Days</td></tr>
          <tr><td>Quantity</td><td class="muted">Number of units</td><td class="muted">3</td></tr>
          <tr><td>Rate</td><td class="muted">Cost per unit</td><td class="muted">$3,500</td></tr>
          <tr><td>Subtotal</td><td class="muted">Auto: Qty x Rate</td><td class="muted">$10,500</td></tr>
        </table>
        <div class="res-spec-sub" style="margin-top:16px">Conditional Fields</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>When Applied</th><th>Format</th></tr>
          <tr><td>Overtime</td><td class="muted">Crew beyond standard hours</td><td class="muted">OT hours + multiplier</td></tr>
          <tr><td>Fringes</td><td class="muted">Union crew, W-2 employees</td><td class="muted">% or fixed</td></tr>
          <tr><td>Allowances</td><td class="muted">Kit fees, per diems</td><td class="muted">Fixed $/day</td></tr>
          <tr><td>Notes</td><td class="muted">Justification for agency</td><td class="muted">Free text</td></tr>
        </table>
      </div>
    </div>

    <!-- Section-Level Inputs -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">2. Section-Level Inputs</span>
        <span class="res-spec-badge">5 sections / 30+ categories</span>
      </div>
      <div class="res-spec-body">
        <div class="res-spec-sub">A. Pre-Production</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Prep days</span>
          <span class="res-spec-item">Creative fees</span>
          <span class="res-spec-item">Casting costs</span>
          <span class="res-spec-item">Location scouting</span>
          <span class="res-spec-item">Production meetings</span>
        </div>

        <div class="res-spec-sub">B. Production — Crew</div>
        <table class="res-spec-table">
          <tr><th>Input</th><th>Type</th><th>Notes</th></tr>
          <tr><td>Role</td><td class="muted">Enum</td><td class="muted">DP, Gaffer, PA, etc.</td></tr>
          <tr><td>Days worked</td><td class="muted">Number</td><td class="muted">Per shoot + prep + wrap</td></tr>
          <tr><td>Rate</td><td class="muted">Currency</td><td class="muted">Daily or weekly</td></tr>
          <tr><td>OT rules</td><td class="muted">Config</td><td class="muted">Union-specific thresholds</td></tr>
          <tr><td>Union class</td><td class="muted">Enum</td><td class="muted">IATSE local, non-union</td></tr>
        </table>

        <div class="res-spec-sub">B. Production — Talent</div>
        <table class="res-spec-table">
          <tr><th>Input</th><th>Type</th><th>Notes</th></tr>
          <tr><td>Talent type</td><td class="muted">Enum</td><td class="muted">Principal, Background, VO</td></tr>
          <tr><td>Usage type</td><td class="muted">Enum</td><td class="muted">TV, Digital, Social, Print</td></tr>
          <tr><td>Duration</td><td class="muted">Enum</td><td class="muted">13wk, 26wk, 1yr, Perpetual</td></tr>
          <tr><td>Session fees</td><td class="muted">Currency</td><td class="muted">Per session day</td></tr>
          <tr><td>Buyout fees</td><td class="muted">Currency</td><td class="muted">Based on usage + duration</td></tr>
        </table>

        <div class="res-spec-sub">B. Production — Equipment</div>
        <table class="res-spec-table">
          <tr><th>Input</th><th>Type</th><th>Notes</th></tr>
          <tr><td>Type</td><td class="muted">Enum</td><td class="muted">Camera, Lighting, Grip, Audio</td></tr>
          <tr><td>Rental duration</td><td class="muted">Number</td><td class="muted">Days or weeks</td></tr>
          <tr><td>Vendor</td><td class="muted">Text</td><td class="muted">Rental house name</td></tr>
          <tr><td>Rate</td><td class="muted">Currency</td><td class="muted">Daily or weekly</td></tr>
        </table>

        <div class="res-spec-sub">B. Production — Locations</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Location fees</span>
          <span class="res-spec-item">Permits</span>
          <span class="res-spec-item">Location days</span>
          <span class="res-spec-item">Holding fees</span>
        </div>

        <div class="res-spec-sub">B. Production — Travel</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Flights</span>
          <span class="res-spec-item">Hotels (nights x rate)</span>
          <span class="res-spec-item">Ground transport</span>
          <span class="res-spec-item">Per diems</span>
        </div>

        <div class="res-spec-sub">B. Production — Expenses</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Catering</span>
          <span class="res-spec-item">Craft services</span>
          <span class="res-spec-item">Wardrobe</span>
          <span class="res-spec-item">Props</span>
          <span class="res-spec-item">Set design / build</span>
        </div>

        <div class="res-spec-sub">C. Post-Production</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Editorial days</span>
          <span class="res-spec-item">VFX costs</span>
          <span class="res-spec-item">Color grading</span>
          <span class="res-spec-item">Sound design / mix</span>
          <span class="res-spec-item">Music licensing</span>
          <span class="res-spec-item">Deliverables</span>
        </div>

        <div class="res-spec-sub">D. Misc / Other</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Insurance</span>
          <span class="res-spec-item">Legal</span>
          <span class="res-spec-item">Contingency (%)</span>
        </div>

        <div class="res-spec-sub">E. Fees / Markups</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Production co. fee (%)</span>
          <span class="res-spec-item">Agency fee (%)</span>
          <span class="res-spec-item">Handling charges</span>
          <span class="res-spec-item">Tax</span>
        </div>
      </div>
    </div>

    <!-- Global Inputs -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">3. Global Inputs (Top of Form)</span>
        <span class="res-spec-badge">4 groups / drives entire system</span>
      </div>
      <div class="res-spec-body">
        <div class="res-spec-sub">Project Metadata</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>Type</th><th>Required</th></tr>
          <tr><td>Project name</td><td class="muted">Text</td><td class="muted">Yes</td></tr>
          <tr><td>Client</td><td class="muted">Text</td><td class="muted">Yes</td></tr>
          <tr><td>Agency</td><td class="muted">Text</td><td class="muted">Yes</td></tr>
          <tr><td>Production company</td><td class="muted">Text</td><td class="muted">Yes</td></tr>
          <tr><td>Bid date</td><td class="muted">Date</td><td class="muted">Yes</td></tr>
          <tr><td>Version #</td><td class="muted">Number</td><td class="muted">Yes</td></tr>
        </table>

        <div class="res-spec-sub">Shoot Parameters</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>Type</th><th>Impact</th></tr>
          <tr><td>Shoot days</td><td class="muted">Number</td><td class="muted">Cascades to crew, equipment, locations, catering</td></tr>
          <tr><td>Locations</td><td class="muted">Number + Enum</td><td class="muted">Affects permits, travel, location fees</td></tr>
          <tr><td>Shoot type</td><td class="muted">Studio / Location / Hybrid</td><td class="muted">Determines location fee structure</td></tr>
        </table>

        <div class="res-spec-sub">Usage / Rights</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>Type</th><th>Impact</th></tr>
          <tr><td>Media type</td><td class="muted">TV / Digital / Social</td><td class="muted">Directly affects talent + music costs</td></tr>
          <tr><td>Territory</td><td class="muted">US / Global / Regional</td><td class="muted">Multiplier on usage fees</td></tr>
          <tr><td>Duration</td><td class="muted">13wk / 26wk / 1yr / Perpetual</td><td class="muted">Major cost driver for talent</td></tr>
        </table>
        <div class="res-spec-warn">Usage/Rights is the single largest cost variable after crew. Changing from "Digital US 13 weeks" to "All Media Global 1 Year" can 10x talent costs.</div>

        <div class="res-spec-sub">Union / Labor Settings</div>
        <table class="res-spec-table">
          <tr><th>Field</th><th>Type</th><th>Impact</th></tr>
          <tr><td>Union vs non-union</td><td class="muted">Boolean</td><td class="muted">Rate minimums, fringes, OT rules</td></tr>
          <tr><td>Guild rules</td><td class="muted">SAG / DGA / IATSE</td><td class="muted">Specific rate cards + conditions</td></tr>
          <tr><td>Fringes %</td><td class="muted">Percentage</td><td class="muted">Added to all union labor</td></tr>
        </table>
      </div>
    </div>

    <!-- Derived Inputs -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">4. Derived Inputs (Indirect Control)</span>
        <span class="res-spec-badge">multipliers + markups + contingency</span>
      </div>
      <div class="res-spec-body">
        <div class="res-spec-sub">Multipliers</div>
        <table class="res-spec-table">
          <tr><th>Multiplier</th><th>Logic</th></tr>
          <tr><td>OT</td><td class="muted">1.5x after 8hrs, 2x after 12hrs (union-specific)</td></tr>
          <tr><td>Weekly vs Daily</td><td class="muted">Weekly = daily x 5 (standard), varies by role</td></tr>
          <tr><td>Fringe loading</td><td class="muted">Applied as % on top of base rate for union crew</td></tr>
        </table>

        <div class="res-spec-sub">Markup Logic</div>
        <table class="res-spec-table">
          <tr><th>Applied On</th><th>Typical %</th><th>Notes</th></tr>
          <tr><td>Below-the-line subtotal</td><td class="muted">25%</td><td class="muted">Production company fee</td></tr>
          <tr><td>Sections A-K</td><td class="muted">3%</td><td class="muted">Insurance</td></tr>
          <tr><td>Travel costs</td><td class="muted">15%</td><td class="muted">Handling fee</td></tr>
          <tr><td>Entire bid</td><td class="muted">Varies</td><td class="muted">Agency markup</td></tr>
        </table>
      </div>
    </div>

    <!-- Hidden but Essential -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">5. Hidden but Essential Inputs</span>
        <span class="res-spec-badge">dependencies + rate cards + templates</span>
      </div>
      <div class="res-spec-body">
        <div class="res-spec-sub">Dependency Chain: "# of Shoot Days" Cascades To</div>
        <div class="res-spec-dep"><span class="res-spec-dep-arrow">shoot days</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span class="res-spec-dep-target">Crew costs (days x rates for all crew)</span></div>
        <div class="res-spec-dep"><span class="res-spec-dep-arrow">shoot days</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span class="res-spec-dep-target">Equipment rentals (days x rental rates)</span></div>
        <div class="res-spec-dep"><span class="res-spec-dep-arrow">shoot days</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span class="res-spec-dep-target">Location fees (days x location rates)</span></div>
        <div class="res-spec-dep"><span class="res-spec-dep-arrow">shoot days</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span class="res-spec-dep-target">Catering (days x headcount x per-person)</span></div>
        <div class="res-spec-dep"><span class="res-spec-dep-arrow">shoot days</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> <span class="res-spec-dep-target">Hotels (nights = shoot days + travel days)</span></div>

        <div class="res-spec-sub">Rate Cards</div>
        <table class="res-spec-table">
          <tr><th>Category</th><th>Examples</th></tr>
          <tr><td>Roles</td><td class="muted">DP: $3,500/day, Gaffer: $1,800/day, PA: $250/day</td></tr>
          <tr><td>Vendors</td><td class="muted">Panavision, ARRI Rental, Quixote</td></tr>
          <tr><td>Equipment</td><td class="muted">ARRI Alexa 35: $2,500/day, etc.</td></tr>
        </table>

        <div class="res-spec-sub">Templates</div>
        <div class="res-spec-items">
          <span class="res-spec-item">Previous bids as starting point</span>
          <span class="res-spec-item">Standard setups (2-day shoot, mid-size crew)</span>
          <span class="res-spec-item">Production company default rate cards</span>
        </div>
      </div>
    </div>

    <!-- Validation -->
    <div class="res-spec-section">
      <div class="res-spec-head" onclick="toggleSpec(this)">
        <span class="res-spec-title">6. Validation Requirements</span>
        <span class="res-spec-badge">9 rules</span>
      </div>
      <div class="res-spec-body">
        <table class="res-spec-table">
          <tr><th>Rule</th><th>Field(s)</th><th>Constraint</th></tr>
          <tr><td>Positive qty</td><td class="muted">Quantity</td><td class="muted">&gt; 0</td></tr>
          <tr><td>Non-negative rate</td><td class="muted">Rate</td><td class="muted">&gt;= 0</td></tr>
          <tr><td>OT limit</td><td class="muted">OT hours</td><td class="muted">Cannot exceed total hours</td></tr>
          <tr><td>Valid usage</td><td class="muted">Usage duration</td><td class="muted">Must be valid enum</td></tr>
          <tr><td>Talent required</td><td class="muted">Talent rows</td><td class="muted">Must include usage type + duration</td></tr>
          <tr><td>Crew required</td><td class="muted">Crew rows</td><td class="muted">Must include union classification</td></tr>
          <tr><td>Section complete</td><td class="muted">All sections</td><td class="muted">At least 1 line item per active section</td></tr>
          <tr><td>Markup base</td><td class="muted">Markup %</td><td class="muted">Must specify which subtotal applies</td></tr>
          <tr><td>Total consistency</td><td class="muted">Grand total</td><td class="muted">Sum of sections + markups = total</td></tr>
        </table>
      </div>
    </div>
  </div>

  <!-- ── Sources Panel ──────── -->
  <div id="spec-sources" class="spec-panel">
    ${data.research && data.research.sources && data.research.sources.length > 0
      ? '<div class="res-sources">' + (data.research.sources as Array<{ name: string; type: string; processedAt: string }>).map((s) =>
          '<div class="res-source">' +
          '<span class="res-source-type">' + esc(s.type) + '</span>' +
          '<span class="res-source-name">' + esc(s.name) + '</span>' +
          '<span class="res-source-date">' + new Date(s.processedAt).toLocaleDateString() + '</span>' +
          '</div>'
        ).join("") + '</div>'
      : '<div style="padding:24px;color:var(--fg-muted)">No sources available.</div>'}
  </div>
</div>
</div>


<!-- ── Changelog Section ─────────────────────── -->
<div id="section-changelog" class="section-panel">
<style>
#section-changelog .container { max-width: 800px; margin: 0 auto; padding: 0 24px 40px; }
#section-changelog .timeline { position: relative; padding-left: 28px; border-left: 1px solid var(--border); margin-left: 8px; display: flex; flex-direction: column; gap: 32px; }
#section-changelog .version { position: relative; }
#section-changelog .version::before { content: ''; position: absolute; left: -28px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
#section-changelog .version.latest::before { background: var(--success); box-shadow: 0 0 8px rgba(34,197,94,0.4); }
#section-changelog .version-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
#section-changelog .version-tag { font-size: 16px; font-weight: 700; color: var(--accent-bright); letter-spacing: 1px; }
#section-changelog .version-date { font-size: 10px; color: var(--fg-muted); letter-spacing: 1px; }
#section-changelog .version-label { font-size: 8px; padding: 2px 8px; border-radius: 2px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
#section-changelog .label-latest { background: rgba(34,197,94,0.15); color: var(--success); border: 1px solid var(--success); }
#section-changelog .label-initial { background: rgba(59,130,246,0.15); color: var(--info); border: 1px solid var(--info); }
#section-changelog .commits { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
#section-changelog .commit { display: flex; align-items: flex-start; gap: 12px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius, 2px); background: var(--bg-card); transition: border-color 0.15s; }
#section-changelog .commit:hover { border-color: var(--accent-dim); }
#section-changelog .commit-hash { font-size: 10px; color: var(--accent); font-weight: 700; min-width: 56px; flex-shrink: 0; padding-top: 1px; }
#section-changelog .commit-msg { font-size: 11px; color: var(--fg); font-weight: 500; margin-bottom: 2px; }
#section-changelog .commit-meta { font-size: 9px; color: var(--fg-muted); }
#section-changelog .decisions { margin-top: 16px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius, 2px); background: var(--bg-card); }
#section-changelog .decisions-title { font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; }
#section-changelog .decision { display: flex; gap: 10px; margin-bottom: 10px; font-size: 11px; line-height: 1.5; }
#section-changelog .decision:last-child { margin-bottom: 0; }
#section-changelog .decision-icon { color: var(--accent-bright); flex-shrink: 0; font-size: 10px; padding-top: 2px; }
#section-changelog .decision-text { color: var(--fg-muted); }
#section-changelog .decision-text strong { color: var(--fg); font-weight: 600; }
#section-changelog .preview-row { display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
#section-changelog .preview-card { flex: 1; min-width: 260px; border: 1px solid var(--border); border-radius: var(--radius, 2px); overflow: hidden; }
#section-changelog .preview-label { padding: 4px 8px; font-size: 8px; letter-spacing: 1px; color: var(--fg-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); background: var(--bg-card); }
#section-changelog .preview-body { padding: 12px; background: #fafaf8; font-family: Inter, -apple-system, sans-serif; }
#section-changelog .hero { padding: 40px 24px 32px; max-width: 800px; margin: 0 auto; }
#section-changelog .hero-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--accent); margin-bottom: 12px; font-weight: 600; }
#section-changelog .hero h1 { font-size: 24px; font-weight: 700; color: var(--accent-bright); letter-spacing: 2px; margin-bottom: 8px; }
#section-changelog .hero p { font-size: 11px; color: var(--fg-muted); letter-spacing: 0.5px; }
#section-changelog .files-toggle { font-size: 9px; color: var(--fg-muted); cursor: pointer; letter-spacing: 1px; text-transform: uppercase; padding: 4px 0; border: none; background: none; font-family: var(--mono); transition: color 0.15s; }
#section-changelog .files-toggle:hover { color: var(--accent); }
#section-changelog .files-list { display: none; margin-top: 8px; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius, 2px); background: var(--bg); font-size: 10px; color: var(--fg-muted); line-height: 1.8; }
#section-changelog .files-list.open { display: block; }
#section-changelog .file-added { color: var(--success); }
#section-changelog .file-modified { color: var(--warn); }
#section-changelog .file-renamed { color: var(--info); }
</style>
<div class="hero">
  <div class="hero-badge">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
    VERSION HISTORY
  </div>
  <h1>Version Changelog</h1>
  <p>Commits, changes, and key design decisions for every release of Mémoire.</p>
</div>

<div class="container">

<!-- ── DIBS Product Changelog ──────────────────── -->
<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="2" y="2" width="20" height="20" rx="4" fill="#c4a35a"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="Inter,sans-serif">d</text></svg>
  <div style="font-size:16px;font-weight:700;letter-spacing:3px;color:var(--accent-bright);text-transform:uppercase">Dibs</div>
  <div style="font-size:10px;color:var(--fg-muted);letter-spacing:0.5px">AICP Budget Intelligence Product</div>
  <div style="flex:1;height:1px;background:var(--border)"></div>
</div>

<div class="timeline">

  <!-- Iteration 11 -->
  <div class="version latest">
    <div class="version-header">
      <div class="version-tag">Iteration 11</div>
      <div class="version-date">2026-03-24</div>
      <span class="version-label label-latest">LATEST</span>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">noche-simplify</div>
        <div class="commit-body">
          <div class="commit-msg">Simplified Noche preview &mdash; removed 4 screen cards, replaced with single &ldquo;View Dibs&rdquo; card linking to dashboard</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">return-btn</div>
        <div class="commit-body">
          <div class="commit-msg">Added frosted glass return-to-Mémoire button (bottom-right) on all 9 Dibs pages &mdash; backdrop blur, subtle border, left-arrow icon</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">sidebar-toggle</div>
        <div class="commit-body">
          <div class="commit-msg">Fixed sidebar collapse toggle jumping between pages &mdash; normalized justify-content to flex-end across all pages</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">active-bids</div>
        <div class="commit-body">
          <div class="commit-msg">Added &ldquo;Active Bids&rdquo; section to sidebar nav with Nike &ldquo;Just Do It&rdquo; 60s TV bid &mdash; global update across all 9 pages</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Sidebar Nav Restructured.</strong> Navigation now has three sections: core pages (Dashboard, New Bid, Bid Board), active bids with gold dot indicators, and settings. The &ldquo;Active Bids&rdquo; section label auto-hides when the sidebar collapses.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Mémoire Hub Simplified.</strong> The 4-card multi-section Screens tab was replaced with a single &ldquo;View Dibs&rdquo; card that shows a live iframe preview of the dashboard. Less noise, clearer entry point.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Return-to-Mémoire Pattern.</strong> Every Dibs page now has a frosted glass back button (fixed, bottom-right). Uses backdrop-filter blur, rgba background, and a left-arrow SVG &mdash; tuned for visibility on light paper backgrounds.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Sidebar Toggle Consistency.</strong> The collapse/expand chevron was jumping position between pages due to mixed justify-content values (space-between vs flex-end). All pages now use flex-end for stable icon placement.</div>
      </div>
    </div>

    <!-- Visual Previews -->
    <div class="preview-row">
      <div class="preview-card" style="flex:1.2">
        <div class="preview-label">Sidebar Nav &mdash; Active Bids Section</div>
        <div class="preview-body" style="padding:0;font-family:Inter,sans-serif;overflow:hidden;background:#fff">
          <!-- Sidebar mockup -->
          <div style="width:100%;background:#fff;padding:12px 0">
            <!-- Dashboard -->
            <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;margin:0 8px;border-radius:6px;background:rgba(157,131,62,0.08)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9d833e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span style="font-size:11px;font-weight:600;color:#9d833e">Dashboard</span>
            </div>
            <!-- New Bid -->
            <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;margin:2px 8px;border-radius:6px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
              <span style="font-size:11px;font-weight:500;color:#999">New Bid</span>
            </div>
            <!-- Bid Board -->
            <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;margin:2px 8px;border-radius:6px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="4" height="18"/><rect x="10" y="3" width="4" height="10"/><rect x="16" y="3" width="4" height="14"/></svg>
              <span style="font-size:11px;font-weight:500;color:#999">Bid Board</span>
            </div>
            <!-- Divider -->
            <div style="height:1px;background:#f0f0f0;margin:8px 16px"></div>
            <!-- Section label -->
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:1.2px;color:#bbb;font-weight:600;padding:4px 14px 2px;margin-left:8px">Active Bids</div>
            <!-- Nike bid -->
            <div style="display:flex;align-items:center;gap:7px;padding:7px 14px;margin:2px 8px;border-radius:6px">
              <div style="width:6px;height:6px;border-radius:50%;background:#9d833e;flex-shrink:0"></div>
              <span style="font-size:11px;font-weight:500;color:#999">Nike &ldquo;Just Do It&rdquo;</span>
            </div>
            <!-- Divider -->
            <div style="height:1px;background:#f0f0f0;margin:8px 16px"></div>
            <!-- Settings -->
            <div style="display:flex;align-items:center;gap:8px;padding:7px 14px;margin:2px 8px;border-radius:6px">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span style="font-size:11px;font-weight:500;color:#999">Settings</span>
            </div>
          </div>
        </div>
      </div>
      <div class="preview-card" style="flex:1.8">
        <div class="preview-label">Mémoire Hub &mdash; Single &ldquo;View Dibs&rdquo; Card</div>
        <div class="preview-body" style="padding:16px;background:#161618;font-family:Inter,sans-serif">
          <!-- Simulated mémoire hub card -->
          <div style="border:1px solid #2a2a2e;border-radius:4px;overflow:hidden;max-width:280px;margin:0 auto">
            <!-- Thumbnail area -->
            <div style="height:100px;background:linear-gradient(135deg,#F7F3EE 0%,#efe9df 100%);display:flex;align-items:center;justify-content:center;position:relative">
              <!-- Mini dashboard mockup -->
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px;width:90%">
                <div style="background:#fff;border-radius:2px;padding:4px 6px;border:1px solid #e5e2d9">
                  <div style="font-size:5px;color:#999">Bids Out</div>
                  <div style="font-size:9px;font-weight:700;color:#1a1a1a">5</div>
                </div>
                <div style="background:#fff;border-radius:2px;padding:4px 6px;border:1px solid #e5e2d9">
                  <div style="font-size:5px;color:#999">Won</div>
                  <div style="font-size:9px;font-weight:700;color:#1a1a1a">$1.8M</div>
                </div>
                <div style="background:#fff;border-radius:2px;padding:4px 6px;border:1px solid #e5e2d9">
                  <div style="font-size:5px;color:#999">Due</div>
                  <div style="font-size:9px;font-weight:700;color:#1a1a1a">2</div>
                </div>
              </div>
            </div>
            <!-- Card info -->
            <div style="padding:10px 12px;background:#1c1c1f;display:flex;align-items:center;justify-content:space-between">
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:16px;height:16px;border-radius:3px;background:#9d833e;display:flex;align-items:center;justify-content:center">
                  <span style="font-size:9px;font-weight:700;color:#fff">d</span>
                </div>
                <span style="font-size:11px;font-weight:500;color:#e0e0e0">View Dibs</span>
              </div>
              <span style="font-size:8px;padding:2px 6px;border-radius:2px;background:rgba(157,131,62,0.15);color:#c4a35a;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Product</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Return-to-Mémoire Button &mdash; Frosted Glass</div>
        <div class="preview-body" style="padding:20px 24px;background:#fafaf8;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:flex-end;position:relative">
          <!-- Simulated page content behind -->
          <div style="position:absolute;left:12px;top:12px;font-size:7px;color:#ccc;letter-spacing:0.5px">page content &hellip;</div>
          <!-- Frosted button -->
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.08);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4a4540" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </div>
        </div>
      </div>
      <div class="preview-card">
        <div class="preview-label">Sidebar Toggle &mdash; Fixed Position (flex-end)</div>
        <div class="preview-body" style="padding:0;font-family:Inter,sans-serif;overflow:hidden;background:#fff">
          <div style="display:flex;align-items:center;justify-content:flex-end;padding:12px 14px;border-bottom:1px solid #f0f0f0">
            <div style="width:24px;height:24px;border-radius:4px;border:1px solid #eee;display:flex;align-items:center;justify-content:center">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </div>
          </div>
          <div style="padding:8px 14px;font-size:8px;color:#bbb;text-align:center">
            <span style="text-decoration:line-through;color:#ddd">space-between</span> &rarr; <span style="color:#9d833e;font-weight:600">flex-end</span> &mdash; toggle stays pinned right
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 10 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 10</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">stepper-v2</div>
        <div class="commit-body">
          <div class="commit-msg">Moved bid type/template selection from dashboard modal into Budget Editor as Step 1 &mdash; 4-step stepper: Type &rarr; Inputs &rarr; Budget &rarr; Review</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">modal-rm</div>
        <div class="commit-body">
          <div class="commit-msg">Removed Create New Bid modal from dashboard &mdash; New Bid button navigates directly to dibs.html</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">nav-cleanup</div>
        <div class="commit-body">
          <div class="commit-msg">Removed Line Items nav links from Bid Board sidebar, Collaborate product nav, and changelog preview</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">widget-fix</div>
        <div class="commit-body">
          <div class="commit-msg">Fixed Line Items widget running total &mdash; card background instead of page background, proper border-radius</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">sticky-fix</div>
        <div class="commit-body">
          <div class="commit-msg">Fixed Budget Editor sticky section nav &mdash; no content bleed-through, improved pill spacing</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>No Modals for Creation Flows.</strong> The 4-step bid creation wizard belongs in the stepper, not in a modal overlay on the dashboard. Modals are for confirmations and quick actions, not multi-step forms. The stepper provides more space, better navigation, and consistent back/forward flow.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Line Items Page Fully Retired.</strong> The standalone Line Items page was consolidated into a dashboard widget in Iteration 5. All remaining nav links (Bid Board sidebar, Collaborate product bar, changelog preview) have been removed.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Widget Visual Containment.</strong> All widget sections &mdash; including footer/summary rows &mdash; now use the card background color (#FFFFFF), not the page background (#F7F3EE). Running total row matches the widget surface with proper bottom border-radius.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Sticky Nav Bleed-Through Fix.</strong> Budget Editor section nav bar (A&ndash;E pills) now uses a 40px box-shadow extension above the sticky element to prevent scrolling content from being visible behind it. Both default and stuck states include this shadow.</div>
      </div>
    </div>

    <!-- Visual Previews -->
    <div class="preview-row">
      <div class="preview-card" style="flex:2">
        <div class="preview-label">4-Step Stepper &mdash; Type Selection as Step 1</div>
        <div class="preview-body" style="padding:10px;font-family:Inter,sans-serif;display:flex;gap:12px">
          <!-- Stepper sidebar -->
          <div style="width:80px;flex-shrink:0;display:flex;flex-direction:column;gap:4px">
            <div style="display:flex;align-items:center;gap:5px">
              <div style="width:16px;height:16px;border-radius:50%;background:#9D833E;color:#fff;font-size:7px;font-weight:700;display:flex;align-items:center;justify-content:center">01</div>
              <span style="font-size:8px;font-weight:600;color:#9D833E">Type</span>
            </div>
            <div style="width:1px;height:8px;background:#e5e2d9;margin-left:8px"></div>
            <div style="display:flex;align-items:center;gap:5px">
              <div style="width:16px;height:16px;border-radius:50%;border:1px solid #ddd;color:#999;font-size:7px;font-weight:600;display:flex;align-items:center;justify-content:center">02</div>
              <span style="font-size:8px;color:#999">Inputs</span>
            </div>
            <div style="width:1px;height:8px;background:#e5e2d9;margin-left:8px"></div>
            <div style="display:flex;align-items:center;gap:5px">
              <div style="width:16px;height:16px;border-radius:50%;border:1px solid #ddd;color:#999;font-size:7px;font-weight:600;display:flex;align-items:center;justify-content:center">03</div>
              <span style="font-size:8px;color:#999">Budget</span>
            </div>
            <div style="width:1px;height:8px;background:#e5e2d9;margin-left:8px"></div>
            <div style="display:flex;align-items:center;gap:5px">
              <div style="width:16px;height:16px;border-radius:50%;border:1px solid #ddd;color:#999;font-size:7px;font-weight:600;display:flex;align-items:center;justify-content:center">04</div>
              <span style="font-size:8px;color:#999">Review</span>
            </div>
          </div>
          <!-- Type cards grid -->
          <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:4px">
            <div style="padding:6px 8px;border:1px solid #9D833E;border-radius:4px;background:rgba(157,131,62,0.06)">
              <div style="width:14px;height:14px;border-radius:3px;background:#9D833E;margin-bottom:4px;display:flex;align-items:center;justify-content:center">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
              </div>
              <div style="font-size:8px;font-weight:600;color:#1a1a1a">TV Commercial</div>
              <div style="font-size:6px;color:#999">Full AICP A-E</div>
            </div>
            <div style="padding:6px 8px;border:1px solid #e5e2d9;border-radius:4px">
              <div style="width:14px;height:14px;border-radius:3px;background:rgba(157,131,62,0.08);margin-bottom:4px"></div>
              <div style="font-size:8px;font-weight:600;color:#1a1a1a">Digital / Social</div>
              <div style="font-size:6px;color:#999">Simplified crew</div>
            </div>
            <div style="padding:6px 8px;border:1px solid #e5e2d9;border-radius:4px">
              <div style="width:14px;height:14px;border-radius:3px;background:rgba(157,131,62,0.08);margin-bottom:4px"></div>
              <div style="font-size:8px;font-weight:600;color:#1a1a1a">Integrated</div>
              <div style="font-size:6px;color:#999">Multi-platform</div>
            </div>
            <div style="padding:6px 8px;border:1px solid #e5e2d9;border-radius:4px">
              <div style="width:14px;height:14px;border-radius:3px;background:rgba(157,131,62,0.08);margin-bottom:4px"></div>
              <div style="font-size:8px;font-weight:600;color:#1a1a1a">Photo / Stills</div>
              <div style="font-size:6px;color:#999">Print, e-comm</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Line Items Widget &mdash; Fixed Running Total</div>
        <div class="preview-body" style="padding:0;font-family:Inter,sans-serif;overflow:hidden;border-radius:0 0 4px 4px">
          <!-- Category grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0">
            <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e2d9;border-right:1px solid #e5e2d9">
              <span style="font-size:8px;color:#666;display:flex;align-items:center;gap:3px"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> Crew</span>
              <span style="font-size:8px;font-weight:600;font-family:'SF Mono',monospace">$142,800</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e2d9">
              <span style="font-size:8px;color:#666;display:flex;align-items:center;gap:3px"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> Equipment</span>
              <span style="font-size:8px;font-weight:600;font-family:'SF Mono',monospace">$67,500</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e2d9;border-right:1px solid #e5e2d9">
              <span style="font-size:8px;color:#666">Locations</span>
              <span style="font-size:8px;font-weight:600;font-family:'SF Mono',monospace">$89,200</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 10px;border-bottom:1px solid #e5e2d9">
              <span style="font-size:8px;color:#666">Talent</span>
              <span style="font-size:8px;font-weight:600;font-family:'SF Mono',monospace">$52,000</span>
            </div>
          </div>
          <!-- Running total — now matches card bg -->
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#ffffff;border-top:1px solid #e5e2d9;border-radius:0 0 4px 4px">
            <div>
              <div style="font-size:7px;text-transform:uppercase;letter-spacing:0.8px;color:#999">Running Total</div>
              <div style="font-size:14px;font-weight:700;color:#1a1a1a;font-family:'SF Mono',monospace">$487,250</div>
            </div>
            <div style="display:flex;gap:10px">
              <div style="text-align:right"><div style="font-size:6px;text-transform:uppercase;letter-spacing:0.5px;color:#999">Items</div><div style="font-size:9px;font-weight:500;color:#666;font-family:'SF Mono',monospace">142 / 186</div></div>
              <div style="text-align:right"><div style="font-size:6px;text-transform:uppercase;letter-spacing:0.5px;color:#999">AI Conf.</div><div style="font-size:9px;font-weight:500;color:#666;font-family:'SF Mono',monospace">76%</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="preview-card">
        <div class="preview-label">Sticky Section Nav &mdash; No Bleed-Through</div>
        <div class="preview-body" style="padding:0;font-family:Inter,sans-serif;overflow:hidden;display:flex;flex-direction:column">
          <!-- Simulated content behind -->
          <div style="background:#fafaf8;padding:4px 10px;font-size:7px;color:#ccc;text-align:center;border-bottom:1px solid #e5e2d9">
            &uarr; content scrolls behind &mdash; hidden by shadow &uarr;
          </div>
          <!-- Sticky nav bar -->
          <div style="display:flex;gap:4px;padding:8px 10px;background:#fafaf8;border-bottom:1px solid #d5d0c8;box-shadow:0 -20px 0 0 #fafaf8, 0 2px 6px rgba(0,0,0,0.06)">
            <div style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:100px;background:rgba(157,131,62,0.08);border:1px solid rgba(157,131,62,0.2)">
              <span style="width:12px;height:12px;border-radius:50%;background:#9D833E;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center">A</span>
              <span style="font-size:7px;font-weight:600;color:#9D833E">Pre-Prod</span>
              <span style="font-size:7px;color:#9D833E;font-family:'SF Mono',monospace">$62K</span>
            </div>
            <div style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:100px;border:1px solid #e5e2d9">
              <span style="width:12px;height:12px;border-radius:50%;background:#e5e2d9;color:#666;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center">B</span>
              <span style="font-size:7px;color:#666">Production</span>
              <span style="font-size:7px;color:#999;font-family:'SF Mono',monospace">$185K</span>
            </div>
            <div style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:100px;border:1px solid #e5e2d9">
              <span style="width:12px;height:12px;border-radius:50%;background:#e5e2d9;color:#666;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center">C</span>
              <span style="font-size:7px;color:#666">Post</span>
              <span style="font-size:7px;color:#999;font-family:'SF Mono',monospace">$45K</span>
            </div>
          </div>
          <!-- Content below -->
          <div style="background:#fafaf8;padding:6px 10px;font-size:7px;color:#999">
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee"><span>Director</span><span style="font-family:'SF Mono',monospace">$15,000</span></div>
            <div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #eee"><span>Producer</span><span style="font-family:'SF Mono',monospace">$12,500</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 9 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 9</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">nav-unify</div>
        <div class="commit-body">
          <div class="commit-msg">Unified sidebar navigation across all Dibs pages &mdash; removed Rate Intelligence, added Bid Board</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">settings</div>
        <div class="commit-body">
          <div class="commit-msg">Full Settings page &mdash; Profile, Defaults, Collaboration Rules, Notifications, Data &amp; Export</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">kpi-rework</div>
        <div class="commit-body">
          <div class="commit-msg">Dashboard KPIs replaced with production-relevant metrics &mdash; Bids Out, Won This Quarter, Avg Budget, Due This Week</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">notifs</div>
        <div class="commit-body">
          <div class="commit-msg">Notifications overlay &mdash; tabbed panel (All / Deadlines / Approvals / Updates) with production-relevant alerts</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">ai-drawer</div>
        <div class="commit-body">
          <div class="commit-msg">AI Assistant drawer nested as flex sibling instead of fixed overlay &mdash; removed Versions tab</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Sidebar-First Navigation.</strong> All Dibs pages now share the same shell: dark global-nav bar + fixed vertical sidebar with Dashboard, New Bid, Bid Board, and Settings. Consistent active-state indicator (2px accent border-right).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Rate Intelligence Removed.</strong> Removed from sidebar nav and dashboard widgets. Rate data will surface contextually inside bid creation and AI chat instead of as a standalone page.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Bid Board Restructured.</strong> dibs-comparison.html rebuilt from topbar + horizontal product-nav to the standard global-nav + sidebar layout. Page header now matches dashboard pattern with &ldquo;8 bids&rdquo; count and action buttons.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Budget Editor Nav.</strong> Compact nav links (12px, 14px icons) added above the wizard stepper in dibs.html sidebar &mdash; enables cross-page navigation without losing the step-by-step flow.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Win Rate Chart.</strong> 6-month trend (Oct 22% &rarr; Mar 34%) with +8% vs industry benchmark. Stacked bars: gold for wins, warm-gray for total bids.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Settings Page.</strong> dibs-settings.html with 5 tabbed sections: Profile, Default Settings (currency, markup, tax, fiscal year), Collaboration Rules (toggle-based with tooltips), Notification Preferences, and Data &amp; Export. All nav links across pages now route to settings.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Production KPIs.</strong> Replaced vanity metrics (Active Bids, Total Pipeline, Win Rate, Avg Bid Time) with actionable stats: Bids Out (with awaiting-response count), Won This Quarter (dollar value + win ratio), Avg Budget (across all bids), Due This Week (with urgency alert).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Notifications Overlay.</strong> Bell icon in global nav opens a tabbed notification panel. Categories: All, Deadlines, Approvals, Updates. Each notification has project code badges (NKE-041, CCL-018), time-ago stamps, and mark-all-read. Panel closes on backdrop click or close button.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>AI Drawer Nested.</strong> AI Assistant changed from a fixed overlay (position:fixed, z-index:201, translateX) to a properly nested flex sibling of .main inside .app-layout. Opens by expanding width from 0 to 360px, pushing content instead of covering it. Versions tab removed &mdash; only Chat and Context remain.</div>
      </div>
    </div>

    <!-- Visual Previews -->
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Production KPIs</div>
        <div class="preview-body" style="display:flex;gap:6px;padding:8px;font-family:Inter,sans-serif">
          <div style="flex:1;background:#fafaf8;border:1px solid #e5e2d9;border-radius:2px;padding:6px 8px">
            <div style="font-size:7px;color:#999;letter-spacing:0.5px">BIDS OUT</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin:2px 0">5</div>
            <div style="font-size:7px;color:#999">2 awaiting response</div>
          </div>
          <div style="flex:1;background:#fafaf8;border:1px solid #e5e2d9;border-radius:2px;padding:6px 8px">
            <div style="font-size:7px;color:#999;letter-spacing:0.5px">WON THIS QTR</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin:2px 0">$1.8M</div>
            <div style="font-size:7px;color:#22C55E">3 of 9 awarded</div>
          </div>
          <div style="flex:1;background:#fafaf8;border:1px solid #e5e2d9;border-radius:2px;padding:6px 8px">
            <div style="font-size:7px;color:#999;letter-spacing:0.5px">AVG BUDGET</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin:2px 0">$340K</div>
            <div style="font-size:7px;color:#999">Across 12 bids</div>
          </div>
          <div style="flex:1;background:#fafaf8;border:1px solid #e5e2d9;border-radius:2px;padding:6px 8px">
            <div style="font-size:7px;color:#999;letter-spacing:0.5px">DUE THIS WEEK</div>
            <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin:2px 0">2</div>
            <div style="font-size:7px;color:#EF4444">1 due tomorrow</div>
          </div>
        </div>
      </div>
      <div class="preview-card">
        <div class="preview-label">Notifications Panel</div>
        <div class="preview-body" style="padding:8px;font-family:Inter,sans-serif;background:#fafaf8">
          <div style="display:flex;gap:8px;margin-bottom:6px;border-bottom:1px solid #e5e2d9;padding-bottom:4px">
            <span style="font-size:8px;color:#9D833E;font-weight:600;border-bottom:1px solid #9D833E;padding-bottom:2px">All</span>
            <span style="font-size:8px;color:#999">Deadlines</span>
            <span style="font-size:8px;color:#999">Approvals</span>
            <span style="font-size:8px;color:#999">Updates</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="display:flex;align-items:center;gap:6px;padding:4px;background:rgba(157,131,62,0.04);border-radius:2px">
              <div style="width:6px;height:6px;border-radius:50%;background:#EF4444;flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:8px;font-weight:600;color:#1a1a1a">NKE-041 bid due tomorrow</div>
                <div style="font-size:7px;color:#999">2h ago</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;padding:4px;border-radius:2px">
              <div style="width:6px;height:6px;border-radius:50%;background:#22C55E;flex-shrink:0"></div>
              <div style="flex:1;min-width:0">
                <div style="font-size:8px;font-weight:600;color:#1a1a1a">Rate card approved &mdash; CCL-018</div>
                <div style="font-size:7px;color:#999">4h ago</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Nested AI Drawer</div>
        <div class="preview-body" style="display:flex;gap:0;padding:0;height:80px">
          <div style="flex:1;background:#fafaf8;padding:8px;border-right:1px solid #e5e2d9">
            <div style="font-size:8px;color:#999;margin-bottom:4px">BUDGET EDITOR</div>
            <div style="display:flex;gap:4px">
              <div style="flex:1;background:#e5e2d9;height:8px;border-radius:1px"></div>
              <div style="flex:1;background:#e5e2d9;height:8px;border-radius:1px"></div>
            </div>
            <div style="margin-top:6px;background:#e5e2d9;height:30px;border-radius:1px"></div>
          </div>
          <div style="width:100px;background:#1a1a1a;padding:6px;border-left:1px solid #333">
            <div style="display:flex;gap:4px;margin-bottom:4px">
              <span style="font-size:7px;color:#9D833E;border-bottom:1px solid #9D833E;padding-bottom:1px">Chat</span>
              <span style="font-size:7px;color:#666">Context</span>
            </div>
            <div style="background:#222;border-radius:2px;padding:3px;margin-bottom:3px">
              <div style="font-size:6px;color:#999">Check line item rates...</div>
            </div>
            <div style="background:rgba(157,131,62,0.15);border-radius:2px;padding:3px">
              <div style="font-size:6px;color:#C4A35A">Found 3 rate issues</div>
            </div>
          </div>
        </div>
      </div>
      <div class="preview-card">
        <div class="preview-label">Settings Page</div>
        <div class="preview-body" style="padding:8px;font-family:Inter,sans-serif;background:#fafaf8">
          <div style="display:flex;gap:6px;margin-bottom:6px">
            <span style="font-size:7px;padding:2px 5px;background:rgba(157,131,62,0.12);color:#9D833E;border-radius:1px;font-weight:600">Profile</span>
            <span style="font-size:7px;color:#999;padding:2px 5px">Defaults</span>
            <span style="font-size:7px;color:#999;padding:2px 5px">Collab</span>
            <span style="font-size:7px;color:#999;padding:2px 5px">Notifs</span>
            <span style="font-size:7px;color:#999;padding:2px 5px">Data</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:7px;color:#666">Display Name</span>
              <div style="width:60px;height:10px;background:#e5e2d9;border-radius:1px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:7px;color:#666">Default Currency</span>
              <div style="width:30px;height:10px;background:#e5e2d9;border-radius:1px"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:7px;color:#666">Require approval</span>
              <div style="width:20px;height:10px;background:#9D833E;border-radius:5px"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 8 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 8</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">ai-chat</div>
        <div class="commit-body">
          <div class="commit-msg">Rebuilt AI Assistant &mdash; chat-first with message bubbles, 10+ query types, action buttons, quick chips</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Chat-First AI.</strong> Chat is now the default tab. Proper message bubbles: gold for user, light surface for AI. Typing indicator with animated dots. Send button with arrow icon.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>10+ Query Types.</strong> AI now understands: totals, biggest section, crew/post costs, savings opportunities ($6K potential), market benchmarks ($420K&ndash;$510K range), validation issues, markups/fees, shoot day impact with +1/-1 actions, and help.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Quick-Action Chips.</strong> Six starter chips (Total, Biggest section, Find savings, Shoot days, Benchmark, Validate) appear on first open &mdash; zero-friction entry into any analysis.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Inline Action Buttons.</strong> Bot responses include contextual actions (+1 Day, -1 Day, Show Insights, Show All) that execute directly from the chat bubble.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Smart Fallback.</strong> Unknown queries no longer show &ldquo;Try:&rdquo; &mdash; instead show current bid state with grand total, issue count, and actionable buttons.</div>
      </div>
    </div>

    <!-- Visual Preview -->
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">AI Chat Bubbles</div>
        <div class="preview-body" style="display:flex;flex-direction:column;gap:6px;padding:10px">
          <div style="align-self:flex-end;background:#9d833e;color:#fff;padding:6px 10px;border-radius:10px 10px 3px 10px;font-size:9px">how can I save?</div>
          <div style="align-self:flex-start;background:var(--bg-card);border:1px solid var(--border);padding:6px 10px;border-radius:10px 10px 10px 3px;font-size:9px;color:var(--fg-muted)">Top 3 savings: Camera Op -$1,050, Volume -$3,200, Bundle -$1,800. Total: -$6,050</div>
        </div>
      </div>
      <div class="preview-card">
        <div class="preview-label">Quick-Action Chips</div>
        <div class="preview-body" style="display:flex;flex-wrap:wrap;gap:4px;padding:8px">
          <span style="padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:8px;color:var(--fg-muted)">Total</span>
          <span style="padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:8px;color:var(--fg-muted)">Biggest section</span>
          <span style="padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:8px;color:var(--fg-muted)">Find savings</span>
          <span style="padding:3px 8px;border-radius:100px;border:1px solid var(--border);font-size:8px;color:var(--fg-muted)">Benchmark</span>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 7 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 7</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">global-nav</div>
        <div class="commit-body">
          <div class="commit-msg">Dark global navigation bar across all dibs pages, Review step flow improvements</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Global Dark Top Nav.</strong> Replaced the old 6-item product navigation bar with a dark (#1a1a1a) 48px fixed top nav across all three active pages &mdash; Dashboard, Budget Editor, Rates. Includes brand logo, nav tabs, settings, notifications with badge, and user avatar.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Enterprise Navigation Pattern.</strong> SAP/Workday-style global chrome &mdash; consistent across the entire app, dark on light contrast, active tab highlighting, icon-only action buttons with tooltips.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Review Step Flow.</strong> Budget Editor step 3 (Review) now has three actions: Back to Budget, Continue to Dashboard, and Export Budget &mdash; no more dead ends.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Old Product Nav Removed.</strong> The 6-tab horizontal nav (Dashboard, Budget Editor, Line Items, Compare, Rates, Collaborate) is gone. The dark global nav replaces it with a cleaner 3-tab structure matching actual app pages.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Layout Adjustments.</strong> Sidebar and main content areas offset by 48px (margin-top / top) to accommodate the fixed global nav without overlapping content.</div>
      </div>
    </div>

    <!-- Visual Previews -->
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Global Navigation Bar</div>
        <div class="preview-body">
          <div style="display:flex;align-items:center;height:32px;padding:0 12px;background:#1a1a1a;border-radius:4px;gap:0;font-size:9px">
            <div style="display:flex;align-items:center;gap:6px;margin-right:16px">
              <div style="width:16px;height:16px;background:#9d833e;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-weight:700">d</div>
              <span style="color:#fff;font-weight:600;font-size:10px">dibs</span>
            </div>
            <div style="display:flex;align-items:center;gap:2px">
              <span style="padding:3px 8px;color:#fff;background:rgba(255,255,255,0.1);border-radius:2px;font-weight:600;font-size:8px">Dashboard</span>
              <span style="padding:3px 8px;color:#888;font-size:8px">Budget Editor</span>
              <span style="padding:3px 8px;color:#888;font-size:8px">Rates</span>
            </div>
            <div style="flex:1"></div>
            <div style="display:flex;align-items:center;gap:4px">
              <div style="width:20px;height:20px;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#777">
                <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5.5" cy="5.5" r="4"/><path d="M8 8l2.5 2.5"/></svg>
              </div>
              <div style="width:20px;height:20px;border-radius:2px;display:flex;align-items:center;justify-content:center;color:#777;position:relative">
                <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 3.5a3.5 3.5 0 0 0-7 0v2l-1 2h9l-1-2v-2z"/><path d="M3.5 7.5v.5a1.5 1.5 0 0 0 3 0v-.5"/></svg>
                <span style="position:absolute;top:2px;right:2px;width:4px;height:4px;background:#c45a5a;border-radius:50%;border:1px solid #1a1a1a"></span>
              </div>
            </div>
            <div style="width:18px;height:18px;border-radius:50%;background:#9d833e;color:#fff;font-size:7px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-left:6px">MC</div>
          </div>
        </div>
      </div>

      <div class="preview-card">
        <div class="preview-label">Review Step &mdash; Three Exit Actions</div>
        <div class="preview-body">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fafaf8;border:1px solid #e8e8e8;border-radius:4px;font-size:8px">
            <div style="display:flex;align-items:center;gap:4px;color:#4a4a4a;font-weight:500">
              <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 2L3 5l4 3"/></svg>
              Back to Budget
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <div style="padding:3px 8px;background:#f5f4f1;border:1px solid #e8e8e8;border-radius:2px;color:#4a4a4a;font-weight:500;display:flex;align-items:center;gap:4px">
                <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="8" height="8" rx="1"/><path d="M1 3.5h8"/></svg>
                Continue to Dashboard
              </div>
              <div style="padding:3px 8px;background:#2c2c2e;border-radius:2px;color:#fff;font-weight:600;display:flex;align-items:center;gap:4px">
                <svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6l2 2 4-4"/></svg>
                Export Budget
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 6 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 6</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">nav+cards</div>
        <div class="commit-body">
          <div class="commit-msg">Full app navigation, archive banners, budget sections as unified cards, icon cleanup</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Product Navigation Bar.</strong> 6-item horizontal nav (Dashboard, Budget Editor, Line Items, Compare, Rates, Collaborate) added to the budget editor &mdash; previously isolated with only a sidebar back-link to Mémoire.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Archive Banners.</strong> Iteration 1 and 2 pages now show a warm-toned banner with &ldquo;Archived &mdash; Iteration N&rdquo; badge, link to current version, and full cross-page navigation back to all app screens and Mémoire Hub.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Budget Cards Contain Content.</strong> Sections A&ndash;E now render as unified cards: white surface, border, border-radius, and shadow wrapping the header, categories, and all line items together. Categories separated by subtle border-top dividers.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Icons Removed.</strong> Category chevrons and line-item expand-toggle icons stripped for cleaner data density. Click the item name to expand OT/fringes/allowance details.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Zero Loose Pages.</strong> All 8 Dibs HTML screens are now reachable from every other screen. No dead ends, no orphaned archives.</div>
      </div>
    </div>

    <!-- Visual Previews -->
    <div class="preview-row">
      <div class="preview-card">
        <div class="preview-label">Budget Card Layout &mdash; Section B: Production</div>
        <div class="preview-body">
          <div style="background:#fff;border:1px solid #e8e8e8;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #f0f0f0">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:20px;height:20px;border-radius:4px;background:#9d833e;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">B</div>
                <span style="font-size:11px;font-weight:600;color:#1a1a1a">Production</span>
                <span style="font-size:9px;color:#999">29 items</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:8px;color:#999;background:#f5f5f4;padding:1px 6px;border-radius:100px;font-family:'JetBrains Mono',monospace">61%</span>
                <span style="font-size:12px;font-weight:700;color:#1a1a1a;font-family:'JetBrains Mono',monospace">$220,510</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 14px">
              <div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;font-weight:600;color:#4a4a4a">Crew</span><span style="font-size:8px;color:#999">8</span></div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:7px;padding:1px 5px;border-radius:100px;background:rgba(234,179,8,0.1);color:#b8860b;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Needs Review</span>
                <span style="font-size:10px;font-weight:600;color:#1a1a1a;font-family:'JetBrains Mono',monospace">$93,716</span>
              </div>
            </div>
            <div style="border-top:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;padding:7px 14px">
              <div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;font-weight:600;color:#4a4a4a">Talent</span><span style="font-size:8px;color:#999">5</span></div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:7px;padding:1px 5px;border-radius:100px;background:rgba(234,179,8,0.1);color:#b8860b;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Needs Review</span>
                <span style="font-size:10px;font-weight:600;color:#1a1a1a;font-family:'JetBrains Mono',monospace">$46,985</span>
              </div>
            </div>
            <div style="border-top:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between;padding:7px 14px">
              <div style="display:flex;align-items:center;gap:6px"><span style="font-size:10px;font-weight:600;color:#4a4a4a">Equipment</span><span style="font-size:8px;color:#999">5</span></div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:7px;padding:1px 5px;border-radius:100px;background:rgba(34,197,94,0.1);color:#2d8a4e;font-weight:600;text-transform:uppercase;letter-spacing:0.3px">Complete</span>
                <span style="font-size:10px;font-weight:600;color:#1a1a1a;font-family:'JetBrains Mono',monospace">$28,500</span>
              </div>
            </div>
            <div style="border-top:1px solid #f0f0f0;padding:5px 14px;font-size:8px;color:#999">
              <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#4a4a4a">Director</span><span style="font-family:'JetBrains Mono',monospace">3</span><span style="font-family:'JetBrains Mono',monospace">$8,000</span><span style="font-weight:600;font-family:'JetBrains Mono',monospace;color:#1a1a1a">$24,000</span></div>
              <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#4a4a4a">Director of Photography</span><span style="font-family:'JetBrains Mono',monospace">3</span><span style="font-family:'JetBrains Mono',monospace">$4,500</span><span style="font-weight:600;font-family:'JetBrains Mono',monospace;color:#1a1a1a">$20,841</span></div>
              <div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#4a4a4a">Camera Operator</span><span style="font-family:'JetBrains Mono',monospace">3</span><span style="font-family:'JetBrains Mono',monospace">$2,200</span><span style="font-weight:600;font-family:'JetBrains Mono',monospace;color:#1a1a1a">$10,930</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="preview-card">
        <div class="preview-label">Navigation &mdash; Product Bar + Archive Banner</div>
        <div class="preview-body">
          <div style="margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:2px;padding:5px 10px;background:#f5f5f4;border-radius:6px;border:1px solid #e8e8e8;font-size:9px">
              <span style="padding:3px 7px;color:#999;font-weight:500">Dashboard</span>
              <span style="padding:3px 7px;background:rgba(157,131,62,0.08);color:#9d833e;font-weight:600;border-radius:3px">Budget Editor</span>
              <span style="padding:3px 7px;color:#999;font-weight:500">Compare</span>
              <span style="padding:3px 7px;color:#999;font-weight:500">Rates</span>
              <span style="padding:3px 7px;color:#999;font-weight:500">Collaborate</span>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(253,246,233,0.9);border-radius:4px;border:1px solid #cfc5b4;font-size:8px">
            <span style="padding:1px 6px;border-radius:2px;background:rgba(157,131,62,0.12);color:#705918;font-weight:600;font-size:7px;text-transform:uppercase;letter-spacing:0.3px">Archived &mdash; Iteration 1</span>
            <span style="color:#9d833e;font-weight:500">View Current Version</span>
            <span style="flex:1"></span>
            <span style="color:#8c8279">Dashboard</span>
            <span style="color:#8c8279">Rates</span>
            <span style="color:#8c8279">Mémoire Hub</span>
          </div>
          <div style="margin-top:12px;font-size:8px;color:#666;line-height:1.6">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
              <span>dibs.html &rarr; 6-item product nav added</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
              <span>dibs-v1.html &rarr; archive banner + nav links</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
              <span>dibs-v2.html &rarr; archive banner + nav links</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:6px;height:6px;border-radius:50%;background:#22c55e;flex-shrink:0"></span>
              <span>8/8 pages connected &mdash; zero loose screens</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 5 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 5</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">widgets</div>
        <div class="commit-body">
          <div class="commit-msg">Consolidate Compare Budgets and Line Items into dashboard widgets &mdash; remove standalone pages</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Bid Comparison Widget.</strong> Triple bid comparison (Prettybird, MJZ, Park Pictures) consolidated from standalone page into a compact dashboard widget. Shows 3 bid cards with totals and diffs, AI recommendation one-liner, and variance heatmap sorted by severity (Post 38%, Talent 35%, Contingency 34%).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Line Items Widget.</strong> 877-line standalone editor page replaced with a compact 2-column category grid showing all 9 AICP budget categories with totals, AI fill percentage (76%), and a running total bar ($487,250 with items filled, sections, and confidence).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Removed Redundant Sections.</strong> Activity Feed, Quick Actions panel, and sidebar nav links to Compare Bids and Line Items all removed. Dashboard now shows everything in one view without page switching.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Win Rate Upgraded.</strong> Win Rate chart moved into a consistent widget card with header showing current rate (34%, +8% vs industry) alongside comparison and line items widgets.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Cross-Page Links Updated.</strong> All dibs pages (Budget Editor, Rates, Collab) and the Mémoire preview gallery now route to the dashboard instead of removed standalone pages.</div>
      </div>
    </div>
  </div>

  <!-- Iteration 4 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 4</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">dashboard</div>
        <div class="commit-body">
          <div class="commit-msg">Dashboard modals &mdash; Collaboration and Templates pages consolidated into modal overlays, compact KPIs</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Share Modal.</strong> Collaboration page removed. Sharing now triggered from dashboard header &mdash; includes team management, role assignment (Owner/Editor/Viewer), invite by email, and version history.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Templates Modal.</strong> Templates page removed. Searchable template library opens as a modal from the sidebar with 6 production presets (National TV :30, Quick Social, Large Integrated, Photo/E-commerce, Animation/VFX, Documentary).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Compact KPI Cards.</strong> Stat cards reduced in vertical height &mdash; tighter padding (14px 16px), smaller type (22px values, 10px labels), narrower gaps (12px) for a denser dashboard layout.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Streamlined Navigation.</strong> Sidebar cleaned up by removing standalone Collaboration and Templates page links. Fewer pages, same functionality via modals.</div>
      </div>
    </div>
  </div>

  <!-- Iteration 3 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 3</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">stepper</div>
        <div class="commit-body">
          <div class="commit-msg">Vertical stepper wizard &mdash; 3-step guided flow replacing spreadsheet layout</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Changes</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Fixed Sidebar Navigation.</strong> 280px sidebar with numbered steps (01, 02, 03), active/completed state indicators, and step connectors. Grand total + progress bar always visible.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Step 1: Inputs.</strong> Three grouped input cards (Project Details, Shoot Parameters, Usage &amp; Financials) with clean grid layout.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Step 2: Budget.</strong> Full AICP sections A&ndash;E with section nav, categories, and line-item editing carried forward from v2.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Step 3: Review.</strong> Totals grid, section breakdown with bar charts, project summary, and AI insight card.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Warm Paper Aesthetic.</strong> Light surface (#fafaf8) with Ink Gold accents, 12px radius cards, tonal layering.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>All Logic Preserved.</strong> Calculation engine, dependency DAG, validation, AI drawer, search, keyboard shortcuts unchanged.</div>
      </div>
    </div>
  </div>

  <!-- Iteration 2 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 2</div>
      <div class="version-date">2026-03-24</div>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">v2</div>
        <div class="commit-body">
          <div class="commit-msg">Full AICP form with unit types, conditional fields, validation engine, and data visualization</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Iteration 1 -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">Iteration 1</div>
      <div class="version-date">2026-03-24</div>
      <span class="version-label label-initial">INITIAL</span>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">v1</div>
        <div class="commit-body">
          <div class="commit-msg">Initial AICP bid form with 4-step wizard, 9 categories, Architectural Ledger design system</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24</div>
        </div>
      </div>
    </div>
  </div>

</div>

<!-- ── Mémoire Engine Changelog ──────────────────── -->
<div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;margin-top:48px">
  <svg width="18" height="18" viewBox="0 0 32 32" fill="none"><path d="M25.5 15.5A9.5 9.5 0 0 1 12 25 9.5 9.5 0 0 1 9.5 6.5 12 12 0 1 0 25.5 15.5z" fill="#C4A35A"/></svg>
  <div style="font-size:16px;font-weight:700;letter-spacing:3px;color:var(--accent-bright);text-transform:uppercase">Mémoire</div>
  <div style="font-size:10px;color:var(--fg-muted);letter-spacing:0.5px">AI-Native Design Intelligence Engine</div>
  <div style="flex:1;height:1px;background:var(--border)"></div>
</div>

<div class="timeline">

  <!-- v0.1.0 -->
  <div class="version latest">
    <div class="version-header">
      <div class="version-tag">v0.1.0</div>
      <div class="version-date">2026-03-24</div>
      <span class="version-label label-latest">LATEST</span>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">fc71ca1</div>
        <div class="commit-body">
          <div class="commit-msg">Add /motion-video skill &mdash; product animation &amp; UI motion superagent</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 15:44</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">7b2cda3</div>
        <div class="commit-body">
          <div class="commit-msg">Add auto-spec engine, memoire go, memoire export, and token-aware codegen</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 14:33</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">709bb57</div>
        <div class="commit-body">
          <div class="commit-msg">Clean up CLI output &mdash; human-readable logs, suppress internal noise</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 14:10</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">82895d6</div>
        <div class="commit-body">
          <div class="commit-msg">Clean preview of user-project content, wire /api/specs to registry</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 13:55</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">a20c747</div>
        <div class="commit-body">
          <div class="commit-msg">Finalize ark &rarr; memoire rename across entire codebase</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 11:57</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">9c15762</div>
        <div class="commit-body">
          <div class="commit-msg">Add animated 3D spinning moon to README header</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 11:44</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">7881845</div>
        <div class="commit-body">
          <div class="commit-msg">Audit and upgrade all Mémoire skills against Figma MCP best practices</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 11:43</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">70d8f6a</div>
        <div class="commit-body">
          <div class="commit-msg">Replace remaining ark CLI references with memoire</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 11:26</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">9f57f82</div>
        <div class="commit-body">
          <div class="commit-msg">Rename Figma Ark &rarr; Mémoire across entire codebase</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 11:11</div>
        </div>
      </div>
      <div class="commit">
        <div class="commit-hash">2b0017f</div>
        <div class="commit-body">
          <div class="commit-msg">Add Figma MCP canvas integration, skills, atomic design enforcement, and README</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-24 10:56</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Key Design Decisions</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Atomic Design Only.</strong> Every generated component must declare an atomic level (atom, molecule, organism, template). Enforced in specs and codegen. No exceptions.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>MCP Tool Decision Tree.</strong> <code style="color:var(--accent);background:var(--accent-dim);padding:1px 4px;border-radius:2px">use_figma</code> (Official MCP) for design-system-aware operations. <code style="color:var(--accent);background:var(--accent-dim);padding:1px 4px;border-radius:2px">figma_execute</code> (Console MCP) for raw Plugin API. Check Code Connect BEFORE creating anything.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Self-Healing Loop.</strong> Mandatory CREATE &rarr; SCREENSHOT &rarr; ANALYZE &rarr; FIX &rarr; VERIFY cycle (max 3 rounds) for all canvas operations.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Code Connect First-Class.</strong> Every component spec has a codeConnect field mapping Figma node IDs to codebase paths. Checked before generation, established after creation.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Multi-Agent Native.</strong> Multiple Claude instances connect on ports 9223-9232. Each shows a color-coded box widget in Figma (yellow=working, green=done, red=error).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>AgenticUI Aesthetic.</strong> Monospace terminal-paper aesthetic. Dark theme for system UI, warm paper theme for generated output. Gold accent (#9D833E).</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Skills Architecture.</strong> 10 skill files in skills/ with freedom levels (maximum, high, read-only, reference). Agents load relevant skills before acting.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Auto-Spec Engine.</strong> <code style="color:var(--accent);background:var(--accent-dim);padding:1px 4px;border-radius:2px">memoire pull</code> auto-creates ComponentSpecs from Figma components. Infers atomic level, shadcn base, and props.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Single-Command Pipeline.</strong> <code style="color:var(--accent);background:var(--accent-dim);padding:1px 4px;border-radius:2px">memoire go</code> runs the full pipeline in one command: connect &rarr; pull &rarr; auto-spec &rarr; generate &rarr; preview.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Token-Aware Codegen.</strong> Generated components inject CSS variable references from pulled design tokens automatically.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Motion Video Skill.</strong> /motion-video superagent for Apple-grade product animation, portfolio videos, motion tokens, and Figma &rarr; After Effects pipeline.</div>
      </div>
    </div>

    <div class="files-changed">
      <button class="files-toggle" onclick="this.nextElementSibling.classList.toggle('open')">+ 50 files changed</button>
      <div class="files-list">
        <span class="file-added">A</span> src/engine/auto-spec.ts &mdash; auto-spec engine<br>
        <span class="file-added">A</span> src/commands/go.ts &mdash; single-command pipeline<br>
        <span class="file-added">A</span> src/commands/export.ts &mdash; export generated code<br>
        <span class="file-added">A</span> skills/MOTION_VIDEO_DESIGN.md &mdash; motion/video superagent<br>
        <span class="file-modified">M</span> src/codegen/shadcn-mapper.ts &mdash; token-aware codegen<br>
        <span class="file-modified">M</span> src/engine/core.ts &mdash; autoSpec() method<br>
        <span class="file-modified">M</span> src/commands/pull.ts &mdash; auto-spec count output<br>
        <span class="file-modified">M</span> src/index.ts &mdash; register go + export commands<br>
        <span class="file-added">A</span> assets/memoire-moon.svg<br>
        <span class="file-added">A</span> skills/DASHBOARD_FROM_RESEARCH.md<br>
        <span class="file-added">A</span> skills/FIGMA_AUDIT.md<br>
        <span class="file-added">A</span> skills/FIGMA_PROTOTYPE.md<br>
        <span class="file-renamed">R</span> .ark/ &rarr; .memoire/<br>
        <span class="file-renamed">R</span> ArkEngine &rarr; MemoireEngine<br>
        <span class="file-renamed">R</span> ArkConfig &rarr; MemoireConfig<br>
        <span class="file-renamed">R</span> ArkWsServer &rarr; MemoireWsServer<br>
        <span class="file-modified">M</span> skills/SUPERPOWER.md — MCP decision tree, Code Connect check-first<br>
        <span class="file-modified">M</span> skills/FIGMA_USE.md — Complete MCP tool routing, API gotchas<br>
        <span class="file-modified">M</span> skills/FIGMA_GENERATE_DESIGN.md — Code Connect before creating<br>
        <span class="file-modified">M</span> skills/FIGMA_GENERATE_LIBRARY.md — Batch ops, Code Connect primary output<br>
        <span class="file-modified">M</span> skills/MULTI_AGENT.md — Error recovery protocol<br>
        <span class="file-modified">M</span> skills/registry.json — v2.0.0, freedomLevel field<br>
        <span class="file-modified">M</span> src/engine/core.ts — Class renames<br>
        <span class="file-modified">M</span> src/figma/ws-server.ts — Class renames<br>
        <span class="file-modified">M</span> src/engine/logger.ts — MEMOIRE_LOG_LEVEL<br>
        <span class="file-modified">M</span> src/engine/workspace.ts — .memoire-workspaces<br>
        <span class="file-modified">M</span> package.json — name: memoire, bin: memoire<br>
        <span class="file-modified">M</span> README.md — Full rewrite, moon header<br>
        <span class="file-modified">M</span> CLAUDE.md — Updated skills reference<br>
        <span class="file-modified">M</span> plugin/ — Mémoire branding<br>
      </div>
    </div>
  </div>

  <!-- v0.0.1 — Initial -->
  <div class="version">
    <div class="version-header">
      <div class="version-tag">v0.0.1</div>
      <div class="version-date">2026-03-23</div>
      <span class="version-label label-initial">INITIAL</span>
    </div>

    <div class="commits">
      <div class="commit">
        <div class="commit-hash">199df7a</div>
        <div class="commit-body">
          <div class="commit-msg">Initial commit: Ark &mdash; AI-native Figma design intelligence engine</div>
          <div class="commit-meta">Sarvesh M Chidambaram &middot; 2026-03-23 14:45</div>
        </div>
      </div>
    </div>

    <div class="decisions">
      <div class="decisions-title">Key Design Decisions</div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Spec-First Architecture.</strong> Every component starts as a JSON spec before any code is generated. Specs define variants, props, shadcn base, and atomic level.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>WebSocket Figma Bridge.</strong> Auto-discovery on ports 9223-9232. Plugin scans and connects automatically. Zero configuration required.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>shadcn/ui + Tailwind.</strong> All generated code uses shadcn/ui components and Tailwind CSS. No custom component libraries. Zod for validation.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Research Pipeline.</strong> Excel/CSV import, Figma sticky note extraction, AI synthesis, and report generation. Research informs design specs.</div>
      </div>
      <div class="decision">
        <div class="decision-icon">&raquo;</div>
        <div class="decision-text"><strong>Built for Claude.</strong> CLAUDE.md + skills/ directory teach Claude how to operate autonomously. Superagent mode by default.</div>
      </div>
    </div>

    <div class="files-changed">
      <button class="files-toggle" onclick="this.nextElementSibling.classList.toggle('open')">+ Initial codebase</button>
      <div class="files-list">
        <span class="file-added">A</span> src/engine/ — Core orchestrator, logger, workspace<br>
        <span class="file-added">A</span> src/figma/ — WebSocket bridge, token extraction<br>
        <span class="file-added">A</span> src/research/ — Research engine<br>
        <span class="file-added">A</span> src/specs/ — Spec types and Zod validation<br>
        <span class="file-added">A</span> src/codegen/ — Code generators<br>
        <span class="file-added">A</span> src/preview/ — Localhost preview server<br>
        <span class="file-added">A</span> src/commands/ — CLI (Commander.js)<br>
        <span class="file-added">A</span> src/tui/ — Terminal UI (Ink/React)<br>
        <span class="file-added">A</span> plugin/ — Figma plugin<br>
        <span class="file-added">A</span> skills/ — Agent skill definitions<br>
        <span class="file-added">A</span> CLAUDE.md — Agent instructions<br>
      </div>
    </div>
  </div>

</div>
</div>
</div>

<!-- ── Footer ────────────────────────────────── -->
<div class="memoire-footer">
  <div>MÉMOIRE v0.1.0 &mdash; AI-native design intelligence engine</div>
  <div>
    <a href="#changelog" onclick="showSection('changelog',document.querySelector('.hdr-nav-link[href=&quot;#changelog&quot;]'));return false">Changelog</a>
  </div>
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

/* ── Footer ──────────────────────────────── */
.memoire-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  margin-bottom: 32px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--fg-muted);
  letter-spacing: 0.5px;
}
.memoire-footer a {
  color: var(--accent);
  text-decoration: none;
  margin-left: 16px;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.memoire-footer a:hover { color: var(--accent-bright); }

/* ── Page Fade-In ────────────────────────── */
@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
body { animation: fadeIn 0.4s ease-out; }

/* ── Responsive ──────────────────────────── */
@media (max-width: 1024px) {
  .grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
}
@media (max-width: 768px) {
  .hdr { flex-direction: column; gap: 8px; align-items: flex-start; }
  .grid { grid-template-columns: 1fr; padding: 16px; }
  .filters { padding: 8px 16px; }
  .memoire-footer { flex-direction: column; gap: 8px; align-items: flex-start; }
}
@media (max-width: 480px) {
  .grid { padding: 8px; gap: 8px; }
  .hdr { padding: 12px 16px; }
  .hdr-project { font-size: 14px; }
}
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
    console.log('[Mémoire] WebSocket connected');
    ws.send(JSON.stringify({ type: 'request-state' }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWsMessage(msg);
    } catch {}
  };

  ws.onclose = () => {
    console.log('[Mémoire] WebSocket disconnected, reconnecting...');
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

// ── Section Tabs ──────────────────────
function showSection(id, link) {
  document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.hdr-nav-link').forEach(l => l.classList.remove('active'));
  const panel = document.getElementById('section-' + id);
  if (panel) panel.classList.add('active');
  if (link) link.classList.add('active');
  // Show grid inside specs section when active
  if (id === 'specs') {
    const grid = document.getElementById('grid');
    if (grid) grid.style.display = '';
  }
}

// ── Research Sub-Panels ──────────────────────
function showResPanel(id, btn) {
  document.querySelectorAll('.res-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.res-nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('res-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function toggleEvidence(idx) {
  const el = document.getElementById('ev-' + idx);
  if (!el) return;
  const isOpen = el.style.display === 'block';
  el.style.display = isOpen ? 'none' : 'block';
}

function filterInsights(conf, btn) {
  document.querySelectorAll('#res-insights .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.res-insight').forEach(card => {
    if (conf === 'all') {
      card.style.display = '';
    } else {
      card.style.display = card.dataset.conf === conf ? '' : 'none';
    }
  });
}

// ── Specs Sub-Panels ──────────────────────────
function showSpecPanel(id, btn) {
  document.querySelectorAll('.spec-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#section-specs .res-nav-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('spec-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
}

function toggleSpec(headEl) {
  const body = headEl.nextElementSibling;
  if (!body) return;
  const isOpen = body.style.display === 'block';
  body.style.display = isOpen ? 'none' : 'block';
  const arrow = headEl.querySelector('.spec-arrow');
  if (arrow) arrow.textContent = isOpen ? '>' : 'v';
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

// ── Stats (auto-count from DOM) ─────────────
function updateStats() {
  const flows = document.querySelectorAll('.screen-card').length;
  const specs = document.querySelectorAll('.spec-section-head').length || document.querySelectorAll('#section-specs .spec-panel').length;
  const tokens = document.querySelectorAll('.sys-swatch').length + document.querySelectorAll('.sys-type-row').length;
  const uf = document.getElementById('stat-userflows');
  const sp = document.getElementById('stat-specs');
  const tk = document.getElementById('stat-tokens');
  if (uf) uf.textContent = flows;
  if (sp) sp.textContent = specs;
  if (tk) tk.textContent = tokens;
  const sc = document.getElementById('screens-count');
  if (sc) sc.textContent = flows + ' USERFLOWS';
}

// ── Init ───────────────────────────────────
connectWs();
checkFigmaStatus();
setInterval(checkFigmaStatus, 10000);
makeCardsEditable();
updateStats();
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
<title>Mémoire Research</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #161618;
  --bg-card: #1c1c1f;
  --bg-hover: #242428;
  --bg-surface: #1e1e21;
  --fg: #e0e0e0;
  --fg-muted: #777777;
  --fg-dim: #4a4a4e;
  --border: #2a2a2e;
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
    <div class="hdr-title"><span>MÉMOIRE</span> RESEARCH</div>
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
    ${insights.length === 0 ? `<div class="empty-note">No insights yet. Run <code>memoire research from-file</code> or <code>memoire research from-stickies</code></div>` : ""}
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
    ${themes.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No themes yet. Run <code>memoire research synthesize</code></div>` : ""}
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
    ${personas.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No personas yet. Run <code>memoire research synthesize</code></div>` : ""}
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
