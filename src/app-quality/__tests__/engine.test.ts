import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagnoseAppQuality } from "../engine.js";

describe("diagnoseAppQuality", () => {
  it("detects code-native design debt and writes reports", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-app-quality-"));
    try {
      await mkdir(join(root, "src", "components", "ui"), { recursive: true });
      await mkdir(join(root, "src", "app", "dashboard"), { recursive: true });
      await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0", tailwindcss: "4.0.0" } }), "utf-8");
      await writeFile(join(root, "src", "components", "ui", "button.tsx"), "export function Button(){ return null }\n", "utf-8");
      await writeFile(join(root, "src", "app", "dashboard", "page.tsx"), `
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  return (
    <main className="p-1 p-2 p-3 p-4 p-5 p-6 p-7 p-8 p-9 text-xs text-sm text-base text-lg text-xl text-2xl text-[19px] bg-[#111111] text-[#fafafa] rounded-sm rounded-md rounded-lg rounded-xl rounded-[18px] shadow-sm shadow-md shadow-lg">
      <img src="/hero.png" />
      <Button className="bg-blue-500 hover:bg-blue-600">Ship</Button>
      <button onClick={() => null} className="px-[13px] py-[7px] bg-[#0055ff]">Raw</button>
    </main>
  );
}
`, "utf-8");

      const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: true });

      expect(diagnosis.summary.scannedFiles).toBeGreaterThan(0);
      expect(diagnosis.summary.score).toBeLessThan(100);
      expect(diagnosis.issues.map((issue) => issue.id)).toContain("color.raw-hex");
      expect(diagnosis.issues.map((issue) => issue.id)).toContain("a11y.image-alt");
      expect(diagnosis.directions.map((direction) => direction.id)).toContain("premium-saas");
      await expect(readFile(join(root, ".memoire", "app-quality", "diagnosis.json"), "utf-8")).resolves.toContain("\"version\": 1");
      await expect(readFile(join(root, ".memoire", "app-quality", "diagnosis.md"), "utf-8")).resolves.toContain("# Memoire App Diagnosis");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
