import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diagnoseAppQuality } from "../engine.js";
const roots: string[] = [];
async function fixture(content: string) { const path = await mkdtemp(join(tmpdir(), "memi-analysis-truth-")); roots.push(path); await writeFile(join(path, "page.tsx"), content); return path; }
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
describe("assessment truth", () => {
  it("does not turn unassessed categories into poor quality", async () => {
    const path = await fixture('export default function Page(){ return <main className="p-4">Hello</main>; }');
    const result = await diagnoseAppQuality({ projectRoot: path, write: false });
    expect(result.quality.score).toBeGreaterThanOrEqual(90);
    expect(result.quality.categories.typography).toBeNull();
    expect(result.quality.coverage).toBeLessThan(1);
    expect(result.summary.score).toBe(result.quality.score);
  });
  it("leaves quality unassessed when no UI is analyzed", async () => {
    const path = await fixture('export const answer = 42;');
    const result = await diagnoseAppQuality({ projectRoot: path, write: false });
    expect(result.quality.score).toBeNull();
    expect(result.summary.verdict).toContain("unassessed");
  });
  it("propagates scan omissions and limits score scope to scanned files", async () => {
    const path = await fixture('export default () => <main className="p-4" />;');
    await writeFile(join(path, "z.tsx"), '<button />');
    const result = await diagnoseAppQuality({ projectRoot: path, maxFiles: 1, write: false });
    expect(result.scanCompleteness.complete).toBe(false);
    expect(result.quality.scope).toBe("scanned-files");
    expect(result.summary.verdict).toContain("scan incomplete");
  });
  it("recognizes focus literals in cn/clsx/cva without executing dynamic expressions", async () => {
    const path = await fixture(`const styles = cva("p-4", { variants: { size: { small: "text-sm", big: "text-lg" } } });
export default () => <><button className={cn("rounded", active && "focus-visible:ring-2", clsx({ "bg-red-500": active }), unknown())}>Go</button><button /><button /></>;`);
    const result = await diagnoseAppQuality({ projectRoot: path, write: false });
    expect(result.issues.map(i => i.id)).not.toContain("a11y.focus-missing");
    expect(result.summary.tailwindClasses).toBeGreaterThanOrEqual(6);
    expect(result.classExtraction.unknownExpressions).toBeGreaterThan(0);
  });
  it("still reports a missing focus style when helper literals lack it", async () => {
    const path = await fixture('export default () => <><button className={clsx("p-4", { "text-sm": active })}>Go</button><button /><button /></>;');
    const result = await diagnoseAppQuality({ projectRoot: path, write: false });
    expect(result.issues.map(i => i.id)).toContain("a11y.focus-missing");
  });
});
