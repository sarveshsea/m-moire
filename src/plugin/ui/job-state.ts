import type { WidgetHealSummary, WidgetJob, WidgetSyncSummary } from "../shared/contracts.js";

export function upsertJobState(jobs: WidgetJob[], job: WidgetJob, maxJobs: number): WidgetJob[] {
  const next = [...jobs];
  const existing = next.findIndex((candidate) => candidate.id === job.id);
  if (existing >= 0) {
    next[existing] = job;
  } else {
    next.unshift(job);
  }
  return next
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, maxJobs);
}

export function disconnectActiveJobs(jobs: WidgetJob[], timestamp = Date.now()): WidgetJob[] {
  return jobs.map((job) => {
    if (job.status !== "running" && job.status !== "queued") {
      return job;
    }
    return {
      ...job,
      status: "disconnected",
      updatedAt: timestamp,
      progressText: "Bridge disconnected",
      error: job.error ?? "Bridge disconnected before the job completed",
    };
  });
}

export function mergeSyncSummaries(
  current: WidgetSyncSummary | null,
  next: WidgetSyncSummary,
): WidgetSyncSummary {
  return {
    tokens: next.tokens || current?.tokens || 0,
    components: next.components || current?.components || 0,
    styles: next.styles || current?.styles || 0,
    partialFailures: unique([...(current?.partialFailures || []), ...next.partialFailures]),
  };
}

export function reduceHealEvent(
  current: WidgetHealSummary | null,
  message: string,
  source?: string,
): WidgetHealSummary | null {
  if (source !== "canvas-healer") {
    return current;
  }

  if (message.startsWith("Starting self-healing loop")) {
    return { round: 0, healed: false, issueCount: 0, issues: [] };
  }

  const roundMatch = message.match(/Round\s+(\d+):\s+found\s+(\d+)\s+issue/);
  if (roundMatch) {
    return {
      round: Number(roundMatch[1]),
      healed: false,
      issueCount: Number(roundMatch[2]),
      issues: current?.issues || [],
    };
  }

  if (message.startsWith("Canvas healed")) {
    return {
      round: current?.round || 0,
      healed: true,
      issueCount: current?.issueCount || 0,
      issues: current?.issues || [],
    };
  }

  if (message.startsWith("Healing incomplete")) {
    return {
      round: current?.round || 0,
      healed: false,
      issueCount: current?.issueCount || 0,
      issues: current?.issues || [],
    };
  }

  return current;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
