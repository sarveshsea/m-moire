/**
 * Code Generator — Orchestrates spec-to-code generation for all spec types.
 *
 * Inputs:
 *   - AnySpec (ComponentSpec | PageSpec | DataVizSpec | DesignSpec | IASpec)
 *   - CodegenContext: project context + design system tokens
 *   - CodegenConfig: output directory, registry reference, optional event callback
 *
 * Outputs:
 *   - CodegenResult: entryFile path, list of written files, original spec
 *
 * Key responsibilities:
 *   1. Hash-based cache invalidation — skip unchanged specs to avoid redundant writes
 *   2. Route to sub-generators (shadcn-mapper, dataviz-generator, page-generator)
 *   3. Write generated files to disk under atomic-design-correct output folders
 *   4. Check that referenced shadcn components are installed in components/ui/
 *   5. Record generation state in the registry for status/watch commands
 *
 * All output uses shadcn/ui primitives + Tailwind utility classes.
 * No CSS modules, styled-components, or inline style objects are emitted.
 */

import { createHash } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "../engine/logger.js";
import type { MemoireEvent } from "../engine/core.js";
import type { Registry, DesignSystem } from "../engine/registry.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec } from "../specs/types.js";
import type { ProjectContext } from "../engine/project-context.js";
import { generateComponent, generateStory } from "./shadcn-mapper.js";
import { generateVueComponent } from "./vue-mapper.js";
import { generateSvelteComponent } from "./svelte-mapper.js";
import { generateDataViz } from "./dataviz-generator.js";
import { generatePage } from "./page-generator.js";
import { atomicLevelToFolder } from "../utils/naming.js";
import { expandAxes } from "../specs/variations.js";

function pascalIdentifier(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
    .replace(/[^A-Za-z0-9_]/g, "");
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c),
  );
}

function renderVariantGridHTML(
  name: string,
  axes: string[],
  variants: Array<{ id: string; hash: string; axisValues: Record<string, string> }>,
): string {
  const rows = variants.map((v) => {
    const axisCells = axes
      .map((a) => `<td><code>${escapeHTML(v.axisValues[a] ?? "")}</code></td>`)
      .join("");
    return `<tr>
      <td><strong>${escapeHTML(v.id)}</strong></td>
      ${axisCells}
      <td><code>${escapeHTML(v.hash)}</code></td>
      <td><a href="./${escapeHTML(v.id)}.tsx">${escapeHTML(v.id)}.tsx</a></td>
    </tr>`;
  }).join("\n");

  const axisHeaders = axes.map((a) => `<th>${escapeHTML(a)}</th>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHTML(name)} — variants</title>
<style>
  body { font: 14px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2rem; max-width: 960px; margin: 0 auto; }
  h1 { margin: 0 0 0.25rem; font-size: 1.25rem; }
  .sub { color: #6b7280; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #e5e7eb; }
  th { font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; }
  code { background: #f3f4f6; padding: 1px 6px; border-radius: 3px; font-size: 12px; }
  a { color: #0f172a; }
</style>
</head>
<body>
  <h1>${escapeHTML(name)}</h1>
  <div class="sub">${variants.length} variants · ${axes.join(" × ")}</div>
  <table>
    <thead>
      <tr>
        <th>Variant</th>
        ${axisHeaders}
        <th>Hash</th>
        <th>File</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>`;
}

export interface CodegenConfig {
  outputDir: string;
  registry: Registry;
  onEvent?: (event: MemoireEvent) => void;
  /** Skip .stories.tsx generation — useful for projects not using Storybook */
  noStories?: boolean;
  /** Output framework: react (default), vue, svelte */
  framework?: "react" | "vue" | "svelte";
}

export interface CodegenResult {
  entryFile: string;
  files: { path: string; content: string }[];
  spec: AnySpec;
}

export interface CodegenContext {
  project: ProjectContext;
  designSystem: DesignSystem;
}

export class CodeGenerator {
  private log = createLogger("codegen");
  private config: CodegenConfig;

  constructor(config: CodegenConfig) {
    this.config = config;
  }

  /** Override generation options at runtime (e.g. --no-stories, --framework from CLI). */
  setOptions(opts: Partial<Pick<CodegenConfig, "noStories" | "framework">>): void {
    if (opts.noStories !== undefined) this.config.noStories = opts.noStories;
    if (opts.framework !== undefined) this.config.framework = opts.framework;
  }

  /**
   * Generate code from a spec and write all output files to disk.
   *
   * Skips generation when spec + design system hash matches a previous run.
   * Returns a CodegenResult describing the written files.
   *
   * @param spec - Any Mémoire spec (component, page, dataviz, design, ia).
   * @param ctx  - Codegen context with project and design system data.
   */
  async generate(spec: AnySpec, ctx: CodegenContext): Promise<CodegenResult> {
    // Hash-based caching — skip generation when spec + design system unchanged
    const specHash = computeSpecHash(spec, ctx);
    const previousState = this.config.registry.getGenerationState(spec.name);
    if (previousState && previousState.specHash === specHash) {
      this.emitEvent("info", `Skipping "${spec.name}" — skipped — unchanged`);
      return {
        entryFile: previousState.files[0] ?? "",
        files: previousState.files.map((path) => ({ path, content: "" })),
        spec,
      };
    }

    this.emitEvent("info", `Generating code for "${spec.name}" (${spec.type})...`);

    let result: CodegenResult;

    switch (spec.type) {
      case "component":
        result = await this.generateComponentFiles(spec, ctx);
        break;
      case "page":
        result = await this.generatePageFiles(spec, ctx);
        break;
      case "dataviz":
        result = await this.generateDataVizFiles(spec, ctx);
        break;
      case "design":
      case "ia":
        this.emitEvent("info", `Skipping "${spec.name}" — ${spec.type} specs are reference-only, no code generated`);
        return {
          entryFile: "",
          files: [],
          spec,
        };
      default:
        throw new Error(`Unknown spec type: ${(spec as { type: string }).type}`);
    }

    // Write all files
    for (const file of result.files) {
      const fullPath = join(this.config.outputDir, file.path);
      await mkdir(join(fullPath, ".."), { recursive: true });
      await writeFile(fullPath, file.content);
    }

    // Record generation
    await this.config.registry.recordGeneration({
      specName: spec.name,
      generatedAt: new Date().toISOString(),
      files: result.files.map((f) => f.path),
      specHash,
    });

    this.emitEvent("success", `Generated ${result.files.length} files for "${spec.name}"`);
    return result;
  }

  /**
   * Preview mode — generates code in memory without writing files to disk.
   * Returns the same CodegenResult so callers can inspect file paths and contents.
   */
  async preview(spec: AnySpec, ctx: CodegenContext): Promise<CodegenResult> {
    this.emitEvent("info", `Previewing code for "${spec.name}" (${spec.type})...`);

    switch (spec.type) {
      case "component":
        return this.generateComponentFiles(spec, ctx);
      case "page":
        return this.generatePageFiles(spec, ctx);
      case "dataviz":
        return this.generateDataVizFiles(spec, ctx);
      case "design":
      case "ia":
        this.emitEvent("info", `Skipping "${spec.name}" — ${spec.type} specs are reference-only, no code generated`);
        return { entryFile: "", files: [], spec };
      default:
        throw new Error(`Unknown spec type: ${(spec as { type: string }).type}`);
    }
  }

  /**
   * Maps atomic level to output folder following Atomic Design methodology.
   * Delegates to the shared atomicLevelToFolder() utility.
   */
  private getAtomicDir(spec: ComponentSpec): string {
    return `${atomicLevelToFolder(spec.level)}/${spec.name}`;
  }

  /**
   * Check that each shadcnBase component exists in the project's components/ui/.
   * Emits a warn event for any that are missing so the user can install them.
   */
  private async checkShadcnInstalled(spec: ComponentSpec): Promise<void> {
    const { access } = await import("fs/promises");
    const { join: pathJoin } = await import("path");

    for (const base of spec.shadcnBase) {
      const kebab = base
        .replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c.toLowerCase() : `-${c.toLowerCase()}`));
      const candidates = [
        pathJoin(this.config.outputDir, "..", "components", "ui", `${kebab}.tsx`),
        pathJoin(this.config.outputDir, "..", "node_modules", "@shadcn", "ui", `${kebab}.tsx`),
      ];
      let found = false;
      for (const candidate of candidates) {
        try {
          await access(candidate);
          found = true;
          break;
        } catch {
          // not found at this path
        }
      }
      if (!found) {
        this.emitEvent(
          "warn",
          `${base} not found in components/ui/ — run: npx shadcn@latest add ${kebab}`
        );
      }
    }
  }

  private async generateComponentFiles(
    spec: ComponentSpec,
    ctx: CodegenContext
  ): Promise<CodegenResult> {
    // Code Connect check — warn if already mapped to codebase
    if (spec.codeConnect?.mapped && spec.codeConnect?.codebasePath) {
      this.emitEvent("warn",
        `Component "${spec.name}" is already mapped to ${spec.codeConnect.codebasePath} via Code Connect. ` +
        `Consider using the existing implementation instead of regenerating.`
      );
    }

    // shadcn install check — warn for any missing base components
    await this.checkShadcnInstalled(spec);

    const framework = this.config.framework ?? "react";
    const dir = this.getAtomicDir(spec);
    const files: { path: string; content: string }[] = [];

    if (framework === "vue") {
      const code = generateVueComponent(spec, ctx.designSystem?.tokens);
      files.push(
        { path: `${dir}/${spec.name}.vue`, content: code.component },
        { path: `${dir}/index.ts`, content: code.barrel },
      );
    } else if (framework === "svelte") {
      const code = generateSvelteComponent(spec, ctx.designSystem?.tokens);
      files.push(
        { path: `${dir}/${spec.name}.svelte`, content: code.component },
        { path: `${dir}/index.ts`, content: code.barrel },
      );
    } else if (spec.variantAxes && Object.keys(spec.variantAxes).length > 0) {
      return this.generateVariantFiles(spec, ctx, dir);
    } else {
      const code = generateComponent(spec, ctx);
      files.push(
        { path: `${dir}/${spec.name}.tsx`, content: code.component },
        { path: `${dir}/index.ts`, content: code.barrel },
      );
      if (!this.config.noStories) {
        const story = generateStory(spec);
        files.splice(1, 0, { path: `${dir}/${spec.name}.stories.tsx`, content: story });
      }
    }

    return {
      entryFile: `${dir}/${spec.name}.tsx`,
      files,
      spec,
    };
  }

  /**
   * Variation-aware component generation. When `spec.variantAxes` is declared,
   * expand the cartesian product and emit one file per variant under
   * `<dir>/variants/{id}.tsx`, a shared barrel, a Storybook story with one
   * export per variant, and a `variants/manifest.json` for the preview gallery.
   *
   * `priorVariants` context is threaded through per-variant generation so any
   * future AI-augmented codegen path can diversify against already-generated
   * siblings. Today the template generator ignores the context but the hook
   * is in place.
   */
  private async generateVariantFiles(
    spec: ComponentSpec,
    ctx: CodegenContext,
    dir: string,
  ): Promise<CodegenResult> {
    const tokenVersion = ctx.designSystem?.tokens?.length
      ? String(ctx.designSystem.tokens.length)
      : "";
    const variants = expandAxes(spec, tokenVersion);
    if (variants.length === 0) {
      // Declared axes were empty arrays — fall back to single-file path.
      const code = generateComponent(spec, ctx);
      return {
        entryFile: `${dir}/${spec.name}.tsx`,
        files: [
          { path: `${dir}/${spec.name}.tsx`, content: code.component },
          { path: `${dir}/index.ts`, content: code.barrel },
        ],
        spec,
      };
    }

    const files: { path: string; content: string }[] = [];

    // Two-round dispatch: round 1 gets no prior context, round 2 sees round 1's
    // output so any AI-augmented generator can diversify against siblings.
    // Each round runs fully in parallel via Promise.all.
    const round1 = variants.slice(0, Math.max(1, Math.ceil(variants.length / 2)));
    const round2 = variants.slice(round1.length);

    const emitOne = async (
      variant: typeof variants[number],
      priorVariants: Array<{ axisValues: Record<string, string>; code: string }>,
    ) => {
      const perVariantSpec: ComponentSpec = { ...spec, variants: [variant.id] };
      const code = generateComponent(perVariantSpec, ctx, {
        axisValues: variant.axisValues,
        priorVariants,
      });
      return { variant, code };
    };

    const round1Results = await Promise.all(round1.map((v) => emitOne(v, [])));
    for (const r of round1Results) {
      files.push({ path: `${dir}/variants/${r.variant.id}.tsx`, content: r.code.component });
    }

    const priorForRound2 = round1Results.map((r) => ({
      axisValues: r.variant.axisValues,
      code: r.code.component,
    }));
    const round2Results = await Promise.all(round2.map((v) => emitOne(v, priorForRound2)));
    for (const r of round2Results) {
      files.push({ path: `${dir}/variants/${r.variant.id}.tsx`, content: r.code.component });
    }

    // Barrel re-exports every variant under its pascalCased id, plus the
    // first variant aliased as the component's canonical name so existing
    // `import { Button } from "..."` call sites still resolve.
    const barrel = [
      `// Generated by Memoire · variant set for ${spec.name}`,
      ...variants.map((v) =>
        `export { ${spec.name} as ${pascalIdentifier(v.id)} } from "./variants/${v.id}.js";`,
      ),
      `export { ${spec.name} } from "./variants/${variants[0].id}.js";`,
      "",
    ].join("\n");
    files.push({ path: `${dir}/index.ts`, content: barrel });

    // One Storybook story per variant — reuse existing generateStory by
    // synthesizing a spec whose `variants` list is the expanded ids.
    if (!this.config.noStories) {
      const storySpec: ComponentSpec = {
        ...spec,
        variants: variants.map((v) => v.id),
      };
      files.push({
        path: `${dir}/${spec.name}.stories.tsx`,
        content: generateStory(storySpec),
      });
    }

    // Manifest consumed by the preview gallery to render the grid.
    const axisNames = Object.keys(spec.variantAxes ?? {}).sort();
    const manifest = {
      component: spec.name,
      axes: axisNames,
      variants: variants.map((v) => ({
        id: v.id,
        hash: v.hash,
        axisValues: v.axisValues,
        file: `variants/${v.id}.tsx`,
      })),
      generatedAt: new Date().toISOString(),
    };
    files.push({
      path: `${dir}/variants/manifest.json`,
      content: JSON.stringify(manifest, null, 2),
    });

    // Static variant-grid page — viewable with `memi preview` without any
    // server-side template changes. Shows one card per variant labeled with
    // its axis values and source file path.
    files.push({
      path: `${dir}/variants/index.html`,
      content: renderVariantGridHTML(spec.name, axisNames, variants),
    });

    this.emitEvent("success", `Expanded "${spec.name}" into ${variants.length} variants`);

    return {
      entryFile: `${dir}/variants/${variants[0].id}.tsx`,
      files,
      spec,
    };
  }

  private async generatePageFiles(
    spec: PageSpec,
    ctx: CodegenContext
  ): Promise<CodegenResult> {
    const code = generatePage(spec, ctx);
    const dir = `pages/${spec.name}`;

    return {
      entryFile: `${dir}/${spec.name}.tsx`,
      files: [
        { path: `${dir}/${spec.name}.tsx`, content: code.page },
        { path: `${dir}/index.ts`, content: code.barrel },
      ],
      spec,
    };
  }

  private async generateDataVizFiles(
    spec: DataVizSpec,
    ctx: CodegenContext
  ): Promise<CodegenResult> {
    const code = generateDataViz(spec, ctx);
    const dir = `dataviz/${spec.name}`;

    return {
      entryFile: `${dir}/${spec.name}.tsx`,
      files: [
        { path: `${dir}/${spec.name}.tsx`, content: code.chart },
        { path: `${dir}/index.ts`, content: code.barrel },
      ],
      spec,
    };
  }

  private emitEvent(type: MemoireEvent["type"], message: string): void {
    this.config.onEvent?.({
      type,
      source: "codegen",
      message,
      timestamp: new Date(),
    });
  }
}

function computeSpecHash(spec: AnySpec, ctx: CodegenContext): string {
  return createHash("sha256")
    .update(JSON.stringify(spec) + JSON.stringify(ctx.designSystem.tokens.length))
    .digest("hex");
}
