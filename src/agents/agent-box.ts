export type AgentBoxVisualStatus = "idle" | "busy" | "error" | "done";

export interface AgentBoxUpdate {
  runId: string;
  taskId: string;
  role: string;
  title: string;
  status: AgentBoxVisualStatus;
  taskIndex: number;
  totalTasks: number;
  dependencyCount?: number;
  summary?: string;
  error?: string;
  healRound?: number;
  elapsedMs?: number;
}

export function getAgentBoxKey(update: Pick<AgentBoxUpdate, "runId" | "taskId" | "role">): string {
  return `${update.runId}:${update.taskId}:${update.role}`;
}

export function formatAgentBoxName(update: AgentBoxUpdate): string {
  const prefix = update.status === "done"
    ? "✓"
    : update.status === "error"
      ? "!"
      : update.status === "busy"
        ? "•"
        : "○";
  return `${prefix} [${update.role}] ${update.title}`;
}

export function formatAgentBoxLines(update: AgentBoxUpdate): { title: string; meta: string; detail: string } {
  const title = `${update.taskIndex + 1}/${update.totalTasks} · ${update.role}`;
  const metaParts = [
    update.status,
    update.dependencyCount ? `${update.dependencyCount} deps` : "no deps",
    update.elapsedMs !== undefined ? formatElapsed(update.elapsedMs) : "",
    update.healRound !== undefined ? `heal ${update.healRound}` : "",
  ].filter(Boolean);
  const detail = update.error || update.summary || update.title;
  return {
    title,
    meta: metaParts.join(" · "),
    detail,
  };
}

export function sortAgentBoxUpdates(updates: AgentBoxUpdate[]): AgentBoxUpdate[] {
  return [...updates].sort((left, right) => {
    if (left.taskIndex !== right.taskIndex) {
      return left.taskIndex - right.taskIndex;
    }
    if (left.role !== right.role) {
      return left.role.localeCompare(right.role);
    }
    return left.taskId.localeCompare(right.taskId);
  });
}

function formatElapsed(elapsedMs: number): string {
  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}
