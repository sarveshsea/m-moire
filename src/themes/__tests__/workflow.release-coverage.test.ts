import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesignToken } from "../../engine/registry.js";
import { applyThemeToProject, buildStoredTheme, createThemeVariants, diffThemes, generateThemeCss, generateThemePreviewHtml, getTheme, importThemeFromSource, listThemes, saveTheme, slugifyThemeName, validateThemeTokens, writeThemePackageArtifacts } from "../workflow.js";
vi.mock("../../integrations/tweakcn.js", async (original) => ({ ...await original<typeof import("../../integrations/tweakcn.js")>(), fetchTweakcnTheme: vi.fn(async () => ":root { --primary: #000000; }") }));
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function dir() { const root = await mkdtemp(join(tmpdir(), "memi-theme-release-")); dirs.push(root); return root; }
const token = (name: string, value: string, type: DesignToken["type"] = "color", dark?: string): DesignToken => ({ name, type, collection: "test", cssVariable: `--${name}`, values: { default: value, ...(dark === undefined ? {} : { dark }) } });
const theme = () => buildStoredTheme({ name: "Review", source: { kind: "generated", value: "test" }, css: ":root { --background: #ffffff; --foreground: #000000; --primary: #000000; --primary-foreground: #ffffff; --radius: 1rem; }" });

describe("theme validation evidence", () => {
  it("reports missing semantic tokens without claiming contrast was assessed", () => {
    const result = validateThemeTokens([], false);
    expect(result.status).toBe("fail");
    expect(result.summary).toMatchObject({ errors: 7, semanticCoverage: 0, totalTokens: 0, contrastFailures: 0 });
    expect(result.contrast).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toContain("missing-dark-mode");
  });
  it.each([["3", true], ["2px", true], ["0.1rem", true], ["4px", false], ["1rem", false], ["var(--space)", false]])("validates spacing size %s", (size, fragile) => {
    const result = validateThemeTokens([token("space", size, "spacing")], false);
    expect(result.issues.some((issue) => issue.code === "spacing-scale-fragile")).toBe(fragile);
  });
  it.each([["40px", true], ["3rem", true], ["32", false], ["var(--radius)", false]])("validates radius size %s", (size, outlier) => {
    const result = validateThemeTokens([token("radius", size, "radius")], false);
    expect(result.issues.some((issue) => issue.code === "radius-outlier")).toBe(outlier);
    expect(result.issues.some((issue) => issue.code === "radius-scale-missing")).toBe(false);
  });
  it("distinguishes unparseable contrast from failed contrast and missing dark values", () => {
    const result = validateThemeTokens([token("background", "var(--surface)", "color", "#000000"), token("foreground", "#000000")], true);
    expect(result.summary.missingDarkTokens).toBe(1);
    expect(result.contrast).toMatchObject([{ status: "skip", ratio: null, mode: "default" }, { status: "warn", ratio: 1, mode: "dark" }]);
    expect(result.summary.contrastFailures).toBe(1);
  });
  it("uses existing token modes without fabricating values for an empty token", () => {
    const result = validateThemeTokens([{ ...token("foreground", "#000"), values: {} }, { ...token("background", "#fff"), values: { Default: "#fff" } }], false);
    expect(result.contrast).toEqual([]);
    const css = generateThemeCss([{ ...token("empty", ""), values: {} }, { ...token("radius", "1rem", "radius"), values: { Default: "1rem" } }]);
    expect(css).not.toContain("undefined");
  });
  it("identifies additions, removals, dark mode loss, and contrast regressions", () => {
    const base = theme();
    const from = { ...base, hasDarkMode: true, tokens: [...base.tokens, token("legacy", "#aaa")] };
    const toTokens = [...base.tokens.filter((item) => item.name !== "radius"), token("new", "#aaa")].map((item) => item.name === "foreground" ? token("foreground", "#ffffff") : item);
    const to = { ...base, tokens: toTokens, validation: validateThemeTokens(toTokens, false) };
    const diff = diffThemes(from, to);
    expect(diff.tokens.added).toEqual(["new"]);
    expect(diff.tokens.removed).toEqual(["legacy", "radius"]);
    expect(diff.contrastRegressions).toMatchObject([{ pair: "foreground on background", from: 21, to: 1 }]);
    expect(diff.highlights).toEqual(expect.arrayContaining(["dark mode missing", "validation regressed", "contrast regressed"]));
    expect(diffThemes(to, from).highlights).toContain("validation improved");
  });
  it("produces independent variants without mutating the base tokens", () => {
    const base = theme();
    const before = JSON.stringify(base);
    const variants = createThemeVariants(base);
    expect(variants.map((variant) => variant.lineage?.recipe)).toEqual(["dark", "warm", "enterprise", "high-contrast"]);
    expect(JSON.stringify(base)).toBe(before);
    expect(variants.every((variant) => variant.tokens !== base.tokens)).toBe(true);
  });
  it("escapes theme names in generated preview markup", () => {
    expect(generateThemePreviewHtml({ ...theme(), name: '<script>alert("x")</script>' })).toContain("&lt;script&gt;");
    expect(slugifyThemeName("  ---  ")).toBe("theme");
    expect(() => buildStoredTheme({ name: "Empty", source: { kind: "file", value: "empty.css" }, css: "body {}" })).toThrow("No tokens");
  });
});

describe("theme persistence and package artifacts", () => {
  it("ignores malformed theme files and selects the most recent valid theme", async () => {
    const root = await dir();
    expect(await getTheme(root)).toBeNull();
    await saveTheme(root, { ...theme(), slug: "old", name: "Old", importedAt: "2026-01-01" });
    await saveTheme(root, { ...theme(), slug: "new", name: "New", importedAt: "2026-09-01" });
    await writeFile(join(root, "themes", "broken.json"), "{broken");
    await writeFile(join(root, "themes", "invalid.json"), JSON.stringify({ kind: "unknown", tokens: [] }));
    await writeFile(join(root, "themes", "null.json"), "null");
    expect((await listThemes(root)).map((item) => item.name)).toEqual(["New", "Old"]);
    expect((await getTheme(root))?.name).toBe("New");
    expect((await getTheme(root, "OLD"))?.name).toBe("Old");
    expect(await getTheme(root, "missing")).toBeNull();
  });
  it("imports named files and URL sources using the correct source metadata", async () => {
    const root = await dir();
    await writeFile(join(root, "quiet_theme.css"), ":root { --primary: #000000; }");
    const local = await importThemeFromSource({ arkDir: root, source: "quiet_theme.css", cwd: root });
    expect(local.theme).toMatchObject({ name: "Quiet Theme", source: { kind: "file", resolved: join(root, "quiet_theme.css") } });
    const remote = await importThemeFromSource({ arkDir: root, source: "https://example.test/remote-theme.css" });
    expect(remote.theme).toMatchObject({ name: "Remote Theme", source: { kind: "url" } });
  });
  it("writes package exports with or without optional package metadata", async () => {
    const root = await dir();
    const initial = await writeThemePackageArtifacts(root, theme());
    expect(await readFile(initial.previewPath, "utf8")).toContain("Review");
    await writeFile(join(root, "package.json"), JSON.stringify({ files: ["tokens/", "theme.json"] }));
    await writeFile(join(root, "README.md"), "# Registry\n");
    await writeThemePackageArtifacts(root, theme());
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).files).toEqual(["tokens/", "theme.json", "preview/"]);
    expect(await readFile(join(root, "README.md"), "utf8")).toContain("## Theme Workflow");
    await writeFile(join(root, "package.json"), "{}");
    await writeThemePackageArtifacts(root, theme());
    expect(JSON.parse(await readFile(join(root, "package.json"), "utf8")).files).toEqual(["theme.json", "preview/"]);
  });
  it("replaces an existing token set only when explicitly requested", async () => {
    const root = await dir();
    const base = theme();
    const existing = { tokens: [token("legacy", "#123456")], components: [], styles: [], lastSync: "before" };
    const result = await applyThemeToProject({ theme: base, designSystem: existing, outputDir: join(root, "replace"), mode: "replace" });
    expect(result.designSystem.tokens.map((item) => item.name)).not.toContain("legacy");
    expect(existing.tokens).toHaveLength(1);
    expect(result.filesWritten).toHaveLength(4);
    await mkdir(join(root, "merge"));
    const merged = await applyThemeToProject({ theme: base, designSystem: existing, outputDir: join(root, "merge") });
    expect(merged.designSystem.tokens.map((item) => item.name)).toContain("legacy");
  });
});
