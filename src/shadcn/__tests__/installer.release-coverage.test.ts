import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installShadcnRegistryItem, resolveShadcnRegistryItem } from "../installer.js";
const ports = vi.hoisted(() => ({ alias: vi.fn(), npm: vi.fn(), path: vi.fn(), fetch: vi.fn() }));
vi.mock("../../marketplace/catalog-loader.js", () => ({ resolveMarketplaceAlias: ports.alias }));
vi.mock("../../registry/npm-fetch.js", () => ({ fetchNpmPackageToCache: ports.npm }));
vi.mock("../../utils/asset-path.js", () => ({ packagePath: ports.path }));
vi.mock("../../security/safe-fetch.js", () => ({ fetchPublicText: ports.fetch }));
let root: string;
const item = (extra = {}) => ({ name: "sample", type: "registry:ui", files: [{ path: "sample.tsx", type: "registry:ui", content: "export const Sample = 1;" }], ...extra });
async function put(path: string, data: unknown) { await mkdir(join(path, ".."), { recursive: true }); await writeFile(path, JSON.stringify(data)); return path; }
beforeEach(async () => { vi.resetAllMocks(); root = await mkdtemp(join(tmpdir(), "memi-shadcn-branches-")); ports.alias.mockResolvedValue(undefined); ports.npm.mockRejectedValue(new Error("fixture package unavailable")); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
it.each(["r", "public/r", "."])("resolves registry item candidate layout %s", async layout => {
  await put(join(root, layout, "sample.json"), item());
  const found = await resolveShadcnRegistryItem(root, "Sample", root);
  expect(found.item.name).toBe("sample"); expect(found.source).toContain("sample.json");
});
it("reads explicit local registry routes and referenced component contents", async () => {
  const dir = join(root, "registry"); await put(join(dir, "registry.json"), { name: "fixture", homepage: "https://fixture.invalid", items: [item({ meta: { memoire: { itemRoute: "items/sample.json" } } })] });
  await put(join(dir, "items/sample.json"), item({ files: [{ path: "sample.tsx", type: "registry:ui" }] }));
  await writeFile(join(dir, "sample.tsx"), "export const Sample = 2;");
  const found = await resolveShadcnRegistryItem(dir, "Sample", root);
  expect(await found.readFileContent(found.item.files[0])).toContain("Sample = 2");
});
it("reports a missing item in an otherwise valid local registry", async () => {
  await put(join(root, "registry.json"), { name: "fixture", homepage: "https://fixture.invalid", items: [] });
  await expect(resolveShadcnRegistryItem(root, "Missing", root)).rejects.toThrow("No shadcn registry item");
});
it.each(["local", "npm", "packaged"])("resolves catalog fallback route %s", async route => {
  const dir = join(root, route); await put(join(dir, "sample.json"), item());
  ports.alias.mockResolvedValue({ packageName: "@fixture/design", sourcePath: route === "local" ? "local" : "missing", slug: "fixture" });
  ports.npm.mockResolvedValueOnce({ packageDir: dir, version: "1.2.3" });
  if (route === "packaged") { ports.npm.mockReset().mockRejectedValue(new Error("offline")); ports.path.mockReturnValue(dir); }
  const found = await resolveShadcnRegistryItem("fixture", "Sample", root, { refresh: true });
  expect(found.source).toBe(route === "npm" ? "npm:@fixture/design@1.2.3" : "catalog:fixture");
});
it("falls back from an unavailable catalog lookup to an exact npm source", async () => {
  await put(join(root, "sample.json"), item()); ports.alias.mockRejectedValue(new Error("catalog absent")); ports.npm.mockResolvedValue({ packageDir: root, version: "2.0.0" });
  expect((await resolveShadcnRegistryItem("@fixture/kit", "Sample", root)).source).toBe("npm:@fixture/kit@2.0.0");
});
it("retains npm failure when bundled catalog content is also absent", async () => {
  ports.alias.mockResolvedValue({ packageName: "missing", sourcePath: "missing", slug: "missing" }); ports.path.mockReturnValue(join(root, "none"));
  await expect(resolveShadcnRegistryItem("missing", "Sample", root)).rejects.toThrow("fixture package unavailable");
});
it.each(["registry:ui", "registry:block", "registry:component"])("records the installed component responsibility for %s", async type => {
  const from = await put(join(root, "source.json"), item({ type, title: type === "registry:component" ? "!!!" : undefined, registryDependencies: ["button", "https://fixture.invalid/item"], categories: ["forms"], meta: { memoire: { sourcePackage: null } } }));
  await writeFile(join(root, "components.json"), JSON.stringify({ aliases: { components: "src/components", empty: "" } }));
  const save = vi.fn(); const result = await installShadcnRegistryItem({ config: { projectRoot: root }, registry: { saveSpec: save } } as never, { from, name: "Sample", targetDir: "src/components" });
  expect(result.spec.level).toBe(type === "registry:ui" ? "atom" : type === "registry:block" ? "organism" : "molecule");
  expect(result.spec.shadcnBase).toEqual(["button"]); expect(result.spec.name).toBe("Sample"); expect(await readFile(result.codePath!, "utf8")).toContain("Sample"); expect(save).toHaveBeenCalledOnce();
});
it("installs non-code files and tolerates an invalid optional components configuration", async () => {
  const from = await put(join(root, "source.json"), item({ files: [{ path: "theme.css", type: "registry:style", content: ":root {}", target: "./styles/theme.css" }], description: "CSS theme" }));
  await writeFile(join(root, "components.json"), "{");
  const result = await installShadcnRegistryItem({ config: { projectRoot: root }, registry: { saveSpec: vi.fn() } } as never, { from, name: "Sample" });
  expect(result.codePath).toBeUndefined(); expect(result.spec.purpose).toBe("CSS theme"); expect(await readFile(result.generatedFiles[0], "utf8")).toBe(":root {}");
});
it("fetches public registry documents through the bounded fetch port", async () => {
  ports.fetch.mockResolvedValueOnce({ ok: true, text: JSON.stringify(item({ files: [{ path: "sample.tsx", type: "registry:ui" }] })) }).mockResolvedValueOnce({ ok: true, text: "export const Sample = 3;" });
  const found = await resolveShadcnRegistryItem("https://fixture.invalid/r/sample.json", "Sample", root);
  expect(await found.readFileContent(found.item.files[0])).toContain("Sample = 3");
  expect(ports.fetch).toHaveBeenLastCalledWith("https://fixture.invalid/r/sample.tsx", { maxBytes: 2_000_000, timeoutMs: 15_000 });
});
it.each([undefined, "items/sample.json"])("follows public registry item route %s", async route => {
  ports.fetch.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ name: "fixture", homepage: "https://fixture.invalid", items: [item({ meta: { memoire: { itemRoute: route } } })] }) }).mockResolvedValueOnce({ ok: true, text: JSON.stringify(item()) });
  const found = await resolveShadcnRegistryItem("https://fixture.invalid/catalog/registry.json", "Sample", root);
  expect(found.source).toBe(route ? "https://fixture.invalid/catalog/items/sample.json" : "https://fixture.invalid/r/sample.json");
});
it("reports HTTP failure and absent remote items precisely", async () => {
  ports.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
  await expect(resolveShadcnRegistryItem("https://fixture.invalid/r/sample.json", "Sample", root)).rejects.toThrow("404");
  ports.fetch.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ name: "fixture", homepage: "https://fixture.invalid", items: [] }) });
  await expect(resolveShadcnRegistryItem("https://fixture.invalid/registry.json", "Missing", root)).rejects.toThrow("Missing");
});
