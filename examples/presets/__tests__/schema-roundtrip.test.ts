/**
 * schema-roundtrip.test.ts — verify every Memoire example preset is a valid
 * registry per the v1 Zod schema, and every file it references actually exists.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { RegistrySchema } from "../../../src/registry/schema.js";
import { ComponentSpecSchema } from "../../../src/specs/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = resolve(__dirname, "..");

function listPresets(): string[] {
  return readdirSync(PRESETS_DIR)
    .filter((n) => {
      if (n === "__tests__" || n.startsWith(".")) return false;
      return statSync(join(PRESETS_DIR, n)).isDirectory();
    })
    .sort();
}

const presets = listPresets();

describe("example presets — registry v1 roundtrip", () => {
  it("discovers the featured presets on disk", () => {
    expect(presets.length).toBeGreaterThanOrEqual(7);
    expect(presets).toContain("starter-saas");
    expect(presets).toContain("docs-blog");
    expect(presets).toContain("dashboard");
    expect(presets).toContain("starter");
    expect(presets).toContain("tweakcn-vercel");
    expect(presets).toContain("tweakcn-supabase");
    expect(presets).toContain("tweakcn-linear");
  });

  for (const slug of presets) {
    describe(slug, () => {
      const dir = join(PRESETS_DIR, slug);
      const registryPath = join(dir, "registry.json");

      it("registry.json parses via RegistrySchema", () => {
        expect(existsSync(registryPath)).toBe(true);
        const raw = JSON.parse(readFileSync(registryPath, "utf8"));
        const result = RegistrySchema.safeParse(raw);
        if (!result.success) {
          throw new Error(
            `zod parse failed for ${slug}:\n${result.error.issues
              .map((i) => `  ${i.path.join(".")}: ${i.message}`)
              .join("\n")}`,
          );
        }
      });

      it("tokens referenced by registry.json exist", () => {
        const raw = JSON.parse(readFileSync(registryPath, "utf8"));
        if (raw.tokens?.href) {
          expect(existsSync(join(dir, raw.tokens.href))).toBe(true);
        }
        // every preset in this set ships tokens.css alongside tokens.json
        expect(existsSync(join(dir, "tokens", "tokens.css"))).toBe(true);
      });

      it("package.json announces a Memoire registry", () => {
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
        expect(pkg.name).toMatch(/^@memoire-examples\//);
        expect(pkg.memoire?.registry).toBe(true);
        expect(pkg.keywords).toContain("memoire-registry");
      });

      it("each component ref resolves to a valid ComponentSpec + code file", () => {
        const registry = RegistrySchema.parse(
          JSON.parse(readFileSync(registryPath, "utf8")),
        );
        expect(registry.components.length).toBeGreaterThanOrEqual(4);
        for (const ref of registry.components) {
          const specPath = join(dir, ref.href);
          expect(existsSync(specPath), `missing spec: ${ref.href}`).toBe(true);
          const spec = JSON.parse(readFileSync(specPath, "utf8"));
          const parsed = ComponentSpecSchema.safeParse(spec);
          if (!parsed.success) {
            throw new Error(
              `spec ${ref.name} failed zod parse:\n${parsed.error.issues
                .map((i) => `  ${i.path.join(".")}: ${i.message}`)
                .join("\n")}`,
            );
          }
          if (ref.code?.href) {
            expect(
              existsSync(join(dir, ref.code.href)),
              `missing code: ${ref.code.href}`,
            ).toBe(true);
          }
        }
      });
    });
  }
});
