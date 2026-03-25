/**
 * Mémoire Core Engine — Central orchestrator that ties together
 * Figma bridge, research, specs, codegen, and preview.
 */

import { ProjectContext, detectProject } from "./project-context.js";
import { Registry } from "./registry.js";
import { FigmaBridge } from "../figma/bridge.js";
import { ResearchEngine } from "../research/engine.js";
import { CodeGenerator } from "../codegen/generator.js";
import { autoSpecFromDesignSystem } from "./auto-spec.js";
import { createLogger } from "./logger.js";
import { EventEmitter } from "events";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { initWorkspace, readSoul } from "./workspace-init.js";

export interface MemoireConfig {
  projectRoot: string;
  figmaToken?: string;
  figmaFileKey?: string;
  previewPort?: number;
}

export interface MemoireEvent {
  type: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export class MemoireEngine extends EventEmitter {
  readonly config: MemoireConfig;
  readonly log = createLogger("memoire");
  readonly registry: Registry;
  readonly figma: FigmaBridge;
  readonly research: ResearchEngine;
  readonly codegen: CodeGenerator;

  private _project: ProjectContext | null = null;
  private _initialized = false;
  private _soul = "";

  constructor(config: MemoireConfig) {
    super();
    this.config = config;
    this.registry = new Registry(join(config.projectRoot, ".memoire"));
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

  /** Design soul — loaded from .memoire/SOUL.md, guides agent output style */
  get soul(): string {
    return this._soul;
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    this.log.info("Initializing Mémoire engine...");

    // Ensure .memoire directory exists and initialize workspace
    const memoireDir = join(this.config.projectRoot, ".memoire");
    await mkdir(memoireDir, { recursive: true });
    await initWorkspace(memoireDir);

    // Detect project context
    this._project = await detectProject(this.config.projectRoot);
    await this.saveProjectContext();

    // Load existing registry
    await this.registry.load();

    // Load design soul for agent context
    this._soul = await readSoul(memoireDir);

    this._initialized = true;
    this.emit("event", {
      type: "success",
      source: "engine",
      message: `Mémoire initialized — detected ${this._project.framework} project`,
      timestamp: new Date(),
      data: this._project,
    } satisfies MemoireEvent);
  }

  async connectFigma(): Promise<number> {
    const port = await this.figma.connect();
    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Figma bridge listening on port ${port} — open the Mémoire plugin to connect`,
      timestamp: new Date(),
    } satisfies MemoireEvent);
    return port;
  }

  async pullDesignSystem(): Promise<void> {
    if (!this.figma.isConnected) {
      throw new Error("Not connected to Figma. Run `memi connect` first.");
    }

    const designSystem = await this.figma.extractDesignSystem();
    await this.registry.updateDesignSystem(designSystem);

    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Design system pulled — ${designSystem.tokens.length} tokens, ${designSystem.components.length} components extracted`,
      timestamp: new Date(),
      data: designSystem,
    } satisfies MemoireEvent);

    // Auto-generate specs from pulled components
    const autoResult = await this.autoSpec();
    if (autoResult > 0) {
      this.emit("event", {
        type: "success",
        source: "auto-spec",
        message: `Auto-created ${autoResult} component specs from Figma`,
        timestamp: new Date(),
      } satisfies MemoireEvent);
    }
  }

  /**
   * Automatically create ComponentSpecs from pulled design system components.
   * Skips components that already have specs. Returns count of new specs created.
   */
  async autoSpec(): Promise<number> {
    const ds = this.registry.designSystem;
    if (ds.components.length === 0) return 0;

    const existingSpecs = await this.registry.getAllSpecs();
    const existingNames = new Set(existingSpecs.map((s) => s.name));

    const { specs, skipped } = autoSpecFromDesignSystem(ds, existingNames);

    for (const spec of specs) {
      await this.registry.saveSpec(spec);
    }

    if (skipped.length > 0) {
      this.log.info(`Auto-spec: skipped ${skipped.length} components (already have specs or invalid names)`);
    }

    return specs.length;
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
      message: `Code generated for ${specName} — ${result.files.length} files written`,
      timestamp: new Date(),
      data: result,
    } satisfies MemoireEvent);

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
      message: `Sync complete — pulled design system and regenerated ${specs.length} specs`,
      timestamp: new Date(),
    } satisfies MemoireEvent);
  }

  private async saveProjectContext(): Promise<void> {
    if (!this._project) return;
    const path = join(this.config.projectRoot, ".memoire", "project.json");
    await writeFile(path, JSON.stringify(this._project, null, 2));
  }
}
