import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";
import type { AnySpec, IASpec, IANode } from "../specs/types.js";
import type { DesignToken } from "../engine/registry.js";
import type { ResearchInsight, ResearchTheme, ResearchStore } from "../research/engine.js";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { spawn } from "child_process";

/** Escape HTML entities to prevent XSS in generated dashboard */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Sanitize a CSS color value — only allow safe color formats */
function escCssColor(val: string): string {
  // Allow hex, rgb/rgba, hsl/hsla, and named CSS colors only
  const safe = val.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(safe)) return safe;
  if (/^(rgb|hsl)a?\([^)]+\)$/.test(safe)) return safe;
  if (/^[a-zA-Z]{1,20}$/.test(safe)) return safe;
  return "#000";
}

interface DashboardData {
  project: { framework?: string; styling: { tailwind: boolean }; shadcn: { installed: boolean } } | null;
  specs: AnySpec[];
  designSystem: { tokens: DesignToken[]; components: unknown[]; styles: unknown[]; lastSync: string };
  research: ResearchStore;
  figma: { running: boolean; port: number; clients: { id: string; file: string; editor: string; connectedAt: string }[] };
}

export function registerDashboardCommand(program: Command, engine: ArkEngine) {
  program
    .command("dashboard")
    .description("Launch the Noche dashboard — view design systems, specs, prototypes, and research on localhost")
    .option("-p, --port <port>", "Dashboard port", "3333")
    .option("--build", "Rebuild dashboard before launching")
    .action(async (opts) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < 1024 || port > 65535) {
        console.error("\n  Invalid port. Must be 1024-65535.\n");
        process.exit(1);
      }

      await engine.init();
      await engine.research.load();

      const dashDir = join(engine.config.projectRoot, ".ark", "dashboard");
      await mkdir(dashDir, { recursive: true });

      console.log("\n  Building Noche Dashboard...\n");

      const project = engine.project;
      const specs = await engine.registry.getAllSpecs();
      const ds = engine.registry.designSystem;
      const research = engine.research.getStore();
      const figmaStatus = engine.figma.getStatus();

      await writeFile(
        join(dashDir, "data.json"),
        JSON.stringify({ project, specs, designSystem: ds, research, figma: figmaStatus, generatedAt: new Date().toISOString() }, null, 2)
      );

      const dashData: DashboardData = {
        project: project as DashboardData["project"],
        specs,
        designSystem: ds,
        research,
        figma: figmaStatus,
      };

      const html = generateAgenticDashboard(dashData);
      await writeFile(join(dashDir, "index.html"), html);

      const components = specs.filter((s) => s.type === "component");
      const pages = specs.filter((s) => s.type === "page");
      const dataviz = specs.filter((s) => s.type === "dataviz");
      const design = specs.filter((s) => s.type === "design");
      const ia = specs.filter((s) => s.type === "ia");

      console.log(`  Dashboard built with:`);
      console.log(`    ${components.length} components`);
      console.log(`    ${pages.length} pages`);
      console.log(`    ${dataviz.length} dataviz`);
      console.log(`    ${design.length} design specs`);
      console.log(`    ${ia.length} IA specs`);
      console.log(`    ${ds.tokens.length} design tokens`);
      console.log(`    ${research.insights.length} research insights`);
      console.log(`\n  Starting on http://localhost:${port}\n`);

      try {
        const child = spawn("npx", ["-y", "serve", dashDir, "-l", String(port), "-s", "--no-clipboard"], {
          stdio: "inherit",
          shell: true,
        });

        child.on("error", (err) => {
          console.log(`  npx serve failed (${err.message}), falling back to python3...`);
          spawn("python3", ["-m", "http.server", String(port)], { cwd: dashDir, stdio: "inherit" });
        });
      } catch {
        spawn("python3", ["-m", "http.server", String(port)], { cwd: dashDir, stdio: "inherit" });
      }
    });
}

// ── AgenticUI × shadcn Dashboard ─────────────────────────────
// Uses shadcn CSS variable architecture reskinned with AgenticUI aesthetics:
// monospace, uppercase labels, corner brackets, block progress, minimal palette

function generateAgenticDashboard(data: DashboardData): string {
  const specs = data.specs;
  const components = specs.filter((s) => s.type === "component");
  const pages = specs.filter((s) => s.type === "page");
  const dataviz = specs.filter((s) => s.type === "dataviz");
  const design = specs.filter((s) => s.type === "design");
  const iaSpecs = specs.filter((s) => s.type === "ia") as IASpec[];
  const tokens = data.designSystem.tokens;
  const insights = data.research.insights;
  const themes = data.research.themes;
  const clients = data.figma.clients;
  const colorTokens = tokens.filter((t) => t.type === "color");
  const spacingTokens = tokens.filter((t) => t.type === "spacing");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Noche — Dashboard</title>
<style>
/* ═══════════════════════════════════════════════════════
   shadcn CSS Variables — AgenticUI skin
   Same token architecture, reskinned for monospace/minimal
   ═══════════════════════════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* shadcn core tokens — light / agentic paper */
  --background: 0 0% 98%;
  --foreground: 0 0% 7%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 7%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 7%;
  --primary: 0 0% 7%;
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 94%;
  --secondary-foreground: 0 0% 7%;
  --muted: 0 0% 94%;
  --muted-foreground: 0 0% 45%;
  --accent: 0 0% 94%;
  --accent-foreground: 0 0% 7%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 98%;
  --border: 0 0% 88%;
  --input: 0 0% 88%;
  --ring: 0 0% 7%;
  --radius: 3px;

  /* shadcn chart tokens — agentic accents */
  --chart-1: 142 71% 35%;
  --chart-2: 43 96% 40%;
  --chart-3: 0 72% 51%;
  --chart-4: 217 91% 60%;
  --chart-5: 270 67% 47%;

  /* shadcn sidebar tokens */
  --sidebar-background: 0 0% 98%;
  --sidebar-foreground: 0 0% 30%;
  --sidebar-primary: 0 0% 7%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 0 0% 94%;
  --sidebar-accent-foreground: 0 0% 7%;
  --sidebar-border: 0 0% 88%;

  /* AgenticUI extensions on top of shadcn */
  --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Consolas', monospace;
}

.dark {
  --background: 0 0% 4%;
  --foreground: 0 0% 93%;
  --card: 0 0% 7%;
  --card-foreground: 0 0% 93%;
  --popover: 0 0% 7%;
  --popover-foreground: 0 0% 93%;
  --primary: 0 0% 93%;
  --primary-foreground: 0 0% 7%;
  --secondary: 0 0% 12%;
  --secondary-foreground: 0 0% 93%;
  --muted: 0 0% 12%;
  --muted-foreground: 0 0% 50%;
  --accent: 0 0% 12%;
  --accent-foreground: 0 0% 93%;
  --destructive: 0 62% 30%;
  --destructive-foreground: 0 0% 93%;
  --border: 0 0% 15%;
  --input: 0 0% 15%;
  --ring: 0 0% 83%;
  --sidebar-background: 0 0% 4%;
  --sidebar-foreground: 0 0% 85%;
  --sidebar-primary: 0 0% 93%;
  --sidebar-primary-foreground: 0 0% 7%;
  --sidebar-accent: 0 0% 12%;
  --sidebar-accent-foreground: 0 0% 85%;
  --sidebar-border: 0 0% 15%;
}

body {
  font-family: var(--mono);
  font-size: 13px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* ── AgenticUI: Corner Bracket Frame ────────────────── */
.frame { position: fixed; inset: 0; pointer-events: none; z-index: 100; }
.frame-corner { position: absolute; width: 20px; height: 20px; color: hsl(var(--border)); }
.frame-tl { top: 12px; left: 12px; }
.frame-tr { top: 12px; right: 12px; }
.frame-bl { bottom: 12px; left: 12px; }
.frame-br { bottom: 12px; right: 12px; }

/* ── AgenticUI: Crosshatch Background ───────────────── */
.crosshatch {
  position: fixed; inset: 0; pointer-events: none; z-index: -1;
  background-image:
    linear-gradient(45deg, hsl(var(--border)) 0.5px, transparent 0.5px),
    linear-gradient(-45deg, hsl(var(--border)) 0.5px, transparent 0.5px);
  background-size: 40px 40px;
  opacity: 0.15;
}

/* ── Layout ─────────────────────────────────────────── */
.shell { max-width: 1100px; margin: 0 auto; padding: 60px 40px 80px; }

/* ── Header ─────────────────────────────────────────── */
.header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 48px; padding-bottom: 24px;
  border-bottom: 1px solid hsl(var(--border));
}
.logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
.logo-sub {
  font-size: 11px; color: hsl(var(--muted-foreground));
  text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;
}
.header-actions { display: flex; gap: 12px; align-items: center; }

/* ── Button (shadcn secondary variant, agentic style) ── */
.btn {
  font-family: var(--mono); font-size: 11px;
  text-transform: uppercase; letter-spacing: 1.5px;
  padding: 6px 16px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary));
  color: hsl(var(--secondary-foreground));
  cursor: pointer; border-radius: var(--radius);
  transition: all 0.15s;
}
.btn:hover {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border-color: hsl(var(--primary));
}

/* ── Nav Tabs ───────────────────────────────────────── */
.nav {
  display: flex; gap: 0; margin-bottom: 40px;
  border-bottom: 1px solid hsl(var(--border));
}
.nav-tab {
  font-family: var(--mono); font-size: 11px;
  text-transform: uppercase; letter-spacing: 1.5px;
  padding: 10px 20px; background: none; border: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer; position: relative; transition: color 0.15s;
}
.nav-tab:hover { color: hsl(var(--foreground)); }
.nav-tab.active { color: hsl(var(--foreground)); font-weight: 700; }
.nav-tab.active::after {
  content: ''; position: absolute;
  bottom: -1px; left: 0; right: 0;
  height: 2px; background: hsl(var(--foreground));
}
.nav-tab .tab-count {
  font-size: 10px; color: hsl(var(--muted-foreground)); margin-left: 4px;
}

/* ── Card (shadcn card, agentic monospace) ───────────── */
.cards { display: grid; gap: 16px; }
.c4 { grid-template-columns: repeat(4, 1fr); }
.c3 { grid-template-columns: repeat(3, 1fr); }
.c2 { grid-template-columns: repeat(2, 1fr); }
.c1 { grid-template-columns: 1fr; }
@media (max-width: 900px) { .c4, .c3 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 600px) { .c4, .c3, .c2 { grid-template-columns: 1fr; } }

.card {
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius);
  padding: 20px;
}

.card-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 2px;
  color: hsl(var(--muted-foreground)); margin-bottom: 8px; font-weight: 600;
}
.card-value {
  font-size: 36px; font-weight: 800; letter-spacing: -2px; line-height: 1;
}
.card-sub {
  font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 6px;
  text-transform: uppercase; letter-spacing: 0.5px;
}

/* ── Status dot ─────────────────────────────────────── */
.status {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;
}
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-ok { background: hsl(var(--chart-1)); }
.dot-warn { background: hsl(var(--chart-2)); }
.dot-err { background: hsl(var(--destructive)); }

/* ── Progress bar (AgenticUI block style) ───────────── */
.progress-bar { letter-spacing: 1px; font-size: 14px; }
.progress-fill { color: hsl(var(--chart-1)); }
.progress-empty { color: hsl(var(--border)); }

/* ── Badge (shadcn outline variant, agentic) ────────── */
.badge {
  display: inline-flex; font-family: var(--mono);
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  padding: 2px 8px; border: 1px solid; border-radius: 2px; font-weight: 600;
}
.badge-ok { border-color: hsl(var(--chart-1)); color: hsl(var(--chart-1)); }
.badge-warn { border-color: hsl(var(--chart-2)); color: hsl(var(--chart-2)); }
.badge-err { border-color: hsl(var(--destructive)); color: hsl(var(--destructive)); }
.badge-info { border-color: hsl(var(--chart-4)); color: hsl(var(--chart-4)); }
.badge-muted {
  border-color: hsl(var(--border));
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}

/* ── Table (shadcn table, agentic labels) ───────────── */
table { width: 100%; border-collapse: collapse; font-size: 12px; font-family: var(--mono); }
th {
  text-align: left; padding: 8px 12px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
  color: hsl(var(--muted-foreground)); font-weight: 600;
  border-bottom: 1px solid hsl(var(--border));
}
td { padding: 8px 12px; border-bottom: 1px solid hsl(var(--border)); }
tr:hover td { background: hsl(var(--muted) / 0.4); }

/* ── Section ────────────────────────────────────────── */
.section { margin-top: 32px; }
.section-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 2px;
  color: hsl(var(--muted-foreground)); margin-bottom: 16px; font-weight: 600;
}

/* ── Separator (shadcn) ─────────────────────────────── */
.sep { height: 1px; background: hsl(var(--border)); margin: 12px 0; }

/* ── Swatch ─────────────────────────────────────────── */
.swatches { display: flex; flex-wrap: wrap; gap: 6px; }
.swatch { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.swatch-block {
  width: 40px; height: 40px; border-radius: var(--radius);
  border: 1px solid hsl(var(--border));
}
.swatch-label {
  font-size: 9px; color: hsl(var(--muted-foreground));
  max-width: 50px; overflow: hidden; text-overflow: ellipsis;
}

/* ── Empty state ────────────────────────────────────── */
.empty {
  text-align: center; padding: 48px 20px;
  color: hsl(var(--muted-foreground));
  border: 1px dashed hsl(var(--border));
  border-radius: var(--radius); font-size: 12px;
  text-transform: uppercase; letter-spacing: 1px;
}
.empty code {
  background: hsl(var(--muted)); padding: 2px 6px;
  border-radius: 2px; font-size: 11px;
  text-transform: none; letter-spacing: 0;
}

/* ── Spacing viz ────────────────────────────────────── */
.sp-box {
  display: inline-flex; flex-direction: column; gap: 2px;
  padding: 8px 12px; border: 1px dashed hsl(var(--border));
  border-radius: var(--radius); font-size: 10px;
  color: hsl(var(--muted-foreground));
}
.sp-val { font-weight: 700; font-size: 13px; color: hsl(var(--foreground)); }

/* ── Input (shadcn) ─────────────────────────────────── */
.input {
  font-family: var(--mono); font-size: 12px;
  padding: 6px 12px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--input));
  border-radius: var(--radius);
  color: hsl(var(--foreground));
}
.input:focus { outline: 2px solid hsl(var(--ring)); outline-offset: 1px; }

/* ── Panels ─────────────────────────────────────────── */
.panel { display: none; }
.panel.active { display: block; }
</style>
</head>
<body>

<!-- AgenticUI frame corners -->
<div class="frame">
  <svg class="frame-corner frame-tl" viewBox="0 0 20 20"><path d="M0 20V0h20" fill="none" stroke="currentColor" stroke-width="1"/></svg>
  <svg class="frame-corner frame-tr" viewBox="0 0 20 20"><path d="M20 20V0H0" fill="none" stroke="currentColor" stroke-width="1"/></svg>
  <svg class="frame-corner frame-bl" viewBox="0 0 20 20"><path d="M0 0v20h20" fill="none" stroke="currentColor" stroke-width="1"/></svg>
  <svg class="frame-corner frame-br" viewBox="0 0 20 20"><path d="M20 0v20H0" fill="none" stroke="currentColor" stroke-width="1"/></svg>
</div>

<div class="crosshatch"></div>

<div class="shell">

  <!-- Header -->
  <header class="header">
    <div>
      <div class="logo">Noche</div>
      <div class="logo-sub">Design Intelligence Engine</div>
    </div>
    <div class="header-actions">
      <span class="status">
        <span class="dot ${clients.length > 0 ? "dot-ok" : "dot-warn"}"></span>
        ${clients.length > 0 ? "CONNECTED" : "OFFLINE"}
      </span>
      <button class="btn" onclick="document.documentElement.classList.toggle('dark')">THEME</button>
    </div>
  </header>

  <!-- Breadcrumb / terminal prompt -->
  <div style="font-size:11px; color:hsl(var(--muted-foreground)); margin-bottom: 12px; letter-spacing:1px;">
    ~$ ARK DASHBOARD &middot; ${esc(data.project?.framework?.toUpperCase() ?? "PROJECT")} &middot; ${esc(new Date().toLocaleTimeString())}
  </div>

  <!-- Nav -->
  <nav class="nav">
    <button class="nav-tab active" onclick="showPanel('overview',this)">OVERVIEW<span class="tab-count">${specs.length}</span></button>
    <button class="nav-tab" onclick="showPanel('tokens',this)">TOKENS<span class="tab-count">${tokens.length}</span></button>
    <button class="nav-tab" onclick="showPanel('components',this)">COMPONENTS<span class="tab-count">${components.length}</span></button>
    <button class="nav-tab" onclick="showPanel('dataviz',this)">DATAVIZ<span class="tab-count">${dataviz.length}</span></button>
    <button class="nav-tab" onclick="showPanel('pages',this)">PAGES<span class="tab-count">${pages.length}</span></button>
    <button class="nav-tab" onclick="showPanel('design',this)">DESIGN<span class="tab-count">${design.length}</span></button>
    <button class="nav-tab" onclick="showPanel('ia',this)">IA<span class="tab-count">${iaSpecs.length}</span></button>
    <button class="nav-tab" onclick="showPanel('research',this)">RESEARCH<span class="tab-count">${insights.length}</span></button>
    <button class="nav-tab" onclick="showPanel('figma',this)">FIGMA<span class="tab-count">${clients.length}</span></button>
  </nav>

  <!-- Overview Panel -->
  <div class="panel active" id="panel-overview">
    <div class="cards c4">
      <div class="card">
        <div class="card-label">Components</div>
        <div class="card-value">${components.length}</div>
        <div class="card-sub">shadcn-based specs</div>
      </div>
      <div class="card">
        <div class="card-label">Pages</div>
        <div class="card-value">${pages.length}</div>
        <div class="card-sub">layout specs</div>
      </div>
      <div class="card">
        <div class="card-label">Design Tokens</div>
        <div class="card-value">${tokens.length}</div>
        <div class="card-sub">
          <span class="status"><span class="dot ${tokens.length > 0 ? "dot-ok" : "dot-warn"}"></span>${tokens.length > 0 ? "synced" : "pending"}</span>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Research</div>
        <div class="card-value">${insights.length}</div>
        <div class="card-sub">${themes.length} themes</div>
      </div>
    </div>

    <!-- System status with block progress -->
    <div class="section">
      <div class="card">
        <div class="card-label">System Status</div>
        <div style="margin-top:12px; line-height: 2">
          <div>
            <span style="display:inline-block;width:70px;font-size:11px">FIGMA</span>
            <span class="progress-bar"><span class="${clients.length > 0 ? "progress-fill" : "progress-empty"}">${clients.length > 0 ? "████████████" : "░░░░░░░░░░░░"}</span></span>
            <span style="font-size:10px; color:hsl(var(--muted-foreground)); letter-spacing:1px">&nbsp;${clients.length > 0 ? "CONNECTED" : "DISCONNECTED"}</span>
          </div>
          <div>
            <span style="display:inline-block;width:70px;font-size:11px">SPECS</span>
            <span class="progress-bar"><span class="progress-fill">${"█".repeat(Math.min(specs.length, 12))}</span><span class="progress-empty">${"░".repeat(Math.max(0, 12 - specs.length))}</span></span>
            <span style="font-size:10px; color:hsl(var(--muted-foreground)); letter-spacing:1px">&nbsp;${specs.length} OF ${Math.max(specs.length, 12)}</span>
          </div>
          <div>
            <span style="display:inline-block;width:70px;font-size:11px">TOKENS</span>
            <span class="progress-bar"><span class="progress-fill">${"█".repeat(Math.min(Math.floor(tokens.length / 5), 12))}</span><span class="progress-empty">${"░".repeat(Math.max(0, 12 - Math.floor(tokens.length / 5)))}</span></span>
            <span style="font-size:10px; color:hsl(var(--muted-foreground)); letter-spacing:1px">&nbsp;${tokens.length}</span>
          </div>
          <div>
            <span style="display:inline-block;width:70px;font-size:11px">RESEARCH</span>
            <span class="progress-bar"><span class="progress-fill">${"█".repeat(Math.min(insights.length, 12))}</span><span class="progress-empty">${"░".repeat(Math.max(0, 12 - insights.length))}</span></span>
            <span style="font-size:10px; color:hsl(var(--muted-foreground)); letter-spacing:1px">&nbsp;${insights.length} INSIGHTS</span>
          </div>
        </div>
      </div>
    </div>

    ${specs.length > 0 ? `
    <div class="section">
      <div class="section-label">All Specs</div>
      <div class="card" style="padding:0; overflow:hidden">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Purpose</th><th>Tags</th></tr></thead>
          <tbody>
          ${specs.map((s) => `<tr>
            <td style="font-weight:700">${esc(s.name)}</td>
            <td><span class="badge badge-muted">${esc(s.type)}</span></td>
            <td style="color:hsl(var(--muted-foreground))">${esc(("purpose" in s ? s.purpose : "").slice(0, 50))}</td>
            <td>${(s.tags || []).map((t: string) => `<span class="badge badge-info" style="margin-right:3px">${esc(t)}</span>`).join("")}</td>
          </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>` : `<div class="section"><div class="empty">No specs yet. Run <code>ark init</code> to start.</div></div>`}
  </div>

  <!-- Tokens Panel -->
  <div class="panel" id="panel-tokens">
    ${colorTokens.length > 0 ? `
    <div class="section-label">Color Tokens &middot; ${colorTokens.length}</div>
    <div class="card">
      <div class="swatches">
        ${colorTokens.map((t) => {
          const val = String(Object.values(t.values)[0] || "#000");
          return `<div class="swatch">
            <div class="swatch-block" style="background:${escCssColor(val)}"></div>
            <div class="swatch-label">${esc(t.name.split("/").pop() || t.name)}</div>
          </div>`;
        }).join("")}
      </div>
    </div>` : ""}

    ${spacingTokens.length > 0 ? `
    <div class="section">
      <div class="section-label">Spacing Tokens</div>
      <div class="card" style="padding:0; overflow:hidden">
        <table>
          <thead><tr><th>Name</th><th>CSS Variable</th><th>Value</th></tr></thead>
          <tbody>
          ${spacingTokens.map((t) => `<tr>
            <td>${esc(t.name)}</td>
            <td><code>${esc(t.cssVariable)}</code></td>
            <td>${esc(String(Object.values(t.values)[0] ?? "—"))}</td>
          </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>` : ""}

    ${tokens.length === 0 ? `<div class="empty">No tokens yet. Run <code>ark connect</code> then <code>ark pull</code></div>` : ""}
  </div>

  <!-- Components Panel -->
  <div class="panel" id="panel-components">
    ${components.length > 0 ? `
    <div class="cards c2">
      ${components.map((s) => {
        if (s.type !== "component") return "";
        return `<div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-weight:700">${esc(s.name)}</span>
            <span class="badge badge-muted">${s.variants.length} variants</span>
          </div>
          <div class="card-sub" style="text-transform:none; letter-spacing:0">${esc(s.purpose)}</div>
          <div class="sep"></div>
          <div class="card-label">shadcn Base</div>
          <div>${s.shadcnBase.map((b: string) => `<span class="badge badge-info" style="margin:2px">${esc(b)}</span>`).join("") || "<span style='color:hsl(var(--muted-foreground))'>none</span>"}</div>
          <div style="margin-top:8px">
            <div class="card-label">Props</div>
            <div style="font-size:11px">${Object.entries(s.props).map(([k, v]) => `<code>${esc(k)}: ${esc(String(v))}</code>`).join(", ") || "<span style='color:hsl(var(--muted-foreground))'>none</span>"}</div>
          </div>
        </div>`;
      }).join("")}
    </div>` : `<div class="empty">No components. Run <code>ark spec component MyComponent</code></div>`}
  </div>

  <!-- DataViz Panel -->
  <div class="panel" id="panel-dataviz">
    ${dataviz.length > 0 ? `
    <div class="cards c2">
      ${dataviz.map((s) => {
        if (s.type !== "dataviz") return "";
        return `<div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-weight:700">${esc(s.name)}</span>
            <span class="badge badge-info">${esc(s.chartType)}</span>
          </div>
          <div class="card-sub" style="text-transform:none; letter-spacing:0">${esc(s.purpose)}</div>
          <div class="sep"></div>
          <div style="font-size:11px; line-height:1.8">
            <span class="card-label">Library:</span> ${esc(s.library)}<br>
            <span class="card-label">Data:</span> x=${esc(s.dataShape.x)}, y=${esc(s.dataShape.y)}<br>
            <span class="card-label">Interactions:</span> ${s.interactions.map((i: string) => esc(i)).join(", ")}
          </div>
        </div>`;
      }).join("")}
    </div>` : `<div class="empty">No dataviz. Run <code>ark spec dataviz MyChart</code></div>`}
  </div>

  <!-- Pages Panel -->
  <div class="panel" id="panel-pages">
    ${pages.length > 0 ? `
    <div class="cards c1">
      ${pages.map((s) => {
        if (s.type !== "page") return "";
        return `<div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-weight:700">${esc(s.name)}</span>
            <span class="badge badge-muted">${esc(s.layout)}</span>
          </div>
          <div class="card-sub" style="text-transform:none; letter-spacing:0">${esc(s.purpose)}</div>
          <div class="sep"></div>
          <div class="card-label">Sections</div>
          <div>${s.sections.map((sec) => `<span class="badge badge-info" style="margin:2px">${esc(sec.name)} (${esc(sec.component)}${sec.repeat > 1 ? " x" + sec.repeat : ""})</span>`).join("")}</div>
          <div style="margin-top:8px; font-size:11px">
            <span class="card-label">Responsive:</span>
            mobile=${esc(s.responsive.mobile)} / tablet=${esc(s.responsive.tablet)} / desktop=${esc(s.responsive.desktop)}
          </div>
        </div>`;
      }).join("")}
    </div>` : `<div class="empty">No pages. Run <code>ark spec page MyPage</code></div>`}
  </div>

  <!-- Design Panel -->
  <div class="panel" id="panel-design">
    ${design.length > 0 ? `
    <div class="cards c1">
      ${design.map((s) => {
        if (s.type !== "design") return "";
        return `<div class="card">
          <div style="display:flex; justify-content:space-between; align-items:center">
            <span style="font-weight:700">${esc(s.name)}</span>
            <span class="badge badge-info">design</span>
          </div>
          <div class="card-sub" style="text-transform:none; letter-spacing:0">${esc(s.purpose)}</div>
          ${s.dimensions ? `<div class="sep"></div>
          <div class="card-label">Dimensions</div>
          <div style="font-size:14px; font-weight:700">${esc(String(s.dimensions.width))} &times; ${esc(String(s.dimensions.height))}</div>` : ""}
          ${s.spacing.length > 0 ? `<div class="sep"></div>
          <div class="card-label">Spacing (${s.spacing.length})</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:4px">
            ${s.spacing.map((sp) => `<div class="sp-box">
              <div>${esc(sp.target)}</div>
              ${sp.padding ? `<div class="sp-val">P: ${sp.padding.top ?? 0} ${sp.padding.right ?? 0} ${sp.padding.bottom ?? 0} ${sp.padding.left ?? 0}${sp.unit}</div>` : ""}
              ${sp.gap !== undefined ? `<div class="sp-val">Gap: ${sp.gap}${sp.unit}</div>` : ""}
            </div>`).join("")}
          </div>` : ""}
          ${s.interactions.length > 0 ? `<div class="sep"></div>
          <div class="card-label">Interactions (${s.interactions.length})</div>
          <table style="margin-top:4px">
            <thead><tr><th>Trigger</th><th>Target</th><th>Action</th><th>Anim</th></tr></thead>
            <tbody>
            ${s.interactions.map((i) => `<tr>
              <td><span class="badge badge-info">${esc(i.trigger)}</span></td>
              <td>${esc(i.target)}</td>
              <td>${esc(i.action)}</td>
              <td>${i.animation ? esc(i.animation.type) + " " + i.animation.duration + "ms" : "none"}</td>
            </tr>`).join("")}
            </tbody>
          </table>` : ""}
          ${s.linkedSpecs.length > 0 ? `<div class="sep"></div>
          <div class="card-label">Linked Specs</div>
          ${s.linkedSpecs.map((l: string) => `<span class="badge badge-muted" style="margin:2px">${esc(l)}</span>`).join("")}` : ""}
        </div>`;
      }).join("")}
    </div>` : `<div class="empty">No design specs. Run <code>ark spec design MyDesign</code> for pixel-level annotations.</div>`}
  </div>

  <!-- IA Panel -->
  <div class="panel" id="panel-ia">
    ${iaSpecs.length > 0 ? iaSpecs.map((ia) => {
      const countNodes = (n: IANode): number => 1 + n.children.reduce((s: number, c: IANode) => s + countNodes(c), 0);
      const totalNodes = countNodes(ia.root);
      const renderNode = (n: IANode, depth: number): string => {
        const indent = depth * 20;
        const typeClass = n.type === "page" ? "badge-info" : "badge-muted";
        const linked = n.linkedPageSpec ? ` <span style="color:hsl(var(--chart-1))">→ ${esc(n.linkedPageSpec)}</span>` : "";
        const kids = n.children.map((c: IANode) => renderNode(c, depth + 1)).join("");
        return `<div style="padding:4px 0 4px ${indent}px; border-left:1px solid hsl(var(--border)); font-size:13px">
          <span class="badge ${typeClass}" style="font-size:10px; margin-right:6px">${esc(n.type)}</span>
          <span style="font-weight:600">${esc(n.label)}</span>${linked}
          ${n.notes ? `<span style="color:hsl(var(--muted-foreground)); font-size:11px"> — ${esc(n.notes)}</span>` : ""}
        </div>${kids}`;
      };
      return `<div class="section">
        <div class="section-label">${esc(ia.name)} &middot; ${totalNodes} NODES &middot; ${ia.flows.length} FLOWS</div>
        <div class="card">
          <div style="display:flex; gap:16px; margin-bottom:12px">
            <div><span class="card-label">Entry Points:</span> ${ia.entryPoints.length > 0 ? ia.entryPoints.map((e: string) => `<span class="badge badge-info">${esc(e)}</span>`).join(" ") : "<span style='color:hsl(var(--muted-foreground))'>none</span>"}</div>
            ${ia.sourceFileKey ? `<div><span class="card-label">Figma:</span> <code>${esc(ia.sourceFileKey)}</code></div>` : ""}
          </div>
          <div class="sep"></div>
          <div class="card-label" style="margin-bottom:8px">SITE TREE</div>
          <div style="font-family:var(--mono); overflow-x:auto">
            ${ia.root.children.map((c: IANode) => renderNode(c, 0)).join("")}
          </div>
          ${ia.flows.length > 0 ? `<div class="sep"></div>
          <div class="card-label" style="margin-bottom:8px">NAVIGATION FLOWS</div>
          <table>
            <thead><tr><th>From</th><th>To</th><th>Trigger</th><th>Label</th><th>Condition</th></tr></thead>
            <tbody>
              ${ia.flows.map((f) => `<tr>
                <td>${esc(f.from)}</td>
                <td>${esc(f.to)}</td>
                <td><span class="badge badge-muted">${esc(f.trigger)}</span></td>
                <td>${f.label ? esc(f.label) : "—"}</td>
                <td>${f.condition ? esc(f.condition) : "—"}</td>
              </tr>`).join("")}
            </tbody>
          </table>` : ""}
          ${ia.globals.length > 0 ? `<div class="sep"></div>
          <div class="card-label" style="margin-bottom:8px">GLOBAL NAV</div>
          <div>${ia.globals.map((g) => `<span class="badge badge-info" style="margin:2px">${esc(g.label)}${g.linkedPageSpec ? ` → ${esc(g.linkedPageSpec)}` : ""}</span>`).join("")}</div>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="empty">No IA specs. Run <code>ark ia extract MyIA</code> to extract from Figma or <code>ark ia create MyIA</code>.</div>`}
  </div>

  <!-- Research Panel -->
  <div class="panel" id="panel-research">
    ${insights.length > 0 ? `
    <div class="cards c4" style="margin-bottom:24px">
      <div class="card"><div class="card-label">Total Insights</div><div class="card-value">${insights.length}</div></div>
      <div class="card"><div class="card-label">High Confidence</div><div class="card-value">${insights.filter((i) => i.confidence === "high").length}</div></div>
      <div class="card"><div class="card-label">Themes</div><div class="card-value">${themes.length}</div></div>
      <div class="card"><div class="card-label">Sources</div><div class="card-value">${data.research.sources.length}</div></div>
    </div>
    <div class="card" style="padding:0; overflow:hidden">
      <table>
        <thead><tr><th>Finding</th><th>Confidence</th><th>Source</th><th>Evidence</th></tr></thead>
        <tbody>
        ${insights.map((i) => `<tr>
          <td>${esc(i.finding.slice(0, 50))}</td>
          <td><span class="badge badge-${i.confidence === "high" ? "ok" : i.confidence === "medium" ? "warn" : "err"}">${esc(i.confidence)}</span></td>
          <td style="color:hsl(var(--muted-foreground))">${esc(i.source)}</td>
          <td style="color:hsl(var(--muted-foreground))">${i.evidence.length} items</td>
        </tr>`).join("")}
        </tbody>
      </table>
    </div>` : `<div class="empty">No research. Run <code>ark research from-file data.xlsx</code></div>`}
  </div>

  <!-- Figma Panel -->
  <div class="panel" id="panel-figma">
    <div class="cards c2">
      <div class="card">
        <div class="card-label">Bridge Status</div>
        <div style="margin-top:8px">
          <span class="status"><span class="dot ${clients.length > 0 ? "dot-ok" : "dot-warn"}"></span>${clients.length > 0 ? "connected" : "disconnected"}</span>
        </div>
        <div class="card-value" style="margin-top:8px">${clients.length}</div>
        <div class="card-sub">active connections</div>
      </div>
      <div class="card">
        <div class="card-label">Design System</div>
        <div style="margin-top:8px; font-size:11px; line-height:1.8">
          <div>${tokens.length} tokens &middot; ${(data.designSystem.components as unknown[]).length} components &middot; ${(data.designSystem.styles as unknown[]).length} styles</div>
          <div style="color:hsl(var(--muted-foreground))">Last sync: ${esc(data.designSystem.lastSync)}</div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Setup Guide</div>
      <div class="card" style="line-height:2.2; font-size:12px">
        <div><strong>1.</strong> Get Figma token: <code>Figma &rarr; Settings &rarr; Personal Access Tokens</code></div>
        <div><strong>2.</strong> Set env: <code>export FIGMA_TOKEN="figd_..."</code></div>
        <div><strong>3.</strong> Start server: <code>ark connect</code></div>
        <div><strong>4.</strong> In Figma: <code>Plugins &rarr; Dev &rarr; Import manifest &rarr; ark/plugin/manifest.json</code></div>
        <div><strong>5.</strong> Pull system: <code>ark pull</code></div>
        <div><strong>6.</strong> Refresh: <code>ark dashboard</code></div>
      </div>
    </div>
  </div>

</div>

<script>
function showPanel(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('panel-' + name).classList.add('active');
  el.classList.add('active');
}
</script>
</body>
</html>`;
}
