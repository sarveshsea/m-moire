/**
 * Gallery Page Template — Generates the main preview HTML page.
 *
 * Extracted from src/commands/preview.ts to keep the command file
 * as a thin orchestrator (~80 lines) instead of 4000+ lines.
 */

import type { PreviewData } from "./types.js";
import { esc, escColor } from "./types.js";
import { resolveAsset } from "./resolve-asset.js";

const CSS = resolveAsset("gallery-page.css");
const CLIENT_JS = resolveAsset("gallery-page.client.js");

export function generatePreviewHTML(data: PreviewData): string {
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
${CSS}
</style>
</head>
<body>

<a href="#main-content" class="skip-link">Skip to main content</a>

<header>
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-project">
      <h1 class="hdr-project-title">mémoire</h1>
    </div>
  </div>
  <nav aria-label="Mémoire navigation">
  <div class="hdr-nav">
    <a href="#screens" class="hdr-nav-link active" onclick="showSection('screens',this)">Screens</a>
    <a href="#research" class="hdr-nav-link" onclick="showSection('research',this)">Research</a>
    <a href="#specs" class="hdr-nav-link" onclick="showSection('specs',this)">Specs</a>
    <a href="#system" class="hdr-nav-link" onclick="showSection('system',this)">Systems</a>
    <a href="#changelog" class="hdr-nav-link" onclick="showSection('changelog',this)">Changelog</a>
  </div>
  </nav>
  <div class="hdr-stats">
    <span><span class="n" id="stat-userflows">0</span>USERFLOWS</span>
    <span><span class="n" id="stat-specs">0</span>SPECS</span>
    <span><span class="n" id="stat-tokens">60</span>SYSTEMS</span>
  </div>
</div>
</header>

<main id="main-content" tabindex="-1">

<!-- ── Screens Section ────────────────────────── -->
<div id="section-screens" class="section-panel active">
<div class="screens-section">
  <div class="screens-header">
    <h2 class="screens-label">DIBS</h2>
    <div class="screens-subtitle">Agency Production Bidding &mdash; AICP-Compliant Estimation</div>
    <div class="screens-line"></div>
    <div class="screens-count" id="screens-count">0 USERFLOWS</div>
  </div>
  <div class="screens-grid">
    <a href="dibs.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1" title="Project Setup preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Project Setup</h3>
        <div class="screen-desc">Production type, brief, template selection</div>
        <div class="screen-badge">STEP 1</div>
      </div>
    </a>
    <a href="dibs.html#step2" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1" title="Smart Estimator preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Smart Estimator</h3>
        <div class="screen-desc">AI pre-filled line items, 9 AICP categories</div>
        <div class="screen-badge">STEP 2</div>
      </div>
    </a>
    <a href="dibs.html#step3" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1" title="Timeline preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Timeline</h3>
        <div class="screen-desc">Gantt chart, milestones, shoot day planning</div>
        <div class="screen-badge">STEP 3</div>
      </div>
    </a>
    <a href="dibs.html#step4" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs.html" tabindex="-1" title="Bid Summary preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Bid Summary</h3>
        <div class="screen-desc">Budget breakdown, comparison, export to AICP PDF</div>
        <div class="screen-badge">STEP 4</div>
      </div>
    </a>
    <a href="dibs-dashboard.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-dashboard.html" tabindex="-1" title="Dashboard preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Dashboard</h3>
        <div class="screen-desc">Active bids, pipeline stats, recent activity</div>
        <div class="screen-badge">OVERVIEW</div>
      </div>
    </a>
    <a href="dibs-dashboard.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-dashboard.html" tabindex="-1" title="Line Items and Compare preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Line Items & Compare</h3>
        <div class="screen-desc">Budget breakdown, comparison, all in dashboard</div>
        <div class="screen-badge">WIDGETS</div>
      </div>
    </a>
    <a href="dibs-rates.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-rates.html" tabindex="-1" title="Rate Cards preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Rate Cards</h3>
        <div class="screen-desc">Union rates, crew benchmarks, equipment pricing</div>
        <div class="screen-badge">RATES</div>
      </div>
    </a>
    <a href="dibs-collab.html" class="screen-card">
      <div class="screen-thumb"><iframe src="dibs-collab.html" tabindex="-1" title="Collaboration preview"></iframe></div>
      <div class="screen-info">
        <h3 class="screen-name">Collaboration</h3>
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
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M25.5 15.5A9.5 9.5 0 0 1 12 25 9.5 9.5 0 0 1 9.5 6.5 12 12 0 1 0 25.5 15.5z" fill="#C4A35A"/></svg>
    <h2 class="sys-title">Dibs Design System</h2>
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
        <h3 class="sys-comp-name">Button / Primary</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><button style="background:transparent;color:#9D833E;border:1px solid #9D833E;padding:10px 24px;border-radius:4px;font-family:var(--mono);font-size:12px;cursor:pointer">Save Draft</button></div>
        <h3 class="sys-comp-name">Button / Outline</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="background:#fff;border:1px solid #E8DDD0;border-radius:8px;padding:16px;width:200px"><div style="font-size:10px;color:#666;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">TOTAL BUDGET</div><div style="font-size:22px;font-weight:700;color:#1a1a1a">$487,250</div></div></div>
        <h3 class="sys-comp-name">Metric Card</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;gap:8px"><span style="background:#F7F3EE;border:2px solid #9D833E;border-radius:4px;padding:6px 16px;font-size:11px;font-weight:600;color:#9D833E">Performance Spot</span><span style="background:transparent;border:1px solid #E8DDD0;border-radius:4px;padding:6px 16px;font-size:11px;color:#666">Lifestyle</span></div></div>
        <h3 class="sys-comp-name">Template Chip</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;align-items:center;gap:12px;background:#FFF8E7;border:1px solid #D4A017;border-radius:6px;padding:12px 16px;width:280px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4A017" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span style="font-size:12px;color:#92400E">Confirm talent count — SAG rates applied</span></div></div>
        <h3 class="sys-comp-name">Attention Card</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;align-items:center;gap:10px"><div style="width:60px;height:60px;position:relative"><svg width="60" height="60" viewBox="0 0 60 60"><circle cx="30" cy="30" r="26" fill="none" stroke="#E8DDD0" stroke-width="4"/><circle cx="30" cy="30" r="26" fill="none" stroke="#9D833E" stroke-width="4" stroke-dasharray="120" stroke-dashoffset="32" transform="rotate(-90 30 30)"/></svg><span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:13px;font-weight:700;color:#1a1a1a">73%</span></div><div style="font-size:11px;color:#666">7 of 9 categories<br>complete</div></div></div>
        <h3 class="sys-comp-name">Progress Ring</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="background:#fff;border:1px solid #E8DDD0;border-radius:6px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;width:260px"><div><div style="font-size:13px;font-weight:600;color:#1a1a1a">Crew & Labor</div><div style="font-size:10px;color:#888">38 / 52 items</div></div><div style="display:flex;align-items:center;gap:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="#2D5016" stroke="none"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span style="font-size:15px;font-weight:700;color:#1a1a1a">$142,800</span></div></div></div>
        <h3 class="sys-comp-name">Category Row</h3>
      </div>
      <div class="sys-comp">
        <div class="sys-comp-demo"><div style="display:flex;gap:4px;align-items:end;height:40px"><div style="width:8px;height:30px;background:#9D833E;border-radius:2px 2px 0 0"></div><div style="width:8px;height:20px;background:#C4A35A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:35px;background:#6B5A2A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:15px;background:#D4B86A;border-radius:2px 2px 0 0"></div><div style="width:8px;height:25px;background:#9D833E;border-radius:2px 2px 0 0"></div></div></div>
        <h3 class="sys-comp-name">Bar Chart</h3>
      </div>
    </div>
  </div>

</div>
</div>

<!-- ── Research Section ──────────────────────── -->
<div id="section-research" class="section-panel">
<div class="research-section">
  <div class="sys-header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" stroke-width="1.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <h2 class="sys-title">Dibs Research</h2>
    <span class="sys-sub">${data.research ? data.research.findings.length + ' findings / ' + data.research.themes.length + ' themes / ' + (data.research.personas?.length || 0) + ' personas / ' + (data.research.sources?.length || 0) + ' sources' : 'No research data'}</span>
  </div>

  ${data.research ? (() => {
    const r = data.research;
    const findings = r.findings;
    const highCount = findings.filter((i: { confidence: string }) => i.confidence === 'high').length;
    const medCount = findings.filter((i: { confidence: string }) => i.confidence === 'medium').length;
    const lowCount = findings.filter((i: { confidence: string }) => i.confidence === 'low').length;
    const totalIns = findings.length;
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
      <div class="res-stat"><div class="res-stat-num">${totalIns}</div><div class="res-stat-label">Findings</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.themes.length}</div><div class="res-stat-label">Themes</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.personas?.length || 0}</div><div class="res-stat-label">Personas</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.sources?.length || 0}</div><div class="res-stat-label">Sources</div></div>
      <div class="res-stat"><div class="res-stat-num">${highCount}</div><div class="res-stat-label">High Confidence</div></div>
      <div class="res-stat"><div class="res-stat-num">${r.quality?.overallScore || 0}</div><div class="res-stat-label">Quality</div></div>
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
      ${findings.filter((i: { confidence: string }) => i.confidence === 'high').slice(0, 5).map((ins: { statement: string; source?: string }) => `
      <div class="res-insight" style="cursor:default">
        <div class="res-insight-text">${esc(ins.statement)}</div>
        <div class="res-insight-meta">
          <span class="res-src">${esc(ins.source || 'research')}</span>
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
      ${r.themes.map((t: { name: string; description: string; frequency: number; findingIds: string[] }) => `
      <div class="res-theme-card">
        <div class="res-theme-head">
          <div class="res-theme-name">${esc(t.name)}</div>
          <span class="res-theme-freq">${t.frequency} findings</span>
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
    ${findings.map((ins: { id: string; statement: string; source?: string; confidence: string; tags: string[]; evidence?: string[] }, idx: number) => `
    <div class="res-insight" data-conf="${ins.confidence}" onclick="toggleEvidence(${idx})">
      <div style="display:flex;gap:8px;align-items:flex-start">
        <span style="font-family:var(--mono);font-size:9px;color:var(--fg-muted);min-width:18px;padding-top:2px">${idx + 1}.</span>
        <div style="flex:1">
          <div class="res-insight-text">${esc(ins.statement)}</div>
          <div class="res-insight-meta">
            <span class="res-src">${esc(ins.source || 'research')}</span>
            <span class="res-conf-badge res-conf-${ins.confidence}">${ins.confidence.toUpperCase()}</span>
          </div>
          ${ins.tags ? `<div class="res-insight-tags">${ins.tags.map((t: string) => `<span class="res-tag">${esc(t)}</span>`).join('')}</div>` : ''}
          <div class="res-evidence" id="ev-${idx}">
            ${(ins.evidence || []).map((e: string) => `<div class="res-ev-item">${esc(e)}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>`).join("")}
  </div>

`;
  })() : `<div style="padding:24px;color:var(--fg-muted)">No research data available. Run <code>memi research</code> to generate findings.</div>`}
</div>
</div>

<!-- ── Specs Section ─────────────────────────── -->
<div id="section-specs" class="section-panel">
<div class="research-section">
  <div class="sys-header">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C4A35A" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
    <h2 class="sys-title">Product Specifications</h2>
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
<div class="hero">
  <div class="hero-badge">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/></svg>
    VERSION HISTORY
  </div>
  <h2 class="hero-heading">Version Changelog</h2>
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
  <div style="font-size:10px;color:var(--fg-muted);letter-spacing:0.5px">Registry-first design system workspace</div>
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
        <div class="decision-text"><strong>Agent-Ready Handoff.</strong> Multiple Codex, Claude Code, or MCP-connected clients can share the same design system context. Registry state stays portable instead of being trapped in one prompt thread.</div>
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
          <div class="commit-msg">Initial commit: Ark &mdash; code-native design system workspace foundation</div>
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
        <div class="decision-text"><strong>Built for agent workflows.</strong> CLAUDE.md + skills/ directory teach agents how to operate autonomously. Superagent mode by default.</div>
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

</main>

<!-- ── Footer ────────────────────────────────── -->
<footer class="memoire-footer">
  <div>MÉMOIRE preview &mdash; code-native design quality workspace</div>
  <div>
    <a href="#changelog" onclick="showSection('changelog',document.querySelector('.hdr-nav-link[href=&quot;#changelog&quot;]'));return false">Changelog</a>
  </div>
</footer>

<!-- ── Agent Command Palette (Cmd+K) ────────── -->
<div id="cmd-palette" class="cmd-palette hidden">
  <div class="cmd-overlay" onclick="closePalette()"></div>
  <div class="cmd-modal">
    <div class="cmd-header">
      <span class="cmd-icon">&#9670;</span>
      <input id="cmd-input" class="cmd-input" type="text" placeholder="Ask the agent to modify your design system..." autocomplete="off" spellcheck="false" />
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
    <div id="cmd-status" class="cmd-status hidden" role="status" aria-live="polite" aria-atomic="true"></div>
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
<div id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>

<!-- ── Pipeline Status (screen-reader region) ── -->
<div id="pipeline-status" role="status" aria-live="polite" aria-atomic="true" class="sr-only"></div>

<!-- ── Figma Connection Status Bar ──────────── -->
<div id="figma-bar" class="figma-bar" role="status" aria-live="polite" aria-atomic="true">
  <div class="figma-status-stack">
    <div class="figma-status-row">
      <span id="figma-dot" class="figma-dot"></span>
      <span id="figma-status" class="figma-status-label">Figma: checking...</span>
      <span id="figma-meta" class="figma-meta">Loading widget state</span>
    </div>
    <div id="figma-summary" class="figma-summary">
      <span id="figma-summary-bridge" class="figma-chip">Bridge: --</span>
      <span id="figma-summary-jobs" class="figma-chip">Jobs: --</span>
      <span id="figma-summary-selection" class="figma-chip">Selection: --</span>
      <span id="figma-summary-agents" class="figma-chip">Agents: --</span>
      <span id="figma-summary-sync" class="figma-chip">Sync: --</span>
      <span id="figma-summary-pipeline" class="figma-chip">Pipeline: --</span>
      <span id="figma-summary-registry" class="figma-chip">Registry: --</span>
      <span id="figma-summary-heal" class="figma-chip">Healer: --</span>
    </div>
  </div>
  <button class="figma-sync-btn" onclick="runAgent('Sync all changes to Figma')">SYNC</button>
</div>

<!-- ── Agent Activity Log ──────────────────── -->
<div id="agent-log" class="agent-log hidden">
  <div class="agent-log-header">
    <span>AGENT ACTIVITY</span>
    <button onclick="toggleAgentLog()" style="background:none;border:none;color:var(--fg-muted);cursor:pointer;font-family:var(--mono)">&times;</button>
  </div>
  <div id="agent-log-body" class="agent-log-body" role="log" aria-live="polite" aria-atomic="false"></div>
</div>
<button id="agent-log-toggle" class="agent-log-toggle" onclick="toggleAgentLog()">&#9670; AGENT LOG</button>

<!-- ── Sync Conflicts Panel ──────────────────── -->
<div id="conflicts-panel" class="conflicts-panel hidden">
  <div class="conflicts-header">
    <span>SYNC CONFLICTS</span>
    <button onclick="toggleConflictsPanel()" style="background:none;border:none;color:var(--fg-muted);cursor:pointer;font-family:var(--mono)">&times;</button>
  </div>
  <div id="conflicts-body" class="conflicts-body">
    <div class="conflicts-empty">No unresolved conflicts</div>
  </div>
</div>
<button id="conflicts-toggle" class="conflicts-toggle hidden" onclick="toggleConflictsPanel()">&#9670; CONFLICTS (<span id="conflicts-count">0</span>)</button>

<!-- ── Research Panel ────────────────────────── -->
<div id="research-panel" class="research-panel hidden">
  <div class="research-panel-header">
    <span>RESEARCH</span>
    <button onclick="toggleResearchPanel()" style="background:none;border:none;color:var(--fg-muted);cursor:pointer;font-family:var(--mono)">&times;</button>
  </div>
  <div id="research-panel-body" class="research-panel-body">
    <div class="research-empty">No research data loaded</div>
  </div>
</div>
<button id="research-toggle" class="research-toggle" onclick="toggleResearchPanel()">&#9670; RESEARCH</button>


<script>
\${CLIENT_JS}
</script>
</body>
</html>`;
}
