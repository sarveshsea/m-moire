import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..");
const catalogPath = join(root, "examples", "featured-registries.json");

type FeaturedRegistry = {
  slug: string;
  title: string;
  packageName: string;
  installCommand: string;
  sourcePath: string;
  screenshotPath: string;
};

describe("featured registries catalog", () => {
  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as FeaturedRegistry[];

  it("contains the three featured registries", () => {
    expect(catalog).toHaveLength(3);
    expect(catalog.map((entry) => entry.slug)).toEqual([
      "starter-saas",
      "docs-blog",
      "dashboard",
    ]);
  });

  it("points every entry at a real source folder and screenshot", () => {
    for (const entry of catalog) {
      expect(entry.installCommand).toContain(entry.packageName);
      expect(existsSync(join(root, entry.sourcePath))).toBe(true);
      expect(existsSync(join(root, entry.screenshotPath))).toBe(true);
    }
  });
});
