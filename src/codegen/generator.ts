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
import { generateDataViz } from "./dataviz-generator.js";
import { generatePage } from "./page-generator.js";
import { atomicLevelToFolder } from "../utils/naming.js";

export interface CodegenConfig {
  outputDir: string;
  registry: Registry;
  onEvent?: (event: MemoireEvent) => void;
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

    const code = generateComponent(spec, ctx);
    const dir = this.getAtomicDir(spec);
    const story = generateStory(spec);

    return {
      entryFile: `${dir}/${spec.name}.tsx`,
      files: [
        { path: `${dir}/${spec.name}.tsx`, content: code.component },
        { path: `${dir}/${spec.name}.stories.tsx`, content: story },
        { path: `${dir}/index.ts`, content: code.barrel },
      ],
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
