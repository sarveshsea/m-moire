/**
 * `memi design-doc <url>` — Extract a design system from any public URL
 * and generate a structured DESIGN.md file.
 *
 * Fetches HTML + stylesheets, parses CSS tokens, then uses Claude to
 * synthesize a clean DESIGN.md covering colors, typography, spacing,
 * components, voice, and a Tailwind config sketch.
 *
 * Output is usable as AI context for `memi compose` or any Claude prompt.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fetchPageAssets, parseCSSTokens, type RawDesignTokens } from "../research/css-extractor.js";
import { getAI, hasAI } from "../ai/client.js";

export interface DesignDocPayload {
  status: "completed" | "failed";
  url: string;
  output: string;
  spec?: string;
  cssVarCount: number;
  colorCount: number;
  elapsedMs: number;
  error?: string;
}

export function registerDesignDocCommand(program: Command, engine: MemoireEngine) {
  program
    .command("design-doc <url>")
    .description("Extract design system from a URL and generate DESIGN.md")
    .option("-o, --output <path>", "Output path for DESIGN.md", "./DESIGN.md")
    .option("--spec", "Also write a DesignSpec JSON to specs/")
    .option("--json", "Output results as JSON")
    .action(async (url: string, opts: { output: string; spec?: boolean; json?: boolean }) => {
      const start = Date.now();
      await engine.init();

      if (!opts.json) {
        console.log(`\n  Extracting design system from ${url}...\n`);
      }

      try {
        // 1. Fetch page assets (HTML + CSS)
        if (!opts.json) console.log("  · Fetching HTML and stylesheets...");
        const assets = await fetchPageAssets(url);

        if (!assets.html && assets.cssBlocks.length === 0) {
          throw new Error(`Could not fetch ${url} — check the URL and try again`);
        }

        // 2. Parse CSS tokens
        const tokens = parseCSSTokens(assets.cssBlocks);

        if (!opts.json) {
          console.log(`  · Parsed ${Object.keys(tokens.cssVars).length} CSS variables, ${tokens.colors.length} colors, ${tokens.fonts.length} fonts`);
        }

        // 3. Generate DESIGN.md via Claude (or fallback to raw extraction)
        let content: string;

        if (hasAI()) {
          if (!opts.json) console.log("  · Synthesizing with Claude...");
          content = await synthesizeWithAI(url, assets.title, tokens);
        } else {
          if (!opts.json) console.log("  · No ANTHROPIC_API_KEY — generating from raw extraction...");
          content = generateFromRaw(url, assets.title, tokens);
        }

        // 4. Write DESIGN.md
        const outputPath = join(engine.config.projectRoot, opts.output);
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, content, "utf-8");

        // 5. Optionally write DesignSpec JSON
        let specPath: string | undefined;
        if (opts.spec) {
          const hostname = new URL(url).hostname.replace(/\./g, "-");
          const specName = `design-${hostname}`;
          specPath = join(engine.config.projectRoot, "specs", "design", `${specName}.json`);
          const spec = buildDesignSpec(specName, url, tokens);
          await mkdir(dirname(specPath), { recursive: true });
          await writeFile(specPath, JSON.stringify(spec, null, 2), "utf-8");
        }

        const elapsed = Date.now() - start;

        if (opts.json) {
          const payload: DesignDocPayload = {
            status: "completed",
            url,
            output: outputPath,
            ...(specPath ? { spec: specPath } : {}),
            cssVarCount: Object.keys(tokens.cssVars).length,
            colorCount: tokens.colors.length,
            elapsedMs: elapsed,
          };
          console.log(JSON.stringify(payload, null, 2));
          return;
        }

        console.log(`\n  Written: ${outputPath}`);
        if (specPath) console.log(`  Spec:    ${specPath}`);
        console.log(`\n  ${(elapsed / 1000).toFixed(1)}s\n`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          const payload: DesignDocPayload = {
            status: "failed",
            url,
            output: opts.output,
            cssVarCount: 0,
            colorCount: 0,
            elapsedMs: Date.now() - start,
            error: msg,
          };
          console.log(JSON.stringify(payload, null, 2));
          process.exitCode = 1;
          return;
        }
        console.error(`\n  Error: ${msg}\n`);
        process.exitCode = 1;
      }
    });
}

// ── AI synthesis ──────────────────────────────────────────

async function synthesizeWithAI(
  url: string,
  title: string,
  tokens: RawDesignTokens,
): Promise<string> {
  const ai = getAI()!;

  // Build a compact summary of the raw tokens to stay within context limits
  const varSample = Object.entries(tokens.cssVars)
    .slice(0, 80)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const colorSample = tokens.colors.slice(0, 40).join(", ");
  const fontSample = tokens.fonts.slice(0, 10).join(" | ");
  const sizeSample = tokens.fontSizes.slice(0, 15).join(", ");
  const spacingSample = tokens.spacing.slice(0, 15).join(", ");
  const radiiSample = tokens.radii.slice(0, 10).join(", ");
  const shadowSample = tokens.shadows.slice(0, 5).join("\n");

  const system = `You are a design system analyst. You extract precise, actionable design systems from raw CSS data.
Your output is a DESIGN.md file that:
- Uses actual values from the data (not placeholders)
- Names tokens semantically (bg, fg, muted, accent, etc.)
- Is opinionated — flag bad patterns (purple gradients, excessive shadows, inconsistent radii)
- Is directly usable as an AI system prompt context for maintaining design consistency
- Covers the Tailwind config sketch with real values`;

  const userMessage = `Extract a complete DESIGN.md from this site's CSS data.

Source: ${url}
Title: ${title || url}

## CSS Custom Properties (sample of ${Object.keys(tokens.cssVars).length} total)
${varSample || "(none found)"}

## Colors (${tokens.colors.length} total)
${colorSample || "(none found)"}

## Font Families
${fontSample || "(none found)"}

## Font Sizes
${sizeSample || "(none found)"}

## Spacing Values
${spacingSample || "(none found)"}

## Border Radii
${radiiSample || "(none found)"}

## Box Shadows
${shadowSample || "(none found)"}

---

Output ONLY the DESIGN.md content, starting with:

# Design System — [site name]
> Extracted ${new Date().toISOString().split("T")[0]} · Source: ${url}

Include these sections:
## Color System
## Typography
## Spacing
## Borders & Surfaces
## Component Patterns
## Voice & Tone
## Do / Don't
## Tailwind Config Sketch

Be specific. Use actual values. No purple gradients.`;

  const response = await ai.complete({
    system,
    messages: [{ role: "user", content: userMessage }],
    model: "deep",
    maxTokens: 4096,
  });

  return response.content.trim();
}

// ── Raw fallback (no AI) ──────────────────────────────────

function generateFromRaw(url: string, title: string, tokens: RawDesignTokens): string {
  const date = new Date().toISOString().split("T")[0];
  const siteName = title || new URL(url).hostname;

  const cssVarSection = Object.keys(tokens.cssVars).length > 0
    ? Object.entries(tokens.cssVars)
        .slice(0, 60)
        .map(([k, v]) => `| \`${k}\` | \`${v}\` |`)
        .join("\n")
    : "| *(no CSS variables found)* | |";

  const colorSection = tokens.colors.length > 0
    ? tokens.colors.slice(0, 30).map((c) => `| \`${c}\` |`).join("\n")
    : "| *(no colors extracted)* |";

  const fontSection = tokens.fonts.length > 0
    ? tokens.fonts.slice(0, 8).map((f) => `- ${f}`).join("\n")
    : "*(no font families extracted)*";

  const spacingSection = tokens.spacing.length > 0
    ? tokens.spacing.slice(0, 12).map((s) => `\`${s}\``).join(" · ")
    : "*(no spacing values extracted)*";

  const radiiSection = tokens.radii.length > 0
    ? tokens.radii.slice(0, 8).map((r) => `\`${r}\``).join(" · ")
    : "*(no border radii extracted)*";

  return `# Design System — ${siteName}
> Extracted ${date} · Source: ${url}
> Note: Add ANTHROPIC_API_KEY to .env.local for AI-synthesized analysis

## CSS Custom Properties
| Variable | Value |
|----------|-------|
${cssVarSection}

## Colors
| Value |
|-------|
${colorSection}

## Typography
${fontSection}

**Font sizes:** ${tokens.fontSizes.slice(0, 12).join(", ") || "*(none extracted)*"}

## Spacing
${spacingSection}

## Borders & Surfaces
**Radii:** ${radiiSection}

${tokens.shadows.length > 0 ? `**Shadows:**\n${tokens.shadows.slice(0, 4).map((s) => `\`${s}\``).join("\n")}` : ""}

## Notes
- Run \`memi design-doc ${url}\` with ANTHROPIC_API_KEY set for full AI analysis
- See raw data above to manually build your Tailwind config
`;
}

// ── DesignSpec builder ────────────────────────────────────

function buildDesignSpec(name: string, url: string, tokens: RawDesignTokens): object {
  const colorEntries = tokens.colors.slice(0, 20).map((val, i) => ({
    name: `color-${i + 1}`,
    value: val,
    usage: "extracted from CSS",
  }));

  // Pull typography from CSS vars where possible
  const typography = tokens.fonts.slice(0, 5).map((font, i) => ({
    element: i === 0 ? "body" : i === 1 ? "heading" : `text-${i}`,
    fontFamily: font,
  }));

  const radiiRecord: Record<string, number> = {};
  tokens.radii.slice(0, 6).forEach((r, i) => {
    const numeric = parseFloat(r);
    if (!isNaN(numeric)) {
      radiiRecord[`r${i + 1}`] = numeric;
    }
  });

  return {
    name,
    type: "design",
    purpose: `Design system extracted from ${url}`,
    colors: colorEntries,
    typography,
    borderRadius: radiiRecord,
    shadows: tokens.shadows.slice(0, 4).map((val, i) => ({
      element: `shadow-${i + 1}`,
      value: val,
    })),
    spacing: [],
    interactions: [],
    notes: [
      `Source: ${url}`,
      `Extracted: ${new Date().toISOString()}`,
      `CSS variables: ${Object.keys(tokens.cssVars).length}`,
    ],
    tags: ["auto-extracted", "design-doc"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
