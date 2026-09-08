import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflowPath = join(process.cwd(), ".github/workflows/native-candidate.yml");
const targets = [
  ["darwin-arm64", "darwin-arm64", "macos-14", "darwin-arm64"],
  ["darwin-x64", "darwin-x64", "macos-15-intel", "darwin-x64"],
  ["linux-arm64", "linux-arm64", "ubuntu-24.04-arm", "linux-arm64"],
  ["linux-x64", "linux-x64", "ubuntu-latest", "linux-x64"],
  ["win-x64", "windows-x64", "windows-latest", "win32-x64"],
] as const;

async function workflow(): Promise<string> {
  return readFile(workflowPath, "utf8");
}

function stepBlocks(source: string): string[] {
  return source.split(/^ {6}- /m).slice(1);
}

describe("native candidate validation workflow", () => {
  it("validates pull requests and main pushes without publication authority", async () => {
    const source = await workflow();
    const triggers = source.split(/^on:\s*$/m)[1]?.split(/^permissions:/m)[0] ?? "";
    expect(triggers).toMatch(/^ {2}pull_request:\s*\n {4}branches: \[main, "codex\/2\.8-\*"\]/m);
    expect(triggers).toMatch(/^ {2}push:\s*\n {4}branches: \[main\]/m);
    expect(source).toMatch(/^permissions:\s*\n {2}contents: read$/m);
    expect(source).not.toMatch(/pull_request_target|secrets\.|id-token:|attestations:|contents: write|packages: write/);
    expect(source).not.toMatch(/npm publish|gh release|action-gh-release|upload-artifact|attest-build-provenance|build-push-action/);
  });

  it.each(targets)("runs %s on its native runner with the correct offline/esbuild target", async (
    binaryTarget, offlineTarget, runner, esbuildPackage,
  ) => {
    const source = await workflow();
    const rows = source.split(/^ {10}- binaryTarget: /m).slice(1);
    expect(rows).toHaveLength(targets.length);
    const row = rows.find((value) => value.startsWith(`${binaryTarget}\n`))?.split(/^    steps:/m)[0];
    expect(row).toBeDefined();
    expect(row).toContain(`offlineTarget: ${offlineTarget}\n`);
    expect(row).toContain(`runner: ${runner}\n`);
    expect(row).toContain(`esbuildPackage: ${esbuildPackage}\n`);
    expect(source).toContain("runs-on: ${{ matrix.runner }}");
    expect(source).toContain("name: native candidate / ${{ matrix.offlineTarget }}");
  });

  it("uses the checked-out candidate and pinned build tools with the committed lock", async () => {
    const source = await workflow();
    const steps = stepBlocks(source);
    expect(steps[0]).toContain("uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1");
    expect(steps[0]).toContain("persist-credentials: false");
    expect(steps[0]).not.toMatch(/^\s+ref:/m);
    expect(source).toContain("uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020");
    expect(source).toContain("node-version: '20'");
    expect(source).toContain("cache-dependency-path: npm-shrinkwrap.json");
    expect(source).toContain("uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(source).toContain("bun-version: 1.3.11");
    expect(source).toContain("run: npm ci --include=optional --ignore-scripts");
    for (const [, ref] of source.matchAll(/uses:\s+(\S+)/g)) {
      expect(ref).toMatch(/^[^@]+@[a-f0-9]{40}$/);
    }
  });

  it("requires typecheck, build, both packages, and the real standalone smoke in order", async () => {
    const source = await workflow();
    const commands = [
      "npm ci --include=optional --ignore-scripts",
      "npm run typecheck",
      "npm run build",
      "node scripts/build-binary.mjs --target=${{ matrix.binaryTarget }}",
      "node scripts/build-offline-bundle.mjs --target=${{ matrix.offlineTarget }}",
      "node scripts/smoke-standalone.mjs dist-bin/memi-${{ matrix.binaryTarget }}",
    ];
    let previous = -1;
    for (const command of commands) {
      const offset = source.indexOf(command);
      expect(offset, command).toBeGreaterThan(previous);
      previous = offset;
      const step = stepBlocks(source).find((value) => value.includes(command));
      expect(step, command).toBeDefined();
      expect(step, command).not.toMatch(/^\s+if:|continue-on-error|\|\|\s*true/m);
    }
    expect(source).toContain("fail-fast: false");
    expect(source).toContain("timeout-minutes: 30");
    expect(source).not.toContain("continue-on-error");
  });

  it("retains platform esbuild provisioning and restores Windows bytes before compilation", async () => {
    const source = await workflow();
    expect(source).toContain("require('./node_modules/vite/node_modules/esbuild/package.json').version");
    expect(source).toContain('npm install --no-save --package-lock=false --ignore-scripts "@esbuild/${{ matrix.esbuildPackage }}@${ESBUILD_VERSION}"');
    const restoration = stepBlocks(source).find((value) => value.includes("git config core.autocrlf false"));
    expect(restoration).toContain("if: runner.os == 'Windows'");
    expect(restoration).toContain("git archive --format=tar HEAD | tar --extract --file=-");
    expect(restoration).toContain("git diff --exit-code");
    expect(source.indexOf("git diff --exit-code")).toBeLessThan(source.indexOf("npm run typecheck"));
  });
});
