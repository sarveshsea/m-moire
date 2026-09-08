import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateAuditScorecardGate,
  evaluateChangelogGate,
} from "../../../scripts/check-release.mjs";

const betaVersion = "2.8.0-beta.1";
const staleEvidenceFailure =
  "Evidence is stale at release time: reviewed-candidate-audit, swiftui-rendered-rerun";

describe("Trust Core candidate release-check policy", () => {
  it("reports the beta candidate honestly without blocking on its named stale-evidence limitation", () => {
    const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "check-release.mjs")], {
      cwd: process.cwd(),
      encoding: "utf8",
      // This integration invokes the complete multi-process release checker.
      timeout: 120_000,
      env: {
        ...process.env,
        SKIP_PACK_GATE: "1",
      },
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    expect(result.error).toBeUndefined();
    expect(result.status, output).toBe(0);

    expect(output).not.toContain(
      "CHANGELOG.md starts at v2.7.9 but package.json is 2.8.0-beta.1",
    );
    expect(output).not.toContain(
      "audit scorecard gate failed: Evidence is stale at release time: reviewed-candidate-audit, swiftui-rendered-rerun",
    );
    expect(output).toContain(
      "TRUST_CORE_BETA_PENDING_DESIGNWORKBENCH_EVIDENCE: reviewed-candidate-audit and swiftui-rendered-rerun must be refreshed before stable",
    );
  }, 130_000);

  it("accepts only an honestly labeled candidate top heading", () => {
    expect(evaluateChangelogGate({
      changelog: "# Changelog\n\n## Trust Core 2.8 development — Unreleased\n\n## v2.7.9 — Published\n",
      version: betaVersion,
      engineState: "candidate",
    })).toEqual([]);
    expect(evaluateChangelogGate({
      changelog: "# Changelog\n\n## v2.8.0-beta.1 — Published\n",
      version: betaVersion,
      engineState: "candidate",
    })).toContain(
      "CHANGELOG.md candidate must start with an Unreleased or Candidate heading",
    );
  });

  it("preserves exact stable changelog version checks", () => {
    expect(evaluateChangelogGate({
      changelog: "# Changelog\n\n## v2.7.9 — Published\n",
      version: "2.7.9",
      engineState: "published",
    })).toEqual([]);
    expect(evaluateChangelogGate({
      changelog: "# Changelog\n\n## v2.7.8 — Published\n",
      version: "2.7.9",
      engineState: "published",
    })).toContain("CHANGELOG.md starts at v2.7.8 but package.json is 2.7.9");
  });

  it("names only the exact beta candidate scorecard limitation", () => {
    expect(evaluateAuditScorecardGate({
      status: 1,
      message: staleEvidenceFailure,
      version: betaVersion,
      engineState: "candidate",
    })).toEqual({
      failures: [],
      limitations: [
        "TRUST_CORE_BETA_PENDING_DESIGNWORKBENCH_EVIDENCE: reviewed-candidate-audit and swiftui-rendered-rerun must be refreshed before stable",
      ],
    });
  });

  it("keeps the same stale evidence blocking for stable", () => {
    expect(evaluateAuditScorecardGate({
      status: 1,
      message: staleEvidenceFailure,
      version: "2.8.0",
      engineState: "published",
    })).toEqual({
      failures: [`audit scorecard gate failed: ${staleEvidenceFailure}`],
      limitations: [],
    });
  });

  it("does not hide additional or unrelated scorecard failures", () => {
    for (const message of [
      `${staleEvidenceFailure}\nScorecard digest mismatch`,
      "Scorecard digest mismatch",
    ]) {
      expect(evaluateAuditScorecardGate({
        status: 1,
        message,
        version: betaVersion,
        engineState: "candidate",
      })).toEqual({
        failures: [`audit scorecard gate failed: ${message}`],
        limitations: [],
      });
    }
  });
});


describe("published beta release boundaries", () => {
  it("accepts the full published prerelease changelog version", () => {
    expect(evaluateChangelogGate({ changelog: "# Changelog\n\n## v2.8.0-beta.1 — Published beta\n", version: betaVersion, engineState: "published" })).toEqual([]);
  });
  it.each([
    ["2.8.0", "2.8.0-beta.1"],
    ["2.8.0-beta.1", "2.8.0"],
    ["2.8.0-beta.2", "2.8.0-beta.1"],
  ])("rejects heading %s for package %s", (heading, version) => {
    expect(evaluateChangelogGate({ changelog: `## v${heading} — Published\n`, version, engineState: "published" })).not.toEqual([]);
  });
  it.each(["candidate", "published"])("retains only the named beta limitation in %s state", engineState => {
    expect(evaluateAuditScorecardGate({ status: 1, message: staleEvidenceFailure, version: betaVersion, engineState })).toEqual({ failures: [], limitations: ["TRUST_CORE_BETA_PENDING_DESIGNWORKBENCH_EVIDENCE: reviewed-candidate-audit and swiftui-rendered-rerun must be refreshed before stable"] });
  });
  it.each([
    ["2.8.0", "published", staleEvidenceFailure],
    ["2.8.0-beta.3", "published", staleEvidenceFailure],
    [betaVersion, "unknown", staleEvidenceFailure],
    [betaVersion, "published", `${staleEvidenceFailure}\nScorecard digest mismatch`],
    [betaVersion, "published", "Scorecard digest mismatch"],
  ])("blocks unsupported exception %s/%s/%s", (version, engineState, message) => {
    expect(evaluateAuditScorecardGate({ status: 1, message, version, engineState })).toEqual({ failures: [`audit scorecard gate failed: ${message}`], limitations: [] });
  });
});


describe("reviewed beta.2 disposition", () => {
  it.each(["candidate", "published"])("retains the same two named limitations for beta.2 %s", engineState => {
    expect(evaluateAuditScorecardGate({ status: 1, message: staleEvidenceFailure, version: "2.8.0-beta.2", engineState })).toEqual({
      failures: [],
      limitations: ["TRUST_CORE_BETA_PENDING_DESIGNWORKBENCH_EVIDENCE: reviewed-candidate-audit and swiftui-rendered-rerun must be refreshed before stable"],
    });
  });
  it.each([
    ["2.8.0-beta.3", "published", staleEvidenceFailure],
    ["2.8.0-beta.2", "unknown", staleEvidenceFailure],
    ["2.8.0-beta.3", "candidate", staleEvidenceFailure],
    ["2.8.0", "candidate", staleEvidenceFailure],
    ["2.8.0", "published", staleEvidenceFailure],
    ["2.8.0-beta.2", "candidate", `${staleEvidenceFailure}\nScorecard digest mismatch`],
    ["2.8.0-beta.2", "candidate", "Evidence is stale at release time: reviewed-candidate-audit"],
    ["2.8.0-beta.2", "candidate", "Native standalone smoke failed"],
  ])("blocks unreviewed scope %s/%s/%s", (version, engineState, message) => {
    expect(evaluateAuditScorecardGate({ status: 1, message, version, engineState })).toEqual({ failures: [`audit scorecard gate failed: ${message}`], limitations: [] });
  });
});
