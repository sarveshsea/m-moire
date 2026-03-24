/**
 * Noche Core Engine — Central orchestrator that ties together
 * Figma bridge, research, specs, codegen, and preview.
 */

import { ProjectContext, detectProject } from "./project-context.js";
import { Registry } from "./registry.js";
import { FigmaBridge } from "../figma/bridge.js";
import { ResearchEngine } from "../research/engine.js";
import { CodeGenerator } from "../codegen/generator.js";
import { createLogger } from "./logger.js";
import { EventEmitter } from "events";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";

export interface ArkConfig {
  projectRoot: string;
  figmaToken?: string;
  figmaFileKey?: string;
  previewPort?: number;
}

export interface ArkEvent {
  type: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export class ArkEngine extends EventEmitter {
  readonly config: ArkConfig;
  readonly log = createLogger("noche");
  readonly registry: Registry;
  readonly figma: FigmaBridge;
  readonly research: ResearchEngine;
  readonly codegen: CodeGenerator;

  private _project: ProjectContext | null = null;
  private _initialized = false;

  constructor(config: ArkConfig) {
    super();
    this.config = config;
    this.registry = new Registry(join(config.projectRoot, ".ark"));
    this.figma = new FigmaBridge({
      token: config.figmaToken,
      fileKey: config.figmaFileKey,
      onEvent: (evt) => this.emit("event", evt),
    });
    this.research = new ResearchEngine({
      outputDir: join(config.projectRoot, "research"),
      onEvent: (evt) => this.emit("event", evt),
    });
    this.codegen = new CodeGenerator({
      outputDir: join(config.projectRoot, "generated"),
      registry: this.registry,
      onEvent: (evt) => this.emit("event", evt),
    });
  }

  get project(): ProjectContext | null {
    return this._project;
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    this.log.info("Initializing Noche engine...");

    // Ensure .ark directory exists
    const arkDir = join(this.config.projectRoot, ".ark");
    await mkdir(arkDir, { recursive: true });

    // Detect project context
    this._project = await detectProject(this.config.projectRoot);
    await this.saveProjectContext();

    // Load existing registry
    await this.registry.load();

    this._initialized = true;
    this.emit("event", {
      type: "success",
      source: "engine",
      message: `Ark initialized — ${this._project.framework} project detected`,
      timestamp: new Date(),
      data: this._project,
    } satisfies ArkEvent);
  }

  async connectFigma(): Promise<number> {
    const port = await this.figma.connect();
    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Bridge server started on port ${port}`,
      timestamp: new Date(),
    } satisfies ArkEvent);
    return port;
  }

  async pullDesignSystem(): Promise<void> {
    if (!this.figma.isConnected) {
      throw new Error("Not connected to Figma. Run `ark connect` first.");
    }

    const designSystem = await this.figma.extractDesignSystem();
    await this.registry.updateDesignSystem(designSystem);

    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Pulled ${designSystem.tokens.length} tokens, ${designSystem.components.length} components`,
      timestamp: new Date(),
      data: designSystem,
    } satisfies ArkEvent);
  }

  async generateFromSpec(specName: string): Promise<string> {
    const spec = await this.registry.getSpec(specName);
    if (!spec) {
      throw new Error(`Spec "${specName}" not found`);
    }

    const result = await this.codegen.generate(spec, {
      project: this._project!,
      designSystem: this.registry.designSystem,
    });

    this.emit("event", {
      type: "success",
      source: "codegen",
      message: `Generated ${result.files.length} files from spec "${specName}"`,
      timestamp: new Date(),
      data: result,
    } satisfies ArkEvent);

    return result.entryFile;
  }

  async fullSync(): Promise<void> {
    this.log.info("Starting full sync...");
    await this.pullDesignSystem();

    const specs = await this.registry.getAllSpecs();
    for (const spec of specs) {
      await this.generateFromSpec(spec.name);
    }

    this.emit("event", {
      type: "success",
      source: "engine",
      message: `Full sync complete — ${specs.length} specs regenerated`,
      timestamp: new Date(),
    } satisfies ArkEvent);
  }

  private async saveProjectContext(): Promise<void> {
    if (!this._project) return;
    const path = join(this.config.projectRoot, ".ark", "project.json");
    await writeFile(path, JSON.stringify(this._project, null, 2));
  }
}
