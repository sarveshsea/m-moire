/**
 * Research Dashboard Template — Generates the research HTML page.
 *
 * Extracted from src/commands/preview.ts.
 * Static CSS and client-side JS are loaded from adjacent files.
 */

import type { ResearchStore } from "../../research/engine.js";
import { esc } from "./types.js";
import { resolveAsset } from "./resolve-asset.js";

// ── Load static assets at module init ──────────────
const CSS = resolveAsset("research-page.css");
const CLIENT_JS = resolveAsset("research-page.client.js");

export function generateResearchDashboard(research: ResearchStore, generatedAt: string): string {
  const { findings, themes, personas, sources, summary, opportunities = [], risks = [], contradictions = [], quantitativeMetrics = [] } = research;
  const highConf = findings.filter((finding) => finding.confidence === "high");
  const medConf = findings.filter((finding) => finding.confidence === "medium");
  const lowConf = findings.filter((finding) => finding.confidence === "low");

  // Tag frequency for the tag cloud
  const tagFreq = new Map<string, number>();
  for (const finding of findings) {
    for (const t of finding.tags) {
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
<title>M\u00e9moire Research</title>
<style>
${CSS}
</style>
</head>
<body>

<div class="hdr">
  <div class="hdr-left">
    <a href="index.html" class="hdr-back">&larr; Gallery</a>
    <div class="hdr-title"><span>M\u00c9MOIRE</span> RESEARCH</div>
  </div>
  <div class="hdr-meta">UPDATED ${esc(new Date(generatedAt).toLocaleString())}</div>
</div>

<div class="stats-bar">
  <div class="stat">
    <div class="stat-val">${findings.length}</div>
    <div class="stat-label">Findings</div>
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
  <div class="stat">
    <div class="stat-val">${quantitativeMetrics.length}</div>
    <div class="stat-label">Quant Metrics</div>
  </div>
  ${research.quality ? `<div class="stat">
    <div class="stat-val">${research.quality.overallScore}</div>
    <div class="stat-label">Quality</div>
  </div>` : ""}
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

${summary ? `<div style="border:1px solid var(--border);background:var(--panel);padding:18px 20px;margin-bottom:18px">
  <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
    <div style="max-width:720px">
      <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-dim);margin-bottom:8px">Executive Summary</div>
      <div style="font-family:var(--sans);font-size:13px;line-height:1.7;color:var(--fg-soft)">${esc(summary.narrative)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(120px,1fr));gap:8px;min-width:260px">
      <div style="border:1px solid var(--border);padding:10px 12px">
        <div style="font-size:10px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.14em">Opportunities</div>
        <div style="font-size:20px;margin-top:4px">${opportunities.length}</div>
      </div>
      <div style="border:1px solid var(--border);padding:10px 12px">
        <div style="font-size:10px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.14em">Risks</div>
        <div style="font-size:20px;margin-top:4px">${risks.length}</div>
      </div>
      <div style="border:1px solid var(--border);padding:10px 12px">
        <div style="font-size:10px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.14em">Contradictions</div>
        <div style="font-size:20px;margin-top:4px">${contradictions.length}</div>
      </div>
      <div style="border:1px solid var(--border);padding:10px 12px">
        <div style="font-size:10px;color:var(--fg-dim);text-transform:uppercase;letter-spacing:.14em">Next Move</div>
        <div style="font-size:11px;line-height:1.5;margin-top:4px">${esc(summary.nextActions[0] ?? "Run synthesis to generate next actions.")}</div>
      </div>
    </div>
  </div>
</div>` : ""}

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('findings',this)">Findings (${findings.length})</button>
  <button class="tab-btn" onclick="switchTab('themes',this)">Themes (${themes.length})</button>
  ${personas.length > 0 ? `<button class="tab-btn" onclick="switchTab('personas',this)">Personas (${personas.length})</button>` : ""}
</div>

<!-- Findings Tab -->
<div class="tab-panel active" id="tab-findings">
  <div class="insight-list" id="insightList">
    ${findings.map((finding) => `<div class="insight" data-tags="${esc(finding.tags.join(","))}" data-confidence="${finding.confidence}">
      <div class="insight-header">
        <div class="insight-conf ${finding.confidence}" title="${finding.confidence} confidence"></div>
        <div class="insight-finding">${esc(finding.statement)}</div>
      </div>
      <div class="insight-meta">
        <span>${esc((finding.source || "").split("/").pop() || finding.source || "research")}</span>
        <span>${esc(finding.confidence)}</span>
        <span>${esc(new Date(finding.createdAt).toLocaleDateString())}</span>
      </div>
      ${(finding.evidence?.length ?? 0) > 0 ? `<div class="insight-evidence">
        <details>
          <summary>${finding.evidence?.length ?? 0} evidence point${(finding.evidence?.length ?? 0) !== 1 ? "s" : ""}</summary>
          ${(finding.evidence ?? []).slice(0, 5).map((e) => `<blockquote>${esc(e)}</blockquote>`).join("")}
          ${(finding.evidence?.length ?? 0) > 5 ? `<div style="font-size:9px;color:var(--fg-dim);padding:4px 0">+${(finding.evidence?.length ?? 0) - 5} more</div>` : ""}
        </details>
      </div>` : ""}
      ${finding.tags.length > 0 ? `<div class="insight-tags">${finding.tags.map((t) => `<span class="insight-tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>`).join("\n    ")}
    ${findings.length === 0 ? `<div class="empty-note">No findings yet. Run <code>memi research from-file</code> or <code>memi research from-stickies</code></div>` : ""}
  </div>
</div>

<!-- Themes Tab -->
<div class="tab-panel" id="tab-themes">
  <div class="themes-grid">
    ${themes.map(t => {
      const relatedFindings = findings.filter((finding) => t.findingIds.includes(finding.id));
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
        ${relatedFindings.slice(0, 3).map((finding) => `<div style="font-size:10px;padding:4px 0;border-top:1px solid var(--border);color:var(--fg-muted);font-family:var(--sans)">
          <span style="color:var(--${finding.confidence})">&bull;</span> ${esc(finding.statement.substring(0, 80))}${finding.statement.length > 80 ? "..." : ""}
        </div>`).join("")}
        ${relatedFindings.length > 3 ? `<div style="font-size:9px;color:var(--fg-dim);padding-top:4px">+${relatedFindings.length - 3} more findings</div>` : ""}
      </div>`;
    }).join("\n    ")}
    ${themes.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No themes yet. Run <code>memi research synthesize</code></div>` : ""}
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
    ${personas.length === 0 ? `<div class="empty-note" style="grid-column:1/-1">No personas yet. Run <code>memi research synthesize</code></div>` : ""}
  </div>
</div>

</div>
</div>

<script>
${CLIENT_JS}
</script>
</body>
</html>`;
}
