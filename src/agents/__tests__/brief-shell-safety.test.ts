import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildDesignAgentBrief } from "../design-agent-brief.js";

function argumentsFrom(command: string): string[] {
  // Replace memi with a shell function; no CLI, file writes or integrations run.
  const result = spawnSync("/bin/sh", ["-c", 'memi() { printf "%s\\0" "$@"; }; ' + command], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.split("\0").filter(Boolean);
}

describe("design brief command arguments", () => {
  it.skipIf(process.platform === "win32")("preserves literal targets instead of interpreting shell metacharacters", () => {
    for (const target of [".; printf INJECTED; #", "./$(printf INJECTED)", "./`printf INJECTED`", "./O'Brien folder", "https://example.com/?x=1&y=2"]) {
      const brief = buildDesignAgentBrief({ projectRoot: "/tmp/project", target, detail: "full" });
      const command = brief.evidenceCommands.find((item) => item.id === "diagnose")!;
      expect(argumentsFrom(command.command)).toEqual(["diagnose", target, "--json"]);
      const designDoc = brief.evidenceCommands.find((item) => item.id === "design-doc");
      if (designDoc) expect(argumentsFrom(designDoc.command)).toEqual(["design-doc", target, "--spec"]);
    }
  });

  it.skipIf(process.platform === "win32")("preserves literal research intent and never inserts agent input into commands", () => {
    const intent = "Fix $(printf INJECTED) and `printf INJECTED`, O'Brien's layout";
    const agent = "; printf INJECTED; #";
    const brief = buildDesignAgentBrief({ projectRoot: "/tmp/project", intent, agent, mode: "full", detail: "full" });
    const command = brief.evidenceCommands.find((item) => item.id === "research-design")!;
    expect(argumentsFrom(command.command)).toEqual(["research", "design", "--intent", intent, "--write-specs", "--mermaid-jam", "--json"]);
    expect(brief.compatibility.installs.join("\n")).not.toContain(agent);
  });
});
