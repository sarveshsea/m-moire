import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { afterEach, describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerInitCommand } from "../init.js";
import {
  ensureGitignorePolicy,
  checkGitignorePolicy,
  renderGitignoreBlock,
} from "../../utils/gitignore-policy.js";
import { captureLogs, lastLog } from "./test-helpers.js";

afterEach(() => {
  resetExecutionPolicyForTests();
  process.exitCode = 0;
});

async function makeDebtRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "memoire-init-team-"));
  await mkdir(join(root, "src", "app"), { recursive: true });
  await writeFile(join(root, "src", "app", "page.tsx"), `
export default function Page() {
  return (
    <div className="bg-[#0a0a0a] border-[#333333]">
      <span className="text-[#ff0000]">alert</span>
      <button onClick={() => null} className="p-1 p-2 p-3 bg-[#111111] text-[#ffffff]">Start</button>
    </div>
  );
}
`, "utf-8");
  return root;
}

async function runInitTeam(root: string): Promise<any> {
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
  const logs = captureLogs();
  const program = new Command();
  registerInitCommand(program, { config: { projectRoot: root } } as never);
  await program.parseAsync(["init", "--team", "--kit", "none", "--json"], { from: "user" });
  return JSON.parse(lastLog(logs));
}

describe("memi init --team", () => {
  it("first run: writes policy, accepts the baseline loudly, and fixes .gitignore", async () => {
    const root = await makeDebtRepo();
    try {
      const payload = await runInitTeam(root);
      expect(payload.status).toBe("completed");
      expect(payload.policy.created).toBe(true);
      expect(payload.policy.preset).toBe("memi-recommended");
      expect(payload.baseline.created).toBe(true);
      expect(payload.baseline.acceptedFindings).toBeGreaterThan(0);
      expect(payload.kit).toEqual({ target: "none", installed: false });

      const policyRaw = JSON.parse(await readFile(join(root, "memoire.policy.json"), "utf-8"));
      expect(policyRaw).toEqual({ schemaVersion: 1, preset: "memi-recommended" });
      const baseline = JSON.parse(await readFile(join(root, ".memoire", "baseline.json"), "utf-8"));
      expect(baseline.entries.length).toBeGreaterThan(0);
      expect(await readFile(join(root, ".gitignore"), "utf-8")).toContain("!.memoire/baseline.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("teammate #2: preserves the committed policy and baseline instead of re-accepting", async () => {
    const root = await makeDebtRepo();
    try {
      const first = await runInitTeam(root);
      const second = await runInitTeam(root);
      expect(second.policy.created).toBe(false);
      expect(second.policy.hash).toBe(first.policy.hash);
      expect(second.baseline.created).toBe(false);
      expect(second.baseline.suppressed).toBe(first.baseline.acceptedFindings);
      expect(second.baseline.active).toBe(0);
      expect(second.baseline.policyHashMatches).toBe(true);
      expect(second.gitignore.action).toBe("unchanged");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("gitignore policy block", () => {
  it("creates .gitignore when missing and is idempotent", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-gitignore-"));
    try {
      const created = await ensureGitignorePolicy(root);
      expect(created.action).toBe("created");
      const again = await ensureGitignorePolicy(root);
      expect(again.action).toBe("unchanged");
      const content = await readFile(join(root, ".gitignore"), "utf-8");
      expect(content).toBe(`${renderGitignoreBlock()}\n`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("appends to an existing .gitignore and reconciles a drifted block", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-gitignore-"));
    try {
      await writeFile(join(root, ".gitignore"), "node_modules/\n", "utf-8");
      const appended = await ensureGitignorePolicy(root);
      expect(appended.action).toBe("updated");
      const content = await readFile(join(root, ".gitignore"), "utf-8");
      expect(content.startsWith("node_modules/\n")).toBe(true);
      expect(content).toContain(renderGitignoreBlock());

      // Drift inside the fence gets reconciled back to canonical.
      await writeFile(join(root, ".gitignore"), content.replace("!.memoire/baseline.json", "# tampered"), "utf-8");
      const reconciled = await ensureGitignorePolicy(root);
      expect(reconciled.action).toBe("updated");
      expect(await readFile(join(root, ".gitignore"), "utf-8")).toContain("!.memoire/baseline.json");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reports a conflicting .memoire/ line outside the block instead of silently succeeding", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-gitignore-"));
    try {
      await writeFile(join(root, ".gitignore"), ".memoire/\n", "utf-8");
      const result = await ensureGitignorePolicy(root);
      expect(result.conflictingLine).toBe(".memoire/");
      const check = await checkGitignorePolicy(root);
      expect(check.present).toBe(true);
      expect(check.upToDate).toBe(true);
      expect(check.conflictingLine).toBe(".memoire/");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
