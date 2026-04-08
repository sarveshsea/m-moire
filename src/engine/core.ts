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
import { readFile, writeFile, mkdir } from "fs/promises";
import { loadEnvFile } from "../utils/env.js";
import { join } from "path";
import { initWorkspace, readSoul } from "./workspace-init.js";
import { NoteLoader } from "../notes/loader.js";
import { CanvasHealer } from "../figma/canvas-healer.js";
import { extractDesignSystemREST } from "../figma/rest-client.js";
import { auditTokensForWcag, type WcagTokenReport } from "../figma/wcag-token-checker.js";
import { readBridgeLock } from "../figma/bridge-lock.js";

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

/** Strip the volatile `detectedAt` timestamp before comparing project contexts to avoid spurious writes. */
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

  /** Debounces auto-pull when the Figma document changes — waits DOC_CHANGE_DEBOUNCE_MS before pulling to coalesce rapid edits. */
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

  /**
   * Returns a deep-cloned snapshot of the current design system from the registry.
   *
   * Used by `memi pull` and `executeRestPull` to capture state immediately before a
   * pull so the token-differ can produce a human-readable before/after diff. Callers
   * should snapshot, pull, then diff — never hold a snapshot across multiple pulls.
   *
   * @returns A deep copy of the current {@link DesignSystem} (tokens, components, styles).
   */
  snapshotDesignSystem(): DesignSystem {
    return JSON.parse(JSON.stringify(this.registry.designSystem));
  }

  /**
   * Run a WCAG 2.2 token audit against the design system currently held in the registry.
   *
   * Delegates to `auditTokensForWcag` so MCP tools, agents, and CLI commands can all
   * trigger the audit without re-implementing the logic. Always call after
   * `pullDesignSystem()` or `pullDesignSystemREST()` to ensure data is fresh.
   *
   * @returns A {@link WcagTokenReport} with per-token pass/warn/fail results and
   *   an aggregate summary. `report.hasFailures` is `true` when at least one token
   *   fails WCAG AA contrast requirements.
   */
  auditDesignSystemWcag(): WcagTokenReport {
    return auditTokensForWcag(this.registry.designSystem.tokens);
  }

  /**
   * Returns the singleton {@link AgentBridge}, creating it on first access (lazy init).
   *
   * The bridge wires together the WebSocket server, the task queue, and the agent
   * registry so that plugin-side agent messages are routed to the right task slots.
   * Requires `connectFigma()` to have been called first so the ws-server exists.
   */
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

  /**
   * The project's design soul string, loaded from `.memoire/SOUL.md` during `init()`.
   *
   * Injected into agent prompts to steer output style (voice, density, aesthetic).
   * Empty string if the soul file does not exist yet.
   */
  get soul(): string {
    return this._soul;
  }

  /**
   * Initialize the Mémoire engine — must be called once before any other method.
   *
   * Performs the following in order:
   * 1. Loads `.env.local` then `.env` into `process.env` (FIGMA_TOKEN, FIGMA_FILE_KEY,
   *    ANTHROPIC_API_KEY are merged into `this.config` if not already set).
   * 2. Creates `.memoire/` and initializes the workspace skeleton (SOUL.md, etc).
   * 3. Detects the project framework/type and persists `project.json`.
   * 4. Loads the existing design system registry from disk.
   * 5. Reads the design soul string.
   * 6. Loads bidirectional sync state, starts the agent registry health-check loop,
   *    starts the task queue, and loads all installed Mémoire Notes.
   *
   * Idempotent — safe to call multiple times; subsequent calls are no-ops.
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    this.log.info("Initializing Mémoire engine...");

    // Load .env.local / .env so FIGMA_TOKEN etc. are available without shell export
    await loadEnvFile(this.config.projectRoot, ".env.local");
    await loadEnvFile(this.config.projectRoot, ".env");
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

  /**
   * Start (or reuse) the Figma WebSocket bridge and return the port it is listening on.
   *
   * Preference order:
   * 1. Reuse an existing `memi connect` bridge found in `.memoire/bridge.json`.
   * 2. Reuse the daemon's bridge port from `.memoire/daemon.json`.
   * 3. Spin up a fresh bridge on the first available port in 9223-9232.
   *
   * Does NOT wait for a plugin to connect — call `ensureFigmaConnected()` for that.
   *
   * @returns The port number the bridge is (or was already) listening on.
   * @throws If no port in the scan range is available.
   */
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
   * Ensure a Figma plugin is actively connected, waiting up to `timeoutMs` if needed.
   *
   * If the bridge is not yet running it is started via `connectFigma()`. If the plugin
   * is already attached (`figma.isConnected`) this returns immediately. Otherwise it
   * registers a one-time `plugin-connected` listener before re-checking state to close
   * the race window, then rejects with a user-friendly message on timeout.
   *
   * Used by commands that require live plugin data (pull, sync, compose, etc).
   *
   * @param timeoutMs - Milliseconds to wait for a plugin connection (default 30 000).
   * @throws {Error} If no plugin connects within the timeout window.
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

  /** Reads `.memoire/bridge.json` and returns the lock if the process is alive, or `null`. Delegates to the shared bridge-lock module which auto-deletes stale locks. */
  private async _readBridgeLock(): Promise<{ port: number; pid: number } | null> {
    return readBridgeLock(this.config.projectRoot);
  }

  /**
   * Returns `true` when a live `memi connect` bridge or a daemon with an active Figma
   * port is detected on the local machine.
   *
   * `memi pull` uses this to decide whether to wait for a plugin connection or to
   * immediately fall back to the REST API. A `false` return means no WebSocket server
   * is running — the user either hasn't run `memi connect` yet or the process died.
   *
   * @returns `true` if a running bridge or daemon lock file exists and the owning
   *   process is still alive, `false` otherwise.
   */
  async hasRunningBridge(): Promise<boolean> {
    const [lock, daemon] = await Promise.all([
      this._readBridgeLock(),
      this._readDaemonStatus(),
    ]);
    return !!(lock || daemon);
  }

  /** Reads `.memoire/daemon.json` and returns `{ figmaPort }` if the daemon process is alive, or `null` if the file is absent or the PID is stale. */
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

  /**
   * Pull the design system from Figma via the active WebSocket plugin connection.
   *
   * Requires an open plugin connection (`figma.isConnected`). Extracts tokens,
   * components, and styles from the live Figma document, persists them to the registry,
   * and runs `autoSpec()` to create any missing component specs.
   *
   * Results are cached for 5 minutes (per `PULL_CACHE_TTL_MS`). Use `force = true` to
   * bypass the cache — e.g. when the user explicitly runs `memi pull --force`.
   *
   * Prefer this path over `pullDesignSystemREST()` when the plugin is available because
   * it captures richer data (node IDs, variants, layout properties) that the REST API
   * cannot provide on Free/Starter Figma plans.
   *
   * @param force - When `true`, skip the 5-minute pull cache and always re-fetch.
   * @throws {Error} If no plugin is currently connected.
   */
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
   * Pull the design system from Figma via the REST API — no plugin or WebSocket required.
   *
   * Use this path in CI environments, headless machines, or when no `memi connect`
   * bridge is running. Fetches variables/tokens, published components, and styles in
   * parallel via three separate REST endpoints. Variables require a Figma Professional+
   * plan — a Free plan returns a `FigmaPlanError` which is absorbed (tokens will be
   * empty but components/styles are still returned).
   *
   * Shares the same 5-minute pull cache as `pullDesignSystem()` so the two methods can
   * be used interchangeably within a session without triggering duplicate network calls.
   *
   * @param force - When `true`, skip the cache and always re-fetch.
   * @throws {FigmaConfigError} If `FIGMA_TOKEN` is invalid (401), the file key is wrong
   *   (404), or the token lacks access to the file (403 on non-variables endpoints).
   * @throws {Error} If `FIGMA_TOKEN` or `FIGMA_FILE_KEY` are not set in config or env.
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
   * Automatically generate `ComponentSpec` stubs for any Figma components that do not
   * yet have a corresponding spec in the registry.
   *
   * Called automatically at the end of both `pullDesignSystem()` and
   * `pullDesignSystemREST()`. Can also be called directly after a manual registry
   * update. Components with names that cannot be turned into valid TypeScript identifiers
   * are skipped and logged.
   *
   * @returns The number of new specs written to disk (0 if nothing was new).
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

  /**
   * Generate React + Tailwind code for a single named spec.
   *
   * Looks up the spec in the registry, runs the code generator with the current
   * project context and design system, writes files to `generated/`, and emits a
   * `success` event. The engine must be initialized before calling this method.
   *
   * @param specName - The spec name as stored in the registry (case-sensitive).
   * @returns The path to the generated entry file (e.g. `generated/atoms/Button.tsx`).
   * @throws {Error} If the spec does not exist or the engine has not been initialized.
   */
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

  /**
   * Run a full sync pipeline: pull the design system from Figma then regenerate code
   * for all specs in the registry.
   *
   * Requires an active plugin connection (calls `pullDesignSystem()` internally).
   * Equivalent to running `memi pull && memi generate` in sequence.
   */
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

  /** Persists the detected project context to `.memoire/project.json`, preserving the original `detectedAt` timestamp if the rest of the context is unchanged. */
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
