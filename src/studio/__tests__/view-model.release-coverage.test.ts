import { describe, expect, it } from "vitest";
import { createStudioTraceSnapshot, deriveStudioTrace, type StudioTraceEventLike } from "../view-model.js";
const event = (type: string, message = "", data?: unknown, id = type): StudioTraceEventLike => ({ id, type, message, data, timestamp: "2026-09-01T00:00:00.000Z" });
const trace = (events: StudioTraceEventLike[]) => deriveStudioTrace({ session: { id: "session", status: "running" }, events });

describe("release trace evidence semantics", () => {
  it.each([
    ["research findings", "research"], ["audit route", "analyze"], ["decision rationale", "ideate"],
    ["screen preview", "design"], ["component tokens", "spec"], ["export result", "handoff"],
  ])("classifies legacy event wording %s", (message, phase) => {
    const result = trace([event("legacy", message)]);
    expect(result.activePhaseId).toBe(phase);
    expect(result.phases.find((entry) => entry.id === phase)).toMatchObject({ status: "running", evidenceIds: ["legacy"] });
  });

  it.each([
    ["chat_message", "chat"], ["stdout", "terminal"], ["stderr", "terminal"], ["figma_candidate", "design"],
    ["design_system_artifact", "artifact"], ["browser_snapshot", "preview"], ["marketplace_download", "marketplace"],
    ["auth_status", "auth"], ["acceptance_statement", "handoff"], ["spec_reference", "artifact"],
  ])("keeps %s output provenance", (type, kind) => {
    const result = trace([event(type, "Evidence", { label: "Review", description: "Observed", filePath: "src/App.ts", previewUrl: "https://example.test/preview" })]);
    expect(result.outputs[0]).toMatchObject({ kind, title: "Review", summary: "Observed", sourcePath: "src/App.ts", url: "https://example.test/preview", eventIds: [type] });
  });

  it.each([
    ["quantitative", "", "quantitative"], ["mixed", "", "mixed"], ["netnography", "", "netnography"],
    ["desk", "", "desk"], [undefined, "community posts", "netnography"], [undefined, "web document", "desk"], [undefined, "interviews", "qualitative"],
  ])("labels research methods from evidence %s", (method, message, expected) => {
    const result = trace([event("research_note", message, { method, tags: ["navigation", 3, null] })]);
    expect(result.researchEvidence[0]).toMatchObject({ method: expected, tags: ["navigation"] });
  });

  it("deduplicates citations across sources and ignores malformed entries", () => {
    const result = trace([
      event("research_note", "Evidence", { citations: [null, [], {}, { href: "https://example.test/a" }, { path: "notes/a.md" }, { title: "Interview" }] }, "a"),
      event("research_note", "More evidence", { sources: [{ url: "https://example.test/a", label: "Same article" }], references: [{ sourcePath: "notes/a.md" }] }, "b"),
    ]);
    expect(result.citations).toHaveLength(3);
    expect(result.citations[0]).toMatchObject({ label: "https://example.test/a", eventIds: ["a", "b"] });
    expect(result.citations[1]).toMatchObject({ label: "notes/a.md", eventIds: ["a", "b"] });
    expect(result.citations[2]).toMatchObject({ label: "Interview", eventIds: ["a"] });
  });

  it.each([
    ["figma_action_started", "figma_action", "running"], ["figma_action_completed", "figma_action", "completed"], ["figma_action_failed", "figma_action", "failed"],
    ["computer_action_started", "computer_action", "running"], ["computer_action_completed", "computer_action", "completed"], ["computer_action_failed", "computer_action", "failed"],
    ["mcp_call", "mcp_call", "completed"], ["browser_snapshot", "browser_action", "completed"],
  ])("represents lifecycle event %s truthfully", (type, kind, status) => {
    expect(trace([event(type)]).activities[0]).toMatchObject({ kind, status, sourceEventIds: [type] });
  });

  it.each([
    ["rg needle", "searching", undefined], ["find src -name '*.ts'", "searching", "src"], ["find", "searching", "workspace"],
    ["ls -a", "listing", undefined], ["tree src", "listing", "src"], ["head README.md", "reading_file", "README.md"],
    ["tail README.md", "reading_file", "README.md"], ["sed -n '1,4p' README.md", "reading_file", "README.md"],
    ["echo hello", "running_command", undefined], ["env cat README.md", "reading_file", "README.md"],
  ])("derives terminal activity for %s", (command, kind, targetPath) => {
    const result = trace([event("terminal_command", command, { status: "started" })]);
    expect(result.activities[0]).toMatchObject({ kind, status: "running", command });
    expect(result.activities[0].targetPath).toBe(targetPath);
    expect(result.activeProcesses).toHaveLength(1);
  });

  it.each([
    [{ status: "failed" }, "failed"], [{ exit_code: 2 }, "failed"], [{ status: "pending" }, "running"], [{ status: "success" }, "completed"], [{}, "completed"],
  ])("does not imply command success for status %j", (data, status) => {
    expect(trace([event("terminal_command", "build", data)]).activities[0].status).toBe(status);
  });

  it("keeps failed tool runs failed after subsequent completion", () => {
    const result = trace([
      event("tool_call", "Read", { id: "t", status: "failed" }, "start"),
      event("tool_result", "later output", { id: "t", status: "completed", name: "Read" }, "finish"),
    ]);
    expect(result.toolRuns).toEqual([{ id: "tool:t", tool: "Read", status: "failed", summary: "later output", eventIds: ["start", "finish"] }]);
  });

  it("tracks pending and rejected approvals independently of session status", () => {
    expect(trace([event("approval_request", "Allow read", { id: "p" })]).toolRuns[0].status).toBe("approval_required");
    const rejected = trace([event("approval_request", "Allow read", { id: "p" }), event("approval_resolved", "Denied", { id: "p", status: "denied" })]);
    expect(rejected.toolRuns[0].status).toBe("failed");
    expect(rejected.activities[0].status).toBe("failed");
  });

  it("retains snapshot origin and ordered event IDs", () => {
    const result = createStudioTraceSnapshot({ session: null, source: "persisted", now: "2026-09-01", events: [event("artifact", ""), event("reference_trace")] });
    expect(result).toMatchObject({ sessionId: null, source: "persisted", generatedAt: "2026-09-01", eventIds: ["artifact", "reference_trace"] });
    expect(result.activities[0].summary).toBe("Model returned a final result without tool calls.");
    expect(createStudioTraceSnapshot({ session: null, source: "empty", events: [] }).generatedAt).toMatch(/^\d{4}-/);
  });
});
