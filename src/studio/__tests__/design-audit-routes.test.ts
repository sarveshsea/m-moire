import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright 2026 Humyn LLC

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { StudioRuntimeServer } from "../server.js";

const servers: StudioRuntimeServer[] = [];

afterEach(async () => {
  resetExecutionPolicyForTests();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function writeAuditableFixture(root: string): Promise<void> {
  configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
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
}

describe("studio design-audit routes", () => {
  it("GET /api/design-audit/latest 404s until an audit has actually been run", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-design-audit-"));
    try {
      await writeAuditableFixture(root);
      const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
      servers.push(server);
      const runtime = await server.start();

      const response = await fetch(`${runtime.url}/api/design-audit/latest`);
      expect(response.status).toBe(404);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs an audit, serves the cached latest result, and gates a fresh finding then suppresses it once baselined", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-design-audit-"));
    try {
      await writeAuditableFixture(root);
      const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
      servers.push(server);
      const runtime = await server.start();

      const runResult = await fetch(`${runtime.url}/api/design-audit/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }).then((res) => res.json());

      expect(runResult.diagnosis.issues.map((issue: { id: string }) => issue.id)).toContain("color.raw-hex");
      expect(runResult.active.map((issue: { id: string }) => issue.id)).toContain("color.raw-hex");
      expect(runResult.suppressed).toEqual([]);
      expect(runResult.baselineExists).toBe(false);
      expect(runResult.history).toHaveLength(1);
      expect(runResult.history[0].score).toBe(runResult.diagnosis.summary.score);

      const latest = await fetch(`${runtime.url}/api/design-audit/latest`).then((res) => res.json());
      expect(latest.diagnosis.summary.score).toBe(runResult.diagnosis.summary.score);
      expect(latest.baselineExists).toBe(false);

      const acceptResult = await fetch(`${runtime.url}/api/design-audit/accept-baseline`, { method: "POST" }).then((res) => res.json());
      expect(acceptResult.baseline.entries.length).toBeGreaterThan(0);

      const rerun = await fetch(`${runtime.url}/api/design-audit/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }).then((res) => res.json());

      expect(rerun.baselineExists).toBe(true);
      expect(rerun.active.map((issue: { id: string }) => issue.id)).not.toContain("color.raw-hex");
      expect(rerun.suppressed.map((issue: { id: string }) => issue.id)).toContain("color.raw-hex");
      expect(rerun.history).toHaveLength(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("POST /api/design-audit/accept-baseline fails with a clear error when no audit has been run yet", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-design-audit-"));
    try {
      await writeAuditableFixture(root);
      const server = new StudioRuntimeServer({ projectRoot: root, port: 0 });
      servers.push(server);
      const runtime = await server.start();

      const response = await fetch(`${runtime.url}/api/design-audit/accept-baseline`, { method: "POST" });
      expect(response.status).toBeGreaterThanOrEqual(400);
      const body = await response.json();
      expect(body.error).toMatch(/no design audit has been run yet/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
