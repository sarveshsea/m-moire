/**
 * Workspace Manager — Stores per-project data outside the Mémoire repo.
 * Each project gets a workspace at ~/.memoire-workspaces/{workspace-id}/
 * keyed by SHA256 hash of the project's absolute path.
 */

import { createHash } from "crypto";
import { readFile, writeFile, readdir, mkdir, rm, rename } from "fs/promises";
import { join, resolve } from "path";
import { homedir } from "os";
import { createLogger } from "./logger.js";
import { z } from "zod";

const log = createLogger("workspace");

// ============================================================================
// Zod Schemas for workspace data structures
// ============================================================================

const ProjectMetaSchema = z.object({
  name: z.string(),
  path: z.string(),
  created: z.string().datetime(),
  lastAccessed: z.string().datetime(),
});
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;

const DesignSystemDataSchema = z.object({
  tokens: z.array(z.unknown()).default([]),
  components: z.array(z.unknown()).default([]),
  styles: z.array(z.unknown()).default([]),
  lastSync: z.string().default("never"),
});
export type DesignSystemData = z.infer<typeof DesignSystemDataSchema>;

const KnowledgeBaseSchema = z.object({
  research: z.unknown().optional(),
  patterns: z.unknown().optional(),
  decisions: z.unknown().optional(),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

const ServerStateSchema = z.object({
  port: z.number().optional(),
  pid: z.number().optional(),
  startedAt: z.string().datetime().optional(),
  status: z.enum(["running", "stopped"]).default("stopped"),
});
export type ServerState = z.infer<typeof ServerStateSchema>;

const GenerationEntrySchema = z.object({
  timestamp: z.string().datetime(),
  specName: z.string(),
  status: z.enum(["success", "failed"]),
  message: z.string(),
  files: z.array(z.string()).optional(),
  error: z.string().optional(),
});
export type GenerationEntry = z.infer<typeof GenerationEntrySchema>;

const RegistrySchema = z.object({
  version: z.literal(1),
  entries: z.record(
    z.string(), // project path
    z.object({
      workspaceId: z.string(),
      created: z.string().datetime(),
    })
  ),
});
export type WorkspaceRegistry = z.infer<typeof RegistrySchema>;

// ============================================================================
// Workspace Manager
// ============================================================================

export class WorkspaceManager {
  private workspaceRoot: string;

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot || join(homedir(), ".memoire-workspaces");
  }

  /**
   * Generate a workspace ID from project path (SHA256 hash, first 12 chars)
   */
  private generateWorkspaceId(projectPath: string): string {
    const resolved = resolve(projectPath);
    const hash = createHash("sha256").update(resolved).digest("hex");
    return hash.slice(0, 12);
  }

  /**
   * Get the workspace directory for a project
   */
  private getWorkspaceDir(projectPath: string): string {
    const workspaceId = this.generateWorkspaceId(projectPath);
    return join(this.workspaceRoot, workspaceId);
  }

  /**
   * Load or initialize the workspace registry
   */
  private async loadRegistry(): Promise<WorkspaceRegistry> {
    const registryPath = join(this.workspaceRoot, "registry.json");
    try {
      const raw = await readFile(registryPath, "utf-8");
      const parsed = JSON.parse(raw);
      return RegistrySchema.parse(parsed);
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ err: err.message }, "Failed to load registry, using defaults");
      }
      return { version: 1, entries: {} };
    }
  }

  /**
   * Save the workspace registry
   */
  private async saveRegistry(registry: WorkspaceRegistry): Promise<void> {
    const registryPath = join(this.workspaceRoot, "registry.json");
    const tmpPath = join(this.workspaceRoot, ".registry.json.tmp");
    await mkdir(this.workspaceRoot, { recursive: true });
    await writeFile(tmpPath, JSON.stringify(registry, null, 2));
    await rename(tmpPath, registryPath);
  }

  /**
   * Get or create a workspace for a project
   */
  async getWorkspace(projectPath: string): Promise<ProjectMeta> {
    const resolved = resolve(projectPath);
    const workspaceId = this.generateWorkspaceId(resolved);
    const workspaceDir = this.getWorkspaceDir(resolved);

    // Create workspace directory structure
    await mkdir(join(workspaceDir, "design-system"), { recursive: true });
    await mkdir(join(workspaceDir, "figma-cache", "file-data"), { recursive: true });
    await mkdir(join(workspaceDir, "figma-cache", "images"), { recursive: true });
    await mkdir(join(workspaceDir, "knowledge"), { recursive: true });
    await mkdir(join(workspaceDir, "specs-cache"), { recursive: true });
    await mkdir(join(workspaceDir, "server", "sessions"), { recursive: true });
    await mkdir(join(workspaceDir, "codegen-history"), { recursive: true });

    // Load or create project metadata
    const metaPath = join(workspaceDir, "meta.json");
    let meta: ProjectMeta;

    try {
      const raw = await readFile(metaPath, "utf-8");
      meta = ProjectMetaSchema.parse(JSON.parse(raw));
      meta.lastAccessed = new Date().toISOString();
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ err: err.message }, "Failed to load meta.json");
      }
      meta = {
        name: resolved.split("/").pop() || "unknown",
        path: resolved,
        created: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };
    }

    // Save updated metadata (atomic write)
    const tmpMetaPath = join(workspaceDir, ".meta.json.tmp");
    await writeFile(tmpMetaPath, JSON.stringify(meta, null, 2));
    await rename(tmpMetaPath, metaPath);

    // Update registry
    const registry = await this.loadRegistry();
    registry.entries[resolved] = {
      workspaceId,
      created: meta.created,
    };
    await this.saveRegistry(registry);

    log.info({ projectPath: resolved, workspaceId }, "Workspace accessed");

    return meta;
  }

  /**
   * List all known workspaces
   */
  async listWorkspaces(): Promise<ProjectMeta[]> {
    const registry = await this.loadRegistry();
    const workspaces: ProjectMeta[] = [];

    for (const [projectPath, entry] of Object.entries(registry.entries)) {
      try {
        const workspaceDir = join(this.workspaceRoot, entry.workspaceId);
        const metaPath = join(workspaceDir, "meta.json");
        const raw = await readFile(metaPath, "utf-8");
        const meta = ProjectMetaSchema.parse(JSON.parse(raw));
        workspaces.push(meta);
      } catch (err) {
        log.warn({ projectPath, err: err instanceof Error ? err.message : String(err) }, "Failed to load workspace metadata");
      }
    }

    return workspaces;
  }

  /**
   * Clean up a workspace (reset all project data)
   */
  async cleanWorkspace(projectPath: string): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    const resolved = resolve(projectPath);

    try {
      await rm(workspaceDir, { recursive: true, force: true });
      log.info({ projectPath: resolved }, "Workspace cleaned");

      // Remove from registry
      const registry = await this.loadRegistry();
      delete registry.entries[resolved];
      await this.saveRegistry(registry);
    } catch (err) {
      log.error({ projectPath: resolved, err: err instanceof Error ? err.message : String(err) }, "Failed to clean workspace");
      throw err;
    }
  }

  /**
   * Read cached design system
   */
  async getDesignSystem(projectPath: string): Promise<DesignSystemData | null> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    const filePath = join(workspaceDir, "design-system", "tokens.json");

    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return DesignSystemDataSchema.parse(parsed);
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ projectPath, err: err.message }, "Failed to load design system");
      }
      return null;
    }
  }

  /**
   * Write design system
   */
  async saveDesignSystem(projectPath: string, data: DesignSystemData): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    await mkdir(join(workspaceDir, "design-system"), { recursive: true });

    const filePath = join(workspaceDir, "design-system", "tokens.json");
    const tmpPath = join(workspaceDir, "design-system", ".tokens.json.tmp");

    const validated = DesignSystemDataSchema.parse(data);
    await writeFile(tmpPath, JSON.stringify(validated, null, 2));
    await rename(tmpPath, filePath);

    log.info({ projectPath }, "Design system saved");
  }

  /**
   * Read knowledge base
   */
  async getKnowledge(projectPath: string): Promise<KnowledgeBase | null> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    const knowledge: KnowledgeBase = {};

    try {
      const researchPath = join(workspaceDir, "knowledge", "research.json");
      try {
        const raw = await readFile(researchPath, "utf-8");
        knowledge.research = JSON.parse(raw);
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          log.warn({ projectPath, err: err.message }, "Failed to load research");
        }
      }

      const patternsPath = join(workspaceDir, "knowledge", "patterns.json");
      try {
        const raw = await readFile(patternsPath, "utf-8");
        knowledge.patterns = JSON.parse(raw);
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          log.warn({ projectPath, err: err.message }, "Failed to load patterns");
        }
      }

      const decisionsPath = join(workspaceDir, "knowledge", "decisions.json");
      try {
        const raw = await readFile(decisionsPath, "utf-8");
        knowledge.decisions = JSON.parse(raw);
      } catch (err) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          log.warn({ projectPath, err: err.message }, "Failed to load decisions");
        }
      }

      return KnowledgeBaseSchema.parse(knowledge);
    } catch (err) {
      log.error({ projectPath, err: err instanceof Error ? err.message : String(err) }, "Failed to load knowledge base");
      return null;
    }
  }

  /**
   * Write to knowledge base
   */
  async saveKnowledge(projectPath: string, key: "research" | "patterns" | "decisions", data: unknown): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    await mkdir(join(workspaceDir, "knowledge"), { recursive: true });

    const filePath = join(workspaceDir, "knowledge", `${key}.json`);
    const tmpPath = join(workspaceDir, "knowledge", `.${key}.json.tmp`);

    await writeFile(tmpPath, JSON.stringify(data, null, 2));
    await rename(tmpPath, filePath);

    log.info({ projectPath, key }, "Knowledge saved");
  }

  /**
   * Read server state
   */
  async getServerState(projectPath: string): Promise<ServerState | null> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    const filePath = join(workspaceDir, "server", "state.json");

    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return ServerStateSchema.parse(parsed);
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ projectPath, err: err.message }, "Failed to load server state");
      }
      return null;
    }
  }

  /**
   * Write server state
   */
  async saveServerState(projectPath: string, state: ServerState): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    await mkdir(join(workspaceDir, "server"), { recursive: true });

    const filePath = join(workspaceDir, "server", "state.json");
    const tmpPath = join(workspaceDir, "server", ".state.json.tmp");

    const validated = ServerStateSchema.parse(state);
    await writeFile(tmpPath, JSON.stringify(validated, null, 2));
    await rename(tmpPath, filePath);

    log.info({ projectPath, port: state.port, status: state.status }, "Server state saved");
  }

  /**
   * Append to codegen history
   */
  async logGeneration(projectPath: string, entry: GenerationEntry): Promise<void> {
    const workspaceDir = this.getWorkspaceDir(projectPath);
    await mkdir(join(workspaceDir, "codegen-history"), { recursive: true });

    const filePath = join(workspaceDir, "codegen-history", "generations.json");
    const tmpPath = join(workspaceDir, "codegen-history", ".generations.json.tmp");

    let entries: GenerationEntry[] = [];
    try {
      const raw = await readFile(filePath, "utf-8");
      entries = JSON.parse(raw);
      if (!Array.isArray(entries)) {
        entries = [];
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ projectPath, err: err.message }, "Failed to load generation history");
      }
    }

    const validated = GenerationEntrySchema.parse(entry);
    entries.push(validated);

    await writeFile(tmpPath, JSON.stringify(entries, null, 2));
    await rename(tmpPath, filePath);

    log.info(
      { projectPath, specName: validated.specName, status: validated.status },
      "Generation logged"
    );
  }
}

/**
 * Singleton workspace manager instance
 */
export const workspace = new WorkspaceManager();
