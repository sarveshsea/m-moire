import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { diagnoseAppQuality, auditContextFromDiagnosis, hasDiagnosis, type AppQualitySeverity } from "../engine.js";
import { defaultPolicy } from "../policy.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), history: vi.fn(async () => {}) }));
vi.mock("../../security/safe-fetch.js", () => ({ fetchPublicText: mocks.fetch }));
vi.mock("../history.js", () => ({ appendHistory: mocks.history }));
let root: string;
async function file(path: string, content: string) { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), content); }
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "memi-quality-release-")); mocks.fetch.mockReset(); mocks.history.mockReset().mockResolvedValue(); configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] }); });
afterEach(async () => { vi.restoreAllMocks(); resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); });
const issueIds = ["system.tokens.missing", "color.raw-hex", "color.scale-wide", "type.scale-wide", "spacing.scale-wide", "shape.radius-drift", "depth.shadow-drift", "components.default-shadcn", "maintainability.arbitrary-tailwind", "responsive.coverage-low", "a11y.image-alt", "a11y.focus-missing"];
async function driftFixture() {
  const imports = ["Button", "Card", "Input", "Badge", "Dialog"].map(name => `import { ${name} } from "@/components/ui/${name}";`).join("\n");
  const source = `${imports}\nexport default function Page(){return <main className="p-1 p-2 text-sm text-xl rounded-sm rounded-lg shadow-sm shadow-lg bg-[#112233] bg-[#223344] bg-[#334455] text-[#445566] border-[#556677] w-[101px] h-[103px]"><img src="fixture.png"/><button>A</button><button>B</button><button>C</button></main>}`;
  for (let i = 0; i < 9; i++) await file(`src/app/${i === 0 ? "docs" : `dashboard-${i}`}/page.tsx`, source);
}
describe("app quality policy and evidence release behavior", () => {
  it.each(["critical", "high", "medium", "low"] as AppQualitySeverity[])("applies %s policy severity to real multi-route design drift", async severity => {
    await driftFixture(); const base = defaultPolicy();
    const policy = { ...base, rules: Object.fromEntries(issueIds.map(id => [id, { severity }])), thresholds: { ...base.thresholds, maxColorUtilities: 0, maxTextSizes: 0, maxSpacingUtilities: 0, maxRadiusUtilities: 0, maxShadowUtilities: 0, maxArbitraryValues: 0 } };
    const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: false, policy });
    expect(diagnosis.issues.map(i => i.id)).toEqual(expect.arrayContaining(issueIds)); expect(diagnosis.issues.every(i => i.severity === severity)).toBe(true);
    expect(diagnosis.issues.find(i => i.id === "color.raw-hex")).toMatchObject({ estimatedEffort: "large", fixCategory: "tokens", evidenceLocations: expect.any(Array) });
    expect(diagnosis.issues.find(i => i.id === "color.raw-hex")!.evidenceLocations).toHaveLength(5);
    expect(diagnosis.issues.find(i => i.id === "responsive.coverage-low")!.fixCategory).toBe("responsive");
    expect(diagnosis.issues.find(i => i.id === "maintainability.arbitrary-tailwind")!.fixCategory).toBe("code-health");
    expect(diagnosis.directions.find(d => d.id === "editorial-product")!.fit).toContain("docs");
    const verdict = severity === "critical" ? "needs a design-system pass" : severity === "high" ? "visibly inconsistent" : severity === "medium" ? "usable but uneven" : "strong in assessed web checks";
    expect(diagnosis.summary.verdict).toBe(verdict);
    expect(await hasDiagnosis(root)).toBe(false);
  });
  it("writes a clean assessed report and tolerates failure of optional history persistence", async () => {
    await file("src/app/page.tsx", 'import { Button } from "@/components/ui/Button";\nexport default function Page(){return <main className="flex items-center p-4 gap-2 text-sm bg-background rounded-md sm:p-6"><Button className="focus-visible:ring-2">Go</Button><img src="fixture.png" alt="Fixture" /></main>}');
    await file("src/theme.css", ':root { --background: #ffffff; --foreground: #000000; --primary: #0055ff; --muted: #eeeeee; --border: #cccccc; --radius: 4px; --font: system-ui; --space: 4px; }');
    mocks.history.mockRejectedValueOnce(new Error("history unavailable"));
    expect(await hasDiagnosis(root)).toBe(false); const diagnosis = await diagnoseAppQuality({ projectRoot: root });
    expect(diagnosis.issues).toEqual([]); expect(diagnosis.summary.score).toBe(100); expect(await hasDiagnosis(root)).toBe(true);
    const markdown = await readFile(join(root, ".memoire", "app-quality", "diagnosis.md"), "utf8");
    expect(markdown).toContain("No major app-quality issues detected"); expect(markdown).toContain("Silent System: not-assessed");
    expect(diagnosis.directions.every(d => d.patchScope[0] === "Preserve current system and add CI checks")).toBe(true);
    expect(mocks.history).toHaveBeenCalledTimes(1);
  });
  it("writes findings with file and line evidence and component-level recommendations", async () => {
    await driftFixture(); const diagnosis = await diagnoseAppQuality({ projectRoot: root });
    const markdown = await readFile(join(root, ".memoire", "app-quality", "diagnosis.md"), "utf8");
    expect(markdown).toContain("Affected files:"); expect(markdown).toContain("Evidence:"); expect(markdown).toContain("Estimated effort: large");
    expect(diagnosis.issues.find(i => i.category === "components")?.affectedFiles).toHaveLength(9);
  });
  it("merges duplicate score caps conservatively without mutating either report", async () => {
    const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: false });
    const report = { ...diagnosis, appliedScoreCaps: [{ id: "shared", maximum: 80, reason: "first" }, { id: "shared", maximum: 90, reason: "weaker" }, { id: "shared", maximum: 70, reason: "stronger" }], ux: { ...diagnosis.ux, appliedScoreCaps: [{ id: "shared", maximum: 60, reason: "UX stronger" }, { id: "other", maximum: 50, reason: "other" }] } };
    const context = auditContextFromDiagnosis(report); expect(context.appliedScoreCaps).toEqual([{ id: "shared", maximum: 60, reason: "UX stronger" }, { id: "other", maximum: 50, reason: "other" }]);
    expect(report.appliedScoreCaps[0].maximum).toBe(80); expect(context.analysisPerformed).toBe(false); expect(context.assessedCategories).toEqual([]);
  });
  it("normalizes an HTTP target using supplied static fixture bytes without network execution", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, text: '<html><main class="p-4 text-sm bg-white rounded">Fixture</main></html>' });
    const diagnosis = await diagnoseAppQuality({ projectRoot: root, target: "https://example.com", write: false });
    expect(diagnosis.summary.scanTarget).toBe("https://example.com/"); expect(diagnosis.summary.scannedFiles).toBe(1); expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("treats incomplete static extraction as partial evidence and preserves scope metadata", async () => {
    await file("src/App.tsx", 'export function App({ variant }) { return <div className={variant} />; }');
    await file("src/Good.tsx", 'export function Good(){return <div className="p-4"/>}');
    const diagnosis = await diagnoseAppQuality({ projectRoot: root, write: false, scope: { files: ["src/App.tsx"], expandImports: true, base: "fixture" } });
    expect(auditContextFromDiagnosis(diagnosis).partialAnalysis).toBe(true); expect(diagnosis.scope).toMatchObject({ requestedFiles: 1, expandedWithDependents: true, base: "fixture" });
  });
});
