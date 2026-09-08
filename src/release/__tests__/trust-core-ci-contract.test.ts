import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Trust Core verification configuration", () => {
  it("defines a dedicated coverage gate at 80 percent for every metric", async () => {
    const config = await readFile(join(root, "vitest.trust-core.config.ts"), "utf8");
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

    expect(config).toContain('provider: "v8"');
    expect(config).toContain("Vitest 4 includes every file matching `include`");
    for (const metric of ["lines", "branches", "functions", "statements"]) {
      expect(config).toMatch(new RegExp(`${metric}:\\s*80`));
    }
    expect(config).toContain('"src/security/execution-policy.ts"');
    expect(config).toContain('"src/security/metadata-receipt.ts"');
    expect(config).toContain('"src/security/command-preflight.ts"');
    expect(config).toContain('"scripts/lib/trust-core-e2e.mjs"');
    expect(config).toContain('"**/__tests__/**"');
    expect(config).toContain('"**/*.d.ts"');
    expect(packageJson.scripts["test:trust-core"]).toBe(
      "vitest run --config vitest.trust-core.config.ts",
    );
    expect(packageJson.scripts["test:trust-core:coverage"]).toBe(
      "vitest run --config vitest.trust-core.config.ts --coverage",
    );
  });

  it("rebuilds the publishable runtime before packed-artifact smoke", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(packageJson.scripts["smoke:trust-core"]).toBe(
      "npm run build && npm run stage:package && node scripts/trust-core-e2e.mjs --package-root .dist/npm-package",
    );
    expect(packageJson.scripts.prepublishOnly).toContain("npm run test:trust-core:coverage");
    expect(packageJson.scripts.prepublishOnly).toContain("npm run smoke:trust-core -- --portable");
  });

  it("runs the portable packed-artifact suite on Node 20, 22, and 24 across all supported hosts", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "clean-install.yml"), "utf8");

    expect(workflow).toContain("os: [ubuntu-latest, macos-latest, windows-latest]");
    expect(workflow).toContain("node-version: [20, 22, 24]");
    expect(workflow).toContain("npm run test:trust-core:coverage");
    expect(workflow).toContain("npm run smoke:trust-core -- --portable");
  });

  it("defines fail-closed Linux amd64 and arm64 read-only, non-root, networkless contracts", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "trust-core.yml"), "utf8");

    expect(workflow).toContain("platform: [linux/amd64, linux/arm64]");
    expect(workflow).toContain("--network none");
    expect(workflow).toContain("--read-only");
    expect(workflow).toContain("--user 65532:65532");
    expect(workflow).toContain('if [ "$PLATFORM" = "linux/arm64" ]');
    expect(workflow).toContain("docker run --rm \\");
    expect(workflow).toContain('--performance-mode "$performance_mode"');
    expect(workflow).toContain("npm run test:trust-core:coverage");
    expect(workflow).toContain("run: npm run stage:package");
    expect(workflow).toContain("working-directory: .dist/npm-package");
    expect(workflow).not.toContain("npm pack --ignore-scripts --pack-destination .trust-artifacts");
    const dockerfile = await readFile(join(root, ".github", "trust-core", "Dockerfile"), "utf8");
    expect(dockerfile).toContain("scripts/trust-core-e2e.mjs");
    expect(dockerfile).toContain('"--container"');

    const harness = await readFile(join(root, "scripts", "trust-core-e2e.mjs"), "utf8");
    expect(harness).toContain('arg === "--performance-mode"');
    expect(harness).toContain('performanceMode: options.performanceMode');
    expect(harness).toContain('enforced: options.performanceMode === "enforced"');
    expect(harness).toContain("commandTimeoutForMode(options.performanceMode");
    expect(harness).not.toMatch(/timeoutMs:\s*(?:5_000|10_000)/);
    expect(harness.indexOf("const DEFAULT_CONFORMANCE_TIMEOUT_MS")).toBeLessThan(
      harness.indexOf("const args = parseArgs"),
    );
  });

  it("enforces the unchanged container performance budgets on native Linux arm64", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "trust-core.yml"), "utf8");
    const nativeJob = workflow.split("  native-arm64:\n")[1]?.split(/^  [a-z][\w-]*:\n/m)[0];

    expect(nativeJob).toBeDefined();
    expect(nativeJob).toContain("runs-on: ubuntu-24.04-arm");
    expect(nativeJob).toContain('test "$(uname -m)" = "aarch64"');
    expect(nativeJob).toContain("--platform linux/arm64");
    expect(nativeJob).toContain("--performance-mode enforced");
    expect(nativeJob).toContain("--network none");
    expect(nativeJob).toContain("--read-only");
    expect(nativeJob).toContain("--user 65532:65532");
    expect(nativeJob).toContain("working-directory: .dist/npm-package");
    expect(nativeJob).not.toContain("setup-qemu-action");
    expect(nativeJob).not.toContain("conformance");
    expect(nativeJob).not.toContain("continue-on-error");
  });

  it("requires reusable Trust Core verification of the publication source before publishing", async () => {
    const trustWorkflow = await readFile(join(root, ".github", "workflows", "trust-core.yml"), "utf8");
    const publishWorkflow = await readFile(join(root, ".github", "workflows", "publish.yml"), "utf8");
    const prerequisite = publishWorkflow.split("  trust-core:\n")[1]?.split(/^  [a-z][\w-]*:\n/m)[0];
    const publishJob = publishWorkflow.split("  publish:\n")[1];

    expect(trustWorkflow).toMatch(/^  workflow_call:$/m);
    expect(prerequisite).toContain("uses: ./.github/workflows/trust-core.yml");
    expect(prerequisite).toContain("contents: read");
    expect(prerequisite).not.toContain("id-token: write");
    expect(prerequisite).not.toContain("secrets: inherit");
    expect(publishJob).toMatch(/^    needs: trust-core$/m);
    expect(publishJob).not.toMatch(/always\(\)|continue-on-error/);
  });

  it("runs the canonical prepublish gates explicitly before scriptless publication", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "publish.yml"), "utf8");
    const gateStep = workflow.split("      - name: Run release gates\n")[1]?.split("      - name:")[0];
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

    expect(gateStep).toBeDefined();
    expect(gateStep).toMatch(/^          npm run prepublishOnly$/m);
    expect(gateStep).not.toMatch(/if:|continue-on-error|\|\| true/);
    expect(workflow.indexOf("npm run prepublishOnly")).toBeLessThan(workflow.indexOf("npm publish --access public"));
    expect(workflow).toContain("npm publish --access public --provenance --ignore-scripts");
    for (const gate of ["check:release", "security:audit", "typecheck", "test:core:coverage", "build", "test:trust-core:coverage", "smoke:trust-core -- --portable"]) {
      expect(packageJson.scripts.prepublishOnly.split(" && ")).toContain(`npm run ${gate}`);
    }
  });

  it("pins every third-party action in the Trust Core workflow", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "trust-core.yml"), "utf8");
    const refs = [...workflow.matchAll(/^\s+- uses: ([^\s#]+)(?:\s+#.*)?$/gm)]
      .map(([, ref]) => ref)
      .filter((ref) => !ref.startsWith("./"));

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ref).toMatch(/^[^@]+@[0-9a-f]{40}$/);
    }
  });

  it("runs the repo self-gate under an explicit connected capability budget", async () => {
    const workflow = await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8");

    expect(workflow).toContain("node dist/index.js --profile connected --allow project-write --allow source-content-persistence --allow shell ci");
    expect(workflow).not.toContain("run: node dist/index.js ci");
  });
});
