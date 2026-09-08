import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSpec, validateCrossRefs } from "../validator.js";
import { ComponentSpecSchema, DataVizSpecSchema, DesignSpecSchema, IASpecSchema, PageSpecSchema } from "../types.js";
import { Registry } from "../../engine/registry.js";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const component = (name: string, extra = {}) => ComponentSpecSchema.parse({ name, type: "component", purpose: "Render an accessible product control", ...extra });
async function registry() { const root = await mkdtemp(join(tmpdir(), "memi-spec-validation-")); dirs.push(root); return new Registry(join(root, ".memoire")); }

describe("spec validation contracts", () => {
  it.each([null, undefined, {}, { name: "MissingType" }])("rejects missing type %j", (input) => {
    expect(validateSpec(input)).toEqual({ valid: false, errors: [{ path: "type", message: "Spec must have a 'type' field" }], warnings: [] });
  });
  it.each(["", "3DView", "bad name", "../unsafe"])("rejects invalid identifiers %s", (name) => {
    const result = validateSpec({ name, type: "component", purpose: "A component" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: "name" }));
  });
  it("rejects unknown types and supplies nested schema error paths", () => {
    expect(validateSpec({ type: "unknown" }).errors).toEqual([{ path: "type", message: "Unknown spec type: unknown" }]);
    expect(validateSpec({ type: "component", name: 3, purpose: null }).errors.map((issue) => issue.path)).toEqual(expect.arrayContaining(["name", "purpose"]));
  });
  it.each([
    [{ level: "atom", composesSpecs: ["Other"] }, "composesSpecs", "error"],
    [{ level: "molecule" }, "composesSpecs", "warning"],
    [{ level: "molecule", composesSpecs: Array.from({ length: 9 }, (_, index) => `Atom${index}`) }, "composesSpecs", "warning"],
    [{ level: "organism", composesSpecs: [] }, "composesSpecs", "warning"],
    [{ props: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [`prop${index}`, "string"])) }, "props", "warning"],
  ])("detects atomic composition concern %j", (extra, path, severity) => {
    const result = validateSpec({ name: "Control", type: "component", purpose: "Render an accessible control", ...extra });
    expect((severity === "error" ? result.errors : result.warnings).some((issue) => issue.path === path)).toBe(true);
  });
  it("does not emit composition or mapping warnings for a complete molecule", () => {
    const result = validateSpec(component("Control", { level: "molecule", shadcnBase: ["Button"], composesSpecs: ["Label"], codeConnect: { mapped: true, figmaNodeId: "1:2", codebasePath: "Control.tsx" } }));
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });
  it("reports missing raw component authoring metadata", () => {
    const result = validateSpec({ type: "component", name: "Control", purpose: "" });
    expect(result.warnings.map((issue) => issue.path)).toEqual(expect.arrayContaining(["shadcnBase", "purpose", "level", "codeConnect"]));
  });
  it("distinguishes missing dataviz sample data from a valid supplied sample", () => {
    const input = { type: "dataviz", name: "Trend", purpose: "Show trend", chartType: "line", dataShape: { x: "date", y: "value" } };
    expect(validateSpec(input).warnings.some((issue) => issue.path === "sampleData")).toBe(true);
    expect(validateSpec({ ...input, sampleData: [{ date: "2026", value: 2 }] }).warnings).toEqual([]);
  });
  it("checks IA root, flows, and entry point authoring separately", () => {
    const result = validateSpec({ type: "ia", name: "Site", purpose: "Navigation" });
    expect(result.valid).toBe(false);
    expect(result.warnings.map((issue) => issue.path)).toEqual(["root", "flows", "entryPoints"]);
    const valid = IASpecSchema.parse({ type: "ia", name: "Site", purpose: "Navigation", root: { id: "home", label: "Home", type: "page" }, flows: [{ from: "home", to: "settings" }], entryPoints: ["home"] });
    expect(validateSpec(valid)).toMatchObject({ valid: true, warnings: [] });
  });
  it("warns when design specs contain no spacing or interaction guidance", () => {
    const spec = DesignSpecSchema.parse({ type: "design", name: "Screen", purpose: "A screen" });
    expect(validateSpec(spec).warnings.map((issue) => issue.path)).toEqual(["spacing", "interactions"]);
    expect(validateSpec(PageSpecSchema.parse({ type: "page", name: "Home", purpose: "Homepage" }))).toMatchObject({ valid: true, warnings: [] });
  });
});

describe("persisted specification cross-references", () => {
  it("checks pages, charts, linked designs, and atomic hierarchy against actual stored specs", async () => {
    const store = await registry();
    await store.saveSpec(component("Atom", { level: "atom" }));
    await store.saveSpec(component("Peer", { level: "molecule" }));
    await store.saveSpec(PageSpecSchema.parse({ name: "Home", type: "page", purpose: "Home page" }));
    const molecule = component("Control", { level: "molecule", composesSpecs: ["Atom", "Peer", "Home", "Missing"], dataviz: "MissingChart" });
    const warnings = await validateCrossRefs(molecule, store);
    expect(warnings).toHaveLength(3);
    expect(warnings.map((issue) => issue.message)).toEqual(expect.arrayContaining([expect.stringContaining("hierarchy violation"), expect.stringContaining('unknown spec "Missing"'), expect.stringContaining('"MissingChart" not found')]));
    const page = PageSpecSchema.parse({ name: "Page", type: "page", purpose: "Page", sections: [{ name: "Valid", component: "Atom" }, { name: "Broken", component: "Missing" }] });
    expect(await validateCrossRefs(page, store)).toMatchObject([{ path: "sections.Broken.component" }]);
    const design = DesignSpecSchema.parse({ name: "Design", type: "design", purpose: "Design", linkedSpecs: ["Atom", "Missing"] });
    expect(await validateCrossRefs(design, store)).toMatchObject([{ path: "linkedSpecs" }]);
    expect(await validateCrossRefs(component("Empty"), store)).toEqual([]);
    await store.saveSpec(DataVizSpecSchema.parse({ name: "Chart", type: "dataviz", purpose: "Show trend", chartType: "line", dataShape: { x: "date", y: "value" } }));
    expect(await validateCrossRefs(component("ChartHolder", { dataviz: "Chart" }), store)).toEqual([]);
  });
  it("walks nested IA links and global navigation without losing the offending path", async () => {
    const store = await registry();
    await store.saveSpec(PageSpecSchema.parse({ name: "Home", type: "page", purpose: "Home" }));
    const spec = IASpecSchema.parse({ name: "Site", type: "ia", purpose: "Navigation", root: { id: "root", label: "Root", type: "group", linkedPageSpec: "Home", children: [{ id: "settings", label: "Settings", type: "page", linkedPageSpec: "Missing", children: [{ id: "leaf", label: "Leaf", type: "page" }] }] }, globals: [{ label: "Home", linkedPageSpec: "Home" }, { label: "Help", linkedPageSpec: "Help" }, { label: "Separator" }] });
    expect(await validateCrossRefs(spec, store)).toMatchObject([{ path: "root.children[0].linkedPageSpec" }, { path: "globals" }]);
  });
});
