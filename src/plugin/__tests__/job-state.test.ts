import { describe, expect, it } from "vitest";
import { disconnectActiveJobs, mergeSyncSummaries, reduceHealEvent, upsertJobState } from "../ui/job-state.js";
import type { WidgetJob } from "../shared/contracts.js";

describe("plugin ui job state", () => {
  it("upserts jobs and keeps the most recent ordering", () => {
    const initial: WidgetJob[] = [
      {
        id: "a",
        runId: "run-a",
        kind: "sync",
        label: "Sync tokens",
        status: "running",
        startedAt: 1,
        updatedAt: 5,
      },
    ];

    const next = upsertJobState(initial, {
      id: "b",
      runId: "run-b",
      kind: "capture",
      label: "Capture node",
      status: "completed",
      startedAt: 2,
      updatedAt: 10,
      finishedAt: 10,
    }, 24);

    expect(next.map((job) => job.id)).toEqual(["b", "a"]);
  });

  it("downgrades active jobs when the bridge disconnects", () => {
    const jobs: WidgetJob[] = [
      {
        id: "a",
        runId: "run-a",
        kind: "sync",
        label: "Sync tokens",
        status: "running",
        startedAt: 1,
        updatedAt: 5,
      },
      {
        id: "b",
        runId: "run-b",
        kind: "capture",
        label: "Capture node",
        status: "completed",
        startedAt: 2,
        updatedAt: 8,
        finishedAt: 8,
      },
    ];

    expect(disconnectActiveJobs(jobs, 20)).toEqual([
      {
        ...jobs[0],
        status: "disconnected",
        updatedAt: 20,
        progressText: "Bridge disconnected",
        error: "Bridge disconnected before the job completed",
      },
      jobs[1],
    ]);
  });

  it("merges sync summaries and healer progress additively", () => {
    expect(
      mergeSyncSummaries(
        { tokens: 3, components: 0, styles: 0, partialFailures: ["styles timeout"] },
        { tokens: 0, components: 12, styles: 4, partialFailures: [] },
      ),
    ).toEqual({
      tokens: 3,
      components: 12,
      styles: 4,
      partialFailures: ["styles timeout"],
    });

    expect(reduceHealEvent(null, "Starting self-healing loop on node 12", "canvas-healer")).toEqual({
      round: 0,
      healed: false,
      issueCount: 0,
      issues: [],
    });
    expect(reduceHealEvent(
      { round: 0, healed: false, issueCount: 0, issues: [] },
      "Round 2: found 3 issue(s) — applying fixes",
      "canvas-healer",
    )).toEqual({
      round: 2,
      healed: false,
      issueCount: 3,
      issues: [],
    });
  });
});
