/**
 * Cinematic Prototype Exporter — Generates Playwright scripts
 * that record interactive walkthroughs of generated pages as
 * video, screenshots, and animated GIF prototypes.
 *
 * Takes a page spec and produces a Playwright test that:
 * 1. Launches the preview server
 * 2. Navigates through each section
 * 3. Records video of interactions
 * 4. Captures screenshots at each state
 * 5. Generates a prototype HTML with transitions
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import type { PageSpec, DataVizSpec, ComponentSpec, AnySpec } from "../specs/types.js";
import type { Registry } from "../engine/registry.js";

export interface PrototypeConfig {
  outputDir: string;
  previewUrl: string;
  viewport: { width: number; height: number };
  transitions: TransitionStyle;
  recordVideo: boolean;
  captureScreenshots: boolean;
}

export type TransitionStyle =
  | "fade"
  | "slide-left"
  | "slide-up"
  | "zoom"
  | "morph"
  | "cinematic";

export interface PrototypeScene {
  name: string;
  url: string;
  waitFor?: string; // CSS selector to wait for
  interactions: PrototypeInteraction[];
  duration: number; // ms to stay on this scene
  transition: TransitionStyle;
}

export interface PrototypeInteraction {
  type: "click" | "hover" | "scroll" | "type" | "wait" | "screenshot";
  target?: string; // CSS selector
  value?: string;
  delay?: number; // ms before this interaction
}

/**
 * Generate a Playwright script for a cinematic prototype walkthrough.
 */
export function generatePlaywrightPrototype(
  scenes: PrototypeScene[],
  config: PrototypeConfig
): string {
  const lines: string[] = [];

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`test.describe('Ark Cinematic Prototype', () => {`);
  lines.push(`  test.use({`);
  lines.push(`    viewport: { width: ${config.viewport.width}, height: ${config.viewport.height} },`);

  if (config.recordVideo) {
    lines.push(`    video: {`);
    lines.push(`      mode: 'on',`);
    lines.push(`      size: { width: ${config.viewport.width}, height: ${config.viewport.height} },`);
    lines.push(`    },`);
  }

  lines.push(`  });`);
  lines.push(``);
  lines.push(`  test('prototype walkthrough', async ({ page }) => {`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    lines.push(``);
    lines.push(`    // ── Scene ${i + 1}: ${scene.name} ──`);
    lines.push(`    await page.goto('${scene.url}');`);

    if (scene.waitFor) {
      lines.push(`    await page.waitForSelector('${scene.waitFor}');`);
    }

    lines.push(`    await page.waitForTimeout(500); // Let animations settle`);

    if (config.captureScreenshots) {
      lines.push(`    await page.screenshot({ path: 'prototype/scene-${i + 1}-${slugify(scene.name)}.png', fullPage: false });`);
    }

    for (const interaction of scene.interactions) {
      if (interaction.delay) {
        lines.push(`    await page.waitForTimeout(${interaction.delay});`);
      }

      switch (interaction.type) {
        case "click":
          lines.push(`    await page.click('${interaction.target}');`);
          break;
        case "hover":
          lines.push(`    await page.hover('${interaction.target}');`);
          break;
        case "scroll":
          lines.push(`    await page.evaluate(() => window.scrollBy(0, ${interaction.value ?? 300}));`);
          break;
        case "type":
          lines.push(`    await page.fill('${interaction.target}', '${interaction.value}');`);
          break;
        case "wait":
          lines.push(`    await page.waitForTimeout(${interaction.value ?? 1000});`);
          break;
        case "screenshot":
          lines.push(`    await page.screenshot({ path: 'prototype/${slugify(scene.name)}-${interaction.value ?? "state"}.png' });`);
          break;
      }
    }

    // Hold on scene for specified duration
    lines.push(`    await page.waitForTimeout(${scene.duration});`);

    if (config.captureScreenshots && scene.interactions.length > 0) {
      lines.push(`    await page.screenshot({ path: 'prototype/scene-${i + 1}-${slugify(scene.name)}-after.png', fullPage: false });`);
    }
  }

  lines.push(`  });`);
  lines.push(`});`);

  return lines.join("\n");
}

/**
 * Generate a cinematic HTML prototype that plays through scenes
 * with CSS transitions, auto-playing like a presentation.
 */
export function generateHtmlPrototype(
  scenes: PrototypeScene[],
  config: PrototypeConfig
): string {
  const transitionCss = getTransitionCss(config.transitions);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Ark Prototype</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: #0a0a0a;
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    overflow: hidden;
    width: 100vw;
    height: 100vh;
  }

  .prototype-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .scene {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    ${transitionCss}
  }

  .scene.active {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .scene iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .prototype-controls {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.8);
    padding: 8px 16px;
    border-radius: 24px;
    backdrop-filter: blur(10px);
  }

  .scene-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    cursor: pointer;
    transition: all 0.3s;
  }

  .scene-dot.active {
    background: white;
    transform: scale(1.3);
  }

  .scene-label {
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    padding: 6px 16px;
    border-radius: 16px;
    backdrop-filter: blur(10px);
    transition: opacity 0.5s;
  }

  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 2px;
    background: linear-gradient(90deg, #6366f1, #818cf8);
    z-index: 1001;
    transition: width 0.1s linear;
  }
</style>
</head>
<body>
<div class="progress-bar" id="progress"></div>
<div class="scene-label" id="sceneLabel"></div>
<div class="prototype-container" id="container">
${scenes.map((scene, i) => `  <div class="scene${i === 0 ? " active" : ""}" id="scene-${i}">
    <iframe src="${scene.url}" loading="${i === 0 ? "eager" : "lazy"}"></iframe>
  </div>`).join("\n")}
</div>
<div class="prototype-controls" id="controls">
${scenes.map((_, i) => `  <div class="scene-dot${i === 0 ? " active" : ""}" onclick="goToScene(${i})"></div>`).join("\n")}
</div>

<script>
const scenes = ${JSON.stringify(scenes.map(s => ({ name: s.name, duration: s.duration })))};
let current = 0;
let timer = null;
let elapsed = 0;
let progressInterval = null;

function goToScene(index) {
  if (index === current) return;

  document.querySelectorAll('.scene').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
  document.querySelectorAll('.scene-dot').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });

  document.getElementById('sceneLabel').textContent = scenes[index].name;
  current = index;
  elapsed = 0;

  clearTimeout(timer);
  startAutoAdvance();
}

function startAutoAdvance() {
  const scene = scenes[current];
  elapsed = 0;

  clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    elapsed += 50;
    const pct = ((current + elapsed / scene.duration) / scenes.length) * 100;
    document.getElementById('progress').style.width = Math.min(pct, 100) + '%';
  }, 50);

  timer = setTimeout(() => {
    if (current < scenes.length - 1) {
      goToScene(current + 1);
    } else {
      clearInterval(progressInterval);
      document.getElementById('progress').style.width = '100%';
    }
  }, scene.duration);
}

// Keyboard controls
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    if (current < scenes.length - 1) goToScene(current + 1);
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (current > 0) goToScene(current - 1);
  }
});

// Start
document.getElementById('sceneLabel').textContent = scenes[0].name;
startAutoAdvance();
</script>
</body>
</html>`;
}

/**
 * Build scenes from page specs for automatic prototype generation.
 */
export async function buildScenesFromSpecs(
  registry: Registry,
  previewUrl: string
): Promise<PrototypeScene[]> {
  const specs = await registry.getAllSpecs();
  const scenes: PrototypeScene[] = [];

  // Component gallery as first scene
  scenes.push({
    name: "Component Gallery",
    url: previewUrl,
    duration: 4000,
    transition: "fade",
    interactions: [
      { type: "wait", value: "1000" },
      { type: "scroll", value: "300", delay: 1000 },
    ],
  });

  // Each page spec becomes a scene
  const pages = specs.filter((s) => s.type === "page");
  for (const page of pages) {
    scenes.push({
      name: page.name,
      url: `${previewUrl}/pages/${page.name}`,
      duration: 5000,
      transition: "slide-left",
      interactions: [
        { type: "wait", value: "500" },
        { type: "scroll", value: "500", delay: 2000 },
      ],
    });
  }

  // DataViz specs get their own scenes
  const dataviz = specs.filter((s) => s.type === "dataviz");
  for (const dv of dataviz) {
    scenes.push({
      name: `DataViz: ${dv.name}`,
      url: `${previewUrl}/dataviz/${dv.name}`,
      duration: 4000,
      transition: "zoom",
      interactions: [
        { type: "hover", target: ".recharts-surface", delay: 1000 },
      ],
    });
  }

  return scenes;
}

/**
 * Write all prototype files to disk.
 */
export async function exportPrototype(
  scenes: PrototypeScene[],
  config: PrototypeConfig
): Promise<{ playwright: string; html: string }> {
  await mkdir(config.outputDir, { recursive: true });

  const playwrightScript = generatePlaywrightPrototype(scenes, config);
  const playwrightPath = join(config.outputDir, "prototype.spec.ts");
  await writeFile(playwrightPath, playwrightScript);

  const htmlPrototype = generateHtmlPrototype(scenes, config);
  const htmlPath = join(config.outputDir, "prototype.html");
  await writeFile(htmlPath, htmlPrototype);

  return { playwright: playwrightPath, html: htmlPath };
}

// ── Helpers ────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getTransitionCss(style: TransitionStyle): string {
  switch (style) {
    case "fade":
      return "transition: opacity 0.8s ease-in-out;";
    case "slide-left":
      return `transition: opacity 0.6s ease, transform 0.6s ease;
    transform: translateX(40px);`;
    case "slide-up":
      return `transition: opacity 0.6s ease, transform 0.6s ease;
    transform: translateY(40px);`;
    case "zoom":
      return `transition: opacity 0.6s ease, transform 0.6s ease;
    transform: scale(0.95);`;
    case "morph":
      return `transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1);
    transform: scale(0.98) translateY(10px);`;
    case "cinematic":
      return `transition: opacity 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), transform 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    transform: scale(1.02);
    filter: blur(4px);`;
    default:
      return "transition: opacity 0.5s ease;";
  }
}
