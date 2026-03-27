import { describe, expect, it } from "vitest";
import { formatAgentBoxLines, formatAgentBoxName, getAgentBoxKey, sortAgentBoxUpdates, type AgentBoxUpdate } from "../agent-box.js";

describe("agent box helpers", () => {
  it("builds stable run-task-role identities", () => {
    expect(getAgentBoxKey({ runId: "plan-1", taskId: "task-4", role: "figma-executor" })).toBe(
      "plan-1:task-4:figma-executor",
    );
  });

  it("formats box labels and details for active and failed tasks", () => {
    const active: AgentBoxUpdate = {
      runId: "plan-1",
      taskId: "task-1",
      role: "component-architect",
      title: "Create dashboard card",
      status: "busy",
      taskIndex: 0,
      totalTasks: 3,
      dependencyCount: 1,
      elapsedMs: 2200,
    };

    expect(formatAgentBoxName(active)).toBe("• [component-architect] Create dashboard card");
    expect(formatAgentBoxLines(active)).toEqual({
      title: "1/3 · component-architect",
      meta: "busy · 1 deps · 2s",
      detail: "Create dashboard card",
    });

    expect(
      formatAgentBoxLines({
        ...active,
        status: "error",
        error: "Figma execute failed",
        healRound: 2,
      }),
    ).toEqual({
      title: "1/3 · component-architect",
      meta: "error · 1 deps · 2s · heal 2",
      detail: "Figma execute failed",
    });
  });

  it("sorts updates deterministically by task index, role, and task id", () => {
    const updates: AgentBoxUpdate[] = [
      {
        runId: "plan-1",
        taskId: "task-b",
        role: "layout-designer",
        title: "Layout",
        status: "busy",
        taskIndex: 2,
        totalTasks: 3,
      },
      {
        runId: "plan-1",
        taskId: "task-a",
        role: "component-architect",
        title: "Spec",
        status: "done",
        taskIndex: 1,
        totalTasks: 3,
      },
      {
        runId: "plan-1",
        taskId: "task-c",
        role: "accessibility-checker",
        title: "Audit",
        status: "idle",
        taskIndex: 1,
        totalTasks: 3,
      },
    ];

    expect(sortAgentBoxUpdates(updates).map((update) => update.taskId)).toEqual([
      "task-c",
      "task-a",
      "task-b",
    ]);
  });
});
