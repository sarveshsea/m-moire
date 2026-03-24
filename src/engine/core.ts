/**
 * Noche Core Engine — Central orchestrator that ties together
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
import { extractFromREST, type FigmaExtractResult } from "../figma/rest-client.js";

export interface NocheConfig {
  projectRoot: string;
  figmaToken?: string;
  figmaFileKey?: string;
  previewPort?: number;
}

export interface NocheEvent {
  type: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

export class NocheEngine extends EventEmitter {
  readonly config: NocheConfig;
  readonly log = createLogger("noche");
  readonly registry: Registry;
  readonly figma: FigmaBridge;
  readonly research: ResearchEngine;
  readonly codegen: CodeGenerator;

  private _project: ProjectContext | null = null;
  private _initialized = false;

  constructor(config: NocheConfig) {
    super();
    this.config = config;
    this.registry = new Registry(join(config.projectRoot, ".noche"));
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

    // Ensure .noche directory exists
    const arkDir = join(this.config.projectRoot, ".noche");
    await mkdir(arkDir, { recursive: true });

    // Load .env.local / .env into process.env
    await this.loadEnvFile();

    // Detect project context
    this._project = await detectProject(this.config.projectRoot);
    await this.saveProjectContext();

    // Load existing registry
    await this.registry.load();

    this._initialized = true;
    this.emit("event", {
      type: "success",
      source: "engine",
      message: `Noche initialized — detected ${this._project.framework} project`,
      timestamp: new Date(),
      data: this._project,
    } satisfies NocheEvent);
  }

  async connectFigma(): Promise<number> {
    const port = await this.figma.connect();
    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Figma bridge listening on port ${port} — open the Noche plugin to connect`,
      timestamp: new Date(),
    } satisfies NocheEvent);
    return port;
  }

  async pullDesignSystem(): Promise<void> {
    // Prefer REST API (token + file key available) — no plugin required
    const token = this.config.figmaToken || process.env.FIGMA_TOKEN;
    const fileKey = this.config.figmaFileKey || process.env.FIGMA_FILE_KEY;
    const nodeId = process.env.FIGMA_NODE_ID;

    if (token && fileKey) {
      const result = await this.pullDesignSystemViaREST(token, fileKey, nodeId);
      this.emit("event", {
        type: "success",
        source: "figma",
        message: `REST pull: ${result.designSystem.tokens.length} tokens, ${result.designSystem.components.length} components, ${result.designSystem.styles.length} styles`,
        timestamp: new Date(),
        data: result,
      } satisfies NocheEvent);
      return;
    }

    // Fallback: require plugin connection
    if (!this.figma.isConnected) {
      throw new Error("No Figma token+fileKey configured and not connected to plugin. Run `noche connect` or set FIGMA_TOKEN + FIGMA_FILE_KEY.");
    }

    const designSystem = await this.figma.extractDesignSystem();
    await this.registry.updateDesignSystem(designSystem);

    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Design system pulled — ${designSystem.tokens.length} tokens, ${designSystem.components.length} components extracted`,
      timestamp: new Date(),
      data: designSystem,
    } satisfies NocheEvent);

    // Auto-generate specs from pulled components
    const autoResult = await this.autoSpec();
    if (autoResult > 0) {
      this.emit("event", {
        type: "success",
        source: "auto-spec",
        message: `Auto-created ${autoResult} component specs from Figma`,
        timestamp: new Date(),
      } satisfies NocheEvent);
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

  async pullDesignSystemViaREST(token: string, fileKey: string, nodeId?: string): Promise<FigmaExtractResult> {
    this.emit("event", {
      type: "info",
      source: "figma",
      message: `REST extraction from file ${fileKey}${nodeId ? ` node ${nodeId}` : ""}…`,
      timestamp: new Date(),
    } satisfies NocheEvent);

    const result = await extractFromREST(token, fileKey, nodeId);
    await this.registry.updateDesignSystem(result.designSystem);

    // Persist page tree + target node to .noche/
    const nocheDir = join(this.config.projectRoot, ".noche");
    await mkdir(nocheDir, { recursive: true });
    await writeFile(join(nocheDir, "page-tree.json"), JSON.stringify(result.pageTree, null, 2));
    if (result.targetNode) {
      await writeFile(join(nocheDir, "target-node.json"), JSON.stringify(result.targetNode, null, 2));
    }

    return result;
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
    } satisfies NocheEvent);

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
    } satisfies NocheEvent);
  }

  private async saveProjectContext(): Promise<void> {
    if (!this._project) return;
    const path = join(this.config.projectRoot, ".noche", "project.json");
    await writeFile(path, JSON.stringify(this._project, null, 2));
  }

  /** Load .env.local then .env into process.env (simple key=value parser, no deps) */
  private async loadEnvFile(): Promise<void> {
    for (const file of [".env.local", ".env"]) {
      try {
        const content = await readFile(join(this.config.projectRoot, file), "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eq = trimmed.indexOf("=");
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          const raw = trimmed.slice(eq + 1).trim();
          const value = raw.startsWith('"') && raw.endsWith('"')
            ? raw.slice(1, -1)
            : raw.startsWith("'") && raw.endsWith("'")
              ? raw.slice(1, -1)
              : raw;
          if (key && !process.env[key]) {
            process.env[key] = value;
          }
        }
      } catch {
        // file absent — skip
      }
    }
  }
}
