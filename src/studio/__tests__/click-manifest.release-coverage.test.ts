import { describe, expect, it } from "vitest";
import { buildStudioClickManifestFromActionIds, buildStudioClickManifestFromSource, classifyStudioAction, normalizeStudioActionId, validateStudioClickManifest } from "../click-manifest.js";

describe("release click manifest contract", () => {
  it.each([
    [' "session.run" ', "session.run"], ["", ""], ["{action.id}", "command-palette.action.*"],
    ["section.toLowerCase()", "settings.section.*"], ["artifact.${selectedEntry.id}", "artifact.*"],
    ["artifact.[index]", "artifact.*"], ["artifact.{id}", "artifact.*"],
    ...["selectedEntry.id", "automation.id", "project.id", "session.id", "harness.id", "item.id", "entry.id", "tool.id", "root", "permission", "note.id", "note.name", "file.path", "process.id", "activity.id", "block.id", "recent.id", "filter.id", "tab.id", "template.id", "section.kind", "section.id", "actionIdSegment(value)", "action.request.action", "action.id"].map((value) => [`prefix.${value}`, "prefix.*"]),
  ])("normalizes dynamic selector %s", (input, expected) => {
    expect(normalizeStudioActionId(input)).toBe(expected);
  });

  it("extracts static, template, and expression actions without duplicate selectors", () => {
    const manifest = buildStudioClickManifestFromSource('<button data-action-id="session.run"/><button data-action-id={`artifact.${item.id}`}/><button data-action-id={action.id}/><button data-action-id="session.run"/>');
    expect(manifest.map((item) => item.id)).toEqual(["artifact.*", "command-palette.action.*", "session.run"]);
    expect(manifest[0]).toMatchObject({ label: "Artifact", selector: '[data-action-id="artifact.*"]' });
    expect(validateStudioClickManifest(manifest)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ["theme.dark", "topbar", false, false, "none"],
    ["project.toggle", "sidebar", false, false, "none"],
    ["session.run", "composer", true, true, "workspace"],
    ["session.cancel", "composer", true, true, "none"],
    ["activity.copy-path", "activity", false, false, "none"],
    ["activity.copy-command", "activity", false, false, "none"],
    ["source-ref.copy", "artifact", false, false, "none"],
    ["starter.prompt", "composer", false, false, "none"],
    ["changed-files.review", "changes", true, false, "workspace"],
    ["artifact.open", "artifact", true, false, "none"],
    ["details.inspect", "details", false, false, "none"],
    ["settings.save", "settings", true, false, "none"],
    ["figma.connect", "figma", true, false, "figma"],
    ["automations.run", "automations", true, true, "none"],
    ["knowledge.filter", "knowledge", false, false, "none"],
    ["design-changelog.open", "changelog", true, false, "none"],
    ["computer.capture", "computer", true, false, "computer"],
    ["scenario.run", "scenario", true, false, "none"],
    ["output.copy", "output", true, false, "none"],
    ["download.open", "settings", true, false, "download"],
    ["command-palette.open", "topbar", false, false, "none"],
    ["unregistered", "unknown", false, false, "none"],
  ])("classifies %s for review and permission routing", (id, surface, mutates, requiresHarness, requiresPermission) => {
    expect(classifyStudioAction(id as string)).toMatchObject({ surface, mutates, requiresHarness, requiresPermission });
    expect(classifyStudioAction(id as string).expectedResult.length).toBeGreaterThan(10);
  });

  it("reports missing fields, unknown surfaces, and duplicate identifiers", () => {
    const target = { ...buildStudioClickManifestFromActionIds(["unregistered"])[0], id: "", label: "", selector: "", expectedResult: "" };
    const validation = validateStudioClickManifest([target, target]);
    expect(validation.errors).toHaveLength(9);
    expect(validation.errors).toContain(" is duplicated.");
    expect(validation.warnings).toEqual([" has unknown surface.", " has unknown surface."]);
    expect(buildStudioClickManifestFromActionIds(["", " "])).toEqual([]);
  });
});
