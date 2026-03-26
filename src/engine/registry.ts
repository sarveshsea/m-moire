/**
 * Registry — Manages specs, design system data, and generation state.
 * Persists to .memoire/ directory for cross-session continuity.
 */

import { readFile, writeFile, readdir, mkdir, rename } from "fs/promises";
import { join, resolve, relative } from "path";
import { tmpdir } from "os";
import { createLogger } from "./logger.js";
import { ComponentSpec, PageSpec, DataVizSpec, DesignSpec, IASpec, AnySpec } from "../specs/types.js";

const log = createLogger("registry");

export interface DesignSystem {
  tokens: DesignToken[];
  components: DesignComponent[];
  styles: DesignStyle[];
  lastSync: string;
}

export interface DesignToken {
  name: string;
  collection: string;
  type: "color" | "spacing" | "typography" | "radius" | "shadow" | "other";
  values: Record<string, string | number>; // mode → value
  cssVariable: string;
}

export interface DesignComponent {
  name: string;
  key: string;
  description: string;
  variants: string[];
  properties: Record<string, { type: string; defaultValue?: string }>;
  figmaNodeId: string;
}

export interface DesignStyle {
  name: string;
  type: "fill" | "text" | "effect" | "grid";
  value: Record<string, unknown>;
}

export interface GenerationState {
  specName: string;
  generatedAt: string;
  files: string[];
  specHash: string; // detect if spec changed since last gen
}

/** Validate spec name is safe for use in file paths */
function assertSafeName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    throw new Error(`Invalid spec name "${name}": must start with a letter and contain only letters, numbers, hyphens, or underscores`);
  }
  if (name.length > 128) {
    throw new Error(`Spec name too long (${name.length} chars, max 128)`);
  }
}

/** Ensure a resolved path stays within the expected parent directory */
function assertWithinDir(filePath: string, parentDir: string): void {
  const resolved = resolve(filePath);
  const parent = resolve(parentDir);
  if (!resolved.startsWith(parent + "/") && resolved !== parent) {
    throw new Error(`Path traversal detected: ${filePath} escapes ${parentDir}`);
  }
}

/** Map spec type to its directory name */
function specTypeDir(type: string): string {
  switch (type) {
    case "dataviz": return "dataviz";
    case "design": return "design";
    case "ia": return "ia";
    case "component": return "components";
    case "page": return "pages";
    default: return `${type}s`;
  }
}

export class Registry {
  private arkDir: string;
  private specs = new Map<string, AnySpec>();
  private generations = new Map<string, GenerationState>();
  private _designSystem: DesignSystem = {
    tokens: [],
    components: [],
    styles: [],
    lastSync: "never",
  };

  constructor(arkDir: string) {
    this.arkDir = arkDir;
  }

  get designSystem(): DesignSystem {
    return this._designSystem;
  }

  async load(): Promise<void> {
    await mkdir(this.arkDir, { recursive: true });

    // Load design system
    try {
      const dsPath = join(this.arkDir, "design-system.json");
      const raw = await readFile(dsPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.tokens)) {
        this._designSystem = parsed;
      } else {
        log.warn("design-system.json has unexpected shape, using defaults");
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ err: err.message }, "Failed to load design-system.json");
      }
    }

    // Load specs from specs/ directories
    await this.loadSpecsFrom("components");
    await this.loadSpecsFrom("pages");
    await this.loadSpecsFrom("dataviz");
    await this.loadSpecsFrom("design");
    await this.loadSpecsFrom("ia");

    // Load generation state
    try {
      const genPath = join(this.arkDir, "generations.json");
      const raw = await readFile(genPath, "utf-8");
      const states: GenerationState[] = JSON.parse(raw);
      for (const state of states) {
        this.generations.set(state.specName, state);
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ err: err.message }, "Failed to load generations.json");
      }
    }
  }

  async getSpec(name: string): Promise<AnySpec | null> {
    return this.specs.get(name) ?? null;
  }

  async getAllSpecs(): Promise<AnySpec[]> {
    return Array.from(this.specs.values());
  }

  async saveSpec(spec: AnySpec): Promise<void> {
    assertSafeName(spec.name);
    this.specs.set(spec.name, spec);

    const typeDir = specTypeDir(spec.type);
    const dir = join(this.arkDir, "..", "specs", typeDir);
    await mkdir(dir, { recursive: true });

    // Atomic write: write to temp file, then rename
    const filePath = join(dir, `${spec.name}.json`);
    const tmpPath = join(dir, `.${spec.name}.json.tmp`);
    assertWithinDir(filePath, dir);
    await writeFile(tmpPath, JSON.stringify(spec, null, 2));
    await rename(tmpPath, filePath);
  }

  addToken(token: DesignToken): void {
    // Replace if exists, otherwise append
    const idx = this._designSystem.tokens.findIndex(t => t.name === token.name);
    if (idx >= 0) {
      this._designSystem.tokens[idx] = token;
    } else {
      this._designSystem.tokens.push(token);
    }
  }

  updateToken(name: string, token: DesignToken): void {
    const idx = this._designSystem.tokens.findIndex(t => t.name === name);
    if (idx >= 0) {
      this._designSystem.tokens[idx] = token;
    } else {
      this._designSystem.tokens.push(token);
    }
  }

  removeToken(name: string): boolean {
    const idx = this._designSystem.tokens.findIndex(t => t.name === name);
    if (idx >= 0) {
      this._designSystem.tokens.splice(idx, 1);
      return true;
    }
    return false;
  }

  async save(): Promise<void> {
    await this.updateDesignSystem(this._designSystem);
  }

  async updateDesignSystem(ds: DesignSystem): Promise<void> {
    this._designSystem = ds;
    const path = join(this.arkDir, "design-system.json");
    const tmpPath = join(this.arkDir, ".design-system.json.tmp");
    await writeFile(tmpPath, JSON.stringify(ds, null, 2));
    await rename(tmpPath, path);
  }

  async recordGeneration(state: GenerationState): Promise<void> {
    this.generations.set(state.specName, state);
    const path = join(this.arkDir, "generations.json");
    const tmpPath = join(this.arkDir, ".generations.json.tmp");
    const all = Array.from(this.generations.values());
    await writeFile(tmpPath, JSON.stringify(all, null, 2));
    await rename(tmpPath, path);
  }

  getGenerationState(specName: string): GenerationState | null {
    return this.generations.get(specName) ?? null;
  }

  private async loadSpecsFrom(subdir: string): Promise<void> {
    const dir = join(this.arkDir, "..", "specs", subdir);
    try {
      const files = await readdir(dir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const raw = await readFile(join(dir, file), "utf-8");
          const spec: AnySpec = JSON.parse(raw);
          if (!spec.name || typeof spec.name !== "string") {
            log.warn({ subdir, file }, "Spec missing valid name, using filename");
            spec.name = file.replace(/\.json$/, "");
          }
          this.specs.set(spec.name, spec);
        } catch (err) {
          if (err instanceof Error) {
            log.warn({ subdir, file, err: err.message }, "Skipping invalid spec file");
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn({ subdir, err: (err as Error).message }, "Failed to read specs directory");
      }
    }
  }
}
