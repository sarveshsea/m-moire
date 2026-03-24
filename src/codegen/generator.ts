/**
 * Code Generator — Produces shadcn-native React + TypeScript + Tailwind
 * components from specs. All output uses shadcn/ui primitives.
 */

import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "../engine/logger.js";
import type { ArkEvent } from "../engine/core.js";
import type { Registry, DesignSystem } from "../engine/registry.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec } from "../specs/types.js";
import type { ProjectContext } from "../engine/project-context.js";
import { generateComponent } from "./shadcn-mapper.js";
import { generateDataViz } from "./dataviz-generator.js";
import { generatePage } from "./page-generator.js";

export interface CodegenConfig {
  outputDir: string;
  registry: Registry;
  onEvent?: (event: ArkEvent) => void;
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

  async generate(spec: AnySpec, ctx: CodegenContext): Promise<CodegenResult> {
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
      specHash: simpleHash(JSON.stringify(spec)),
    });

    this.emitEvent("success", `Generated ${result.files.length} files for "${spec.name}"`);
    return result;
  }

  /**
   * Maps atomic level to output folder following Atomic Design methodology.
   * atoms → components/ui/, molecules → components/molecules/, etc.
   */
  private getAtomicDir(spec: ComponentSpec): string {
    switch (spec.level) {
      case "atom": return `components/ui/${spec.name}`;
      case "molecule": return `components/molecules/${spec.name}`;
      case "organism": return `components/organisms/${spec.name}`;
      case "template": return `components/templates/${spec.name}`;
      default: return `components/${spec.name}`;
    }
  }

  private async generateComponentFiles(
    spec: ComponentSpec,
    ctx: CodegenContext
  ): Promise<CodegenResult> {
    const code = generateComponent(spec, ctx);
    const dir = this.getAtomicDir(spec);

    return {
      entryFile: `${dir}/${spec.name}.tsx`,
      files: [
        { path: `${dir}/${spec.name}.tsx`, content: code.component },
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

  private emitEvent(type: ArkEvent["type"], message: string): void {
    this.config.onEvent?.({
      type,
      source: "codegen",
      message,
      timestamp: new Date(),
    });
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
