import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerDiagnoseCommand } from "../diagnose.js";
import { captureLogs, lastLog } from "./test-helpers.js";

describe("memi diagnose", () => {
  it("emits app-quality JSON for an existing web app", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-diagnose-command-"));
    try {
      await mkdir(join(root, "src", "app"), { recursive: true });
      await writeFile(join(root, "src", "app", "page.tsx"), `
export default function Page() {
  return <button onClick={() => null} className="p-1 p-2 p-3 bg-[#111] text-[#fff]">Start</button>;
}
`, "utf-8");

      const logs = captureLogs();
      const program = new Command();
      registerDiagnoseCommand(program, { config: { projectRoot: root } } as never);

      await program.parseAsync(["diagnose", "--json", "--no-write"], { from: "user" });
      const payload = JSON.parse(lastLog(logs));

      expect(payload.version).toBe(1);
      expect(payload.summary.scannedFiles).toBe(1);
      expect(payload.summary.score).toBeLessThan(100);
      expect(payload.issues.some((issue: { id: string }) => issue.id === "color.raw-hex")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
