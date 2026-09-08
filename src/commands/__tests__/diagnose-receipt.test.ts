import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDiagnoseCommand } from "../diagnose.js";
import { captureLogs } from "./test-helpers.js";
const roots: string[] = [];
async function fixture(content: string) { const root = await mkdtemp(join(tmpdir(), "PRIVATE_PROJECT_MARKER-")); roots.push(root); await writeFile(join(root, "PRIVATE_FILE_MARKER.tsx"), content); return root; }
async function run(root: string, args: string[]) {
  const logs = captureLogs(); const program = new Command().exitOverride();
  registerDiagnoseCommand(program, { config: { projectRoot: root } } as never);
  await program.parseAsync(["diagnose", ...args], { from: "user" }); return logs;
}
afterEach(async () => { process.exitCode = 0; vi.restoreAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
describe("metadata-only diagnosis", () => {
  it("emits exactly one metadata receipt with counts/hash and no source or private paths", async () => {
    const root = await fixture('export default () => <main className="p-4">PRIVATE_SOURCE_MARKER</main>;');
    const logs = await run(root, ["--receipt-only", "--trend", "--fail-on", "none"]);
    expect(logs).toHaveLength(1);
    const text = logs[0]; const receipt = JSON.parse(text);
    expect(receipt.schemaVersion).toBe("memi.receipt.v1");
    expect(receipt.evidence.counts.scannedFiles).toBe(1);
    expect(receipt.evidence.hashes.diagnosis).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.policy.decisions.length).toBeGreaterThan(0);
    for (const secret of [root, "PRIVATE_PROJECT_MARKER", "PRIVATE_FILE_MARKER", "PRIVATE_SOURCE_MARKER"]) expect(text).not.toContain(secret);
    expect(receipt).not.toHaveProperty("target");
    await expect(access(join(root, ".memoire"))).rejects.toThrow();
  });
  it("preserves gate failure exit status in receipt-only mode", async () => {
    const root = await fixture('export default () => <div className="bg-[#111111] text-[#222222] border-[#333333] ring-[#444444] from-[#555555]" />;');
    const logs = await run(root, ["--receipt-only", "--fail-on", "high"]);
    expect(JSON.parse(logs[0]).evidence.counts.gateFailed).toBe(1);
    expect(process.exitCode).toBe(1);
  });
  it("rejects agent context without exposing any context", async () => {
    const root = await fixture('export default () => <main>PRIVATE_SOURCE_MARKER</main>;');
    const logs = await run(root, ["--receipt-only", "--agent-context"]);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]).evidence.ruleIds).toContain("diagnose.options-conflict");
    expect(logs[0]).not.toContain("PRIVATE_");
    expect(process.exitCode).toBe(1);
  });
  it("does not leak private paths through failure messages", async () => {
    const root = await fixture("export const x = 1;");
    const logs = await run(root, [join(root, "PRIVATE_MISSING_MARKER"), "--receipt-only"]);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]).evidence.counts.errors).toBe(1);
    expect(logs[0]).not.toContain("PRIVATE_");
    expect(process.exitCode).toBe(1);
  });
  it("renders unassessed quality as unassessed, not a zero score", async () => {
    const root = await fixture("export const x = 1;");
    const logs = await run(root, ["--no-write", "--fail-on", "none"]);
    expect(logs.join("\n")).not.toContain("0/100");
    expect(logs.join("\n")).toContain("unassessed");
    expect(logs.join("\n")).toContain("eligible");
  });
});
