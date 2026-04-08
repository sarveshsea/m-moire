/**
 * Mémoire Core Engine — Central orchestrator that ties together
 * Figma bridge, research, specs, codegen, and preview.
 */

import { ProjectContext, detectProject } from "./project-context.js";
import { Registry, type DesignSystem } from "./registry.js";
import { FigmaBridge } from "../figma/bridge.js";
import { ResearchEngine } from "../research/engine.js";
import { CodeGenerator } from "../codegen/generator.js";
import { autoSpecFromDesignSystem } from "./auto-spec.js";
import { BidirectionalSync, type SyncDirection } from "./sync.js";
import { CodeWatcher } from "./code-watcher.js";
import { AgentRegistry } from "../agents/agent-registry.js";
import { TaskQueue } from "../agents/task-queue.js";
import { AgentBridge } from "../agents/agent-bridge.js";
import { createLogger } from "./logger.js";
import { EventEmitter } from "events";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import { join } from "path";
import { initWorkspace, readSoul } from "./workspace-init.js";
import { NoteLoader } from "../notes/loader.js";
import { CanvasHealer } from "../figma/canvas-healer.js";
import { extractDesignSystemREST } from "../figma/rest-client.js";
import { auditTokensForWcag, type WcagTokenReport } from "../figma/wcag-token-checker.js";

export interface MemoireConfig {
  projectRoot: string;
  figmaToken?: string;
  figmaFileKey?: string;
  previewPort?: number;
  anthropicApiKey?: string;
}

export interface MemoireEvent {
  type: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
  timestamp: Date;
  data?: unknown;
}

function stripProjectTimestamp(project: ProjectContext): Omit<ProjectContext, "detectedAt"> {
  const { detectedAt: _detectedAt, ...rest } = project;
  return rest;
}

export class MemoireEngine extends EventEmitter {
  readonly config: MemoireConfig;
  readonly log = createLogger("memoire");
  readonly registry: Registry;
  readonly figma: FigmaBridge;
  readonly research: ResearchEngine;
  readonly codegen: CodeGenerator;
  readonly notes: NoteLoader;
  readonly healer: CanvasHealer;
  readonly sync: BidirectionalSync;
  readonly codeWatcher: CodeWatcher;
  readonly agentRegistry: AgentRegistry;
  readonly taskQueue: TaskQueue;
  private _agentBridge: AgentBridge | null = null;
  private pullCache: { hash: string; pulledAt: number } | null = null;
  private static readonly PULL_CACHE_TTL_MS = 300_000; // 5 minutes

  private _project: ProjectContext | null = null;
  private _initialized = false;
  private _soul = "";

  /** Debounced auto-pull on Figma document changes */
  private _docChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private _docChangePulling = false;
  private static readonly DOC_CHANGE_DEBOUNCE_MS = 3000;

  constructor(config: MemoireConfig) {
    super();
    this.setMaxListeners(30);
    this.config = config;
    this.registry = new Registry(join(config.projectRoot, ".memoire"));
    this.notes = new NoteLoader(config.projectRoot);
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
    this.healer = new CanvasHealer(
      this.figma,
      (evt) => this.emit("event", evt),
    );
    this.sync = new BidirectionalSync(this);
    this.codeWatcher = new CodeWatcher(join(config.projectRoot, "generated"));
    this.agentRegistry = new AgentRegistry(join(config.projectRoot, ".memoire"));
    this.taskQueue = new TaskQueue();

    // Auto-pull design system when Figma document changes (debounced)
    this.figma.on("document-changed", () => this._onDocumentChanged());

    // Route granular Figma change events through sync
    this.figma.on("variable-changed", (data: { name: string; collection: string; values: Record<string, string | number>; updatedAt: number }) => {
      this.sync.onVariableChanged(data);
    });

    // Route registry token changes through sync (code side)
    this.registry.on("token-changed", (data: { name: string; current: unknown }) => {
      if (data.current && !this.sync.isGuarded) {
        this.sync.onCodeTokenChanged(data.current as import("./registry.js").DesignToken);
      }
    });
  }

  private _onDocumentChanged(): void {
    if (this._docChangeTimer) clearTimeout(this._docChangeTimer);
    this._docChangeTimer = setTimeout(async () => {
      if (this._docChangePulling || !this.figma.isConnected) return;
      this._docChangePulling = true;
      try {
        this.emit("event", {
          type: "info",
          source: "engine",
          message: "Figma document changed — auto-pulling design system...",
          timestamp: new Date(),
        } satisfies MemoireEvent);
        await this.pullDesignSystem();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit("event", {
          type: "warn",
          source: "engine",
          message: `Auto-pull failed: ${msg}`,
          timestamp: new Date(),
        } satisfies MemoireEvent);
      } finally {
        this._docChangePulling = false;
        this._docChangeTimer = null;
      }
    }, MemoireEngine.DOC_CHANGE_DEBOUNCE_MS);
  }

  get project(): ProjectContext | null {
    return this._project;
  }

  /** Deep copy of the current design system, useful for diffing before/after pulls. */
  snapshotDesignSystem(): DesignSystem {
    return JSON.parse(JSON.stringify(this.registry.designSystem));
  }

  /**
   * WA-404 — Run a WCAG token audit against the current design system.
   * Exposes the audit to MCP tools and agents without re-implementing the logic.
   * Call after pullDesignSystem() or pullDesignSystemREST() for fresh data.
   */
  auditDesignSystemWcag(): WcagTokenReport {
    return auditTokensForWcag(this.registry.designSystem.tokens);
  }

  /** Get or create the agent bridge (lazy — needs connected ws-server). */
  get agentBridge(): AgentBridge {
    if (!this._agentBridge) {
      this._agentBridge = new AgentBridge(this.figma.wsServer);

      // Route agent messages from bridge through task queue
      this.figma.wsServer.on("agent-message", (data: unknown) => {
        this._agentBridge!.handleAgentMessage(data as import("../plugin/shared/contracts.js").AgentTaskEnvelope);
      });

      // When agent bridge receives task results, complete/fail them in the queue
      this._agentBridge.on("task-result", (data: { agentId: string; taskId: string; result?: unknown; error?: string }) => {
        if (data.error) {
          this.taskQueue.fail(data.taskId, data.agentId, data.error);
        } else {
          this.taskQueue.complete(data.taskId, data.agentId, data.result);
        }
        this.agentRegistry.markOnline(data.agentId);
      });
    }
    return this._agentBridge;
  }

  /** Design soul — loaded from .memoire/SOUL.md, guides agent output style */
  get soul(): string {
    return this._soul;
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    this.log.info("Initializing Mémoire engine...");

    // Load .env.local / .env so FIGMA_TOKEN etc. are available without shell export
    await this._loadEnvFile(".env.local");
    await this._loadEnvFile(".env");
    if (!this.config.figmaToken && process.env.FIGMA_TOKEN) this.config.figmaToken = process.env.FIGMA_TOKEN;
    if (!this.config.figmaFileKey && process.env.FIGMA_FILE_KEY) this.config.figmaFileKey = process.env.FIGMA_FILE_KEY;
    if (!this.config.anthropicApiKey && process.env.ANTHROPIC_API_KEY) this.config.anthropicApiKey = process.env.ANTHROPIC_API_KEY;

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

    // Load sync state and agent registry
    await this.sync.loadState();
    await this.agentRegistry.load();
    this.agentRegistry.startHealthCheck();
    await this.taskQueue.start();

    // Load Mémoire Notes
    await this.notes.loadAll();

    this._initialized = true;
    this.emit("event", {
      type: "success",
      source: "engine",
      message: `Mémoire initialized — detected ${this._project?.framework ?? "unknown"} project`,
      timestamp: new Date(),
      data: this._project,
    } satisfies MemoireEvent);
  }

  async connectFigma(): Promise<number> {
    // Check if a standalone `memi connect` bridge is already running
    const bridgeLock = await this._readBridgeLock();
    if (bridgeLock && bridgeLock.port > 0) {
      this.log.info(`Found running bridge on port ${bridgeLock.port}, reusing...`);
      try {
        const port = await this.figma.connect(bridgeLock.port);
        this.emit("event", {
          type: "success",
          source: "figma",
          message: `Reusing bridge on port ${port}`,
          timestamp: new Date(),
        } satisfies MemoireEvent);
        return port;
      } catch {
        this.log.info("Bridge lock stale, starting fresh bridge...");
      }
    }

    // Check if a daemon is already running with a bridge
    const daemonStatus = await this._readDaemonStatus();
    if (daemonStatus && daemonStatus.figmaPort > 0) {
      // Try connecting to the existing daemon's bridge port
      this.log.info(`Found running daemon on port ${daemonStatus.figmaPort}, reusing...`);
      try {
        const port = await this.figma.connect(daemonStatus.figmaPort);
        this.emit("event", {
          type: "success",
          source: "figma",
          message: `Reusing daemon bridge on port ${port}`,
          timestamp: new Date(),
        } satisfies MemoireEvent);
        return port;
      } catch {
        // Daemon port stale, start fresh
        this.log.info("Daemon port stale, starting fresh bridge...");
      }
    }

    const port = await this.figma.connect();
    this.emit("event", {
      type: "success",
      source: "figma",
      message: `Figma bridge listening on port ${port} — open the Mémoire plugin to connect`,
      timestamp: new Date(),
    } satisfies MemoireEvent);
    return port;
  }

  /**
   * Connect to Figma and wait for a plugin to actually connect.
   * Used by commands that need an active plugin (pull, sync, etc).
   */
  async ensureFigmaConnected(timeoutMs = 30000): Promise<void> {
    if (this.figma.isConnected) return;

    const port = await this.connectFigma();
    if (this.figma.isConnected) return;

    // Wait for a plugin to connect — register listener BEFORE checking state
    // to prevent the race where connection happens between check and listen
    console.log(`  · Waiting for Figma plugin on port ${port}...`);
    await new Promise<void>((resolve, reject) => {
      const onConnect = () => {
        clearTimeout(timer);
        console.log(`  + Figma plugin connected on port ${port}`);
        resolve();
      };

      const timer = setTimeout(() => {
        this.figma.removeListener("plugin-connected", onConnect);
        reject(new Error(
          `No Figma plugin connected within ${timeoutMs / 1000}s. ` +
          `Open the Mémoire plugin in Figma — it auto-discovers port ${port}.`
        ));
      }, timeoutMs);

      this.figma.once("plugin-connected", onConnect);

      // Check again after registering the listener (covers the race)
      if (this.figma.isConnected) {
        this.figma.removeListener("plugin-connected", onConnect);
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Parse and inject a .env file into process.env (no-op if file absent) */
  private async _loadEnvFile(filename: string): Promise<void> {
    const envPath = join(this.config.projectRoot, filename);
    try {
      await access(envPath);
      const raw = await readFile(envPath, "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        if (key && !(key in process.env)) process.env[key] = val;
      }
    } catch { /* file doesn't exist — skip */ }
  }

  /** Read bridge lock written by `memi connect` — lets pull/sync reuse an existing bridge */
  private async _readBridgeLock(): Promise<{ port: number; pid: number } | null> {
    try {
      const lockPath = join(this.config.projectRoot, ".memoire", "bridge.json");
      const raw = await readFile(lockPath, "utf-8");
      const lock = JSON.parse(raw) as { pid: number; port: number };
      if (lock.pid) {
        try { process.kill(lock.pid, 0); } catch { return null; } // stale
      }
      return lock;
    } catch {
      return null;
    }
  }

  /**
   * Returns true if a live bridge or daemon is already running.
   * Used by pull to decide whether to wait for a plugin or fall back to REST.
   */
  async hasRunningBridge(): Promise<boolean> {
    const [lock, daemon] = await Promise.all([
      this._readBridgeLock(),
      this._readDaemonStatus(),
    ]);
    return !!(lock || daemon);
  }

  /** Read daemon status file if it exists */
  private async _readDaemonStatus(): Promise<{ figmaPort: number } | null> {
    try {
      const statusPath = join(this.config.projectRoot, ".memoire", "daemon.json");
      const raw = await readFile(statusPath, "utf-8");
      const status = JSON.parse(raw);
      // Verify the daemon process is actually alive
      if (status.pid) {
        try { process.kill(status.pid, 0); } catch { return null; }
      }
      return status;
    } catch {
      return null;
    }
  }

  async pullDesignSystem(force = false): Promise<void> {
    if (!this.figma.isConnected) {
      throw new Error("Not connected to Figma. Run `memi connect` first, or use `memi pull` which waits for the plugin.");
    }

    // Skip pull if cache is fresh (within TTL) unless forced
    const now = Date.now();
    if (!force && this.pullCache && now - this.pullCache.pulledAt < MemoireEngine.PULL_CACHE_TTL_MS) {
      this.log.info({ cachedAgoMs: now - this.pullCache.pulledAt }, "Design system pull skipped — cache still fresh");
      return;
    }

    const designSystem = await this.figma.extractDesignSystem();
    await this.registry.updateDesignSystem(designSystem);

    // Update cache
    const hash = `${designSystem.tokens.length}-${designSystem.components.length}-${designSystem.styles.length}`;
    this.pullCache = { hash, pulledAt: now };

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
   * Pull design system via Figma REST API — no plugin or WebSocket required.
   * Requires FIGMA_TOKEN and FIGMA_FILE_KEY in config/env.
   */
  async pullDesignSystemREST(force = false): Promise<void> {
    const token = this.config.figmaToken || process.env.FIGMA_TOKEN;
    const fileKey = this.config.figmaFileKey || process.env.FIGMA_FILE_KEY;

    if (!token) throw new Error("FIGMA_TOKEN required for REST pull. Add it to .env.local");
    if (!fileKey) throw new Error("FIGMA_FILE_KEY required for REST pull. Add it to .env.local");

    // Share the same cache as plugin pull
    const now = Date.now();
    if (!force && this.pullCache && now - this.pullCache.pulledAt < MemoireEngine.PULL_CACHE_TTL_MS) {
      this.log.info({ cachedAgoMs: now - this.pullCache.pulledAt }, "Design system pull skipped — cache still fresh");
      return;
    }

    const designSystem = await extractDesignSystemREST(fileKey, token);
    await this.registry.updateDesignSystem(designSystem);

    const hash = `${designSystem.tokens.length}-${designSystem.components.length}-${designSystem.styles.length}`;
    this.pullCache = { hash, pulledAt: now };

    this.emit("event", {
      type: "success",
      source: "figma-rest",
      message: `Design system pulled via REST — ${designSystem.tokens.length} tokens, ${designSystem.components.length} components`,
      timestamp: new Date(),
      data: designSystem,
    } satisfies MemoireEvent);

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

    if (!this._project) {
      throw new Error("Engine not initialized. Call init() before generating code.");
    }

    const result = await this.codegen.generate(spec, {
      project: this._project,
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
    let existingRaw: string | null = null;
    try {
      existingRaw = await readFile(path, "utf-8");
      const existing = JSON.parse(existingRaw) as ProjectContext;
      if (JSON.stringify(stripProjectTimestamp(existing)) === JSON.stringify(stripProjectTimestamp(this._project))) {
        this._project = {
          ...this._project,
          detectedAt: existing.detectedAt,
        };
      }
    } catch {
      // No existing project context yet
    }

    const nextRaw = JSON.stringify(this._project, null, 2);
    if (existingRaw === nextRaw) {
      return;
    }

    await writeFile(path, nextRaw);
  }
}
