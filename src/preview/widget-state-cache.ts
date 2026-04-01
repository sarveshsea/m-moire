import type {
  AgentBoxState,
  WidgetConnectionState,
  WidgetHealSummary,
  WidgetJob,
  WidgetSelectionSnapshot,
  WidgetSyncSummary,
} from "../plugin/shared/contracts.js";

export interface PreviewBridgeStatus {
  running: boolean;
  port: number;
  clients: { id: string; file: string; editor: string; connectedAt: string }[];
}

export interface PreviewWidgetStatusPayload {
  connected: boolean;
  port: number | null;
  clients: PreviewBridgeStatus["clients"];
  bridge: PreviewBridgeStatus;
  connection: WidgetConnectionState | null;
  selection: WidgetSelectionSnapshot | null;
  jobs: WidgetJob[];
  agents: AgentBoxState[];
  sync: WidgetSyncSummary | null;
  heal: WidgetHealSummary | null;
  counts: {
    jobs: {
      total: number;
      running: number;
      completed: number;
      failed: number;
      disconnected: number;
    };
    agents: {
      total: number;
      idle: number;
      busy: number;
      done: number;
      error: number;
    };
  };
  updatedAt: number;
}

type BridgeStatusLike = Pick<PreviewBridgeStatus, "running" | "port" | "clients">;

export class PreviewWidgetStateCache {
  private connection: WidgetConnectionState | null = null;
  private selection: WidgetSelectionSnapshot | null = null;
  private jobs = new Map<string, WidgetJob>();
  private agents = new Map<string, AgentBoxState>();
  private sync: WidgetSyncSummary | null = null;
  private heal: WidgetHealSummary | null = null;
  private updatedAt = Date.now();

  updateConnection(connection: WidgetConnectionState): void {
    if (!connection?.stage) return;
    this.connection = connection;
    this.touch();
  }

  updateSelection(selection: WidgetSelectionSnapshot): void {
    this.selection = selection;
    this.touch();
  }

  upsertJob(job: WidgetJob): void {
    if (!job?.id || !job?.status) return;
    this.jobs.set(job.id, job);
    this.touch();
  }

  upsertAgent(agent: AgentBoxState): void {
    if (!agent?.runId || !agent?.taskId || !agent?.role) return;
    const key = `${agent.runId}:${agent.taskId}:${agent.role}`;
    this.agents.set(key, agent);
    this.touch();
  }

  mergeSync(sync: WidgetSyncSummary): void {
    if (!sync) return;
    this.sync = {
      tokens: sync.tokens ?? this.sync?.tokens ?? 0,
      components: sync.components ?? this.sync?.components ?? 0,
      styles: sync.styles ?? this.sync?.styles ?? 0,
      partialFailures: unique([...(this.sync?.partialFailures || []), ...(sync.partialFailures || [])]),
    };
    this.touch();
  }

  updateHeal(heal: WidgetHealSummary): void {
    this.heal = heal;
    this.touch();
  }

  /** Transition running jobs → disconnected and busy agents → error on plugin disconnect. */
  markDisconnected(): void {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.status === "running") {
        this.jobs.set(id, { ...job, status: "disconnected", updatedAt: now });
      }
    }
    for (const [key, agent] of this.agents) {
      if (agent.status === "busy") {
        this.agents.set(key, { ...agent, status: "error", error: "Plugin disconnected" });
      }
    }
    this.touch();
  }

  snapshot(bridge: BridgeStatusLike): PreviewWidgetStatusPayload {
    const jobs = this.getJobs();
    const agents = this.getAgents();
    return {
      connected: bridge.clients.length > 0,
      port: bridge.clients.length > 0 ? bridge.port : null,
      clients: bridge.clients,
      bridge: {
        running: bridge.running,
        port: bridge.port,
        clients: bridge.clients,
      },
      connection: this.connection,
      selection: this.selection,
      jobs,
      agents,
      sync: this.sync,
      heal: this.heal,
      counts: {
        jobs: {
          total: jobs.length,
          running: jobs.filter((job) => job.status === "running").length,
          completed: jobs.filter((job) => job.status === "completed").length,
          failed: jobs.filter((job) => job.status === "failed").length,
          disconnected: jobs.filter((job) => job.status === "disconnected").length,
        },
        agents: {
          total: agents.length,
          idle: agents.filter((agent) => agent.status === "idle").length,
          busy: agents.filter((agent) => agent.status === "busy").length,
          done: agents.filter((agent) => agent.status === "done").length,
          error: agents.filter((agent) => agent.status === "error").length,
        },
      },
      updatedAt: this.updatedAt,
    };
  }

  getJobs(): WidgetJob[] {
    return Array.from(this.jobs.values()).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  getSelection(): WidgetSelectionSnapshot | null {
    return this.selection;
  }

  getAgents(): AgentBoxState[] {
    return Array.from(this.agents.values()).sort((left, right) => {
      if (left.runId !== right.runId) return left.runId.localeCompare(right.runId);
      if (left.taskId !== right.taskId) return left.taskId.localeCompare(right.taskId);
      return left.role.localeCompare(right.role);
    });
  }

  getConnection(): WidgetConnectionState | null {
    return this.connection;
  }

  getSync(): WidgetSyncSummary | null {
    return this.sync;
  }

  getHeal(): WidgetHealSummary | null {
    return this.heal;
  }

  private touch(): void {
    this.updatedAt = Date.now();
  }
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
