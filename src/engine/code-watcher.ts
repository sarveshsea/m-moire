/**
 * CodeWatcher — Watches the generated/ directory for code edits.
 *
 * Detects when generated files are modified (e.g., by a developer tweaking
 * props or variants), parses the changes, and notifies BidirectionalSync
 * so they can be pushed back to Figma or reflected in specs.
 */

import { EventEmitter } from "events";
import { watch, type FSWatcher } from "fs";
import { readFile, readdir, stat } from "fs/promises";
import { join, basename, extname } from "path";
import { createLogger } from "./logger.js";

const log = createLogger("code-watcher");

// ── Types ──────────────────────────────────────────────────

export interface CodeChange {
  file: string;
  specName: string;
  changeType: "modified" | "created" | "deleted";
  timestamp: number;
}

export interface CodeWatcherConfig {
  debounceMs: number;
  extensions: string[];
}

const DEFAULT_CONFIG: CodeWatcherConfig = {
  debounceMs: 500,
  extensions: [".tsx", ".ts", ".jsx", ".js", ".css"],
};

// ── CodeWatcher ────────────────────────────────────────────

export class CodeWatcher extends EventEmitter {
  private generatedDir: string;
  private config: CodeWatcherConfig;
  private watchers: FSWatcher[] = [];
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private running = false;

  constructor(generatedDir: string, config?: Partial<CodeWatcherConfig>) {
    super();
    this.generatedDir = generatedDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Start watching the generated/ directory tree. */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Watch the top-level generated/ directory
    try {
      const entries = await readdir(this.generatedDir);
      for (const entry of entries) {
        const entryPath = join(this.generatedDir, entry);
        const entryStat = await stat(entryPath);
        if (entryStat.isDirectory()) {
          this.watchDir(entryPath);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        log.info("generated/ directory does not exist yet — will watch when created");
      } else {
        log.warn({ err }, "Failed to start code watcher");
      }
      return;
    }

    // Also watch the root for new subdirectories
    this.watchDir(this.generatedDir);
    log.info({ dir: this.generatedDir }, "Code watcher started");
  }

  /** Stop watching. */
  stop(): void {
    this.running = false;
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    log.info("Code watcher stopped");
  }

  private watchDir(dir: string): void {
    try {
      const watcher = watch(dir, (event, filename) => {
        if (!filename) return;

        const ext = extname(filename);
        if (!this.config.extensions.includes(ext)) return;

        const filePath = join(dir, filename);
        this.onFileChanged(filePath);
      });
      this.watchers.push(watcher);
    } catch {
      // Directory may not exist yet
    }
  }

  private onFileChanged(filePath: string): void {
    const key = filePath;
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        this.processChange(filePath);
      }, this.config.debounceMs),
    );
  }

  private async processChange(filePath: string): Promise<void> {
    // Derive spec name from directory structure: generated/<specName>/...
    const relative = filePath.slice(this.generatedDir.length + 1);
    const specName = relative.split("/")[0] ?? basename(filePath, extname(filePath));

    let changeType: CodeChange["changeType"] = "modified";
    try {
      await stat(filePath);
    } catch {
      changeType = "deleted";
    }

    const change: CodeChange = {
      file: filePath,
      specName,
      changeType,
      timestamp: Date.now(),
    };

    log.info({ specName, changeType }, "Code change detected");
    this.emit("code-changed", change);
  }
}
